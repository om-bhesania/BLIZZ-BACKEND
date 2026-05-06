import { Request, Response } from "express";
import { prisma } from "../config/client";
import { logger } from "../utils/logger";
import { isAdmin, isShopOwner } from "../config/roles";
import { emitUserNotification } from "./NotificationsController";
import { getSocketService } from "../services/socketService";
import { logActivity } from "../utils/audit";
import { ParsedQs } from "qs";

// Prisma client types can lag after schema edits on Windows (EPERM on generate).
// Use a narrow fallback delegate so TypeScript remains buildable until regenerate.
const paymentMethodDelegate = (prisma as any).paymentMethod as {
  findUnique: (args: any) => Promise<any>;
  findMany: (args?: any) => Promise<any[]>;
  findFirst: (args: any) => Promise<any>;
  create: (args: any) => Promise<any>;
};

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
      subtotal: _clientSubtotalIgnored,
      tax: _clientTaxIgnored = 0,
      discount = 0,
      total: _clientTotalIgnored,
      paymentMethodId,
      paymentBreakdown,
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
      const { productId, quantity } = item;
      
      // Check if product exists
      const product = await prisma.product.findUnique({
        where: { id: productId },
      });

      if (!product) {
        res.status(400).json({ error: `Product ${productId} not found` });
        return;
      }

      // For factory invoices, skip shop inventory validation
      const effectiveUnitPrice = Number(product.unitPrice || 0);

      if (invoiceType === "FACTORY") {
        // Calculate item total based on product pricing
        const itemTotal = quantity * effectiveUnitPrice;

        validatedItems.push({
          productId,
          productName: item.productName || product.name,
          quantity,
          unitPrice: effectiveUnitPrice,
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

        // Calculate item total based on product pricing
        const itemTotal = quantity * effectiveUnitPrice;

        validatedItems.push({
          productId,
          productName: item.productName || product.name,
          quantity,
          unitPrice: effectiveUnitPrice,
          total: itemTotal,
        });

        // Prepare stock update for shop invoices
        stockUpdates.push({
          inventoryId: shopInventory.id,
          newStock: shopInventory.currentStock - quantity,
        });
      }
    }

    const selectedMethodId = typeof paymentMethodId === "string" ? paymentMethodId : "";
    let selectedMethod = null;
    if (selectedMethodId) {
      selectedMethod = await paymentMethodDelegate.findUnique({
        where: { id: selectedMethodId },
      });
      if (!selectedMethod || !selectedMethod.isActive) {
        res.status(400).json({ error: "Invalid payment method selected" });
        return;
      }
    }

    type PaymentBreakdownItem = { paymentMethodId?: string; amount?: number | string };
    const breakdownInput: PaymentBreakdownItem[] = Array.isArray(paymentBreakdown)
      ? paymentBreakdown
      : [];
    const isPartialPayment =
      selectedMethod?.name.toLowerCase() === "partial payment" ||
      breakdownInput.length > 0;

    let normalizedBreakdown: Array<{
      paymentMethodId: string;
      paymentMethodName: string;
      amount: number;
    }> = [];

    if (isPartialPayment) {
      if (!selectedMethod || selectedMethod.name.toLowerCase() !== "partial payment") {
        res.status(400).json({ error: "Select 'Partial Payment' as payment method for split payments" });
        return;
      }
      if (breakdownInput.length === 0) {
        res.status(400).json({ error: "Please add at least one partial payment entry" });
        return;
      }

      const methodIds = breakdownInput
        .map((entry) => String(entry.paymentMethodId || "").trim())
        .filter((id) => !!id);

      const methods = await paymentMethodDelegate.findMany({
        where: {
          id: { in: methodIds },
          isActive: true,
        },
      });
      const methodMap = new Map(methods.map((m) => [m.id, m]));

      try {
        normalizedBreakdown = breakdownInput.map((entry) => {
          const methodId = String(entry.paymentMethodId || "").trim();
          const amount = Number(entry.amount || 0);
          const method = methodMap.get(methodId);
          if (!method || !method.isActive) {
            throw new Error("Invalid payment method in partial payment");
          }
          if (!Number.isFinite(amount) || amount <= 0) {
            throw new Error("Partial payment amounts must be greater than 0");
          }
          if (method.name.toLowerCase() === "partial payment") {
            throw new Error("Partial payment cannot contain itself");
          }
          return {
            paymentMethodId: method.id,
            paymentMethodName: method.name,
            amount: Number(amount.toFixed(2)),
          };
        });
      } catch (e: any) {
        res.status(400).json({ error: e?.message || "Invalid partial payment breakdown" });
        return;
      }
    }

    // Server-assigned invoice number only (stored on Billing; max+1 from DB per year).
    let nextInvoiceNumber = await computeNextBlizzInvoiceNumber();
    const normalizedSubtotal = Number(
      validatedItems.reduce(
        (sum, line: any) => sum + Number(line.unitPrice || 0) * Number(line.quantity || 0),
        0
      )
    ); // GST-inclusive line totals from product prices
    const normalizedDiscount = Number(discount || 0);
    const tax = Number((normalizedSubtotal * (5 / 105)).toFixed(2)); // Extract GST component (5% inclusive)
    const total = Number((normalizedSubtotal - normalizedDiscount).toFixed(2));
    const paidAmount = Number(
      normalizedBreakdown.reduce((sum, p) => sum + p.amount, 0).toFixed(2)
    );
    const paymentStatus = isPartialPayment
      ? paidAmount >= total
        ? "paid"
        : "pending"
      : "pending";

    const baseData: any = {
      shopId: invoiceType === "FACTORY" ? null : shopId,
      customerName,
      customerEmail,
      customerContact,
      items: validatedItems,
      subtotal: normalizedSubtotal,
      tax,
      discount,
      total,
      paymentStatus,
      paymentMethod: selectedMethod?.name || null,
      paymentMethodId: selectedMethod?.id || null,
      paymentBreakdown: isPartialPayment ? normalizedBreakdown : null,
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

export const getPaymentMethods = async (_req: Request, res: Response): Promise<void> => {
  try {
    const methods = await paymentMethodDelegate.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });
    res.status(200).json(methods);
  } catch (error) {
    logger.error("Error fetching payment methods:", error);
    res.status(500).json({ error: "Failed to fetch payment methods" });
  }
};

export const createPaymentMethod = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.publicId;
    const name = String(req.body?.name || "").trim();

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!name) {
      res.status(400).json({ error: "Payment method name is required" });
      return;
    }

    const existing = await paymentMethodDelegate.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
    });
    if (existing) {
      res.status(409).json({ error: "Payment method already exists" });
      return;
    }

    const method = await paymentMethodDelegate.create({
      data: { name },
    });
    res.status(201).json(method);
  } catch (error) {
    logger.error("Error creating payment method:", error);
    res.status(500).json({ error: "Failed to create payment method" });
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
