"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteSupplier = exports.updateSupplier = exports.getSupplierById = exports.getSuppliers = exports.createSupplier = void 0;
const client_1 = require("../config/client");
const NotificationsController_1 = require("./NotificationsController");
const audit_1 = require("../utils/audit");
const roles_1 = require("../config/roles");
const createSupplier = async (req, res) => {
    try {
        const { name, contact, email, address } = req.body;
        const userId = req.user?.publicId;
        const userRole = req.user?.role;
        // Only Admin can create suppliers
        if (!(0, roles_1.isAdmin)(userRole)) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        const supplier = await client_1.prisma.supplier.create({
            data: {
                name,
                contact,
                email,
                address,
            },
        });
        try {
            if (userId) {
                const created = await client_1.prisma.notification.create({
                    data: {
                        userId,
                        type: 'SUPPLIER_CREATED',
                        message: `Created supplier: ${supplier.name}`
                    },
                });
                await (0, NotificationsController_1.emitUserNotification)(userId, { event: 'created', notification: created });
            }
        }
        catch (notificationError) {
            console.error('Notification error:', notificationError);
        }
        res.status(201).json(supplier);
        await (0, audit_1.logActivity)({
            type: 'supplier',
            action: 'created',
            entity: 'Supplier',
            entityId: supplier.id,
            userId,
            metadata: { name, contact }
        });
    }
    catch (error) {
        console.error('Error creating supplier:', error);
        res.status(500).json({ error: 'Failed to create supplier' });
    }
};
exports.createSupplier = createSupplier;
const getSuppliers = async (req, res) => {
    try {
        const suppliers = await client_1.prisma.supplier.findMany({
            where: {
                isActive: true,
            },
            orderBy: {
                name: 'asc'
            }
        });
        res.json(suppliers);
    }
    catch (error) {
        console.error('Error fetching suppliers:', error);
        res.status(500).json({ error: 'Failed to fetch suppliers' });
    }
};
exports.getSuppliers = getSuppliers;
const getSupplierById = async (req, res) => {
    try {
        const { id } = req.params;
        const supplier = await client_1.prisma.supplier.findUnique({
            where: { id },
        });
        if (!supplier) {
            return res.status(404).json({ error: 'Supplier not found' });
        }
        res.json(supplier);
    }
    catch (error) {
        console.error('Error fetching supplier:', error);
        res.status(500).json({ error: 'Failed to fetch supplier' });
    }
};
exports.getSupplierById = getSupplierById;
const updateSupplier = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, contact, email, address, isActive } = req.body;
        const userId = req.user?.publicId;
        const userRole = req.user?.role;
        // Only Admin can update suppliers
        if (!(0, roles_1.isAdmin)(userRole)) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        const supplier = await client_1.prisma.supplier.update({
            where: { id },
            data: {
                name,
                contact,
                email,
                address,
                isActive,
            },
        });
        try {
            if (userId) {
                const updated = await client_1.prisma.notification.create({
                    data: {
                        userId,
                        type: 'SUPPLIER_UPDATED',
                        message: `Updated supplier: ${supplier.name}`
                    },
                });
                await (0, NotificationsController_1.emitUserNotification)(userId, { event: 'created', notification: updated });
            }
        }
        catch (notificationError) {
            console.error('Notification error:', notificationError);
        }
        res.json(supplier);
        await (0, audit_1.logActivity)({
            type: 'supplier',
            action: 'updated',
            entity: 'Supplier',
            entityId: supplier.id,
            userId,
            metadata: { name, contact }
        });
    }
    catch (error) {
        console.error('Error updating supplier:', error);
        res.status(500).json({ error: 'Failed to update supplier' });
    }
};
exports.updateSupplier = updateSupplier;
const deleteSupplier = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.publicId;
        const userRole = req.user?.role;
        // Only Admin can delete suppliers
        if (!(0, roles_1.isAdmin)(userRole)) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        await client_1.prisma.supplier.update({
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
                        type: 'SUPPLIER_DEACTIVATED',
                        message: `Deactivated supplier: ${id}`
                    },
                });
                await (0, NotificationsController_1.emitUserNotification)(userId, { event: 'created', notification: deleted });
            }
        }
        catch (notificationError) {
            console.error('Notification error:', notificationError);
        }
        res.json({ message: 'Supplier deactivated successfully' });
        await (0, audit_1.logActivity)({
            type: 'supplier',
            action: 'deleted',
            entity: 'Supplier',
            entityId: id,
            userId,
            metadata: { supplierId: id }
        });
    }
    catch (error) {
        console.error('Error deleting supplier:', error);
        res.status(500).json({ error: 'Failed to delete supplier' });
    }
};
exports.deleteSupplier = deleteSupplier;
