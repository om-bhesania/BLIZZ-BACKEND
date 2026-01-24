"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ping = void 0;
const client_1 = require("@prisma/client");
const client_2 = require("../config/client");
const console_log_colors_1 = require("console-log-colors");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const modules_1 = require("../types/modules");
const prisma = client_2.prisma ?? new client_1.PrismaClient();
const ping = async (req, res) => {
    // Resolve publicId from req.user (preferred) or decode token
    let publicId = req?.user?.publicId;
    if (!publicId) {
        const authHeader = req.headers.authorization;
        const token = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : undefined;
        if (token) {
            try {
                const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET);
                publicId = decoded?.publicId;
            }
            catch { }
        }
    }
    console.log("Ping request received", (0, console_log_colors_1.yellowBG)(String(publicId || "unknown")));
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
            where: { publicId: publicId },
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
            where: { managerId: publicId },
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
        const allowedModules = new Set(modules_1.SYSTEM_MODULES);
        const grouped = {};
        for (const rp of user.Role?.permissions || []) {
            const resource = rp.permission.resource;
            const action = rp.permission.action;
            if (!allowedModules.has(resource))
                continue;
            if (!grouped[resource])
                grouped[resource] = new Set();
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
    }
    catch (err) {
        console.error(err);
        res.status(500).json({
            tokenValidity: false,
            message: "Internal server error",
        });
    }
};
exports.ping = ping;
