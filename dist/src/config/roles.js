"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRolePermissions = exports.isShopOwner = exports.isAdmin = exports.hasPermission = exports.getRoleById = exports.getRoleByName = exports.ROLES = void 0;
exports.ROLES = [
    {
        id: "37db443d-4198-4764-97dc-12b549b855bd",
        name: "Admin",
        description: "Administrator role with full system access",
        permissions: [
            "Inventory",
            "Billing",
            "Shop",
            "Home",
            "Employee",
            "Raw Materials"
        ]
    },
    {
        id: "1a6bbf72-a96f-4965-904b-0fc9c8cdba62",
        name: "Shop_Owner",
        description: "Shop owner with permissions to manage their store and products",
        permissions: [
            "Billing",
            "Shop Inventory",
            "Home",
            "Raw Materials"
        ]
    }
];
// Helper functions for role checking
const getRoleByName = (roleName) => {
    return exports.ROLES.find(role => role.name === roleName);
};
exports.getRoleByName = getRoleByName;
const getRoleById = (roleId) => {
    return exports.ROLES.find(role => role.id === roleId);
};
exports.getRoleById = getRoleById;
const hasPermission = (roleName, permission) => {
    const role = (0, exports.getRoleByName)(roleName);
    return role ? role.permissions.includes(permission) : false;
};
exports.hasPermission = hasPermission;
const isAdmin = (roleName) => {
    return roleName === "Admin";
};
exports.isAdmin = isAdmin;
const isShopOwner = (roleName) => {
    return roleName === "Shop Owner" || roleName === "Shop_Owner";
};
exports.isShopOwner = isShopOwner;
const getRolePermissions = (roleName) => {
    const role = (0, exports.getRoleByName)(roleName);
    return role ? role.permissions : [];
};
exports.getRolePermissions = getRolePermissions;
// Export default roles for easy access
exports.default = exports.ROLES;
