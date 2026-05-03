import { Request, Response } from "express";
import { prisma } from "../config/client";
import { logger } from "../utils/logger";
import { isAdmin, isShopOwner } from "../config/roles";
import { emitUserNotification } from "./NotificationsController";
import { getSocketService } from "../services/socketService";

// Create shop inventory entry
export const createShopInventory = async (req: Request, res: Response): Promise<any> => {
  try {
    const { shopId, productId, currentStock = 0, minStockPerItem, lowStockAlertsEnabled, items } = req.body;
    const userId = (req as any).user?.publicId;

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    // Check if user has access to this shop
    const user = await prisma.user.findUnique({
      where: { publicId: userId },
      include: { 
        Role: true 
      },
    });

    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }

    // Get user's shop IDs from managed shops (temporary until shopIds is available)
    const managedShops = await prisma.shop.findMany({
      where: { managerId: userId },
      select: { id: true }
    });
    const userShopIds = managedShops.map(shop => shop.id);
    
    if (!user.Role || (!isAdmin(user.Role.name) && userShopIds.length === 0)) {
      return res.status(403).json({ error: "User has no assigned shops" });
    }
    // Check if user has access to this shop
    console.log("User role:", user.Role?.name, "User shop IDs:", userShopIds, "Requested shop ID:", shopId);
    if (!user.Role || (!isAdmin(user.Role.name) && !userShopIds.includes(shopId))) {
      res.status(403).json({ error: "Access denied to this shop" });
      return;
    }

    // If bulk items provided, handle multiple creations
    if (Array.isArray(items) && items.length > 0) {
      console.log("Bulk creation requested:", { shopId, itemsCount: items.length });
      const created: any[] = [];

      for (const it of items) {
        const { productId: pId, currentStock: cs = 0, minStockPerItem: ms, lowStockAlertsEnabled: alerts } = it || {};
        // Validate product
        const product = await prisma.product.findUnique({ where: { id: pId } });
        if (!product) {
          continue; // skip invalid productId
        }

        const shop = await prisma.shop.findUnique({ where: { id: shopId } });
        if (!shop) {
          continue;
        }

              // Check if inventory entry already exists
      const existingInv = await prisma.shopInventory.findUnique({
        where: { shopId_productId: { shopId, productId: pId } },
        include: { shop: true, product: true },
      });

      let inv;
      if (existingInv) {
        // Update existing entry
        inv = await prisma.shopInventory.update({
          where: { id: existingInv.id },
          data: ({
            currentStock: cs,
            minStockPerItem: typeof ms === "number" ? ms : null,
            lowStockAlertsEnabled: alerts !== false,
            updatedAt: new Date(),
          } as any),
          include: { shop: true, product: true },
        });
      } else {
        // Create new entry
        inv = await prisma.shopInventory.create({
          data: ({
            shopId,
            productId: pId,
            currentStock: cs,
            minStockPerItem: typeof ms === "number" ? ms : null,
            lowStockAlertsEnabled: alerts !== false,
          } as any),
          include: { shop: true, product: true },
        });
      }

        // Notifications based on shop-specific thresholds
        const threshold = (inv as any).minStockPerItem ?? product.minStockLevel;
        const alertsEnabled = (inv as any).lowStockAlertsEnabled !== false;
        if (alertsEnabled && threshold && cs <= threshold) {
          const notificationMessage = `Low stock alert: ${product.name} in ${shop.name} has only ${cs} units remaining (min: ${threshold})`;
          if (shop.managerId) {
            await prisma.notification.create({
              data: { userId: shop.managerId, type: "CRITICAL", message: notificationMessage },
            });
            emitUserNotification(shop.managerId, {
              event: "low_stock_alert",
              notification: { type: "CRITICAL", message: notificationMessage },
            });
          }
        }

        created.push(inv);
      }

      res.status(201).json({ createdCount: created.length, items: created });
      return;
    }

    // Single item create: validate product
    console.log("Single item creation:", { shopId, productId, currentStock, minStockPerItem, lowStockAlertsEnabled });
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      res.status(404).json({ error: "Product not found" });
      return;
    }

    // Check if shop exists
    const shop = await prisma.shop.findUnique({
      where: { id: shopId },
    });

    if (!shop) {
      res.status(404).json({ error: "Shop not found" });
      return;
    }

    // Create shop inventory entry
    const shopInventory = await prisma.shopInventory.create({
      data: ({
        shopId,
        productId,
        currentStock,
        minStockPerItem: typeof minStockPerItem === "number" ? minStockPerItem : null,
        lowStockAlertsEnabled: lowStockAlertsEnabled !== false,
      } as any),
      include: {
        shop: true,
        product: true,
      },
    });

    // Check if stock is low and trigger notification (respect per-shop toggle and threshold)
    // Use type assertion to bridge until Prisma types are regenerated
    const threshold = (shopInventory as any).minStockPerItem ?? product.minStockLevel;
    const alertsEnabled = (shopInventory as any).lowStockAlertsEnabled !== false;
    if (alertsEnabled && threshold && currentStock <= threshold) {
      const notificationMessage = `🚨 Low stock alert: ${product.name} in ${shop.name} has only ${currentStock} units remaining (min: ${threshold})`;
      
      // Notify shop manager
      if (shop.managerId) {
        await prisma.notification.create({
          data: {
            userId: shop.managerId,
            type: "CRITICAL",
            message: notificationMessage,
          },
        });
        
        // Emit real-time notification
        emitUserNotification(shop.managerId, {
          event: "low_stock_alert",
          notification: {
            type: "CRITICAL",
            message: notificationMessage,
          },
        });
      }
    }

    // Broadcast real-time update
    const socketService = getSocketService();
    socketService.broadcastInventoryUpdate(shopId, {
      type: 'created',
      inventory: shopInventory,
      timestamp: new Date().toISOString()
    });

    res.status(201).json(shopInventory);
  } catch (error) {
    logger.error("Error creating shop inventory:", error);
    console.log(error);
    res.status(500).json({ error: "Failed to create shop inventory" });
  }
};

