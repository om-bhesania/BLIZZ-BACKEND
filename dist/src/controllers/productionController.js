"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProductionsByProduct = exports.getProductionBatchById = exports.getProductionBatches = exports.createProductionBatch = void 0;
const client_1 = require("../config/client");
const NotificationsController_1 = require("./NotificationsController");
const audit_1 = require("../utils/audit");
const roles_1 = require("../config/roles");
const socketService_1 = require("../services/socketService");
const createProductionBatch = async (req, res) => {
    try {
        const { recipeId, productId, quantity, notes } = req.body;
        const userId = req.user?.publicId;
        const userRole = req.user?.role;
        // Only Admin can create production batches
        if (!(0, roles_1.isAdmin)(userRole)) {
            res.status(403).json({ error: 'Admin access required' });
            return;
        }
        // Get recipe with items
        const recipe = await client_1.prisma.recipe.findUnique({
            where: { id: recipeId },
            include: {
                items: {
                    include: {
                        rawMaterial: true,
                    },
                },
                product: true,
            },
        });
        if (!recipe) {
            return res.status(404).json({ error: 'Recipe not found' });
        }
        if (!recipe.isActive) {
            return res.status(400).json({ error: 'Recipe is not active' });
        }
        const availabilityCheck = [];
        const requiredMaterials = [];
        for (const item of recipe.items) {
            const requiredQuantity = Number(item.quantity) * Number(quantity);
            // Get inventory for this raw material
            const inventory = await client_1.prisma.rawMaterialInventory.findFirst({
                where: {
                    rawMaterialId: item.rawMaterialId,
                },
            });
            const availableQuantity = inventory ? Number(inventory.quantity) : 0;
            const isAvailable = availableQuantity >= requiredQuantity;
            availabilityCheck.push({
                rawMaterialId: item.rawMaterialId,
                rawMaterialName: item.rawMaterial.name,
                required: requiredQuantity,
                available: availableQuantity,
                unit: item.unit,
                isAvailable,
            });
            if (!isAvailable) {
                requiredMaterials.push({
                    name: item.rawMaterial.name,
                    required: requiredQuantity,
                    available: availableQuantity,
                    unit: item.unit,
                });
            }
        }
        // If insufficient stock, return error
        if (requiredMaterials.length > 0) {
            return res.status(400).json({
                error: 'Insufficient raw materials',
                details: requiredMaterials,
                availabilityCheck,
            });
        }
        // Create production batch and deduct materials in a transaction
        const result = await client_1.prisma.$transaction(async (tx) => {
            // Create production batch
            const productionBatch = await tx.productionBatch.create({
                data: {
                    recipeId,
                    productId,
                    quantity,
                    notes,
                    createdBy: userId || 'system',
                },
            });
            // Deduct raw materials and create transactions
            const transactions = [];
            for (const item of recipe.items) {
                const requiredQuantity = Number(item.quantity) * Number(quantity);
                // Get inventory
                const inventory = await tx.rawMaterialInventory.findFirst({
                    where: {
                        rawMaterialId: item.rawMaterialId,
                    },
                });
                if (inventory) {
                    const previousStock = Number(inventory.quantity);
                    const newStock = previousStock - requiredQuantity;
                    // Update inventory
                    const updatedInventory = await tx.rawMaterialInventory.update({
                        where: { id: inventory.id },
                        data: {
                            quantity: newStock,
                            lastUpdated: new Date(),
                        },
                    });
                    // Create transaction record
                    const transaction = await tx.rawMaterialTransaction.create({
                        data: {
                            rawMaterialId: item.rawMaterialId,
                            inventoryId: inventory.id,
                            productionBatchId: productionBatch.id,
                            type: 'PRODUCTION_DEDUCTION',
                            quantity: -requiredQuantity, // Negative for deduction
                            previousStock,
                            newStock,
                            notes: `Production batch ${productionBatch.id} - ${quantity} ${recipe.product.name}`,
                            createdBy: userId || 'system',
                        },
                    });
                    transactions.push(transaction);
                    // Check for low stock alert
                    const minStockLevelNum = Number(updatedInventory.minStockLevel);
                    if (minStockLevelNum && newStock <= minStockLevelNum) {
                        const rawMaterial = item.rawMaterial;
                        const socketService = (0, socketService_1.getSocketService)();
                        socketService.broadcastRawMaterialLowStockAlert({
                            rawMaterialId: item.rawMaterialId,
                            rawMaterialName: rawMaterial.name,
                            currentStock: newStock,
                            minStockLevel: minStockLevelNum,
                            unit: rawMaterial.unit,
                            timestamp: new Date().toISOString(),
                        });
                        // Create notifications for admins
                        const adminUsers = await tx.user.findMany({
                            where: { role: 'Admin' },
                            select: { publicId: true },
                        });
                        for (const adminUser of adminUsers) {
                            const notification = await tx.notification.create({
                                data: {
                                    userId: adminUser.publicId,
                                    type: 'RAW_MATERIAL_LOW_STOCK',
                                    message: `🚨 Low stock alert: ${rawMaterial.name} has only ${newStock} ${rawMaterial.unit} remaining (min: ${minStockLevelNum} ${rawMaterial.unit})`,
                                },
                            });
                            await (0, NotificationsController_1.emitUserNotification)(adminUser.publicId, {
                                event: 'raw_material_low_stock',
                                notification,
                            });
                        }
                    }
                }
            }
            // Update product inventory (Storeroom/Cold Storage)
            const product = await tx.product.findUnique({
                where: { id: productId },
            });
            if (product) {
                const previousProductStock = product.totalStock || 0;
                const producedQuantity = Number(quantity);
                const newProductStock = previousProductStock + producedQuantity;
                // Update product totalStock (Storeroom inventory)
                await tx.product.update({
                    where: { id: productId },
                    data: {
                        totalStock: newProductStock,
                    },
                });
                // Log product inventory update
                await (0, audit_1.logActivity)({
                    type: 'product_inventory',
                    action: 'production_added',
                    entity: 'Product',
                    entityId: productId,
                    userId,
                    metadata: {
                        productionBatchId: productionBatch.id,
                        previousStock: previousProductStock,
                        addedQuantity: producedQuantity,
                        newStock: newProductStock,
                    },
                });
            }
            return { productionBatch, transactions };
        });
        try {
            if (userId) {
                const created = await client_1.prisma.notification.create({
                    data: {
                        userId,
                        type: 'PRODUCTION_BATCH_CREATED',
                        message: `Created production batch: ${quantity} ${recipe.product.name}`,
                    },
                });
                await (0, NotificationsController_1.emitUserNotification)(userId, { event: 'created', notification: created });
            }
        }
        catch (notificationError) {
            console.error('Notification error:', notificationError);
        }
        // Fetch complete production batch with relations
        const completeBatch = await client_1.prisma.productionBatch.findUnique({
            where: { id: result.productionBatch.id },
            include: {
                recipe: {
                    include: {
                        product: true,
                        items: {
                            include: {
                                rawMaterial: true,
                            },
                        },
                    },
                },
                product: true,
                transactions: {
                    include: {
                        rawMaterial: true,
                    },
                },
            },
        });
        res.status(201).json(completeBatch);
        await (0, audit_1.logActivity)({
            type: 'production_batch',
            action: 'created',
            entity: 'ProductionBatch',
            entityId: result.productionBatch.id,
            userId,
            metadata: { recipeId, productId, quantity }
        });
    }
    catch (error) {
        console.error('Error creating production batch:', error);
        res.status(500).json({ error: 'Failed to create production batch' });
    }
};
exports.createProductionBatch = createProductionBatch;
const getProductionBatches = async (req, res) => {
    try {
        const { productId, startDate, endDate } = req.query;
        const batches = await client_1.prisma.productionBatch.findMany({
            where: {
                ...(productId && { productId: productId }),
                ...(startDate && endDate && {
                    producedAt: {
                        gte: new Date(startDate),
                        lte: new Date(endDate),
                    },
                }),
            },
            include: {
                recipe: {
                    include: {
                        product: true,
                    },
                },
                product: true,
                _count: {
                    select: {
                        transactions: true,
                    },
                },
            },
            orderBy: {
                producedAt: 'desc',
            },
            take: 100,
        });
        res.json(batches);
    }
    catch (error) {
        console.error('Error fetching production batches:', error);
        res.status(500).json({ error: 'Failed to fetch production batches' });
    }
};
exports.getProductionBatches = getProductionBatches;
const getProductionBatchById = async (req, res) => {
    try {
        const { id } = req.params;
        const batch = await client_1.prisma.productionBatch.findUnique({
            where: { id },
            include: {
                recipe: {
                    include: {
                        product: true,
                        items: {
                            include: {
                                rawMaterial: true,
                            },
                        },
                    },
                },
                product: true,
                transactions: {
                    include: {
                        rawMaterial: true,
                        inventory: true,
                    },
                },
            },
        });
        if (!batch) {
            return res.status(404).json({ error: 'Production batch not found' });
        }
        res.json(batch);
    }
    catch (error) {
        console.error('Error fetching production batch:', error);
        res.status(500).json({ error: 'Failed to fetch production batch' });
    }
};
exports.getProductionBatchById = getProductionBatchById;
const getProductionsByProduct = async (req, res) => {
    try {
        const { productId } = req.params;
        const batches = await client_1.prisma.productionBatch.findMany({
            where: {
                productId,
            },
            include: {
                recipe: {
                    include: {
                        items: {
                            include: {
                                rawMaterial: true,
                            },
                        },
                    },
                },
            },
            orderBy: {
                producedAt: 'desc',
            },
        });
        res.json(batches);
    }
    catch (error) {
        console.error('Error fetching productions by product:', error);
        res.status(500).json({ error: 'Failed to fetch productions by product' });
    }
};
exports.getProductionsByProduct = getProductionsByProduct;
