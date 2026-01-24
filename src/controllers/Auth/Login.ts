import bcrypt from "bcryptjs";
import { Response } from "express";
import jwt, { Secret, SignOptions } from "jsonwebtoken";
import { prisma } from "../../config/client";
import { emitUserNotification } from "../NotificationsController";
import { logger } from "../../utils/logger";
import { DEFAULT_PERMISSIONS, ModuleName, ActionType } from "../../types/modules";

// Helper function to get user permissions based on role
const getUserPermissions = (roleName: string) => {
  const rolePermissions = DEFAULT_PERMISSIONS[roleName as keyof typeof DEFAULT_PERMISSIONS];
  if (!rolePermissions) {
    console.warn(`No permissions found for role: ${roleName}`);
    return [];
  }
  console.log("rolePermissions", rolePermissions);
  // Transform the permissions object into an array of { module, actions } format
  return Object.entries(rolePermissions).map(([module, actions]) => ({
    module,
    actions: actions as ActionType[],
  })).filter(p => p.actions.length > 0); // Only include modules with at least one action
};

const generateToken = (
  user: any,
  secret: Secret,
  expiresIn: SignOptions["expiresIn"]
) => {
  const payload = {
    id: user.id,
    name: user.name,
    role: user.role,
    roleId: user.roleId,
    email: user.email,
    contact: user.contact,
    publicId: user.publicId,
  };
  const options: SignOptions = { expiresIn };
  return jwt.sign(payload, secret, options);
};

export const login = async (req: any, res: Response) => {
  const { email, password } = req.body;
  logger.auth.login(email, false); // Start with false, will update to true on success
  console.log("email", email);
  if (!email) {
    logger.warn("Login attempt without email");
    return res.status(400).json({ message: "Email is required" });
  }
  if (!password) {
    logger.warn("Login attempt without password", { email });
    return res.status(400).json({ message: "Password is required" });
  }

  try {
    const user = await prisma.user.findFirst({
      where: { email },
    });
    console.log("user", user);
    if (!user) {
      logger.auth.login(email, false);
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    console.log("Password from request:", password);
    console.log("Hashed password from DB:", user.password);
    console.log("Password comparison result:", isValidPassword);

    if (!isValidPassword) {
      logger.auth.login(email, false);
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const accessToken = generateToken(
      user,
      process.env.JWT_SECRET as Secret,
      "6h"
    );
    const refreshToken = generateToken(
      user,
      process.env.JWT_REFRESH_SECRET as Secret,
      "7d"
    );

    logger.auth.tokenGenerate(user.id.toString(), "access");
    logger.auth.tokenGenerate(user.id.toString(), "refresh");

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    logger.auth.login(email, true);

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
  } catch (error) {
    logger.error("Login error", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const logout = async (req: any, res: Response) => {
  const refreshToken = req.cookies?.refreshToken; // get from cookies

  if (!refreshToken) {
    return res.status(401).json({ message: "Not authorized" });
  }

  try {
    const decoded = jwt.verify(
      refreshToken,
      process.env.JWT_REFRESH_SECRET as Secret
    );

    if (typeof decoded !== "object" || !decoded || !("id" in decoded)) {
      return res.status(400).json({ message: "Invalid token" });
    }

    // Optional: invalidate token in DB if you store them
    await prisma.user.update({
      where: { id: (decoded as any).id as number },
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
  } catch (error) {
    logger.error("Logout error", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const refreshToken = async (req: any, res: Response) => {
  try {
    const refreshToken = req.cookies?.refreshToken;
    if (!refreshToken) {
      return res.status(401).json({ message: "Refresh token not found" });
    }
    const decoded = jwt.verify(
      refreshToken,
      process.env.JWT_REFRESH_SECRET as Secret
    );
    if (typeof decoded !== "object" || !decoded || !("id" in decoded)) {
      return res.status(400).json({ message: "Invalid token" });
    }
    // Optionally, check if user still exists and is active
    const userId = (decoded as any).id as number;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }
    const accessToken = generateToken(
      user,
      process.env.JWT_SECRET as Secret,
      "6h"
    );
    
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
  } catch (error) {
    logger.error("Refresh token error", error);
    res.status(401).json({ message: "Invalid or expired refresh token" });
  }
};

export const listUsers = async (_req: any, res: Response) => {
  try {
    const users = await prisma.user.findMany({
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

    logger.auth.usersListed(users.length);
    res.status(200).json(users);
  } catch (error) {
    logger.error("Error fetching users", error);
    res.status(500).json({ message: "Error fetching users" });
  }
};

export const getRoles = async (_req: any, res: Response) => {
  try {
    const { ROLES } = await import("../../config/roles");
    logger.auth.rolesListed(ROLES.length);
    res.json(ROLES);
  } catch (error) {
    logger.error("Error fetching roles", error);
    res.status(500).json({ error: "Failed to fetch roles" });
  }
};

export const deleteUser = async (req: any, res: Response) => {
  try {
    const { publicId } = req.params;
    const requestingUser = req.user; // From JWT middleware

    // Check if user exists
    const userToDelete = await prisma.user.findUnique({
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
    const deletedUser = await prisma.user.delete({
      where: { publicId },
    });

    logger.auth.userDeleted(publicId, requestingUser.publicId);

    res.json({
      message: `User ${userToDelete.name} has been deleted successfully`,
      deletedUser: {
        name: userToDelete.name,
        email: userToDelete.email,
        publicId: userToDelete.publicId,
      },
    });
  } catch (error) {
    console.error("Detailed error deleting user:", error);
    logger.error("Error deleting user", error);

    // More specific error handling
    if (error instanceof Error) {
      res.status(500).json({
        error: "Failed to delete user",
        message: error.message,
        details: error.stack,
      });
    } else {
      res.status(500).json({
        error: "Failed to delete user",
        message: "An unknown error occurred while deleting the user.",
        details: JSON.stringify(error),
      });
    }
  }
};

// Get current user permissions - called on page refresh to sync permissions
export const getUserPerms = async (req: any, res: Response) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const user = await prisma.user.findUnique({
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
  } catch (error) {
    logger.error("Error fetching user permissions", error);
    res.status(500).json({ message: "Failed to fetch permissions" });
  }
};