// Get shop inventory by shop ID
export const getShopInventory = async (req: Request, res: Response): Promise<any> => {
  try {
    const { shopId } = req.params;
    const userId = (req as any).user?.publicId;

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { publicId: (req as any).user?.publicId },
      include: { 
        Role: true 
      },
    });

    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }

    // Get user's shop IDs from managed shops (temporary until shopIds is available)
    const managedShops = await prisma.shop.findMany({
      where: { managerId: (req as any).user?.publicId },
      select: { id: true }
    });
    const userShopIds = managedShops.map(shop => shop.id);
    
    if (!user.Role || (!isAdmin(user.Role.name) && userShopIds.length === 0)) {
      return res.status(403).json({ error: "User has no assigned shops" });
    }

    // Check if user has access to this shop
    console.log("GET - User role:", user.Role?.name, "User shop IDs:", userShopIds, "Requested shop ID:", shopId);
    if (!user.Role || (!isAdmin(user.Role.name) && !userShopIds.includes(shopId))) {
      res.status(403).json({ error: "Access denied to this shop" });
      return;
    }

    console.log("Fetching inventory for shopId:", shopId);
    const inventory = await prisma.shopInventory.findMany({
      where: { 
        shopId,
        isActive: true,
      },
      include: {
        product: {
          include: {
            category: true,
            flavor: true,
          },
        },
      },
      orderBy: { product: { name: "asc" } },
    });

    console.log("Found inventory items:", inventory.length);
    res.status(200).json(inventory);
  } catch (error) {
    console.log(error);
    logger.error("Error fetching shop inventory:", error);
    res.status(500).json({ error: "Failed to fetch shop inventory" });
  }
};

