"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateFactoryStockWithNotifications = exports.getTotalItemsWorth = exports.getTotalRevenue = exports.getLowStockProducts = exports.getProductsByFlavor = exports.hardDeleteProduct = exports.deleteProduct = exports.updateProductStock = exports.updateProduct = exports.getProductBySku = exports.getProductById = exports.getProducts = exports.createProduct = void 0;
const client_1 = require("../../config/client");
const logger_1 = require("../../utils/logger");
const NotificationsController_1 = require("../NotificationsController");
const audit_1 = require("../../utils/audit");
const socketService_1 = require("../../services/socketService");
const roles_1 = require("../../config/roles");
const createProduct = async (req, res) => {
    try {
        const { sku, name, description, categoryId, packagingTypeId, quantityInLiters, unitSize, unitMeasurement, unitPrice, costPrice, retailPrice, totalStock, minStockLevel, barcode, imageUrl, flavorId, } = req.body;
        // Validate that category and flavor exist
        const category = await client_1.prisma.category.findUnique({
            where: { id: categoryId },
        });
        if (!category) {
            return res.status(400).json({ error: "Invalid category ID" });
        }
        const flavor = await client_1.prisma.flavor.findUnique({
            where: { id: flavorId },
        });
        // If packagingTypeId provided, validate exists
        if (packagingTypeId) {
            const pkg = await client_1.prisma.packagingType.findUnique({
                where: { id: packagingTypeId },
            });
            if (!pkg) {
                return res.status(400).json({ error: "Invalid packaging type ID" });
            }
        }
        if (!flavor) {
            return res.status(400).json({ error: "Invalid flavor ID" });
        }
        // Check if SKU is unique
        const existingSku = await client_1.prisma.product.findUnique({
            where: { sku },
        });
        if (existingSku) {
            return res.status(400).json({ error: "SKU already exists" });
        }
        const product = await client_1.prisma.product.create({
            data: {
                sku,
                name,
                description,
                categoryId,
                packagingTypeId,
                quantityInLiters,
                unitSize,
                unitMeasurement,
                unitPrice,
                costPrice,
                retailPrice,
                totalStock,
                minStockLevel,
                barcode,
                imageUrl,
                flavorId,
            },
            include: {
                category: true,
                flavor: true,
                packagingType: true,
            },
        });
        logger_1.logger.controller.create("Product", {
            name: product.name,
            sku: product.sku,
        });
        await (0, audit_1.logActivity)({
            type: "product",
            action: "created",
            entity: "Product",
            entityId: product.id,
            userId: req.user?.publicId,
            metadata: { name: product.name, sku: product.sku },
        });
        try {
            const userId = req.user?.publicId;
            if (userId) {
                const created = await client_1.prisma.notification.create({
                    data: {
                        userId,
                        type: "PRODUCT_CREATED",
                        message: `Created product ${product.name}`,
                    },
                });
                await (0, NotificationsController_1.emitUserNotification)(userId.toString(), {
                    event: "created",
                    notification: created,
                });
                // Low stock notification on create
                if (product.minStockLevel != null &&
                    product.totalStock <= product.minStockLevel) {
                    const low = await client_1.prisma.notification.create({
                        data: {
                            userId,
                            type: "CRITICAL",
                            message: `${product.name} is at or below minimum stock`,
                        },
                    });
                    await (0, NotificationsController_1.emitUserNotification)(userId.toString(), {
                        event: "created",
                        notification: low,
                    });
                }
            }
        }
        catch { }
        res.status(201).json(product);
    }
    catch (error) {
        logger_1.logger.error("Error creating product:", error);
        if (error.code === "P2002") {
            return res
                .status(400)
                .json({ error: "A product with this SKU already exists" });
        }
        res.status(500).json({ error: "Failed to create product" });
    }
};
exports.createProduct = createProduct;
const getProducts = async (req, res) => {
    const packagingTypeId = req.query.packagingTypeId;
    try {
        const userId = req.user?.publicId;
        if (!userId) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        // Get user with role information
        const user = await client_1.prisma.user.findUnique({
            where: { publicId: userId },
            include: {
                Role: true,
            },
        });
        if (!user) {
            return res.status(401).json({ error: "User not found" });
        }
        // Get query parameters for filtering
        const { categoryId, flavorId, isActive } = req.query;
        // Build where clause based on query parameters
        const where = {};
        if (categoryId)
            where.categoryId = categoryId;
        if (flavorId)
            where.flavorId = flavorId;
        if (isActive !== undefined)
            where.isActive = isActive === "true";
        else
            where.isActive = true; // Default to active products only
        // Products are master data from factory - all authenticated users can see all products
        const products = await client_1.prisma.product.findMany({
            where,
            include: {
                category: true,
                flavor: true,
                packagingType: true,
            },
            orderBy: {
                name: "asc",
            },
        });
        return res.json(products);
    }
    catch (error) {
        logger_1.logger.error("Error fetching products:", error);
        if (!res.headersSent) {
            return res.status(500).json({ error: "Failed to fetch products" });
        }
        // If headers are already sent, just end the function
        return;
    }
};
exports.getProducts = getProducts;
const getProductById = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.publicId;
        if (!userId) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        // Get user with role information
        const user = await client_1.prisma.user.findUnique({
            where: { publicId: userId },
            include: {
                Role: true,
            },
        });
        if (!user) {
            return res.status(401).json({ error: "User not found" });
        }
        const product = await client_1.prisma.product.findUnique({
            where: { id },
            include: {
                category: true,
                flavor: true,
                packagingType: true,
                restockRequests: true,
            },
        });
        if (!product) {
            return res.status(404).json({ error: "Product not found" });
        }
        // Products are master data from factory - all authenticated users can see all products
        res.json(product);
    }
    catch (error) {
        logger_1.logger.error("Error fetching product:", error);
        res.status(500).json({ error: "Failed to fetch product" });
    }
};
exports.getProductById = getProductById;
const getProductBySku = async (req, res) => {
    try {
        const { sku } = req.params;
        const product = await client_1.prisma.product.findUnique({
            where: { sku },
            include: {
                category: true,
                flavor: true,
                packagingType: true,
            },
        });
        if (!product) {
            return res.status(404).json({ error: "Product not found" });
        }
        res.json(product);
    }
    catch (error) {
        logger_1.logger.error("Error fetching product by SKU:", error);
        res.status(500).json({ error: "Failed to fetch product by SKU" });
    }
};
exports.getProductBySku = getProductBySku;
const updateProduct = async (req, res) => {
    try {
        const { id } = req.params;
        const { sku, name, description, categoryId, packagingTypeId, packagingType, quantityInLiters, unitSize, unitMeasurement, unitPrice, costPrice, retailPrice, totalStock, minStockLevel, barcode, imageUrl, flavorId, isActive, } = req.body;
        // Check if product exists
        const existingProduct = await client_1.prisma.product.findUnique({
            where: { id },
        });
        if (!existingProduct) {
            return res.status(404).json({ error: "Product not found" });
        }
        // If categoryId is provided, validate it exists
        if (categoryId) {
            const category = await client_1.prisma.category.findUnique({
                where: { id: categoryId },
            });
            if (!category) {
                return res.status(400).json({ error: "Invalid category ID" });
            }
        }
        // If flavorId is provided, validate it exists
        if (flavorId) {
            const flavor = await client_1.prisma.flavor.findUnique({
                where: { id: flavorId },
            });
            if (!flavor) {
                return res.status(400).json({ error: "Invalid flavor ID" });
            }
        }
        // If packagingTypeId is provided, validate exists
        if (packagingTypeId) {
            const pkg = await client_1.prisma.packagingType.findUnique({
                where: { id: packagingTypeId },
            });
            if (!pkg) {
                return res.status(400).json({ error: "Invalid packaging type ID" });
            }
        }
        // If SKU is changed, check it's not already in use
        if (sku && sku !== existingProduct.sku) {
            const existingSku = await client_1.prisma.product.findUnique({
                where: { sku },
            });
            if (existingSku && existingSku.id !== id) {
                return res.status(400).json({ error: "SKU already exists" });
            }
        }
        const product = await client_1.prisma.product.update({
            where: { id },
            data: {
                name,
                description,
                categoryId,
                packagingTypeId,
                quantityInLiters,
                unitSize,
                unitMeasurement,
                unitPrice,
                costPrice,
                retailPrice,
                totalStock,
                minStockLevel,
                barcode,
                imageUrl,
                flavorId,
                isActive,
            },
            include: {
                category: true,
                flavor: true,
                packagingType: true,
            },
        });
        logger_1.logger.controller.update("Product", product.id, { name: product.name });
        await (0, audit_1.logActivity)({
            type: "product",
            action: "updated",
            entity: "Product",
            entityId: product.id,
            userId: req.user?.publicId,
            metadata: { name: product.name },
        });
        try {
            const userId = req.user?.publicId;
            if (userId) {
                const updated = await client_1.prisma.notification.create({
                    data: {
                        userId,
                        type: "PRODUCT_UPDATED",
                        message: `Updated product ${product.name}`,
                    },
                });
                await (0, NotificationsController_1.emitUserNotification)(userId.toString(), {
                    event: "created",
                    notification: updated,
                });
                if (product.minStockLevel != null &&
                    product.totalStock <= product.minStockLevel) {
                    const low = await client_1.prisma.notification.create({
                        data: {
                            userId,
                            type: "CRITICAL",
                            message: `${product.name} is at or below minimum stock`,
                        },
                    });
                    await (0, NotificationsController_1.emitUserNotification)(userId.toString(), {
                        event: "created",
                        notification: low,
                    });
                }
            }
        }
        catch { }
        res.json(product);
    }
    catch (error) {
        logger_1.logger.error("Error updating product:", error);
        console.error("Full error details:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
        // Check for specific Prisma errors
        if (error.code === "P2002") {
            return res
                .status(400)
                .json({ error: "A product with this SKU already exists" });
        }
        if (error.code === "P2003") {
            return res.status(400).json({
                error: "Invalid foreign key reference",
                details: error.meta
            });
        }
        if (error.code === "P2025") {
            return res.status(404).json({
                error: "Product not found",
                details: error.meta
            });
        }
        // Return more detailed error for debugging
        res.status(500).json({
            error: "Failed to update product",
            message: error.message || "Unknown error",
            code: error.code || "UNKNOWN"
        });
    }
};
exports.updateProduct = updateProduct;
const updateProductStock = async (req, res) => {
    try {
        const { id } = req.params;
        const { totalStock } = req.body;
        if (typeof totalStock !== "number" || totalStock < 0) {
            return res.status(400).json({ error: "Invalid stock value" });
        }
        // Get current product data before update
        const currentProduct = await client_1.prisma.product.findUnique({
            where: { id },
            select: { id: true, name: true, totalStock: true },
        });
        if (!currentProduct) {
            return res.status(404).json({ error: "Product not found" });
        }
        const stockChange = totalStock - currentProduct.totalStock;
        // Use the helper function for consistent stock updates with notifications
        const updatedProduct = await (0, exports.updateFactoryStockWithNotifications)(id, stockChange, "manual_stock_update", {
            updatedBy: req.user?.publicId,
            updateType: "direct_stock_set",
        });
        res.json(updatedProduct);
    }
    catch (error) {
        logger_1.logger.error("Error updating product stock:", error);
        res.status(500).json({
            error: error instanceof Error
                ? error.message
                : "Failed to update product stock",
        });
    }
};
exports.updateProductStock = updateProductStock;
const deleteProduct = async (req, res) => {
    try {
        const { id } = req.params;
        // Soft delete - mark as inactive
        await client_1.prisma.product.update({
            where: { id },
            data: {
                isActive: false,
            },
        });
        res.json({ message: "Product deactivated successfully" });
    }
    catch (error) {
        logger_1.logger.error("Error deactivating product:", error);
        res.status(500).json({ error: "Failed to delete product" });
    }
};
exports.deleteProduct = deleteProduct;
const hardDeleteProduct = async (req, res) => {
    try {
        const { id } = req.params;
        // Check if there are any related restock requests
        const relatedRequests = await client_1.prisma.restockRequest.findMany({
            where: { productId: id },
        });
        if (relatedRequests.length > 0) {
            return res.status(400).json({
                error: "Cannot delete product with existing restock requests",
                count: relatedRequests.length,
            });
        }
        // Hard delete - remove from database
        const product = await client_1.prisma.product.findUnique({ where: { id } });
        await client_1.prisma.product.delete({
            where: { id },
        });
        const productCount = await client_1.prisma.product.count();
        res.json({
            message: `${product?.name} has been successfully deleted`,
            count: productCount,
        });
    }
    catch (error) {
        logger_1.logger.error("Error deleting product:", error);
        res.status(500).json({ error: "Failed to delete product" });
    }
};
exports.hardDeleteProduct = hardDeleteProduct;
const getProductsByFlavor = async (req, res) => {
    try {
        const { flavorId } = req.params;
        // First check if flavor exists
        const flavor = await client_1.prisma.flavor.findUnique({
            where: { id: flavorId },
        });
        if (!flavor) {
            return res.status(404).json({ error: "Flavor not found" });
        }
        const products = await client_1.prisma.product.findMany({
            where: {
                flavorId,
                isActive: true,
            },
            include: {
                category: true,
                flavor: true,
            },
            orderBy: {
                name: "asc",
            },
        });
        res.json({
            flavor,
            products,
        });
    }
    catch (error) {
        logger_1.logger.error("Error fetching products by flavor:", error);
        res.status(500).json({ error: "Failed to fetch products by flavor" });
    }
};
exports.getProductsByFlavor = getProductsByFlavor;
const getLowStockProducts = async (req, res) => {
    try {
        const lowStockProducts = await client_1.prisma.product.findMany({
            where: {
                isActive: true,
                minStockLevel: {
                    not: null,
                },
                totalStock: {
                    lte: client_1.prisma.product.fields.minStockLevel,
                },
            },
            include: {
                category: true,
                flavor: true,
            },
            orderBy: {
                totalStock: "asc",
            },
        });
        res.json(lowStockProducts);
    }
    catch (error) {
        logger_1.logger.error("Error fetching low stock products:", error);
        res.status(500).json({ error: "Failed to fetch low stock products" });
    }
};
exports.getLowStockProducts = getLowStockProducts;
// Get total revenue from all shop billings (real revenue)
const getTotalRevenue = async (req, res) => {
    try {
        const userId = req.user?.publicId;
        if (!userId) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        // Get user with role information
        const user = await client_1.prisma.user.findUnique({
            where: { publicId: userId },
            include: {
                Role: true,
            },
        });
        if (!user) {
            return res.status(401).json({ error: "User not found" });
        }
        // Only Admin can access total revenue
        if (!user.Role || !(0, roles_1.isAdmin)(user.Role.name)) {
            return res
                .status(403)
                .json({ error: "Access denied: Admin role required" });
        }
        // Get all shop billings (exclude factory billings)
        const billings = await client_1.prisma.billing.findMany({
            where: {
                invoiceType: "SHOP", // Only shop billings count as revenue
                shopId: { not: null }, // Ensure it's a shop billing
            },
            select: {
                total: true,
                createdAt: true,
                shopId: true,
                shop: {
                    select: {
                        name: true,
                    },
                },
            },
        });
        // Calculate total revenue
        const totalRevenue = billings.reduce((sum, billing) => sum + (billing.total || 0), 0);
        // Calculate total profit (revenue - cost)
        let totalProfit = 0;
        for (const billing of billings) {
            // For each billing, we need to calculate profit based on items sold
            // This is a simplified calculation - in a real scenario, you'd need to track
            // the cost price of each item sold in the billing
            if (billing.total) {
                // Assuming 30% profit margin as an example
                // In reality, you'd calculate this based on actual cost prices
                totalProfit += billing.total * 0.3;
            }
        }
        // Get revenue by shop
        const revenueByShop = billings.reduce((acc, billing) => {
            const shopName = billing.shop?.name || "Unknown Shop";
            if (!acc[shopName]) {
                acc[shopName] = 0;
            }
            acc[shopName] += billing.total || 0;
            return acc;
        }, {});
        res.json({
            totalRevenue,
            totalProfit,
            totalBills: billings.length,
            revenueByShop,
            lastUpdated: new Date().toISOString(),
        });
    }
    catch (error) {
        logger_1.logger.error("Error fetching total revenue:", error);
        res.status(500).json({ error: "Failed to fetch total revenue" });
    }
};
exports.getTotalRevenue = getTotalRevenue;
// Get total items worth from restock requests (inventory tracking)
const getTotalItemsWorth = async (req, res) => {
    try {
        const userId = req.user?.publicId;
        if (!userId) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        // Get user with role information
        const user = await client_1.prisma.user.findUnique({
            where: { publicId: userId },
            include: {
                Role: true,
            },
        });
        if (!user) {
            return res.status(401).json({ error: "User not found" });
        }
        // Only Admin can access total items worth
        if (!user.Role || !(0, roles_1.isAdmin)(user.Role.name)) {
            return res
                .status(403)
                .json({ error: "Access denied: Admin role required" });
        }
        // Get all fulfilled restock requests
        const restockRequests = await client_1.prisma.restockRequest.findMany({
            where: {
                status: "fulfilled",
            },
            include: {
                product: {
                    select: {
                        name: true,
                        unitPrice: true,
                    },
                },
                shop: {
                    select: {
                        name: true,
                    },
                },
            },
        });
        // Calculate total items worth
        const totalItemsWorth = restockRequests.reduce((sum, request) => {
            return sum + request.requestedAmount * (request.product.unitPrice || 0);
        }, 0);
        // Get items worth by shop
        const itemsWorthByShop = restockRequests.reduce((acc, request) => {
            const shopName = request.shop?.name || "Unknown Shop";
            if (!acc[shopName]) {
                acc[shopName] = 0;
            }
            acc[shopName] +=
                request.requestedAmount * (request.product.unitPrice || 0);
            return acc;
        }, {});
        res.json({
            totalItemsWorth,
            totalRequests: restockRequests.length,
            itemsWorthByShop,
            lastUpdated: new Date().toISOString(),
        });
    }
    catch (error) {
        logger_1.logger.error("Error fetching total items worth:", error);
        res.status(500).json({ error: "Failed to fetch total items worth" });
    }
};
exports.getTotalItemsWorth = getTotalItemsWorth;
// Helper function to update factory stock with WebSocket notifications
const updateFactoryStockWithNotifications = async (productId, stockChange, reason, metadata) => {
    try {
        // Get current product data including minStockLevel
        const currentProduct = await client_1.prisma.product.findUnique({
            where: { id: productId },
            select: { id: true, name: true, totalStock: true, minStockLevel: true },
        });
        if (!currentProduct) {
            throw new Error("Product not found");
        }
        const previousStock = currentProduct.totalStock;
        const newStock = previousStock + stockChange;
        // Check if the new stock would be negative
        if (newStock < 0) {
            throw new Error(`Insufficient factory stock. Available: ${previousStock}, Required: ${Math.abs(stockChange)}`);
        }
        // Update the product stock
        const updatedProduct = await client_1.prisma.product.update({
            where: { id: productId },
            data: {
                totalStock: newStock,
                updatedAt: new Date(),
            },
        });
        // Emit WebSocket updates
        const socketService = (0, socketService_1.getSocketService)();
        socketService.broadcastFactoryStockUpdate({
            event: "factory_stock:update",
            productId: updatedProduct.id,
            productName: updatedProduct.name,
            action: stockChange > 0 ? "stock_added" : "stock_deducted",
            stockChange: Math.abs(stockChange),
            previousStock,
            newStock,
            reason,
            metadata,
            timestamp: new Date().toISOString(),
        });
        // Check for low stock alert after stock update
        if (currentProduct.minStockLevel != null &&
            newStock <= currentProduct.minStockLevel) {
            // Get all admin users to notify them about low stock
            const adminUsers = await client_1.prisma.user.findMany({
                where: {
                    role: "Admin",
                },
                select: {
                    publicId: true,
                },
            });
            // Create low stock notifications for all admin users
            for (const adminUser of adminUsers) {
                const lowStockNotification = await client_1.prisma.notification.create({
                    data: {
                        userId: adminUser.publicId,
                        type: "CRITICAL",
                        message: `🚨 Factory low stock alert: ${updatedProduct.name} has only ${newStock} units remaining (min: ${currentProduct.minStockLevel})`,
                    },
                });
                // Emit real-time notification
                await (0, NotificationsController_1.emitUserNotification)(adminUser.publicId, {
                    event: "low_stock_alert",
                    notification: lowStockNotification,
                });
            }
            // Emit WebSocket low stock alert to all connected clients
            const socketService = (0, socketService_1.getSocketService)();
            socketService.emitToAll("factory_low_stock_alert", {
                event: "factory_low_stock_alert",
                notification: {
                    type: "CRITICAL",
                    message: `🚨 Factory low stock alert: ${updatedProduct.name} has only ${newStock} units remaining (min: ${currentProduct.minStockLevel})`,
                    timestamp: new Date().toISOString(),
                    data: {
                        productId: updatedProduct.id,
                        productName: updatedProduct.name,
                        currentStock: newStock,
                        minStockLevel: currentProduct.minStockLevel,
                        previousStock,
                        stockChange,
                        reason,
                    },
                },
            });
        }
        // Log the activity
        await (0, audit_1.logActivity)({
            type: "factory_stock",
            action: stockChange > 0 ? "added" : "deducted",
            entity: "Product",
            entityId: productId,
            metadata: {
                productName: updatedProduct.name,
                previousStock,
                newStock,
                stockChange,
                reason,
                ...metadata,
            },
            message: `Factory stock ${stockChange > 0 ? "added" : "deducted"} for ${updatedProduct.name}`,
            status: "success",
        });
        return updatedProduct;
    }
    catch (error) {
        logger_1.logger.error("Error updating factory stock:", error);
        throw error;
    }
};
exports.updateFactoryStockWithNotifications = updateFactoryStockWithNotifications;
