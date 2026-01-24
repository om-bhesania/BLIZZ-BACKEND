import { Request, Response } from 'express';
import { prisma } from '../config/client';
import { emitUserNotification } from './NotificationsController';
import { logActivity } from '../utils/audit';
import { isAdmin } from '../config/roles';

export const createSupplier = async (req: Request, res: Response) => {
    try {
        const { name, contact, email, address } = req.body;
        const userId = (req as any).user?.publicId as string | undefined;
        const userRole = (req as any).user?.role;

        // Only Admin can create suppliers
        if (!isAdmin(userRole)) {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const supplier = await prisma.supplier.create({
            data: {
                name,
                contact,
                email,
                address,
            },
        });

        try {
            if (userId) {
                const created = await prisma.notification.create({
                    data: { 
                        userId, 
                        type: 'SUPPLIER_CREATED', 
                        message: `Created supplier: ${supplier.name}` 
                    },
                });
                await emitUserNotification(userId, { event: 'created', notification: created });
            }
        } catch (notificationError) {
            console.error('Notification error:', notificationError);
        }

        res.status(201).json(supplier);
        await logActivity({
            type: 'supplier', 
            action: 'created', 
            entity: 'Supplier', 
            entityId: supplier.id,
            userId, 
            metadata: { name, contact }
        });
    } catch (error) {
        console.error('Error creating supplier:', error);
        res.status(500).json({ error: 'Failed to create supplier' });
    }
};

export const getSuppliers = async (req: Request, res: Response) => {
    try {
        const suppliers = await prisma.supplier.findMany({
            where: {
                isActive: true,
            },
            orderBy: {
                name: 'asc'
            }
        });
        res.json(suppliers);
    } catch (error) {
        console.error('Error fetching suppliers:', error);
        res.status(500).json({ error: 'Failed to fetch suppliers' });
    }
};

export const getSupplierById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const supplier = await prisma.supplier.findUnique({
            where: { id },
        });
        if (!supplier) {
            return res.status(404).json({ error: 'Supplier not found' });
        }
        res.json(supplier);
    } catch (error) {
        console.error('Error fetching supplier:', error);
        res.status(500).json({ error: 'Failed to fetch supplier' });
    }
};

export const updateSupplier = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { name, contact, email, address, isActive } = req.body;
        const userId = (req as any).user?.publicId as string | undefined;
        const userRole = (req as any).user?.role;

        // Only Admin can update suppliers
        if (!isAdmin(userRole)) {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const supplier = await prisma.supplier.update({
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
                const updated = await prisma.notification.create({
                    data: { 
                        userId, 
                        type: 'SUPPLIER_UPDATED', 
                        message: `Updated supplier: ${supplier.name}` 
                    },
                });
                await emitUserNotification(userId, { event: 'created', notification: updated });
            }
        } catch (notificationError) {
            console.error('Notification error:', notificationError);
        }

        res.json(supplier);
        await logActivity({
            type: 'supplier', 
            action: 'updated', 
            entity: 'Supplier', 
            entityId: supplier.id,
            userId, 
            metadata: { name, contact }
        });
    } catch (error) {
        console.error('Error updating supplier:', error);
        res.status(500).json({ error: 'Failed to update supplier' });
    }
};

export const deleteSupplier = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const userId = (req as any).user?.publicId as string | undefined;
        const userRole = (req as any).user?.role;

        // Only Admin can delete suppliers
        if (!isAdmin(userRole)) {
            return res.status(403).json({ error: 'Admin access required' });
        }

        await prisma.supplier.update({
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
                        type: 'SUPPLIER_DEACTIVATED', 
                        message: `Deactivated supplier: ${id}` 
                    },
                });
                await emitUserNotification(userId, { event: 'created', notification: deleted });
            }
        } catch (notificationError) {
            console.error('Notification error:', notificationError);
        }

        res.json({ message: 'Supplier deactivated successfully' });
        await logActivity({
            type: 'supplier', 
            action: 'deleted', 
            entity: 'Supplier', 
            entityId: id,
            userId, 
            metadata: { supplierId: id }
        });
    } catch (error) {
        console.error('Error deleting supplier:', error);
        res.status(500).json({ error: 'Failed to delete supplier' });
    }
};
