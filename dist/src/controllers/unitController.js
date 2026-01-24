"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteUnit = exports.updateUnit = exports.getUnitById = exports.getUnits = exports.createUnit = void 0;
const client_1 = require("../config/client");
const NotificationsController_1 = require("./NotificationsController");
const audit_1 = require("../utils/audit");
const createUnit = async (req, res) => {
    try {
        const { name, symbol, description } = req.body;
        const unit = await client_1.prisma.unit.create({
            data: {
                name,
                symbol,
                description,
            },
        });
        try {
            const userId = req.user?.publicId;
            if (userId) {
                const created = await client_1.prisma.notification.create({
                    data: { userId, type: 'UNIT_CREATED', message: `Created unit ${unit.name}` },
                });
                await (0, NotificationsController_1.emitUserNotification)(userId, { event: 'created', notification: created });
            }
        }
        catch { }
        res.status(201).json(unit);
        await (0, audit_1.logActivity)({
            type: 'unit', action: 'created', entity: 'Unit', entityId: unit.id,
            userId: req.user?.publicId, metadata: { name, symbol }
        });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to create unit' });
    }
};
exports.createUnit = createUnit;
const getUnits = async (req, res) => {
    try {
        const units = await client_1.prisma.unit.findMany({
            where: {
                isActive: true,
            },
            orderBy: {
                name: 'asc',
            },
        });
        res.json(units);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch units' });
    }
};
exports.getUnits = getUnits;
const getUnitById = async (req, res) => {
    try {
        const { id } = req.params;
        const unit = await client_1.prisma.unit.findUnique({
            where: { id },
        });
        if (!unit) {
            return res.status(404).json({ error: 'Unit not found' });
        }
        res.json(unit);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch unit' });
    }
};
exports.getUnitById = getUnitById;
const updateUnit = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, symbol, description, isActive } = req.body;
        const unit = await client_1.prisma.unit.update({
            where: { id },
            data: {
                name,
                symbol,
                description,
                isActive,
            },
        });
        try {
            const userId = req.user?.publicId;
            if (userId) {
                const updated = await client_1.prisma.notification.create({
                    data: { userId, type: 'UNIT_UPDATED', message: `Updated unit ${unit.name}` },
                });
                await (0, NotificationsController_1.emitUserNotification)(userId, { event: 'created', notification: updated });
            }
        }
        catch { }
        res.json(unit);
        await (0, audit_1.logActivity)({
            type: 'unit', action: 'updated', entity: 'Unit', entityId: unit.id,
            userId: req.user?.publicId, metadata: { name, symbol }
        });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to update unit' });
    }
};
exports.updateUnit = updateUnit;
const deleteUnit = async (req, res) => {
    try {
        const { id } = req.params;
        await client_1.prisma.unit.update({
            where: { id },
            data: {
                isActive: false,
            },
        });
        try {
            const userId = req.user?.publicId;
            if (userId) {
                const deleted = await client_1.prisma.notification.create({
                    data: { userId, type: 'UNIT_DEACTIVATED', message: `Deactivated unit ${id}` },
                });
                await (0, NotificationsController_1.emitUserNotification)(userId, { event: 'created', notification: deleted });
            }
        }
        catch { }
        res.json({ message: 'Unit deactivated successfully' });
        await (0, audit_1.logActivity)({
            type: 'unit', action: 'deleted', entity: 'Unit', entityId: id,
            userId: req.user?.publicId
        });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to delete unit' });
    }
};
exports.deleteUnit = deleteUnit;
