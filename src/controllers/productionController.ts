import { Request, Response } from 'express';
import { prisma } from '../config/client';
import { emitUserNotification } from './NotificationsController';
import { logActivity } from '../utils/audit';
import { isAdmin } from '../config/roles';
import { getSocketService } from '../services/socketService';

export const createProductionBatch = async (req: Request, res: Response) => {
    try {
        const { recipeId, productId, quantity, notes } = req.body;
        const userId = (req as any).user?.publicId as string | undefined;
        const userRole = (req as any).user?.role;

        // Only Admin can create production batches
        if (!isAdmin(userRole)) {
            res.status(403).json({ error: 'Admin access required' });
            return;
        }

        // Get recipe with items
        const recipe = await prisma.recipe.findUnique({
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

        // Check raw material availability and calculate requirements
        interface AvailabilityCheckItem {
            rawMaterialId: string;
            rawMaterialName: string;
            required: number;
            available: number;
            unit: string;
            isAvailable: boolean;
        }
        interface RequiredMaterial {
            name: string;
            required: number;
            available: number;
            unit: string;
        }
        const availabilityCheck: AvailabilityCheckItem[] = [];
        const requiredMaterials: RequiredMaterial[] = [];

        for (const item of recipe.items) {
            const requiredQuantity = Number(item.quantity) * Number(quantity);
            
            // Get inventory for this raw material
            const inventory = await prisma.rawMaterialInventory.findFirst({
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
        const result = await prisma.$transaction(async (tx) => {
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
                        const socketService = getSocketService();
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
                            await emitUserNotification(adminUser.publicId, {
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
                await logActivity({
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
                const created = await prisma.notification.create({
                    data: {
                        userId,
                        type: 'PRODUCTION_BATCH_CREATED',
                        message: `Created production batch: ${quantity} ${recipe.product.name}`,
                    },
                });
                await emitUserNotification(userId, { event: 'created', notification: created });
            }
        } catch (notificationError) {
            console.error('Notification error:', notificationError);
        }

        // Fetch complete production batch with relations
        const completeBatch = await prisma.productionBatch.findUnique({
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
        await logActivity({
            type: 'production_batch',
            action: 'created',
            entity: 'ProductionBatch',
            entityId: result.productionBatch.id,
            userId,
            metadata: { recipeId, productId, quantity }
        });
    } catch (error) {
        console.error('Error creating production batch:', error);
        res.status(500).json({ error: 'Failed to create production batch' });
    }
};

export const getProductionBatches = async (req: Request, res: Response) => {
    try {
        const { productId, startDate, endDate } = req.query;
        const batches = await prisma.productionBatch.findMany({
            where: {
                ...(productId && { productId: productId as string }),
                ...(startDate && endDate && {
                    producedAt: {
                        gte: new Date(startDate as string),
                        lte: new Date(endDate as string),
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
    } catch (error) {
        console.error('Error fetching production batches:', error);
        res.status(500).json({ error: 'Failed to fetch production batches' });
    }
};

export const getProductionBatchById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const batch = await prisma.productionBatch.findUnique({
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
    } catch (error) {
        console.error('Error fetching production batch:', error);
        res.status(500).json({ error: 'Failed to fetch production batch' });
    }
};

export const getProductionsByProduct = async (req: Request, res: Response) => {
    try {
        const { productId } = req.params;
        const batches = await prisma.productionBatch.findMany({
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
    } catch (error) {
        console.error('Error fetching productions by product:', error);
        res.status(500).json({ error: 'Failed to fetch productions by product' });
    }
};