// Update shop inventory stock
export const updateShopInventoryStock = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    const { currentStock, minStockPerItem, lowStockAlertsEnabled } = req.body;
    const userId = (req as any).user?.id;

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { publicId: (req as any).user?.publicId },
      include: { 
        Role: true 
      },
    });

    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }

    // Get current inventory entry
    const currentInventory = await prisma.shopInventory.findUnique({
      where: { id },
      include: {
        shop: true,
        product: true,
      },
    });

    if (!currentInventory) {
      res.status(404).json({ error: "Inventory entry not found" });
      return;
    }

    // Get user's shop IDs from managed shops (temporary until shopIds is available)
    const managedShops = await prisma.shop.findMany({
      where: { managerId: (req as any).user?.publicId },
      select: { id: true }
    });
    const userShopIds = managedShops.map(shop => shop.id);
    
    if (!user.Role || (!isAdmin(user.Role.name) && userShopIds.length === 0)) {
      return res.status(403).json({ error: "User has no assigned shops" });
    }

    // Check if user has access to this shop
    if (!user.Role || (!isAdmin(user.Role.name) && !userShopIds.includes(currentInventory.shopId))) {
      res.status(403).json({ error: "Access denied to this shop" });
      return;
    }

    const updateData: {
      currentStock?: number;
      minStockPerItem?: number | null;
      lowStockAlertsEnabled?: boolean;
      updatedAt: Date;
    } = { updatedAt: new Date() };

    if (typeof currentStock === "number" && Number.isFinite(currentStock)) {
      updateData.currentStock = Math.max(0, Math.floor(currentStock));
    }
    if (minStockPerItem !== undefined) {
      if (minStockPerItem === null || minStockPerItem === "") {
        updateData.minStockPerItem = null;
      } else if (typeof minStockPerItem === "number" && Number.isFinite(minStockPerItem)) {
        updateData.minStockPerItem = Math.max(0, Math.floor(minStockPerItem));
      }
    }
    if (typeof lowStockAlertsEnabled === "boolean") {
      updateData.lowStockAlertsEnabled = lowStockAlertsEnabled;
    }

    if (
      updateData.currentStock === undefined &&
      updateData.minStockPerItem === undefined &&
      updateData.lowStockAlertsEnabled === undefined
    ) {
      res.status(400).json({
        error:
          "Provide at least one of: currentStock, minStockPerItem, lowStockAlertsEnabled",
      });
      return;
    }

    const updatedInventory = await prisma.shopInventory.update({
      where: { id },
      data: updateData as any,
      include: {
        shop: true,
        product: true,
      },
    });

    // Check if stock is low and trigger notification (respect per-shop toggle and threshold)
    // Use type assertion to bridge until Prisma types are regenerated
    const threshold = (updatedInventory as any).minStockPerItem ?? updatedInventory.product.minStockLevel;
    const alertsEnabled = (updatedInventory as any).lowStockAlertsEnabled !== false;
    const stockAfter = updatedInventory.currentStock;
    if (alertsEnabled && threshold && stockAfter <= threshold) {
      const notificationMessage = `🚨 Low stock alert: ${updatedInventory.product.name} in ${updatedInventory.shop.name} has only ${stockAfter} units remaining (min: ${threshold})`;
      
      // Notify shop manager
      if (updatedInventory.shop.managerId) {
        await prisma.notification.create({
          data: {
            userId: updatedInventory.shop.managerId,
            type: "CRITICAL",
            message: notificationMessage,
          },
        });
        
        emitUserNotification(updatedInventory.shop.managerId, {
          event: "low_stock_alert",
          notification: {
            type: "CRITICAL",
            message: notificationMessage,
          },
        });
      }
    }

    // Broadcast real-time update
    const socketService = getSocketService();
    socketService.broadcastInventoryUpdate(updatedInventory.shopId, {
      type: 'stock_updated',
      inventory: updatedInventory,
      timestamp: new Date().toISOString()
    });

    res.status(200).json(updatedInventory);
  } catch (error) {
    logger.error("Error updating shop inventory stock:", error);
    res.status(500).json({ error: "Failed to update shop inventory stock" });
  }
};

// Remove product from shop (soft delete)
  export const removeProductFromShop = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.id;

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { publicId: (req as any).user?.publicId },
      include: { 
        Role: true 
      },
    });

    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }

    const inventory = await prisma.shopInventory.findUnique({
      where: { id },
      include: { shop: true },
    });

    if (!inventory) {
      res.status(404).json({ error: "Inventory entry not found" });
      return;
    }

    // Get user's shop IDs from managed shops (temporary until shopIds is available)
    const managedShops = await prisma.shop.findMany({
      where: { managerId: (req as any).user?.publicId },
      select: { id: true }
    });
    const userShopIds = managedShops.map(shop => shop.id);
    
    if (!user.Role || (!isAdmin(user.Role.name) && userShopIds.length === 0)) {
      return res.status(403).json({ error: "User has no assigned shops" });
    }

    // Check if user has access to this shop
    if (!user.Role || (!isAdmin(user.Role.name) && !userShopIds.includes(inventory.shopId))) {
      res.status(403).json({ error: "Access denied to this shop" });
      return;
    }

    // Soft delete by marking as inactive
    const updatedInventory = await prisma.shopInventory.update({
      where: { id },
      data: { isActive: false },
    });

    res.status(200).json({ message: "Product removed from shop successfully" });
  } catch (error) {
    logger.error("Error removing product from shop:", error);
    res.status(500).json({ error: "Failed to remove product from shop" });
  }
};

// Initialize shop inventory for new shop
export const initializeShopInventory = async (shopId: string, productIds: string[]) => {
  try {
    const inventoryEntries = await Promise.all(
      productIds.map(productId =>
        prisma.shopInventory.create({
          data: {
            shopId,
            productId,
            currentStock: 0,
          },
        })
      )
    );

    logger.info(`Initialized ${inventoryEntries.length} inventory entries for shop ${shopId}`);
    return inventoryEntries;
  } catch (error) {
    logger.error("Error initializing shop inventory:", error);
    throw error;
  }
};
