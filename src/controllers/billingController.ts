import { Request, Response } from "express";
import { prisma } from "../config/client";
import { logger } from "../utils/logger";
import { isAdmin, isShopOwner } from "../config/roles";
import { emitUserNotification } from "./NotificationsController";
import { getSocketService } from "../services/socketService";
import { logActivity } from "../utils/audit";
import { ParsedQs } from "qs";

/**
 * Global invoice numbers: BLIZZ/YYYY/NNNNN (5-digit sequence per year).
 * Uses max existing sequence for the year (not latest row by createdAt).
 */
async function computeNextBlizzInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `BLIZZ/${year}/`;
  const rows = await prisma.billing.findMany({
    where: {
      invoiceNumber: { startsWith: prefix },
    },
    select: { invoiceNumber: true },
  });
  let maxSeq = 0;
  for (const row of rows) {
    const inv = row.invoiceNumber;
    if (!inv || !inv.startsWith(prefix)) continue;
    const tail = inv.slice(prefix.length);
    const n = parseInt(tail, 10);
    if (Number.isFinite(n) && n > maxSeq) maxSeq = n;
  }
  const nextSeq = String(maxSeq + 1).padStart(5, "0");
  return `${prefix}${nextSeq}`;
}

// Create billing
export const createBilling = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      shopId,
      invoiceNumber: _clientInvoiceIgnored,
      customerName,
      customerEmail,
      customerContact,
      items,
      subtotal,
      tax = 0,
      discount = 0,
      total,
      invoiceType = "SHOP", // SHOP | FACTORY
    } = req.body;
    
    const userId = (req as any).user?.publicId;

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
    return;
    }

    // Check if user has access to this shop
    const user = await prisma.user.findUnique({
      where: { publicId: userId },
    });

    if (!user) {
      res.status(401).json({ error: "User not found" });
    return;
    }

    let shop = null;
    
    // Handle different invoice types
    if (invoiceType === "FACTORY") {
      // Factory invoices don't require shop validation
      if (!isAdmin(user.role || "")) {
        res.status(403).json({ error: "Only admins can create factory invoices" });
        return;
      }
    } else {
      // Shop invoices require shop validation
      if (!shopId) {
        res.status(400).json({ error: "Shop ID is required for shop invoices" });
        return;
      }

      // Check if user manages this shop by querying directly
      const managedShop = await prisma.shop.findFirst({
        where: { 
          id: shopId,
          managerId: user.publicId 
        },
      });

      const userShopId = managedShop?.id;
      if (!user.role || (!isAdmin(user.role) && shopId !== userShopId)) {
        res.status(403).json({ error: "Access denied to this shop" });
      return;
      }

      // Check if shop exists
      shop = await prisma.shop.findUnique({
        where: { id: shopId },
      });

      if (!shop) {
        res.status(404).json({ error: "Shop not found" });
      return;
      }
    }

    // Validate items and check stock
    const validatedItems = [];
    const stockUpdates = [];

    for (const item of items) {
      const { productId, quantity, unitPrice } = item;
      
      // Check if product exists
      const product = await prisma.product.findUnique({
        where: { id: productId },
      });

      if (!product) {
        res.status(400).json({ error: `Product ${productId} not found` });
        return;
      }

      // For factory invoices, skip shop inventory validation
      if (invoiceType === "FACTORY") {
        // Calculate item total
        const itemTotal = quantity * unitPrice;
        
        validatedItems.push({
          ...item,
          productName: item.productName || product.name,
          total: itemTotal,
        });
      } else {
        // For shop invoices, validate shop inventory
        const shopInventory = await prisma.shopInventory.findFirst({
          where: {
            shopId,
            productId,
          },
        });

        if (!shopInventory) {
          res.status(400).json({ error: `Product ${product.name} not available in this shop` });
          return;
        }

        if (shopInventory.currentStock < quantity) {
          res.status(400).json({ 
            error: `Insufficient stock for ${product.name}. Available: ${shopInventory.currentStock}, Requested: ${quantity}` 
          });
          return;
        }

        // Calculate item total
        const itemTotal = quantity * unitPrice;
        
        validatedItems.push({
          ...item,
          productName: item.productName || product.name,
          total: itemTotal,
        });

        // Prepare stock update for shop invoices
        stockUpdates.push({
          inventoryId: shopInventory.id,
          newStock: shopInventory.currentStock - quantity,
        });
      }
    }

    // Server-assigned invoice number only (stored on Billing; max+1 from DB per year).
    let nextInvoiceNumber = await computeNextBlizzInvoiceNumber();

    const baseData: any = {
      shopId: invoiceType === "FACTORY" ? null : shopId,
      customerName,
      customerEmail,
      customerContact,
      items: validatedItems,
      subtotal,
      tax,
      discount,
      total,
      paymentStatus: "pending",
      invoiceType,
    };

    const createBillingRow = (num: string) =>
      prisma.billing.create({
        data: {
          ...baseData,
          invoiceNumber: num,
          createdBy: user.publicId,
          createdByRole: user.role || null,
        },
        include: { shop: true },
      });

    let billing: Awaited<ReturnType<typeof createBillingRow>> | undefined;
    let lastError: unknown;
    for (let attempt = 0; attempt < 5; attempt++) {
      const num =
        attempt === 0
          ? nextInvoiceNumber
          : await computeNextBlizzInvoiceNumber();
      try {
        billing = await createBillingRow(num);
        lastError = undefined;
        break;
      } catch (err: unknown) {
        lastError = err;
        const code = (err as { code?: string })?.code;
        if (code !== "P2002") throw err;
      }
    }
    if (!billing) {
      throw lastError instanceof Error
        ? lastError
        : new Error("Could not assign unique invoice number");
    }

    // Update stock levels only for shop invoices
    if (invoiceType === "SHOP") {
      for (const update of stockUpdates) {
        await prisma.shopInventory.update({
          where: { id: update.inventoryId },
          data: {
            currentStock: update.newStock,
            isActive: true,
            updatedAt: new Date(),
          },
        });
      }

      // Check for low stock after sale and trigger notifications
      for (const item of validatedItems) {
        const shopInventory = await prisma.shopInventory.findFirst({
          where: {
            shopId,
            productId: item.productId,
            isActive: true,
          },
        });

        if (shopInventory) {
          const product = await prisma.product.findUnique({
            where: { id: item.productId },
          });

          if (product && product.minStockLevel && 
              shopInventory.currentStock <= product.minStockLevel) {
            
            const notificationMessage = `🚨 Low stock alert after sale: ${product.name} in ${shop?.name || 'Unknown Shop'} has only ${shopInventory.currentStock} units remaining (min: ${product.minStockLevel})`;
            
            // Notify shop manager
            if (shop?.managerId) {
              await prisma.notification.create({
                data: {
                  userId: shop.managerId,
                  type: "LOW_STOCK_ALERT",
                  category: "INVENTORY",
                  priority: "HIGH",
                  message: notificationMessage,
                  metadata: JSON.stringify({
                    productId: item.productId,
                    productName: product.name,
                    currentStock: shopInventory.currentStock,
                    minStockLevel: product.minStockLevel,
                    shopId: shop.id,
                    shopName: shop.name
                  })
                },
              });

              emitUserNotification(shop.managerId, {
                event: "created",
                notification: {
                  type: "LOW_STOCK_ALERT",
                  category: "INVENTORY",
                  priority: "HIGH",
                  message: notificationMessage,
                },
              });
            }
          }
        }
      }
    }

    // Create appropriate notifications based on invoice type
    if (invoiceType === "FACTORY") {
      // Factory invoice notification - notify all admins
      const adminUsers = await prisma.user.findMany({
        where: { role: "Admin" },
        select: { publicId: true, name: true }
      });

      const factoryMessage = `🏭 Factory invoice created: ${customerName || 'Customer'} - Total: ₹${total} (Created by ${user.name || user.email})`;
      
      for (const admin of adminUsers) {
        await prisma.notification.create({
          data: {
            userId: admin.publicId,
            type: "FACTORY_INVOICE_CREATED",
            category: "FACTORY",
            priority: "MEDIUM",
            message: factoryMessage,
            metadata: JSON.stringify({
              invoiceId: billing.id,
              invoiceNumber: billing.invoiceNumber,
              createdBy: user.publicId,
              createdByName: user.name || user.email,
              total: total,
              customerName: customerName || 'Customer'
            })
          },
        });

        emitUserNotification(admin.publicId, {
          event: "created",
          notification: {
            type: "FACTORY_INVOICE_CREATED",
            category: "FACTORY",
            priority: "MEDIUM",
            message: factoryMessage,
          },
        });
      }
    } else {
      // Shop invoice notification
      const shopMessage = `🧾 Invoice generated for ${shop?.name || 'Unknown Shop'}: ${customerName || 'Customer'} - Total: ₹${total}${isAdmin(user.role || "") ? ` (Created by Admin: ${user.name || user.email})` : ''}`;
      
      if (shop?.managerId) {
        await prisma.notification.create({
          data: {
            userId: shop.managerId,
            type: "SHOP_INVOICE_CREATED",
            category: "BILLING",
            priority: "MEDIUM",
            message: shopMessage,
            metadata: JSON.stringify({
              invoiceId: billing.id,
              invoiceNumber: billing.invoiceNumber,
              shopId: shop.id,
              shopName: shop.name,
              createdBy: user.publicId,
              createdByName: user.name || user.email,
              createdByRole: user.role,
              total: total,
              customerName: customerName || 'Customer'
            })
          },
        });

        emitUserNotification(shop.managerId, {
          event: "created",
          notification: {
            type: "SHOP_INVOICE_CREATED",
            category: "BILLING",
            priority: "MEDIUM",
            message: shopMessage,
          },
        });
      }
    }

    // Audit
    await logActivity({
      type: "billing",
      action: "created",
      entity: "Billing",
      entityId: billing.id,
      userId: (req as any).user?.publicId,
      shopId,
      metadata: { total }
    });

    // Broadcast real-time update
    const socketService = getSocketService();
    socketService.broadcastBillingUpdate(shopId, {
      type: 'created',
      billing: billing,
      timestamp: new Date().toISOString()
    });

    // Emit revenue update for admin dashboard (only for shop invoices)
    if (invoiceType === "SHOP") {
      socketService.emitToAll('revenue_updated', {
        event: 'revenue_updated',
        data: {
          total: billing.total,
          shopId: billing.shopId,
          shopName: shop?.name || 'Unknown Shop',
          invoiceNumber: billing.invoiceNumber,
          timestamp: new Date().toISOString()
        }
      });
    }

    res.status(201).json(billing);
  } catch (error) {
    logger.error("Error creating billing:", error);
    res.status(500).json({ error: "Failed to create billing" });
  }
};

