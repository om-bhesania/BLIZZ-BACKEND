import { Request, Response } from 'express';
import { prisma } from '../config/client';
import { emitUserNotification } from './NotificationsController';
import { logActivity } from '../utils/audit';
import { isAdmin } from '../config/roles';

export const createRecipe = async (req: Request, res: Response) => {
    try {
        const { productId, name, description, duration, yield: recipeYield, items, isDefault } = req.body;
        const userId = (req as any).user?.publicId as string | undefined;
        const userRole = (req as any).user?.role;

        // Only Admin can create recipes
        if (!isAdmin(userRole)) {
            res.status(403).json({ error: 'Admin access required' });
            return;
        }

        // Validate items
        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'Recipe must have at least one item' });
        }

        // If setting as default, unset other default recipes for this product
        if (isDefault) {
            await prisma.recipe.updateMany({
                where: {
                    productId,
                    isDefault: true,
                },
                data: {
                    isDefault: false,
                },
            });
        }

        // Create recipe with items
        const recipe = await prisma.recipe.create({
            data: {
                productId,
                name,
                description,
                duration,
                yield: recipeYield,
                isDefault: isDefault || false,
                items: {
                    create: items.map((item: any) => ({
                        rawMaterialId: item.rawMaterialId,
                        quantity: item.quantity,
                        unit: item.unit,
                        notes: item.notes,
                    })),
                },
            },
            include: {
                product: true,
                items: {
                    include: {
                        rawMaterial: true,
                    },
                },
            },
        });

        try {
            if (userId) {
                const created = await prisma.notification.create({
                    data: {
                        userId,
                        type: 'RECIPE_CREATED',
                        message: `Created recipe: ${recipe.name || recipe.product.name}`,
                    },
                });
                await emitUserNotification(userId, { event: 'created', notification: created });
            }
        } catch (notificationError) {
            console.error('Notification error:', notificationError);
        }

        res.status(201).json(recipe);
        await logActivity({
            type: 'recipe',
            action: 'created',
            entity: 'Recipe',
            entityId: recipe.id,
            userId,
            metadata: { productId, name, itemCount: items.length }
        });
    } catch (error) {
        console.error('Error creating recipe:', error);
        res.status(500).json({ error: 'Failed to create recipe' });
    }
};

export const getRecipes = async (req: Request, res: Response) => {
    try {
        const { productId, isActive } = req.query;
        const recipes = await prisma.recipe.findMany({
            where: {
                ...(productId && { productId: productId as string }),
                ...(isActive !== undefined && { isActive: isActive === 'true' }),
            },
            include: {
                product: true,
                items: {
                    include: {
                        rawMaterial: true,
                    },
                },
                _count: {
                    select: {
                        productions: true,
                    },
                },
            },
            orderBy: {
                createdAt: 'desc',
            },
        });
        res.json(recipes);
    } catch (error) {
        console.error('Error fetching recipes:', error);
        res.status(500).json({ error: 'Failed to fetch recipes' });
    }
};

export const getRecipeById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const recipe = await prisma.recipe.findUnique({
            where: { id },
            include: {
                product: true,
                items: {
                    include: {
                        rawMaterial: true,
                    },
                },
                productions: {
                    take: 10,
                    orderBy: {
                        producedAt: 'desc',
                    },
                },
            },
        });
        if (!recipe) {
            return res.status(404).json({ error: 'Recipe not found' });
        }
        res.json(recipe);
    } catch (error) {
        console.error('Error fetching recipe:', error);
        res.status(500).json({ error: 'Failed to fetch recipe' });
    }
};

export const getRecipesByProduct = async (req: Request, res: Response) => {
    try {
        const { productId } = req.params;
        const recipes = await prisma.recipe.findMany({
            where: {
                productId,
                isActive: true,
            },
            include: {
                items: {
                    include: {
                        rawMaterial: true,
                    },
                },
                _count: {
                    select: {
                        productions: true,
                    },
                },
            },
            orderBy: [
                { isDefault: 'desc' },
                { createdAt: 'desc' },
            ],
        });
        res.json(recipes);
    } catch (error) {
        console.error('Error fetching recipes by product:', error);
        res.status(500).json({ error: 'Failed to fetch recipes by product' });
    }
};

