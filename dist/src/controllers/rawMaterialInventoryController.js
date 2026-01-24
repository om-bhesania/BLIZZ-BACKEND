"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateRawMaterialInventory = exports.initializeInventory = exports.getLowStockItems = exports.getRawMaterialInventoryById = exports.getRawMaterialInventories = void 0;
const client_1 = require("../config/client");
const NotificationsController_1 = require("./NotificationsController");
const audit_1 = require("../utils/audit");
const roles_1 = require("../config/roles");
const socketService_1 = require("../services/socketService");
const getRawMaterialInventories = async (req, res) => {
    try {
        // Get all inventories (location concept removed - everything is in cold storage/factory)
        const inventories = await client_1.prisma.rawMaterialInventory.findMany({
            include: {
                rawMaterial: true,
            },
            orderBy: {
                lastUpdated: 'desc'
            }
        });
        res.json(inventories);
    }
    catch (error) {
        console.error('Error fetching raw material inventories:', error);
        res.status(500).json({ error: 'Failed to fetch raw material inventories' });
    }
};
exports.getRawMaterialInventories = getRawMaterialInventories;
const getRawMaterialInventoryById = async (req, res) => {
    try {
        const { id } = req.params;
        const inventory = await client_1.prisma.rawMaterialInventory.findUnique({
            where: { id },
            include: {
                rawMaterial: true,
                transactions: {
                    orderBy: {
                        createdAt: 'desc'
                    },
                    take: 50
                }
            },
        });
        if (!inventory) {
            return res.status(404).json({ error: 'Raw material inventory not found' });
        }
        res.json(inventory);
    }
    catch (error) {
        console.error('Error fetching raw material inventory:', error);
        res.status(500).json({ error: 'Failed to fetch raw material inventory' });
    }
};
exports.getRawMaterialInventoryById = getRawMaterialInventoryById;
const getLowStockItems = async (req, res) => {
    try {
        const inventories = await client_1.prisma.rawMaterialInventory.findMany({
            where: {
                quantity: {
                    lte: client_1.prisma.rawMaterialInventory.fields.minStockLevel
                }
            },
            include: {
                rawMaterial: true,
            },
            orderBy: {
                quantity: 'asc'
            }
        });
        res.json(inventories);
    }
    catch (error) {
        console.error('Error fetching low stock items:', error);
        res.status(500).json({ error: 'Failed to fetch low stock items' });
    }
};
exports.getLowStockItems = getLowStockItems;
const initializeInventory = async (req, res) => {
    try {
        const { rawMaterialId, quantity, minStockLevel } = req.body;
        const userId = req.user?.publicId;
        const userRole = req.user?.role;
        // Only Admin can initialize inventory
        if (!(0, roles_1.isAdmin)(userRole)) {
            res.status(403).json({ error: 'Admin access required' });
            return;
        }
        // Check if inventory already exists (location concept removed - using default "Factory" for schema compatibility)
        const existing = await client_1.prisma.rawMaterialInventory.findFirst({
            where: {
                rawMaterialId,
            }
        });
        if (existing) {
            return res.status(400).json({ error: 'Inventory already exists for this raw material' });
        }
        const inventory = await client_1.prisma.rawMaterialInventory.create({
            data: {
                rawMaterialId,
                quantity,
                minStockLevel: minStockLevel || 0,
                location: 'Factory', // Default location for schema compatibility (cold storage is in factory)
            },
            include: {
                rawMaterial: true,
            },
        });
        // Create initial stock transaction
        await client_1.prisma.rawMaterialTransaction.create({
            data: {
                rawMaterialId,
                inventoryId: inventory.id,
                type: 'INITIAL_STOCK',
                quantity,
                previousStock: 0,
                newStock: quantity,
                notes: 'Initial stock setup',
                createdBy: userId || 'system',
            },
        });
        // Check for low stock alert
        await checkLowStockAlert({
            rawMaterialId: inventory.rawMaterialId,
            quantity: Number(inventory.quantity),
            minStockLevel: Number(inventory.minStockLevel),
            location: inventory.location, // Keep for backward compatibility
            rawMaterial: inventory.rawMaterial ? {
                id: inventory.rawMaterial.id,
                name: inventory.rawMaterial.name,
                unit: inventory.rawMaterial.unit,
            } : undefined,
        });
        res.status(201).json(inventory);
        await (0, audit_1.logActivity)({
            type: 'raw_material_inventory',
            action: 'created',
            entity: 'RawMaterialInventory',
            entityId: inventory.id,
            userId,
            metadata: { rawMaterialId, quantity }
        });
    }
    catch (error) {
        console.error('Error initializing inventory:', error);
        res.status(500).json({ error: 'Failed to initialize inventory' });
    }
};
exports.initializeInventory = initializeInventory;
const updateRawMaterialInventory = async (req, res) => {
    try {
        const { id } = req.params;
        const { quantity, minStockLevel, notes } = req.body;
        const userId = req.user?.publicId;
        const userRole = req.user?.role;
        // Only Admin can update inventory
        if (!(0, roles_1.isAdmin)(userRole)) {
            res.status(403).json({ error: 'Admin access required' });
            return;
        }
        const existingInventory = await client_1.prisma.rawMaterialInventory.findUnique({
            where: { id },
            include: {
                rawMaterial: true,
            },
        });
        if (!existingInventory) {
            return res.status(404).json({ error: 'Raw material inventory not found' });
        }
        const previousStock = existingInventory.quantity;
        const newStock = quantity !== undefined ? quantity : previousStock;
        const inventory = await client_1.prisma.rawMaterialInventory.update({
            where: { id },
            data: {
                ...(quantity !== undefined && { quantity: newStock }),
                ...(minStockLevel !== undefined && { minStockLevel }),
                lastUpdated: new Date(),
            },
            include: {
                rawMaterial: true,
            },
        });
        // Determine transaction type
        const transactionType = quantity !== undefined && quantity !== previousStock
            ? 'MANUAL_ADJUSTMENT'
            : 'INVENTORY_UPDATE';
        // Create transaction record
        const quantityDiff = Number(newStock) - Number(previousStock);
        await client_1.prisma.rawMaterialTransaction.create({
            data: {
                rawMaterialId: inventory.rawMaterialId,
                inventoryId: inventory.id,
                type: transactionType,
                quantity: quantityDiff, // Positive for additions, negative for deductions
                previousStock,
                newStock,
                notes: notes || `Manual ${transactionType.toLowerCase()}`,
                createdBy: userId || 'system',
            },
        });
        // Check for low stock alert
        await checkLowStockAlert({
            rawMaterialId: inventory.rawMaterialId,
            quantity: Number(inventory.quantity),
            minStockLevel: Number(inventory.minStockLevel),
            location: inventory.location,
            rawMaterial: inventory.rawMaterial ? {
                id: inventory.rawMaterial.id,
                name: inventory.rawMaterial.name,
                unit: inventory.rawMaterial.unit,
            } : undefined,
        });
        try {
            if (userId) {
                const updated = await client_1.prisma.notification.create({
                    data: {
                        userId,
                        type: 'RAW_MATERIAL_INVENTORY_UPDATED',
                        message: `Updated inventory for ${inventory.rawMaterial.name}: ${newStock} ${inventory.rawMaterial.unit}`,
                    },
                });
                await (0, NotificationsController_1.emitUserNotification)(userId, { event: 'created', notification: updated });
            }
        }
        catch (notificationError) {
            console.error('Notification error:', notificationError);
        }
        res.json(inventory);
        await (0, audit_1.logActivity)({
            type: 'raw_material_inventory',
            action: 'updated',
            entity: 'RawMaterialInventory',
            entityId: inventory.id,
            userId,
            metadata: { rawMaterialId: inventory.rawMaterialId, previousStock, newStock }
        });
    }
    catch (error) {
        console.error('Error updating raw material inventory:', error);
        res.status(500).json({ error: 'Failed to update raw material inventory' });
    }
};
exports.updateRawMaterialInventory = updateRawMaterialInventory;
async function checkLowStockAlert(inventory) {
    try {
        const quantity = Number(inventory.quantity);
        const minStockLevel = Number(inventory.minStockLevel);
        if (minStockLevel && quantity <= minStockLevel) {
            let rawMaterial = inventory.rawMaterial;
            if (!rawMaterial) {
                const found = await client_1.prisma.rawMaterial.findUnique({
                    where: { id: inventory.rawMaterialId }
                });
                if (found) {
                    rawMaterial = {
                        id: found.id,
                        name: found.name,
                        unit: found.unit,
                    };
                }
            }
            // If raw material still not found, skip alert
            if (!rawMaterial) {
                console.error(`Raw material not found for inventory: ${inventory.rawMaterialId}`);
                return;
            }
            // Get all admin users
            const adminUsers = await client_1.prisma.user.findMany({
                where: {
                    role: 'Admin',
                },
                select: {
                    publicId: true,
                },
            });
            const alertMessage = `🚨 Low stock alert: ${rawMaterial.name} has only ${quantity} ${rawMaterial.unit} remaining (min: ${minStockLevel} ${rawMaterial.unit})`;
            // Create notifications for all admins
            for (const adminUser of adminUsers) {
                const notification = await client_1.prisma.notification.create({
                    data: {
                        userId: adminUser.publicId,
                        type: 'RAW_MATERIAL_LOW_STOCK',
                        message: alertMessage,
                    },
                });
                await (0, NotificationsController_1.emitUserNotification)(adminUser.publicId, {
                    event: 'raw_material_low_stock',
                    notification,
                });
            }
            // Emit socket event
            const socketService = (0, socketService_1.getSocketService)();
            socketService.broadcastRawMaterialLowStockAlert({
                rawMaterialId: inventory.rawMaterialId,
                rawMaterialName: rawMaterial.name,
                currentStock: quantity,
                minStockLevel: minStockLevel,
                unit: rawMaterial.unit,
                location: inventory.location,
                timestamp: new Date().toISOString(),
            });
        }
    }
    catch (error) {
        console.error('Error checking low stock alert:', error);
    }
}