// Get next invoice number (same rule as create — max BLIZZ/YYYY/* + 1)
export const getNextInvoiceNumber = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.publicId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const invoiceNumber = await computeNextBlizzInvoiceNumber();
    res.json({ invoiceNumber });
  } catch (error) {
    logger.error("Error computing next invoice number:", error);
    res.status(500).json({ error: "Failed to compute next invoice number" });
  }
};

// Get billings by shop ID
export const getBillings = async (req: Request, res: Response): Promise<void> => {
  try {
    const { shopId } = req.params;
    const userId = (req as any).user?.publicId;

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
    return;
    }

    const user = await prisma.user.findUnique({
      where: { publicId: userId },
    });

    if (!user) {
      res.status(401).json({ error: "User not found" });
    return;
    }

    // Admins can view any shop's billings without shop assignment
    if (!isAdmin(user.role || "")) {
      // Check if user manages this shop by querying directly
      const managedShop = await prisma.shop.findFirst({
        where: { 
          id: shopId,
          managerId: user.publicId 
        },
      });
      const userShopId = managedShop?.id;
      if (!user.role || shopId !== userShopId) {
        res.status(403).json({ error: "Access denied to this shop" });
        return;
      }
    }

    const billings = await prisma.billing.findMany({
      where: { shopId },
      include: { shop: true },
      orderBy: { createdAt: "desc" },
    });

    res.status(200).json(billings);
  } catch (error) {
    logger.error("Error fetching billings:", error);
    res.status(500).json({ error: "Failed to fetch billings" });
  }
};

