import { Request, Response } from 'express';
import { prisma } from '../config/client';
import { emitUserNotification } from './NotificationsController';
import { logActivity } from '../utils/audit';

export const createUnit = async (req: Request, res: Response) => {
    try {
        const { name, symbol, description } = req.body;
        const unit = await prisma.unit.create({
            data: {
                name,
                symbol,
                description,
            },
        });
        try {
            const userId = (req as any).user?.publicId as string | undefined;
            if (userId) {
                const created = await prisma.notification.create({
                    data: { userId, type: 'UNIT_CREATED', message: `Created unit ${unit.name}` },
                });
                await emitUserNotification(userId, { event: 'created', notification: created });
            }
        } catch {}
        res.status(201).json(unit);
        await logActivity({
            type: 'unit', action: 'created', entity: 'Unit', entityId: unit.id,
            userId: (req as any).user?.publicId, metadata: { name, symbol }
        });
    } catch (error) {
        console.log('error', error);
        res.status(500).json({ error: 'Failed to create unit' });
    }
};

export const getUnits = async (req: Request, res: Response) => {
    try {
        const units = await prisma.unit.findMany({
            where: {
                isActive: true,
            },
            orderBy: {
                name: 'asc',
            },
        });
        res.json(units);
    } catch (error) {
        console.log("error", error);
        res.status(500).json({ error: 'Failed to fetch units' });
    }
};

export const getUnitById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const unit = await prisma.unit.findUnique({
            where: { id },
        });
        if (!unit) {
            return res.status(404).json({ error: 'Unit not found' });
        }
        res.json(unit);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch unit' });
    }
};

export const updateUnit = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { name, symbol, description, isActive } = req.body;
        const unit = await prisma.unit.update({
            where: { id },
            data: {
                name,
                symbol,
                description,
                isActive,
            },
        });
        try {
            const userId = (req as any).user?.publicId as string | undefined;
            if (userId) {
                const updated = await prisma.notification.create({
                    data: { userId, type: 'UNIT_UPDATED', message: `Updated unit ${unit.name}` },
                });
                await emitUserNotification(userId, { event: 'created', notification: updated });
            }
        } catch {}
        res.json(unit);
        await logActivity({
            type: 'unit', action: 'updated', entity: 'Unit', entityId: unit.id,
            userId: (req as any).user?.publicId, metadata: { name, symbol }
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update unit' });
    }
};

export const deleteUnit = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        await prisma.unit.update({
            where: { id },
            data: {
                isActive: false,
            },
        });
        try {
            const userId = (req as any).user?.publicId as string | undefined;
            if (userId) {
                const deleted = await prisma.notification.create({
                    data: { userId, type: 'UNIT_DEACTIVATED', message: `Deactivated unit ${id}` },
                });
                await emitUserNotification(userId, { event: 'created', notification: deleted });
            }
        } catch {}
        res.json({ message: 'Unit deactivated successfully' });
        await logActivity({
            type: 'unit', action: 'deleted', entity: 'Unit', entityId: id,
            userId: (req as any).user?.publicId
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete unit' });
    }
};

