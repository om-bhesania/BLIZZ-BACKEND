"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const modules_1 = require("./src/types/modules");
const prisma = new client_1.PrismaClient();
async function setupRoles() {
    try {
        // Upsert Admin role
        const adminRole = await prisma.role.upsert({
            where: { name: "Admin" },
            update: {
                description: "Administrator role with full system access",
            },
            create: {
                name: "Admin",
                description: "Administrator role with full system access",
            },
        });
        // Upsert Shop Owner role
        const shopOwnerRole = await prisma.role.upsert({
            where: { name: "Shop_Owner" },
            update: {
                description: "Shop owner with permissions to manage their store and products",
            },
            create: {
                name: "Shop_Owner",
                description: "Shop owner with permissions to manage their store and products",
            },
        });
        // Upsert Super Admin role
        const superAdminRole = await prisma.role.upsert({
            where: { name: "Super_Admin" },
            update: {
                description: "Super administrator role with full system access and monitoring capabilities",
            },
            create: {
                name: "Super_Admin",
                description: "Super administrator role with full system access and monitoring capabilities",
            },
        });
        // Upsert Factory Worker role
        const factoryWorkerRole = await prisma.role.upsert({
            where: { name: "Factory_Employee" },
            update: {
                description: "Factory worker role for inventory management and monitoring",
            },
            create: {
                name: "Factory_Employee",
                description: "Factory worker role for inventory management and monitoring",
            },
        });
        // Upsert Outlet Employee role
        const outletEmployeeRole = await prisma.role.upsert({
            where: { name: "Outlet_Employee" },
            update: {
                description: "Outlet employee role for shop operations and billing",
            },
            create: {
                name: "Outlet_Employee",
                description: "Outlet employee role for shop operations and billing",
            },
        });
        // Delete existing permissions for these roles
        await prisma.rolePermission.deleteMany({
            where: {
                roleId: {
                    in: [adminRole.id, shopOwnerRole.id, superAdminRole.id, factoryWorkerRole.id, outletEmployeeRole.id],
                },
            },
        });
        // Create permissions for Admin
        const adminModules = Object.keys(modules_1.DEFAULT_PERMISSIONS.Admin);
        console.log('adminModules', adminModules);
        for (const module of adminModules) {
            const actions = modules_1.DEFAULT_PERMISSIONS.Admin[module];
            const permissions = actions.map((action) => ({
                action,
                resource: module,
                description: `${action} ${module}`,
            }));
            // Create permissions using upsert to handle duplicates
            for (const permission of permissions) {
                await prisma.permission.upsert({
                    where: {
                        action_resource: {
                            action: permission.action,
                            resource: permission.resource,
                        },
                    },
                    update: {},
                    create: permission,
                });
            }
            // Fetch created permissions
            const createdPermissionRecords = await prisma.permission.findMany({
                where: {
                    resource: module,
                    action: { in: actions },
                },
            });
            console.log('createdPermissionRecords', createdPermissionRecords);
            // Create role-permission connections
            await prisma.rolePermission.createMany({
                data: createdPermissionRecords.map((permission) => ({
                    roleId: adminRole.id,
                    permissionId: permission.id,
                })),
            });
        }
        // Create permissions for Shop Owner
        const shopOwnerModules = Object.keys(modules_1.DEFAULT_PERMISSIONS.Shop_Owner);
        for (const module of shopOwnerModules) {
            const actions = modules_1.DEFAULT_PERMISSIONS.Shop_Owner[module];
            const permissions = actions.map((action) => ({
                action,
                resource: module,
                description: `${action} ${module}`,
            }));
            // Create permissions using upsert to handle duplicates
            for (const permission of permissions) {
                await prisma.permission.upsert({
                    where: {
                        action_resource: {
                            action: permission.action,
                            resource: permission.resource,
                        },
                    },
                    update: {},
                    create: permission,
                });
            }
            // Fetch created permissions
            const createdPermissionRecords = await prisma.permission.findMany({
                where: {
                    resource: module,
                    action: { in: actions },
                },
            });
            // Create role-permission connections
            await prisma.rolePermission.createMany({
                data: createdPermissionRecords.map((permission) => ({
                    roleId: shopOwnerRole.id,
                    permissionId: permission.id,
                })),
            });
        }
        // Create permissions for Super Admin
        const superAdminModules = Object.keys(modules_1.DEFAULT_PERMISSIONS.Super_Admin);
        for (const module of superAdminModules) {
            const actions = modules_1.DEFAULT_PERMISSIONS.Super_Admin[module];
            const permissions = actions.map((action) => ({
                action,
                resource: module,
                description: `${action} ${module}`,
            }));
            // Create permissions using upsert to handle duplicates
            for (const permission of permissions) {
                await prisma.permission.upsert({
                    where: {
                        action_resource: {
                            action: permission.action,
                            resource: permission.resource,
                        },
                    },
                    update: {},
                    create: permission,
                });
            }
            // Fetch created permissions
            const createdPermissionRecords = await prisma.permission.findMany({
                where: {
                    resource: module,
                    action: { in: actions },
                },
            });
            // Create role-permission connections
            await prisma.rolePermission.createMany({
                data: createdPermissionRecords.map((permission) => ({
                    roleId: superAdminRole.id,
                    permissionId: permission.id,
                })),
            });
        }
        // Create permissions for Factory Worker
        const factoryWorkerModules = Object.keys(modules_1.DEFAULT_PERMISSIONS.Factory_Employee);
        for (const module of factoryWorkerModules) {
            const actions = modules_1.DEFAULT_PERMISSIONS.Factory_Employee[module];
            const permissions = actions.map((action) => ({
                action,
                resource: module,
                description: `${action} ${module}`,
            }));
            // Create permissions using upsert to handle duplicates
            for (const permission of permissions) {
                await prisma.permission.upsert({
                    where: {
                        action_resource: {
                            action: permission.action,
                            resource: permission.resource,
                        },
                    },
                    update: {},
                    create: permission,
                });
            }
            // Fetch created permissions
            const createdPermissionRecords = await prisma.permission.findMany({
                where: {
                    resource: module,
                    action: { in: actions },
                },
            });
            // Create role-permission connections
            await prisma.rolePermission.createMany({
                data: createdPermissionRecords.map((permission) => ({
                    roleId: factoryWorkerRole.id,
                    permissionId: permission.id,
                })),
            });
        }
        // Create permissions for Outlet Employee
        const outletEmployeeModules = Object.keys(modules_1.DEFAULT_PERMISSIONS.Outlet_Employee);
        for (const module of outletEmployeeModules) {
            const actions = modules_1.DEFAULT_PERMISSIONS.Outlet_Employee[module];
            const permissions = actions.map((action) => ({
                action,
                resource: module,
                description: `${action} ${module}`,
            }));
            // Create permissions using upsert to handle duplicates
            for (const permission of permissions) {
                await prisma.permission.upsert({
                    where: {
                        action_resource: {
                            action: permission.action,
                            resource: permission.resource,
                        },
                    },
                    update: {},
                    create: permission,
                });
            }
            // Fetch created permissions
            const createdPermissionRecords = await prisma.permission.findMany({
                where: {
                    resource: module,
                    action: { in: actions },
                },
            });
            // Create role-permission connections
            await prisma.rolePermission.createMany({
                data: createdPermissionRecords.map((permission) => ({
                    roleId: outletEmployeeRole.id,
                    permissionId: permission.id,
                })),
            });
        }
        console.log("Roles and permissions set up successfully!");
    }
    catch (error) {
        console.error('Error setting up roles:', error);
    }
    finally {
        await prisma.$disconnect();
    }
}
setupRoles();