export const updateRecipe = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { name, description, duration, yield: recipeYield, items, isActive, isDefault } = req.body;
        const userId = (req as any).user?.publicId as string | undefined;
        const userRole = (req as any).user?.role;

        // Only Admin can update recipes
        if (!isAdmin(userRole)) {
            res.status(403).json({ error: 'Admin access required' });
            return;
        }

        const existingRecipe = await prisma.recipe.findUnique({
            where: { id },
            include: {
                product: true,
            },
        });

        if (!existingRecipe) {
            return res.status(404).json({ error: 'Recipe not found' });
        }

        // If setting as default, unset other default recipes for this product
        if (isDefault) {
            await prisma.recipe.updateMany({
                where: {
                    productId: existingRecipe.productId,
                    isDefault: true,
                    id: { not: id },
                },
                data: {
                    isDefault: false,
                },
            });
        }

        // Update recipe
        const recipe = await prisma.recipe.update({
            where: { id },
            data: {
                ...(name !== undefined && { name }),
                ...(description !== undefined && { description }),
                ...(duration !== undefined && { duration }),
                ...(recipeYield !== undefined && { yield: recipeYield }),
                ...(isActive !== undefined && { isActive }),
                ...(isDefault !== undefined && { isDefault }),
            },
            include: {
                product: true,
                items: {
                    include: {
                        rawMaterial: true,
                    },
                },
            },
        });

        // Update items if provided
        if (items && Array.isArray(items)) {
            // Delete existing items
            await prisma.recipeItem.deleteMany({
                where: { recipeId: id },
            });

            // Create new items
            await prisma.recipeItem.createMany({
                data: items.map((item: any) => ({
                    recipeId: id,
                    rawMaterialId: item.rawMaterialId,
                    quantity: item.quantity,
                    unit: item.unit,
                    notes: item.notes,
                })),
            });

            // Reload recipe with updated items
            const updatedRecipe = await prisma.recipe.findUnique({
                where: { id },
                include: {
                    product: true,
                    items: {
                        include: {
                            rawMaterial: true,
                        },
                    },
                },
            });

            try {
                if (userId) {
                    const updated = await prisma.notification.create({
                        data: {
                            userId,
                            type: 'RECIPE_UPDATED',
                            message: `Updated recipe: ${recipe.name || recipe.product.name}`,
                        },
                    });
                    await emitUserNotification(userId, { event: 'created', notification: updated });
                }
            } catch (notificationError) {
                console.error('Notification error:', notificationError);
            }

            res.json(updatedRecipe);
            await logActivity({
                type: 'recipe',
                action: 'updated',
                entity: 'Recipe',
                entityId: recipe.id,
                userId,
                metadata: { productId: recipe.productId, name }
            });
            return;
        }

        try {
            if (userId) {
                const updated = await prisma.notification.create({
                    data: {
                        userId,
                        type: 'RECIPE_UPDATED',
                        message: `Updated recipe: ${recipe.name || recipe.product.name}`,
                    },
                });
                await emitUserNotification(userId, { event: 'created', notification: updated });
            }
        } catch (notificationError) {
            console.error('Notification error:', notificationError);
        }

        res.json(recipe);
        await logActivity({
            type: 'recipe',
            action: 'updated',
            entity: 'Recipe',
            entityId: recipe.id,
            userId,
            metadata: { productId: recipe.productId, name }
        });
    } catch (error) {
        console.error('Error updating recipe:', error);
        res.status(500).json({ error: 'Failed to update recipe' });
    }
};

export const deleteRecipe = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const userId = (req as any).user?.publicId as string | undefined;
        const userRole = (req as any).user?.role;

        // Only Admin can delete recipes
        if (!isAdmin(userRole)) {
            res.status(403).json({ error: 'Admin access required' });
            return;
        }

        const recipe = await prisma.recipe.findUnique({
            where: { id },
            include: {
                product: true,
            },
        });

        if (!recipe) {
            return res.status(404).json({ error: 'Recipe not found' });
        }

        // Soft delete
        await prisma.recipe.update({
            where: { id },
            data: {
                isActive: false,
            },
        });

        try {
            if (userId) {
                const deleted = await prisma.notification.create({
                    data: {
                        userId,
                        type: 'RECIPE_DEACTIVATED',
                        message: `Deactivated recipe: ${recipe.name || recipe.product.name}`,
                    },
                });
                await emitUserNotification(userId, { event: 'created', notification: deleted });
            }
        } catch (notificationError) {
            console.error('Notification error:', notificationError);
        }

        res.json({ message: 'Recipe deactivated successfully' });
        await logActivity({
            type: 'recipe',
            action: 'deleted',
            entity: 'Recipe',
            entityId: id,
            userId,
            metadata: { recipeId: id }
        });
    } catch (error) {
        console.error('Error deleting recipe:', error);
        res.status(500).json({ error: 'Failed to delete recipe' });
    }
};

export const setDefaultRecipe = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const userId = (req as any).user?.publicId as string | undefined;
        const userRole = (req as any).user?.role;

        // Only Admin can set default recipe
        if (!isAdmin(userRole)) {
            res.status(403).json({ error: 'Admin access required' });
            return;
        }

        const recipe = await prisma.recipe.findUnique({
            where: { id },
            include: {
                product: true,
            },
        });

        if (!recipe) {
            return res.status(404).json({ error: 'Recipe not found' });
        }

        // Unset other default recipes for this product
        await prisma.recipe.updateMany({
            where: {
                productId: recipe.productId,
                isDefault: true,
                id: { not: id },
            },
            data: {
                isDefault: false,
            },
        });

        // Set this recipe as default
        const updatedRecipe = await prisma.recipe.update({
            where: { id },
            data: {
                isDefault: true,
            },
            include: {
                product: true,
                items: {
                    include: {
                        rawMaterial: true,
                    },
                },
            },
        });

        res.json(updatedRecipe);
        await logActivity({
            type: 'recipe',
            action: 'updated',
            entity: 'Recipe',
            entityId: recipe.id,
            userId,
            metadata: { action: 'set_default', productId: recipe.productId }
        });
    } catch (error) {
        console.error('Error setting default recipe:', error);
        res.status(500).json({ error: 'Failed to set default recipe' });
    }
};