// Get billing by ID
export const getBillingById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.publicId;

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
    return;
    }

    const user = await prisma.user.findUnique({
      where: { publicId: userId },
    });

    if (!user) {
      res.status(401).json({ error: "User not found" });
    return;
    }

    const billing = await prisma.billing.findUnique({
      where: { id },
      include: {
        shop: true,
      },
    });

    if (!billing) {
      res.status(404).json({ error: "Billing not found" });
    return;
    }

    // Check if user manages this shop by querying directly
    let managedShop = null;
    if (billing.shopId) {
      managedShop = await prisma.shop.findFirst({
        where: { 
          id: billing.shopId,
          managerId: user.publicId 
        },
      });
    }

    const userShopId = managedShop?.id;
    if (!user.role || (!isAdmin(user.role) && billing.shopId !== userShopId)) {
      res.status(403).json({ error: "Access denied to this billing" });
    return;
    }

    res.status(200).json(billing);
  } catch (error) {
    logger.error("Error fetching billing:", error);
    res.status(500).json({ error: "Failed to fetch billing" });
  }
};

// Update billing payment status
export const updateBillingPaymentStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { paymentStatus } = req.body;
    const userId = (req as any).user?.publicId;

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
    return;
    }

    const user = await prisma.user.findUnique({
      where: { publicId: userId },
    });

    if (!user) {
      res.status(401).json({ error: "User not found" });
    return;
    }

    const billing = await prisma.billing.findUnique({
      where: { id },
      include: {
        shop: true,
      },
    });

    if (!billing) {
      res.status(404).json({ error: "Billing not found" });
    return;
    }

    // Check if user manages this shop by querying directly
    let managedShop = null;
    if (billing.shopId) {
      managedShop = await prisma.shop.findFirst({
        where: { 
          id: billing.shopId,
          managerId: user.publicId 
        },
      });
    }

    const userShopId = managedShop?.id;
    if (!user.role || (!isAdmin(user.role) && billing.shopId !== userShopId)) {
      res.status(403).json({ error: "Access denied to this billing" });
    return;
    }

    if (!["pending", "paid", "failed"].includes(paymentStatus)) {
      res.status(400).json({ error: "Invalid payment status" });
    return;
    }

    const updatedBilling = await prisma.billing.update({
      where: { id },
      data: {
        paymentStatus,
        updatedAt: new Date(),
      },
      include: {
        shop: true,
      },
    });

    res.status(200).json(updatedBilling);
  } catch (error) {
    logger.error("Error updating billing payment status:", error);
    res.status(500).json({ error: "Failed to update billing payment status" });
  }
};

