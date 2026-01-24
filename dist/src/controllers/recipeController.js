"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setDefaultRecipe = exports.deleteRecipe = exports.updateRecipe = exports.getRecipesByProduct = exports.getRecipeById = exports.getRecipes = exports.createRecipe = void 0;
const client_1 = require("../config/client");
const NotificationsController_1 = require("./NotificationsController");
const audit_1 = require("../utils/audit");
const roles_1 = require("../config/roles");
const createRecipe = async (req, res) => {
    try {
        const { productId, name, description, duration, yield: recipeYield, items, isDefault } = req.body;
        const userId = req.user?.publicId;
        const userRole = req.user?.role;
        // Only Admin can create recipes
        if (!(0, roles_1.isAdmin)(userRole)) {
            res.status(403).json({ error: 'Admin access required' });
            return;
        }
        // Validate items
        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'Recipe must have at least one item' });
        }
        // If setting as default, unset other default recipes for this product
        if (isDefault) {
            await client_1.prisma.recipe.updateMany({
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
        const recipe = await client_1.prisma.recipe.create({
            data: {
                productId,
                name,
                description,
                duration,
                yield: recipeYield,
                isDefault: isDefault || false,
                items: {
                    create: items.map((item) => ({
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
                const created = await client_1.prisma.notification.create({
                    data: {
                        userId,
                        type: 'RECIPE_CREATED',
                        message: `Created recipe: ${recipe.name || recipe.product.name}`,
                    },
                });
                await (0, NotificationsController_1.emitUserNotification)(userId, { event: 'created', notification: created });
            }
        }
        catch (notificationError) {
            console.error('Notification error:', notificationError);
        }
        res.status(201).json(recipe);
        await (0, audit_1.logActivity)({
            type: 'recipe',
            action: 'created',
            entity: 'Recipe',
            entityId: recipe.id,
            userId,
            metadata: { productId, name, itemCount: items.length }
        });
    }
    catch (error) {
        console.error('Error creating recipe:', error);
        res.status(500).json({ error: 'Failed to create recipe' });
    }
};
exports.createRecipe = createRecipe;
const getRecipes = async (req, res) => {
    try {
        const { productId, isActive } = req.query;
        const recipes = await client_1.prisma.recipe.findMany({
            where: {
                ...(productId && { productId: productId }),
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
    }
    catch (error) {
        console.error('Error fetching recipes:', error);
        res.status(500).json({ error: 'Failed to fetch recipes' });
    }
};
exports.getRecipes = getRecipes;
const getRecipeById = async (req, res) => {
    try {
        const { id } = req.params;
        const recipe = await client_1.prisma.recipe.findUnique({
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
    }
    catch (error) {
        console.error('Error fetching recipe:', error);
        res.status(500).json({ error: 'Failed to fetch recipe' });
    }
};
exports.getRecipeById = getRecipeById;
const getRecipesByProduct = async (req, res) => {
    try {
        const { productId } = req.params;
        const recipes = await client_1.prisma.recipe.findMany({
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
    }
    catch (error) {
        console.error('Error fetching recipes by product:', error);
        res.status(500).json({ error: 'Failed to fetch recipes by product' });
    }
};
exports.getRecipesByProduct = getRecipesByProduct;
const updateRecipe = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, duration, yield: recipeYield, items, isActive, isDefault } = req.body;
        const userId = req.user?.publicId;
        const userRole = req.user?.role;
        // Only Admin can update recipes
        if (!(0, roles_1.isAdmin)(userRole)) {
            res.status(403).json({ error: 'Admin access required' });
            return;
        }
        const existingRecipe = await client_1.prisma.recipe.findUnique({
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
            await client_1.prisma.recipe.updateMany({
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
        const recipe = await client_1.prisma.recipe.update({
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
            await client_1.prisma.recipeItem.deleteMany({
                where: { recipeId: id },
            });
            // Create new items
            await client_1.prisma.recipeItem.createMany({
                data: items.map((item) => ({
                    recipeId: id,
                    rawMaterialId: item.rawMaterialId,
                    quantity: item.quantity,
                    unit: item.unit,
                    notes: item.notes,
                })),
            });
            // Reload recipe with updated items
            const updatedRecipe = await client_1.prisma.recipe.findUnique({
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
                    const updated = await client_1.prisma.notification.create({
                        data: {
                            userId,
                            type: 'RECIPE_UPDATED',
                            message: `Updated recipe: ${recipe.name || recipe.product.name}`,
                        },
                    });
                    await (0, NotificationsController_1.emitUserNotification)(userId, { event: 'created', notification: updated });
                }
            }
            catch (notificationError) {
                console.error('Notification error:', notificationError);
            }
            res.json(updatedRecipe);
            await (0, audit_1.logActivity)({
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
                const updated = await client_1.prisma.notification.create({
                    data: {
                        userId,
                        type: 'RECIPE_UPDATED',
                        message: `Updated recipe: ${recipe.name || recipe.product.name}`,
                    },
                });
                await (0, NotificationsController_1.emitUserNotification)(userId, { event: 'created', notification: updated });
            }
        }
        catch (notificationError) {
            console.error('Notification error:', notificationError);
        }
        res.json(recipe);
        await (0, audit_1.logActivity)({
            type: 'recipe',
            action: 'updated',
            entity: 'Recipe',
            entityId: recipe.id,
            userId,
            metadata: { productId: recipe.productId, name }
        });
    }
    catch (error) {
        console.error('Error updating recipe:', error);
        res.status(500).json({ error: 'Failed to update recipe' });
    }
};
exports.updateRecipe = updateRecipe;
const deleteRecipe = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.publicId;
        const userRole = req.user?.role;
        // Only Admin can delete recipes
        if (!(0, roles_1.isAdmin)(userRole)) {
            res.status(403).json({ error: 'Admin access required' });
            return;
        }
        const recipe = await client_1.prisma.recipe.findUnique({
            where: { id },
            include: {
                product: true,
            },
        });
        if (!recipe) {
            return res.status(404).json({ error: 'Recipe not found' });
        }
        // Soft delete
        await client_1.prisma.recipe.update({
            where: { id },
            data: {
                isActive: false,
            },
        });
        try {
            if (userId) {
                const deleted = await client_1.prisma.notification.create({
                    data: {
                        userId,
                        type: 'RECIPE_DEACTIVATED',
                        message: `Deactivated recipe: ${recipe.name || recipe.product.name}`,
                    },
                });
                await (0, NotificationsController_1.emitUserNotification)(userId, { event: 'created', notification: deleted });
            }
        }
        catch (notificationError) {
            console.error('Notification error:', notificationError);
        }
        res.json({ message: 'Recipe deactivated successfully' });
        await (0, audit_1.logActivity)({
            type: 'recipe',
            action: 'deleted',
            entity: 'Recipe',
            entityId: id,
            userId,
            metadata: { recipeId: id }
        });
    }
    catch (error) {
        console.error('Error deleting recipe:', error);
        res.status(500).json({ error: 'Failed to delete recipe' });
    }
};
exports.deleteRecipe = deleteRecipe;
const setDefaultRecipe = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.publicId;
        const userRole = req.user?.role;
        // Only Admin can set default recipe
        if (!(0, roles_1.isAdmin)(userRole)) {
            res.status(403).json({ error: 'Admin access required' });
            return;
        }
        const recipe = await client_1.prisma.recipe.findUnique({
            where: { id },
            include: {
                product: true,
            },
        });
        if (!recipe) {
            return res.status(404).json({ error: 'Recipe not found' });
        }
        // Unset other default recipes for this product
        await client_1.prisma.recipe.updateMany({
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
        const updatedRecipe = await client_1.prisma.recipe.update({
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
        await (0, audit_1.logActivity)({
            type: 'recipe',
            action: 'updated',
            entity: 'Recipe',
            entityId: recipe.id,
            userId,
            metadata: { action: 'set_default', productId: recipe.productId }
        });
    }
    catch (error) {
        console.error('Error setting default recipe:', error);
        res.status(500).json({ error: 'Failed to set default recipe' });
    }
};
exports.setDefaultRecipe = setDefaultRecipe;
