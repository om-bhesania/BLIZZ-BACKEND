"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserPerms = exports.deleteUser = exports.getRoles = exports.listUsers = exports.refreshToken = exports.logout = exports.login = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const client_1 = require("../../config/client");
const logger_1 = require("../../utils/logger");
const modules_1 = require("../../types/modules");
// Helper function to get user permissions based on role
const getUserPermissions = (roleName) => {
    const rolePermissions = modules_1.DEFAULT_PERMISSIONS[roleName];
    if (!rolePermissions) {
        console.warn(`No permissions found for role: ${roleName}`);
        return [];
    }
    console.log("rolePermissions", rolePermissions);
    // Transform the permissions object into an array of { module, actions } format
    return Object.entries(rolePermissions).map(([module, actions]) => ({
        module,
        actions: actions,
    })).filter(p => p.actions.length > 0); // Only include modules with at least one action
};
const generateToken = (user, secret, expiresIn) => {
    const payload = {
        id: user.id,
        name: user.name,
        role: user.role,
        roleId: user.roleId,
        email: user.email,
        contact: user.contact,
        publicId: user.publicId,
    };
    const options = { expiresIn };
    return jsonwebtoken_1.default.sign(payload, secret, options);
};
const login = async (req, res) => {
    const { email, password } = req.body;
    logger_1.logger.auth.login(email, false); // Start with false, will update to true on success
    console.log("email", email);
    if (!email) {
        logger_1.logger.warn("Login attempt without email");
        return res.status(400).json({ message: "Email is required" });
    }
    if (!password) {
        logger_1.logger.warn("Login attempt without password", { email });
        return res.status(400).json({ message: "Password is required" });
    }
    try {
        const user = await client_1.prisma.user.findFirst({
            where: { email },
        });
        console.log("user", user);
        if (!user) {
            logger_1.logger.auth.login(email, false);
            return res.status(401).json({ message: "Invalid email or password" });
        }
        const isValidPassword = await bcryptjs_1.default.compare(password, user.password);
        console.log("Password from request:", password);
        console.log("Hashed password from DB:", user.password);
        console.log("Password comparison result:", isValidPassword);
        if (!isValidPassword) {
            logger_1.logger.auth.login(email, false);
            return res.status(401).json({ message: "Invalid email or password" });
        }
        const accessToken = generateToken(user, process.env.JWT_SECRET, "6h");
        const refreshToken = generateToken(user, process.env.JWT_REFRESH_SECRET, "7d");
        logger_1.logger.auth.tokenGenerate(user.id.toString(), "access");
        logger_1.logger.auth.tokenGenerate(user.id.toString(), "refresh");
        res.cookie("refreshToken", refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        });
        logger_1.logger.auth.login(email, true);
        // Login notifications removed - not needed for UI
        // Get permissions based on user's role
        const permissions = getUserPermissions(user.role || "");
        res.status(200).json({
            status: "success",
            message: "Login successful",
            token: accessToken,
            refreshToken: refreshToken,
            user: {
                id: user.id,
                name: user.name,
                role: user.role,
                roleId: user.roleId,
                email: user.email,
                contact: user.contact,
                publicId: user.publicId,
                permissions: permissions,
            },
        });
    }
    catch (error) {
        logger_1.logger.error("Login error", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};
exports.login = login;
const logout = async (req, res) => {
    const refreshToken = req.cookies?.refreshToken; // get from cookies
    if (!refreshToken) {
        return res.status(401).json({ message: "Not authorized" });
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
        if (typeof decoded !== "object" || !decoded || !("id" in decoded)) {
            return res.status(400).json({ message: "Invalid token" });
        }
        // Optional: invalidate token in DB if you store them
        await client_1.prisma.user.update({
            where: { id: decoded.id },
            data: {},
        });
        res.clearCookie("refreshToken", {
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
        });
        res.status(200).json({
            status: "success",
            message: "Logout successful",
            token: null,
            refreshToken: null,
            user: null,
        });
    }
    catch (error) {
        logger_1.logger.error("Logout error", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};
exports.logout = logout;
const refreshToken = async (req, res) => {
    try {
        const refreshToken = req.cookies?.refreshToken;
        if (!refreshToken) {
            return res.status(401).json({ message: "Refresh token not found" });
        }
        const decoded = jsonwebtoken_1.default.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
        if (typeof decoded !== "object" || !decoded || !("id" in decoded)) {
            return res.status(400).json({ message: "Invalid token" });
        }
        // Optionally, check if user still exists and is active
        const userId = decoded.id;
        const user = await client_1.prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            return res.status(401).json({ message: "User not found" });
        }
        const accessToken = generateToken(user, process.env.JWT_SECRET, "6h");
        // Get permissions based on user's role
        const permissions = getUserPermissions(user.role || "");
        res.status(200).json({
            status: "success",
            token: accessToken,
            user: {
                id: user.id,
                name: user.name,
                role: user.role,
                roleId: user.roleId,
                email: user.email,
                contact: user.contact,
                publicId: user.publicId,
                permissions: permissions,
            },
        });
    }
    catch (error) {
        logger_1.logger.error("Refresh token error", error);
        res.status(401).json({ message: "Invalid or expired refresh token" });
    }
};
exports.refreshToken = refreshToken;
const listUsers = async (_req, res) => {
    try {
        const users = await client_1.prisma.user.findMany({
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                roleId: true,
                contact: true,
                publicId: true,
                managedShops: true,
            },
            orderBy: { id: "asc" },
        });
        logger_1.logger.auth.usersListed(users.length);
        res.status(200).json(users);
    }
    catch (error) {
        logger_1.logger.error("Error fetching users", error);
        res.status(500).json({ message: "Error fetching users" });
    }
};
exports.listUsers = listUsers;
const getRoles = async (_req, res) => {
    try {
        const { ROLES } = await Promise.resolve().then(() => __importStar(require("../../config/roles")));
        logger_1.logger.auth.rolesListed(ROLES.length);
        res.json(ROLES);
    }
    catch (error) {
        logger_1.logger.error("Error fetching roles", error);
        res.status(500).json({ error: "Failed to fetch roles" });
    }
};
exports.getRoles = getRoles;
const deleteUser = async (req, res) => {
    try {
        const { publicId } = req.params;
        const requestingUser = req.user; // From JWT middleware
        // Check if user exists
        const userToDelete = await client_1.prisma.user.findUnique({
            where: { publicId },
            include: {
                managedShops: true,
            },
        });
        if (!userToDelete) {
            return res.status(404).json({
                error: "User not found",
                message: "The user you're trying to delete does not exist",
            });
        }
        // Prevent self-deletion
        if (requestingUser.publicId === publicId) {
            return res.status(400).json({
                error: "Cannot delete yourself",
                message: "You cannot delete your own account",
            });
        }
        // Check if user is an admin or has permission to delete users
        if (requestingUser.role !== "Admin") {
            return res.status(403).json({
                error: "Insufficient permissions",
                message: "Only administrators can delete users",
            });
        }
        // Check if user has managed shops (prevent deletion if they manage shops)
        if (userToDelete.managedShops && userToDelete.managedShops.length > 0) {
            return res.status(400).json({
                error: "Cannot delete user with managed shops",
                message: "Please reassign shop management before deleting this user",
            });
        }
        // Delete the user
        const deletedUser = await client_1.prisma.user.delete({
            where: { publicId },
        });
        logger_1.logger.auth.userDeleted(publicId, requestingUser.publicId);
        res.json({
            message: `User ${userToDelete.name} has been deleted successfully`,
            deletedUser: {
                name: userToDelete.name,
                email: userToDelete.email,
                publicId: userToDelete.publicId,
            },
        });
    }
    catch (error) {
        console.error("Detailed error deleting user:", error);
        logger_1.logger.error("Error deleting user", error);
        // More specific error handling
        if (error instanceof Error) {
            res.status(500).json({
                error: "Failed to delete user",
                message: error.message,
                details: error.stack,
            });
        }
        else {
            res.status(500).json({
                error: "Failed to delete user",
                message: "An unknown error occurred while deleting the user.",
                details: JSON.stringify(error),
            });
        }
    }
};
exports.deleteUser = deleteUser;
// Get current user permissions - called on page refresh to sync permissions
const getUserPerms = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ message: "Not authenticated" });
        }
        const user = await client_1.prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                role: true,
                roleId: true,
            },
        });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        const permissions = getUserPermissions(user.role || "");
        res.status(200).json({
            status: "success",
            permissions: permissions,
            role: user.role,
        });
    }
    catch (error) {
        logger_1.logger.error("Error fetching user permissions", error);
        res.status(500).json({ message: "Failed to fetch permissions" });
    }
};
exports.getUserPerms = getUserPerms;