// Get billing statistics for a shop
export const getBillingStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const { shopId } = req.params;
    const userId = (req as any).user?.publicId;

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
    return;
    }

    const user = await prisma.user.findUnique({
      where: { publicId: userId },
    });

    if (!user) {
      res.status(401).json({ error: "User not found" });
    return;
    }

    // Check if user manages this shop by querying directly
    const managedShop = await prisma.shop.findFirst({
      where: { 
        id: shopId,
        managerId: user.publicId 
      },
    });

    const userShopId = managedShop?.id;
    if (!user.role || (!isAdmin(user.role) && shopId !== userShopId)) {
      res.status(403).json({ error: "Access denied to this shop" });
    return;
    }

    // Get billing statistics
    const stats = await prisma.billing.groupBy({
      by: ['paymentStatus'],
      where: { shopId },
      _count: { id: true },
      _sum: { total: true },
    });

    // Get total counts
    const totalBillings = await prisma.billing.count({
      where: { shopId },
    });

    const totalRevenue = await prisma.billing.aggregate({
      where: { 
        shopId,
        paymentStatus: "paid",
      },
      _sum: { total: true },
    });

    const result = {
      totalBillings,
      totalRevenue: totalRevenue._sum.total || 0,
      byStatus: stats.reduce((acc, stat) => {
        acc[stat.paymentStatus] = {
          count: stat._count.id,
          total: stat._sum.total || 0,
        };
        return acc;
      }, {} as any),
    };

    res.status(200).json(result);
  } catch (error) {
    logger.error("Error fetching billing stats:", error);
    res.status(500).json({ error: "Failed to fetch billing stats" });
  }
};
