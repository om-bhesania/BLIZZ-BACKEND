import { Response, NextFunction, Request } from "express";
import { PrismaClient } from "@prisma/client";
import { prisma as sharedPrisma } from "../config/client";
import { yellowBG } from "console-log-colors";
import { AuthRequest } from "../middlewares/auth";
import jwt from "jsonwebtoken";
import { SYSTEM_MODULES } from "../types/modules";

const prisma = sharedPrisma ?? new PrismaClient();

export const ping = async (req: AuthRequest & Request, res: Response): Promise<void> => {
  // Resolve publicId from req.user (preferred) or decode token
  let publicId: string | undefined = (req as any)?.user?.publicId as string | undefined;
  if (!publicId) {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : undefined;
    if (token) {
      try {
        const decoded: any = jwt.verify(token, process.env.JWT_SECRET as string);
        publicId = decoded?.publicId;
      } catch {}
    }
  }

  console.log("Ping request received", yellowBG(String(publicId || "unknown")));

  if (!publicId) {
    res.status(401).json({
      tokenValidity: false,
      message: "Unauthorized - Missing publicId in token",
    });
    return;
  }

  try {
    // Get user with role and permissions
    const user = await prisma.user.findUnique({
      where: { publicId: publicId as string },
      include: {
        Role: {
          include: {
            permissions: {
              include: { permission: true },
            },
          },
        },
      },
    });

    if (!user) {
      res.status(404).json({
        tokenValidity: false,
        message: "User not found",
      });
      return;
    }

    // Get shops where this user is the manager (using publicId)
    const managedShops = await prisma.shop.findMany({
      where: { managerId: publicId as string },
      select: {
        id: true,
        name: true,
        email: true,
        contactNumber: true,
        isActive: true,
      },
    });

    // Group permissions by module(resource) with allowed actions
    // Use SYSTEM_MODULES from modules.ts to include all valid modules
    const allowedModules = new Set<string>(SYSTEM_MODULES);
    const grouped: Record<string, Set<string>> = {};
    for (const rp of user.Role?.permissions || []) {
      const resource = rp.permission.resource;
      const action = rp.permission.action;
      if (!allowedModules.has(resource)) continue;
      if (!grouped[resource]) grouped[resource] = new Set<string>();
      grouped[resource].add(action);
    }
    const permissions = Object.entries(grouped).map(([module, actions]) => ({
      module,
      permissions: Array.from(actions.values()).sort(),
    }));

    res.json({
      tokenValidity: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.Role?.name || null,
        roleId: user?.roleId || null,
        publicId: user?.publicId,
        permissions,
        managedShops,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      tokenValidity: false,
      message: "Internal server error",
    });
  }
};
