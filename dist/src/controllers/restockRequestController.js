"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.softDeleteRestockRequest = exports.autoGenerateRestockRequest = exports.markRestockRequestFulfilled = exports.updateRestockRequestStatus = exports.rejectRestockRequest = exports.approveRestockRequest = exports.getAllRestockRequests = exports.getRestockRequests = exports.createRestockRequest = void 0;
const client_1 = require("../config/client");
const logger_1 = require("../utils/logger");
const roles_1 = require("../config/roles");
const NotificationsController_1 = require("./NotificationsController");
const socketService_1 = require("../services/socketService");
const console_log_colors_1 = require("console-log-colors");
const audit_1 = require("../utils/audit");
const ProductsController_1 = require("./Products/ProductsController");
// Create restock request
const createRestockRequest = async (req, res) => {
    try {
        const { shopId, productId, requestedAmount, notes, requestType = "RESTOCK", submissionBatchId, } = req.body;
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ error: "Unauthorized" });
            return;
        }
        // Check if user has access to this shop
        const user = await client_1.prisma.user.findUnique({
            where: { id: userId },
        });
        if (!user) {
            res.status(401).json({ error: "User not found" });
            return;
        }
        // Check if user manages this shop by querying directly
        const managedShop = await client_1.prisma.shop.findFirst({
            where: {
                id: shopId,
                managerId: user.publicId
            },
        });
        const userShopId = managedShop?.id;
        console.log((0, console_log_colors_1.bgRedBright)(user.role), 'user.role');
        // Allow Admin role or Shop_Owner role managing the specific shop
        if (!user.role || (!(0, roles_1.isAdmin)(user.role) && !(0, roles_1.isShopOwner)(user.role))) {
            res.status(403).json({ error: "Access denied: Admin or Shop Owner role required" });
            return;
        }
        // If user is Shop_Owner, they can only create requests for shops they manage
        if ((0, roles_1.isShopOwner)(user.role) && shopId !== userShopId) {
            res.status(403).json({ error: "Shop Owner can only create restock requests for their own shop" });
            return;
        }
        // Check if product exists
        const product = await client_1.prisma.product.findUnique({
            where: { id: productId },
        });
        if (!product) {
            res.status(404).json({ error: "Product not found" });
            return;
        }
        // Check if shop exists
        const shop = await client_1.prisma.shop.findUnique({
            where: { id: shopId },
        });
        if (!shop) {
            res.status(404).json({ error: "Shop not found" });
            return;
        }
        // Create restock request (supports RESTOCK and INVENTORY_ADD types)
        const restockRequest = await client_1.prisma.restockRequest.create({
            data: {
                shopId,
                productId,
                requestedAmount,
                notes,
                requestType,
                submissionBatchId: typeof submissionBatchId === "string" && submissionBatchId.trim()
                    ? submissionBatchId.trim()
                    : undefined,
                status: "waiting_for_approval", // Changed from "pending" to "waiting_for_approval"
            },
            include: {
                shop: true,
                product: true,
            },
        });
        // Create notification message
        const isInventoryAdd = String(requestType).toUpperCase() === 'INVENTORY_ADD';
        // Only notify Admin users about new restock requests (not the shop manager who created it)
        const adminUsers = await client_1.prisma.user.findMany({
            where: {
                role: "Admin"
            },
            select: {
                publicId: true
            }
        });
        for (const adminUser of adminUsers) {
            const adminNotificationMessage = `📦 New restock request from ${shop.name}: ${requestedAmount} units of ${product.name} requested by ${user.name || user.email}`;
            await client_1.prisma.notification.create({
                data: {
                    userId: adminUser.publicId,
                    type: "INFO",
                    message: adminNotificationMessage,
                },
            });
        }
        // Enhanced Audit Logging
        await (0, audit_1.logActivity)({
            type: "restock",
            action: "created",
            entity: "RestockRequest",
            entityId: restockRequest.id,
            userId: req.user?.publicId,
            shopId: shopId,
            metadata: {
                requestedAmount,
                productId,
                productName: product.name,
                shopName: shop.name,
                requestType: requestType,
                status: "waiting_for_approval",
                actionPerformedBy: user.name || user.email || 'Unknown User',
                actionTimestamp: new Date().toISOString(),
                details: `New ${isInventoryAdd ? 'inventory add' : 'restock'} request created by ${user.name || user.email}. ${requestedAmount} units of ${product.name} for ${shop.name}. Status: waiting_for_approval.`
            },
            message: `New ${isInventoryAdd ? 'inventory add' : 'restock'} request created`,
            status: "success"
        });
        // Emit consolidated real-time update
        const socketService = (0, socketService_1.getSocketService)();
        socketService.emitToAll('restock_request_created', {
            event: 'restock_request_created',
            notification: {
                type: 'INFO',
                message: `📦 New ${isInventoryAdd ? 'inventory add' : 'restock'} request from ${shop.name}: ${requestedAmount} units of ${product.name}`,
                timestamp: new Date().toISOString(),
                data: {
                    requestId: restockRequest.id,
                    shopId: shopId,
                    productName: product.name,
                    requestedAmount: requestedAmount,
                    requestType: requestType
                }
            }
        });
        res.status(201).json(restockRequest);
    }
    catch (error) {
        logger_1.logger.error("Error creating restock request:", error);
        res.status(500).json({ error: "Failed to create restock request" });
    }
};
exports.createRestockRequest = createRestockRequest;
// Get restock requests by shop ID
const getRestockRequests = async (req, res) => {
    try {
        const { shopId } = req.params;
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ error: "Unauthorized" });
            return;
        }
        const user = await client_1.prisma.user.findUnique({
            where: { id: userId },
        });
        if (!user) {
            res.status(401).json({ error: "User not found" });
            return;
        }
        // Check if user manages this shop by querying directly
        const managedShop = await client_1.prisma.shop.findFirst({
            where: {
                id: shopId,
                managerId: user.publicId
            },
        });
        const userShopId = managedShop?.id;
        // Allow Admin role or Shop_Owner role managing the specific shop
        if (!user.role || (!(0, roles_1.isAdmin)(user.role) && !(0, roles_1.isShopOwner)(user.role))) {
            res.status(403).json({ error: "Access denied: Admin or Shop Owner role required" });
            return;
        }
        // If user is Shop_Owner, they can only view requests for shops they manage
        if ((0, roles_1.isShopOwner)(user.role) && shopId !== userShopId) {
            res.status(403).json({ error: "Shop Owner can only view restock requests for their own shop" });
            return;
        }
        const restockRequests = await client_1.prisma.restockRequest.findMany({
            where: { shopId },
            include: {
                product: {
                    include: {
                        category: true,
                        flavor: true,
                    },
                },
            },
            orderBy: { createdAt: "desc" },
        });
        res.status(200).json(restockRequests);
    }
    catch (error) {
        logger_1.logger.error("Error fetching restock requests:", error);
        res.status(500).json({ error: "Failed to fetch restock requests" });
    }
};
exports.getRestockRequests = getRestockRequests;
// Get all restock requests across all shops (Admin only)
const getAllRestockRequests = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ error: "Unauthorized" });
            return;
        }
        const user = await client_1.prisma.user.findUnique({
            where: { id: userId },
        });
        if (!user) {
            res.status(401).json({ error: "User not found" });
            return;
        }
        // Only Admin role can view all restock requests
        if (!user.role || !(0, roles_1.isAdmin)(user.role)) {
            res.status(403).json({ error: "Access denied: Admin role required" });
            return;
        }
        const restockRequests = await client_1.prisma.restockRequest.findMany({
            where: {
                // @ts-ignore
                hidden: false, // Only show non-hidden requests
            },
            include: {
                shop: true,
                product: {
                    include: {
                        category: true,
                        flavor: true,
                    },
                },
            },
            orderBy: { createdAt: "desc" },
        });
        res.status(200).json(restockRequests);
    }
    catch (error) {
        logger_1.logger.error("Error fetching all restock requests:", error);
        res.status(500).json({ error: "Failed to fetch all restock requests" });
    }
};
exports.getAllRestockRequests = getAllRestockRequests;
// Approve restock request
const approveRestockRequest = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ error: "Unauthorized" });
            return;
        }
        const user = await client_1.prisma.user.findUnique({
            where: { id: userId },
        });
        if (!user) {
            res.status(401).json({ error: "User not found" });
            return;
        }
        // Get restock request
        const restockRequest = await client_1.prisma.restockRequest.findUnique({
            where: { id },
            include: {
                shop: true,
                product: true,
            },
        });
        if (!restockRequest) {
            res.status(404).json({ error: "Restock request not found" });
            return;
        }
        // Check if user manages this shop by querying directly
        const managedShop = await client_1.prisma.shop.findFirst({
            where: {
                id: restockRequest.shopId,
                managerId: user.publicId
            },
        });
        const userShopId = managedShop?.id;
        if (!user.role || (!(0, roles_1.isAdmin)(user.role) && restockRequest.shopId !== userShopId)) {
            res.status(403).json({ error: "Access denied to this shop" });
        }
        if (restockRequest.status !== "waiting_for_approval") {
            res.status(400).json({ error: "Restock request is not waiting for approval" });
            return;
        }
        // Check factory stock availability before approval (but don't deduct yet)
        const product = await client_1.prisma.product.findUnique({ where: { id: restockRequest.productId } });
        if (!product) {
            res.status(404).json({ error: "Product not found" });
            return;
        }
        // Check if there's enough factory stock for the request (but don't deduct until fulfillment)
        if (product.totalStock < restockRequest.requestedAmount) {
            res.status(400).json({ error: `Insufficient factory stock for ${product.name}. Available: ${product.totalStock}, Requested: ${restockRequest.requestedAmount}` });
            return;
        }
        // Approve request and move to approved_pending (don't deduct factory stock or increment shop stock yet)
        const updatedRequest = await client_1.prisma.restockRequest.update({
            where: { id },
            data: {
                status: "approved_pending", // Changed to approved_pending to show admin approved but pending fulfillment
                approvedAt: new Date(),
                updatedAt: new Date(),
            },
        });
        // Notify shop owner/manager about approval
        const notificationMessage = `✅ Restock request approved: ${restockRequest.requestedAmount} units of ${restockRequest.product.name} added to ${restockRequest.shop.name}`;
        if (restockRequest.shop.managerId) {
            await client_1.prisma.notification.create({
                data: {
                    userId: restockRequest.shop.managerId,
                    type: "INFO",
                    message: notificationMessage,
                },
            });
        }
        // Emit consolidated real-time updates
        const socketService = (0, socketService_1.getSocketService)();
        // Emit restock request approved event
        socketService.emitToAll('restock_request_approved', {
            event: 'restock_request_approved',
            notification: {
                type: 'INFO',
                message: notificationMessage,
                timestamp: new Date().toISOString(),
                data: {
                    requestId: updatedRequest.id,
                    shopId: restockRequest.shopId,
                    productName: restockRequest.product.name,
                    requestedAmount: restockRequest.requestedAmount,
                    status: 'in_transit'
                }
            }
        });
        // Note: Factory stock is NOT deducted during approval - only during fulfillment
        // This ensures stock is only reduced when items are actually delivered
        res.status(200).json(updatedRequest);
        // Enhanced Audit Logging
        await (0, audit_1.logActivity)({
            type: "restock",
            action: "status_changed",
            entity: "RestockRequest",
            entityId: updatedRequest.id,
            userId: req.user?.publicId,
            shopId: restockRequest.shopId,
            metadata: {
                status: updatedRequest.status,
                previousStatus: "waiting_for_approval",
                productName: restockRequest.product.name,
                requestedAmount: restockRequest.requestedAmount,
                shopName: restockRequest.shop.name,
                actionPerformedBy: user.name || user.email || 'Unknown User',
                actionTimestamp: new Date().toISOString(),
                details: `Restock request approved by ${user.name || user.email}. Status changed from 'waiting_for_approval' to 'approved_pending'. ${restockRequest.requestedAmount} units of ${restockRequest.product.name} for ${restockRequest.shop.name}.`
            },
            message: `Restock request approved`,
            status: "success"
        });
    }
    catch (error) {
        logger_1.logger.error("Error approving restock request:", error);
        res.status(500).json({ error: "Failed to approve restock request" });
    }
};
exports.approveRestockRequest = approveRestockRequest;
// Reject restock request
const rejectRestockRequest = async (req, res) => {
    try {
        const { id } = req.params;
        const { notes } = req.body;
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ error: "Unauthorized" });
            return;
        }
        const user = await client_1.prisma.user.findUnique({
            where: { id: userId },
        });
        if (!user) {
            res.status(401).json({ error: "User not found" });
            return;
        }
        // Get restock request
        const restockRequest = await client_1.prisma.restockRequest.findUnique({
            where: { id },
            include: {
                shop: true,
                product: true,
            },
        });
        if (!restockRequest) {
            res.status(404).json({ error: "Restock request not found" });
            return;
        }
        // Check if user manages this shop by querying directly
        const managedShop = await client_1.prisma.shop.findFirst({
            where: {
                id: restockRequest.shopId,
                managerId: user.publicId
            },
        });
        const userShopId = managedShop?.id;
        if (!user.role || (!(0, roles_1.isAdmin)(user.role) && restockRequest.shopId !== userShopId)) {
            res.status(403).json({ error: "Access denied to this shop" });
        }
        if (restockRequest.status !== "waiting_for_approval") {
            res.status(400).json({ error: "Restock request is not waiting for approval" });
            return;
        }
        // Update restock request status
        const updatedRequest = await client_1.prisma.restockRequest.update({
            where: { id },
            data: {
                status: "rejected",
                notes: notes || restockRequest.notes,
                updatedAt: new Date(),
            },
        });
        // Notify shop owner/manager about rejection
        const notificationMessage = `❌ Restock request declined: ${restockRequest.requestedAmount} units of ${restockRequest.product.name} for ${restockRequest.shop.name}. Reason: ${notes || "No reason provided"}`;
        if (restockRequest.shop.managerId) {
            await client_1.prisma.notification.create({
                data: {
                    userId: restockRequest.shop.managerId,
                    type: "WARNING",
                    message: notificationMessage,
                },
            });
        }
        // Emit consolidated real-time update
        const socketService = (0, socketService_1.getSocketService)();
        socketService.emitToAll('restock_request_rejected', {
            event: 'restock_request_rejected',
            notification: {
                type: 'WARNING',
                message: notificationMessage,
                timestamp: new Date().toISOString(),
                data: {
                    requestId: updatedRequest.id,
                    shopId: restockRequest.shopId,
                    productName: restockRequest.product.name,
                    requestedAmount: restockRequest.requestedAmount,
                    status: 'rejected',
                    reason: notes || 'No reason provided'
                }
            }
        });
        res.status(200).json(updatedRequest);
    }
    catch (error) {
        logger_1.logger.error("Error rejecting restock request:", error);
        res.status(500).json({ error: "Failed to reject restock request" });
    }
};
exports.rejectRestockRequest = rejectRestockRequest;
// Update restock request status
const updateRestockRequestStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, notes } = req.body;
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ error: "Unauthorized" });
            return;
        }
        const user = await client_1.prisma.user.findUnique({
            where: { id: userId },
        });
        if (!user) {
            res.status(401).json({ error: "User not found" });
            return;
        }
        // Only Admin role can update restock request status
        if (!user.role || !(0, roles_1.isAdmin)(user.role)) {
            res.status(403).json({ error: "Access denied: Admin role required" });
            return;
        }
        // Get restock request
        const restockRequest = await client_1.prisma.restockRequest.findUnique({
            where: { id },
            include: {
                shop: true,
                product: true,
            },
        });
        if (!restockRequest) {
            res.status(404).json({ error: "Restock request not found" });
            return;
        }
        // Validate status transition
        const validStatuses = [
            "waiting_for_approval",
            "pending",
            "approved",
            "approved_pending",
            "in_transit",
            "fulfilled",
            "rejected",
            "cancelled",
        ];
        if (!validStatuses.includes(status)) {
            res.status(400).json({
                error: "Invalid status. Must be one of: waiting_for_approval, pending, approved, approved_pending, in_transit, fulfilled, rejected, cancelled",
            });
            return;
        }
        // Update restock request status
        const updatedRequest = await client_1.prisma.restockRequest.update({
            where: { id },
            data: {
                status,
                notes: notes || restockRequest.notes,
                updatedAt: new Date(),
            },
        });
        // Only update inventory when status is "fulfilled" - this is the only time inventory should be updated
        let inventoryUpdateDetails = null;
        let factoryStockUpdateDetails = null;
        if (status === "fulfilled") {
            // First, check and update factory stock (ProductsController)
            const currentProduct = await client_1.prisma.product.findUnique({
                where: { id: restockRequest.productId },
                select: { id: true, name: true, totalStock: true }
            });
            if (!currentProduct) {
                res.status(404).json({ error: "Product not found" });
                return;
            }
            // Check if there's enough factory stock for the fulfillment
            if (currentProduct.totalStock < restockRequest.requestedAmount) {
                res.status(400).json({
                    error: `Insufficient factory stock for fulfillment. Available: ${currentProduct.totalStock}, Required: ${restockRequest.requestedAmount}`
                });
                return;
            }
            // Deduct from factory stock on fulfillment using helper function
            const updatedProduct = await (0, ProductsController_1.updateFactoryStockWithNotifications)(restockRequest.productId, -restockRequest.requestedAmount, 'restock_request_fulfilled', {
                requestId: updatedRequest.id,
                shopId: restockRequest.shopId,
                updatedBy: req.user?.publicId
            });
            factoryStockUpdateDetails = {
                previousStock: currentProduct.totalStock,
                newStock: updatedProduct.totalStock,
                stockDeducted: restockRequest.requestedAmount,
                factoryStockUpdated: true
            };
            // Then update shop inventory
            const currentInventory = await client_1.prisma.shopInventory.findFirst({
                where: {
                    shopId: restockRequest.shopId,
                    productId: restockRequest.productId,
                    isActive: true,
                },
            });
            const previousStock = currentInventory?.currentStock || 0;
            const newStock = previousStock + restockRequest.requestedAmount;
            if (currentInventory) {
                await client_1.prisma.shopInventory.update({
                    where: { id: currentInventory.id },
                    data: {
                        currentStock: newStock,
                        lastRestockDate: new Date(),
                        updatedAt: new Date(),
                    },
                });
            }
            else {
                await client_1.prisma.shopInventory.create({
                    data: {
                        shopId: restockRequest.shopId,
                        productId: restockRequest.productId,
                        currentStock: restockRequest.requestedAmount,
                        lastRestockDate: new Date(),
                    },
                });
            }
            inventoryUpdateDetails = {
                previousStock,
                newStock,
                stockAdded: restockRequest.requestedAmount,
                inventoryUpdated: true
            };
        }
        // Enhanced Audit Logging
        const auditDetails = {
            productId: restockRequest.productId,
            productName: restockRequest.product.name,
            requestedAmount: restockRequest.requestedAmount,
            shopName: restockRequest.shop.name,
            status,
            previousStatus: restockRequest.status,
            actionPerformedBy: user.name || user.email || 'Unknown User',
            actionTimestamp: new Date().toISOString(),
            details: `Restock request status changed by ${user.name || user.email}. Status changed from '${restockRequest.status}' to '${status}'. ${restockRequest.requestedAmount} units of ${restockRequest.product.name} for ${restockRequest.shop.name}.`
        };
        // Add inventory update details if applicable
        if (inventoryUpdateDetails) {
            auditDetails.inventoryUpdate = inventoryUpdateDetails;
            auditDetails.details += ` Inventory updated: Stock changed from ${inventoryUpdateDetails.previousStock} to ${inventoryUpdateDetails.newStock} (+${inventoryUpdateDetails.stockAdded}).`;
        }
        // Add factory stock update details if applicable
        if (factoryStockUpdateDetails) {
            auditDetails.factoryStockUpdate = factoryStockUpdateDetails;
            auditDetails.details += ` Factory stock updated: Stock changed from ${factoryStockUpdateDetails.previousStock} to ${factoryStockUpdateDetails.newStock} (-${factoryStockUpdateDetails.stockDeducted}).`;
        }
        await (0, audit_1.logActivity)({
            type: "restock",
            action: "status_changed",
            entity: "RestockRequest",
            entityId: updatedRequest.id,
            userId: req.user?.publicId,
            shopId: restockRequest.shopId,
            metadata: auditDetails,
            message: `Restock request status changed to ${status}`,
            status: "success"
        });
        // Create notification message
        const statusMessages = {
            waiting_for_approval: `New restock request created: ${restockRequest.requestedAmount} units of ${restockRequest.product.name} for ${restockRequest.shop.name}`,
            approved_pending: `Restock request approved by admin: ${restockRequest.requestedAmount} units of ${restockRequest.product.name} for ${restockRequest.shop.name} - pending fulfillment`,
            fulfilled: `Restock request completed: ${restockRequest.requestedAmount} units of ${restockRequest.product.name} delivered to ${restockRequest.shop.name}`,
            rejected: `Restock request declined: ${restockRequest.requestedAmount} units of ${restockRequest.product.name} for ${restockRequest.shop.name}. Reason: ${notes || "No reason provided"}`
        };
        const notificationMessage = statusMessages[status] || `Restock request status changed to ${status}: ${restockRequest.requestedAmount} units of ${restockRequest.product.name} for ${restockRequest.shop.name}`;
        // Determine notification category based on status
        const getNotificationCategory = (status) => {
            switch (status) {
                case 'pending':
                case 'approved':
                case 'fulfilled':
                    return 'INFO';
                case 'rejected':
                    return 'WARNING';
                case 'waiting_for_approval':
                    return 'INFO';
                default:
                    return 'INFO';
            }
        };
        const notificationCategory = getNotificationCategory(status);
        // Only notify shop owner/manager about status updates (not the admin who made the change)
        if (restockRequest.shop.managerId) {
            await client_1.prisma.notification.create({
                data: {
                    userId: restockRequest.shop.managerId,
                    type: notificationCategory,
                    message: notificationMessage,
                },
            });
        }
        // Emit single consolidated real-time update
        const socketService = (0, socketService_1.getSocketService)();
        socketService.emitToAll('restock_request_status_updated', {
            event: 'restock_request_status_updated',
            notification: {
                type: notificationCategory,
                message: notificationMessage,
                timestamp: new Date().toISOString(),
                data: {
                    requestId: updatedRequest.id,
                    shopId: restockRequest.shopId,
                    productName: restockRequest.product.name,
                    requestedAmount: restockRequest.requestedAmount,
                    status: status,
                    requestType: restockRequest.requestType
                }
            }
        });
        // Emit factory stock update if status is fulfilled
        if (status === "fulfilled" && factoryStockUpdateDetails) {
            // Emit inventory update event for real-time inventory view
            socketService.emitToAll('inventory:update', {
                event: 'inventory:update',
                shopId: restockRequest.shopId,
                productId: restockRequest.productId,
                requestedAmount: restockRequest.requestedAmount,
                action: 'restock_fulfilled',
                newStock: inventoryUpdateDetails?.newStock || 0,
                factoryStock: factoryStockUpdateDetails.newStock,
                productName: restockRequest.product.name,
                previousFactoryStock: factoryStockUpdateDetails.previousStock,
                factoryStockChange: -restockRequest.requestedAmount,
                timestamp: new Date().toISOString()
            });
            // Emit factory stock update event for real-time factory stock tracking
            socketService.broadcastFactoryStockUpdate({
                event: 'factory_stock:update',
                productId: restockRequest.productId,
                productName: restockRequest.product.name,
                action: 'stock_deducted',
                deductedAmount: restockRequest.requestedAmount,
                previousStock: factoryStockUpdateDetails.previousStock,
                newStock: factoryStockUpdateDetails.newStock,
                reason: 'restock_request_fulfilled',
                requestId: updatedRequest.id,
                shopId: restockRequest.shopId,
                shopInventoryUpdate: inventoryUpdateDetails ? {
                    previousStock: inventoryUpdateDetails.previousStock,
                    newStock: inventoryUpdateDetails.newStock,
                    stockAdded: inventoryUpdateDetails.stockAdded
                } : null,
                timestamp: new Date().toISOString()
            });
        }
        res.status(200).json(updatedRequest);
    }
    catch (error) {
        logger_1.logger.error("Error updating restock request status:", error);
        res.status(500).json({ error: "Failed to update restock request status" });
    }
};
exports.updateRestockRequestStatus = updateRestockRequestStatus;
// Mark restock request as fulfilled (called from shop inventory when order is received)
const markRestockRequestFulfilled = async (req, res) => {
    try {
        const { shopId, productId } = req.body;
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ error: "Unauthorized" });
            return;
        }
        const user = await client_1.prisma.user.findUnique({
            where: { id: userId },
        });
        if (!user) {
            res.status(401).json({ error: "User not found" });
            return;
        }
        // Check if user manages this shop
        const managedShop = await client_1.prisma.shop.findFirst({
            where: {
                id: shopId,
                managerId: user.publicId
            },
        });
        // Allow Admin role or Shop Owner role managing the specific shop
        if (!user.role || (!(0, roles_1.isAdmin)(user.role) && !(0, roles_1.isShopOwner)(user.role))) {
            res.status(403).json({ error: "Access denied: Admin or Shop Owner role required" });
            return;
        }
        // If user is Shop Owner, they can only mark requests for shops they manage
        if ((0, roles_1.isShopOwner)(user.role) && !managedShop) {
            res.status(403).json({ error: "Shop Owner can only mark restock requests as fulfilled for their own shops" });
            return;
        }
        // Find the most recent approved_pending restock request for this product and shop
        const restockRequest = await client_1.prisma.restockRequest.findFirst({
            where: {
                shopId,
                productId,
                status: "approved_pending" // Only fulfill requests that are approved and pending
            },
            orderBy: { createdAt: "desc" },
            include: {
                shop: true,
                product: true,
            },
        });
        if (!restockRequest) {
            res.status(404).json({ error: "No approved restock request found for this product and shop" });
            return;
        }
        // Update restock request status to fulfilled
        const updatedRequest = await client_1.prisma.restockRequest.update({
            where: { id: restockRequest.id },
            data: {
                status: "fulfilled",
                fulfilledAt: new Date(),
                updatedAt: new Date(),
            },
        });
        // Update factory stock on fulfillment (deduct from factory stock when actually delivered)
        const currentProduct = await client_1.prisma.product.findUnique({
            where: { id: restockRequest.productId },
            select: { id: true, name: true, totalStock: true }
        });
        if (!currentProduct) {
            res.status(404).json({ error: "Product not found" });
            return;
        }
        // Check if there's enough factory stock for the fulfillment
        if (currentProduct.totalStock < restockRequest.requestedAmount) {
            res.status(400).json({
                error: `Insufficient factory stock for fulfillment. Available: ${currentProduct.totalStock}, Required: ${restockRequest.requestedAmount}`
            });
            return;
        }
        // Deduct from factory stock on fulfillment using helper function
        const updatedProduct = await (0, ProductsController_1.updateFactoryStockWithNotifications)(restockRequest.productId, -restockRequest.requestedAmount, 'restock_request_fulfilled', {
            requestId: updatedRequest.id,
            shopId: restockRequest.shopId,
            updatedBy: user.publicId
        });
        // Increment shop inventory on fulfillment
        const currentInventory = await client_1.prisma.shopInventory.findFirst({
            where: {
                shopId,
                productId,
                isActive: true,
            },
        });
        let updatedInventory;
        if (currentInventory) {
            updatedInventory = await client_1.prisma.shopInventory.update({
                where: { id: currentInventory.id },
                data: {
                    currentStock: currentInventory.currentStock + restockRequest.requestedAmount,
                    lastRestockDate: new Date(),
                    updatedAt: new Date(),
                },
            });
        }
        else {
            updatedInventory = await client_1.prisma.shopInventory.create({
                data: {
                    shopId,
                    productId,
                    currentStock: restockRequest.requestedAmount,
                    lastRestockDate: new Date(),
                },
            });
        }
        // Enhanced Audit Logging for fulfillment
        const previousShopStock = currentInventory?.currentStock || 0;
        const newShopStock = updatedInventory?.currentStock || 0;
        const previousFactoryStock = currentProduct.totalStock;
        const newFactoryStock = updatedProduct.totalStock;
        await (0, audit_1.logActivity)({
            type: "restock",
            action: "fulfilled",
            entity: "RestockRequest",
            entityId: updatedRequest.id,
            userId: user.publicId,
            shopId: restockRequest.shopId,
            metadata: {
                productId: restockRequest.productId,
                productName: restockRequest.product.name,
                requestedAmount: restockRequest.requestedAmount,
                shopName: restockRequest.shop.name,
                status: "fulfilled",
                previousStatus: "approved_pending",
                actionPerformedBy: user.name || user.email || 'Unknown User',
                actionTimestamp: new Date().toISOString(),
                shopInventoryUpdate: {
                    previousStock: previousShopStock,
                    newStock: newShopStock,
                    stockAdded: restockRequest.requestedAmount,
                    inventoryUpdated: true
                },
                factoryStockUpdate: {
                    previousStock: previousFactoryStock,
                    newStock: newFactoryStock,
                    stockDeducted: restockRequest.requestedAmount,
                    factoryStockUpdated: true
                },
                details: `Restock request fulfilled by ${user.name || user.email}. Status changed from 'approved_pending' to 'fulfilled'. ${restockRequest.requestedAmount} units of ${restockRequest.product.name} delivered to ${restockRequest.shop.name}. Shop inventory updated: ${previousShopStock} → ${newShopStock} (+${restockRequest.requestedAmount}). Factory stock updated: ${previousFactoryStock} → ${newFactoryStock} (-${restockRequest.requestedAmount}).`
            },
            message: `Restock request fulfilled with factory stock update`,
            status: "success"
        });
        // Create notification message
        const notificationMessage = `🎉 Restock request completed: ${restockRequest.requestedAmount} units of ${restockRequest.product.name} delivered to ${restockRequest.shop.name}. Factory stock updated: ${previousFactoryStock} → ${newFactoryStock}`;
        // Notify shop owner/manager
        if (restockRequest.shop.managerId) {
            await client_1.prisma.notification.create({
                data: {
                    userId: restockRequest.shop.managerId,
                    type: "INFO",
                    message: notificationMessage,
                },
            });
        }
        // Emit consolidated real-time updates
        const socketService = (0, socketService_1.getSocketService)();
        // Emit restock request fulfilled event
        socketService.emitToAll('restock_request_fulfilled', {
            event: 'restock_request_fulfilled',
            notification: {
                type: 'INFO',
                message: notificationMessage,
                timestamp: new Date().toISOString(),
                data: {
                    requestId: updatedRequest.id,
                    shopId: restockRequest.shopId,
                    productName: restockRequest.product.name,
                    requestedAmount: restockRequest.requestedAmount,
                    status: 'fulfilled'
                }
            }
        });
        // Emit inventory update event for real-time inventory view
        socketService.emitToAll('inventory:update', {
            event: 'inventory:update',
            shopId: restockRequest.shopId,
            productId: restockRequest.productId,
            requestedAmount: restockRequest.requestedAmount,
            action: 'restock_fulfilled',
            newStock: updatedInventory?.currentStock || 0,
            inventoryId: updatedInventory?.id,
            factoryStock: updatedProduct.totalStock,
            productName: updatedProduct.name,
            previousFactoryStock: previousFactoryStock,
            factoryStockChange: -restockRequest.requestedAmount,
            timestamp: new Date().toISOString()
        });
        // Emit factory stock update event for real-time factory stock tracking
        socketService.broadcastFactoryStockUpdate({
            event: 'factory_stock:update',
            productId: restockRequest.productId,
            productName: updatedProduct.name,
            action: 'stock_deducted',
            deductedAmount: restockRequest.requestedAmount,
            previousStock: previousFactoryStock,
            newStock: updatedProduct.totalStock,
            reason: 'restock_request_fulfilled',
            requestId: updatedRequest.id,
            shopId: restockRequest.shopId,
            shopInventoryUpdate: {
                previousStock: previousShopStock,
                newStock: newShopStock,
                stockAdded: restockRequest.requestedAmount
            },
            timestamp: new Date().toISOString()
        });
        res.status(200).json(updatedRequest);
    }
    catch (error) {
        logger_1.logger.error("Error marking restock request as fulfilled:", error);
        res.status(500).json({ error: "Failed to mark restock request as fulfilled" });
    }
};
exports.markRestockRequestFulfilled = markRestockRequestFulfilled;
// Auto-generate restock request when stock is low
const autoGenerateRestockRequest = async (shopId, productId, currentStock) => {
    try {
        const product = await client_1.prisma.product.findUnique({
            where: { id: productId },
        });
        if (!product || !product.minStockLevel || currentStock > product.minStockLevel) {
            return null;
        }
        // Check if there's already a waiting for approval request
        const existingRequest = await client_1.prisma.restockRequest.findFirst({
            where: {
                shopId,
                productId,
                status: "waiting_for_approval",
            },
        });
        if (existingRequest) {
            return existingRequest;
        }
        // Create auto restock request
        const restockRequest = await client_1.prisma.restockRequest.create({
            data: {
                shopId,
                productId,
                requestedAmount: product.minStockLevel * 2, // Request 2x min stock level
                notes: "Auto-generated due to low stock",
                status: "waiting_for_approval", // Changed from "pending" to "waiting_for_approval"
            },
        });
        logger_1.logger.info(`Auto-generated restock request for product ${productId} in shop ${shopId}`);
        // Trigger notification
        const shop = await client_1.prisma.shop.findUnique({
            where: { id: shopId },
        });
        if (shop?.managerId) {
            const notificationMessage = `⚠️ Auto restock request: ${restockRequest.requestedAmount} units of ${product.name} requested for ${shop.name} due to low stock (${currentStock}/${product.minStockLevel})`;
            await client_1.prisma.notification.create({
                data: {
                    userId: shop.managerId,
                    type: "WARNING",
                    message: notificationMessage,
                },
            });
        }
        // Notify all Admin users about the auto-generated restock request
        const adminUsers = await client_1.prisma.user.findMany({
            where: {
                role: "Admin"
            },
            select: {
                publicId: true
            }
        });
        for (const adminUser of adminUsers) {
            const adminNotificationMessage = `⚠️ Auto restock request generated: ${restockRequest.requestedAmount} units of ${product.name} requested for ${shop?.name || 'Unknown Shop'} due to low stock (${currentStock}/${product.minStockLevel})`;
            await client_1.prisma.notification.create({
                data: {
                    userId: adminUser.publicId,
                    type: "WARNING",
                    message: adminNotificationMessage,
                },
            });
        }
        // Emit consolidated real-time update for auto-generated request
        const socketService = (0, socketService_1.getSocketService)();
        socketService.emitToAll('restock_request_auto_generated', {
            event: 'restock_request_auto_generated',
            notification: {
                type: 'WARNING',
                message: `⚠️ Auto restock request generated: ${restockRequest.requestedAmount} units of ${product.name} due to low stock`,
                timestamp: new Date().toISOString(),
                data: {
                    requestId: restockRequest.id,
                    shopId: shopId,
                    productName: product.name,
                    requestedAmount: restockRequest.requestedAmount,
                    status: 'waiting_for_approval',
                    isAutoGenerated: true,
                    currentStock: currentStock,
                    minStockLevel: product.minStockLevel
                }
            }
        });
        return restockRequest;
    }
    catch (error) {
        logger_1.logger.error("Error auto-generating restock request:", error);
        return null;
    }
};
exports.autoGenerateRestockRequest = autoGenerateRestockRequest;
// Soft delete restock request (Admin only) - hide from UI but keep in DB
const softDeleteRestockRequest = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ error: "Unauthorized" });
            return;
        }
        const user = await client_1.prisma.user.findUnique({
            where: { id: userId },
        });
        if (!user) {
            res.status(401).json({ error: "User not found" });
            return;
        }
        // Only Admin role can soft delete restock requests
        if (!user.role || !(0, roles_1.isAdmin)(user.role)) {
            res.status(403).json({ error: "Access denied: Admin role required" });
            return;
        }
        // Get the request with shop and product details before hiding
        const existingRequest = await client_1.prisma.restockRequest.findUnique({
            where: { id },
            include: {
                shop: true,
                product: true,
            },
        });
        if (!existingRequest) {
            res.status(404).json({ error: "Restock request not found" });
            return;
        }
        // Soft delete by setting hidden to true
        const deletedRequest = await client_1.prisma.restockRequest.update({
            where: { id },
            data: {
                // @ts-ignore
                hidden: true,
            },
            include: {
                shop: true,
                product: true,
            },
        });
        // Create notification for shop owner/manager
        if (existingRequest.shop.managerId) {
            const notificationMessage = `Restock request hidden: ${existingRequest.requestedAmount} units of ${existingRequest.product.name} for ${existingRequest.shop.name}`;
            await client_1.prisma.notification.create({
                data: {
                    userId: existingRequest.shop.managerId,
                    type: "RESTOCK_REQUEST",
                    message: notificationMessage,
                },
            });
            // Emit real-time notification
            (0, NotificationsController_1.emitUserNotification)(existingRequest.shop.managerId, {
                event: "hidden",
                notification: {
                    type: "RESTOCK_REQUEST",
                    message: notificationMessage,
                },
            });
        }
        // Broadcast real-time update
        const socketService = (0, socketService_1.getSocketService)();
        socketService.broadcastRestockRequestUpdate({
            type: 'hidden',
            request: deletedRequest,
            shopId: existingRequest.shopId,
            status: 'hidden',
            timestamp: new Date().toISOString()
        });
        // Emit specific restock request events
        socketService.emitToAll('restock_request_hidden', {
            event: 'restock_request_hidden',
            notification: {
                type: 'RESTOCK_REQUEST',
                message: `Restock request hidden: ${existingRequest.requestedAmount} units of ${existingRequest.product.name}`,
                timestamp: new Date().toISOString(),
                data: {
                    requestId: deletedRequest.id,
                    shopId: existingRequest.shopId,
                    productName: existingRequest.product.name,
                    requestedAmount: existingRequest.requestedAmount,
                    status: 'hidden'
                }
            }
        });
        // Also emit as live notification
        socketService.emitToAll('notification:new', {
            event: 'restock_request_hidden',
            notification: {
                type: 'RESTOCK_REQUEST',
                message: `Restock request hidden: ${existingRequest.requestedAmount} units of ${existingRequest.product.name}`,
                timestamp: new Date().toISOString(),
                data: {
                    requestId: deletedRequest.id,
                    shopId: existingRequest.shopId,
                    productName: existingRequest.product.name,
                    requestedAmount: existingRequest.requestedAmount,
                    status: 'hidden'
                }
            }
        });
        res.status(200).json({
            message: "Restock request hidden successfully",
            request: deletedRequest
        });
    }
    catch (error) {
        logger_1.logger.error("Error hiding restock request:", error);
        res.status(500).json({ error: "Failed to hide restock request" });
    }
};
exports.softDeleteRestockRequest = softDeleteRestockRequest;
