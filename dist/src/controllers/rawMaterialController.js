"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteRawMaterial = exports.updateRawMaterial = exports.getRawMaterialById = exports.getRawMaterials = exports.createRawMaterial = void 0;
const client_1 = require("../config/client");
const NotificationsController_1 = require("./NotificationsController");
const audit_1 = require("../utils/audit");
const roles_1 = require("../config/roles");
const createRawMaterial = async (req, res) => {
    try {
        const { name, description, unit } = req.body;
        const userId = req.user?.publicId;
        const userRole = req.user?.role;
        // Only Admin can create raw materials
        if (!(0, roles_1.isAdmin)(userRole)) {
            res.status(403).json({ error: 'Admin access required' });
            return;
        }
        const rawMaterial = await client_1.prisma.rawMaterial.create({
            data: {
                name,
                ...(description !== undefined && { description }),
                unit,
            },
        });
        try {
            if (userId) {
                const created = await client_1.prisma.notification.create({
                    data: {
                        userId,
                        type: 'RAW_MATERIAL_CREATED',
                        message: `Created raw material: ${rawMaterial.name}`
                    },
                });
                await (0, NotificationsController_1.emitUserNotification)(userId, { event: 'created', notification: created });
            }
        }
        catch (notificationError) {
            console.error('Notification error:', notificationError);
        }
        res.status(201).json(rawMaterial);
        await (0, audit_1.logActivity)({
            type: 'raw_material',
            action: 'created',
            entity: 'RawMaterial',
            entityId: rawMaterial.id,
            userId,
            metadata: { name, unit }
        });
    }
    catch (error) {
        console.error('Error creating raw material:', error);
        res.status(500).json({ error: 'Failed to create raw material' });
    }
};
exports.createRawMaterial = createRawMaterial;
const getRawMaterials = async (req, res) => {
    try {
        const rawMaterials = await client_1.prisma.rawMaterial.findMany({
            where: {
                isActive: true,
            },
            include: {
                inventory: {
                    take: 1
                }
            },
            orderBy: {
                name: 'asc'
            }
        });
        res.json(rawMaterials);
    }
    catch (error) {
        console.error('Error fetching raw materials:', error);
        res.status(500).json({ error: 'Failed to fetch raw materials' });
    }
};
exports.getRawMaterials = getRawMaterials;
const getRawMaterialById = async (req, res) => {
    try {
        const { id } = req.params;
        const rawMaterial = await client_1.prisma.rawMaterial.findUnique({
            where: { id },
            include: {
                inventory: true,
                recipeItems: {
                    include: {
                        recipe: {
                            include: {
                                product: true
                            }
                        }
                    }
                }
            },
        });
        if (!rawMaterial) {
            return res.status(404).json({ error: 'Raw material not found' });
        }
        res.json(rawMaterial);
    }
    catch (error) {
        console.error('Error fetching raw material:', error);
        res.status(500).json({ error: 'Failed to fetch raw material' });
    }
};
exports.getRawMaterialById = getRawMaterialById;
const updateRawMaterial = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, unit, isActive } = req.body;
        const userId = req.user?.publicId;
        const userRole = req.user?.role;
        // Only Admin can update raw materials
        if (!(0, roles_1.isAdmin)(userRole)) {
            res.status(403).json({ error: 'Admin access required' });
            return;
        }
        const rawMaterial = await client_1.prisma.rawMaterial.update({
            where: { id },
            data: {
                ...(name !== undefined && { name }),
                ...(description !== undefined && { description }),
                ...(unit !== undefined && { unit }),
                ...(isActive !== undefined && { isActive }),
            },
        });
        try {
            if (userId) {
                const updated = await client_1.prisma.notification.create({
                    data: {
                        userId,
                        type: 'RAW_MATERIAL_UPDATED',
                        message: `Updated raw material: ${rawMaterial.name}`
                    },
                });
                await (0, NotificationsController_1.emitUserNotification)(userId, { event: 'created', notification: updated });
            }
        }
        catch (notificationError) {
            console.error('Notification error:', notificationError);
        }
        res.json(rawMaterial);
        await (0, audit_1.logActivity)({
            type: 'raw_material',
            action: 'updated',
            entity: 'RawMaterial',
            entityId: rawMaterial.id,
            userId,
            metadata: { name, unit }
        });
    }
    catch (error) {
        console.error('Error updating raw material:', error);
        res.status(500).json({ error: 'Failed to update raw material' });
    }
};
exports.updateRawMaterial = updateRawMaterial;
const deleteRawMaterial = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.publicId;
        const userRole = req.user?.role;
        // Only Admin can delete raw materials
        if (!(0, roles_1.isAdmin)(userRole)) {
            res.status(403).json({ error: 'Admin access required' });
            return;
        }
        await client_1.prisma.rawMaterial.update({
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
                        type: 'RAW_MATERIAL_DEACTIVATED',
                        message: `Deactivated raw material: ${id}`
                    },
                });
                await (0, NotificationsController_1.emitUserNotification)(userId, { event: 'created', notification: deleted });
            }
        }
        catch (notificationError) {
            console.error('Notification error:', notificationError);
        }
        res.json({ message: 'Raw material deactivated successfully' });
        await (0, audit_1.logActivity)({
            type: 'raw_material',
            action: 'deleted',
            entity: 'RawMaterial',
            entityId: id,
            userId,
            metadata: { rawMaterialId: id }
        });
    }
    catch (error) {
        console.error('Error deleting raw material:', error);
        res.status(500).json({ error: 'Failed to delete raw material' });
    }
};
exports.deleteRawMaterial = deleteRawMaterial;
