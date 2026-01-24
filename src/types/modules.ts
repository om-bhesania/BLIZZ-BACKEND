export type ModuleName =
  | "Inventory"
  | "Billing"
  | "Shop"
  | "Employee"
  | "Home"
  | "Shop Inventory"
  | "Restock Management"
  | "Notifications"
  | "Dashboard"
  | "Audit Log"
  | "Low Stock Alerts"
  | "Search"
  | "Database Monitoring"
  | "Cache Management"
  | "Support"
  | "Raw Materials"
  | "Suppliers";

export type ActionType = "read" | "write" | "update" | "delete";

export const SYSTEM_MODULES: ModuleName[] = [
  "Inventory",
  "Billing",
  "Shop",
  "Employee",
  "Home",
  "Shop Inventory",
  "Restock Management",
  "Notifications",
  "Dashboard",
  "Audit Log",
  "Low Stock Alerts",
  "Search",
  "Database Monitoring",
  "Cache Management",
  "Support",
  "Raw Materials",
  "Suppliers",
];

export const SUPER_ADMIN_MODULE_PERMISSIONS: Record<ModuleName, ActionType[]> = {
  Inventory: ["read", "write", "update", "delete"],
  Billing: ["read", "write", "update", "delete"],
  Shop: ["read", "write", "update", "delete"],
  Employee: ["read", "write", "update", "delete"],
  Home: ["read"],
  "Shop Inventory": ["read", "write", "update", "delete"],
  "Restock Management": ["read", "write", "update", "delete"],
  Notifications: ["read", "write", "update", "delete"],
  Dashboard: ["read"],
  "Audit Log": ["read"],
  "Low Stock Alerts": ["read"],
  Search: ["read"],
  "Database Monitoring": ["read", "write", "update", "delete"],
  "Cache Management": ["read", "write", "update", "delete"],
  Support: ["read", "write", "update", "delete"],
  "Raw Materials": ["read", "write", "update", "delete"],
  Suppliers: ["read", "write", "update", "delete"],
};

export const ADMIN_MODULE_PERMISSIONS: Record<ModuleName, ActionType[]> = {
  Inventory: ["read", "write", "update", "delete"],
  Billing: ["read", "write", "update", "delete"],
  Shop: ["read", "write", "update", "delete"],
  Employee: ["read", "write", "update", "delete"],
  Home: ["read"],
  "Shop Inventory": [],
  "Restock Management": ["read", "write", "update", "delete"],
  Notifications: ["read", "write", "update", "delete"],
  Dashboard: ["read"],
  "Audit Log": ["read"],
  "Low Stock Alerts": ["read"],
  Search: ["read"],
  "Database Monitoring": [],
  "Cache Management": [],
  Support: ["read", "write", "update", "delete"],
  "Raw Materials": ["read", "write", "update", "delete"],
  Suppliers: ["read", "write", "update", "delete"],
};

export const SHOP_OWNER_MODULE_PERMISSIONS: Record<ModuleName, ActionType[]> = {
  Inventory: [],
  Billing: ["read", "write"],
  Shop: [],
  Employee: [],
  Home: ["read"],
  "Shop Inventory": ["read", "write", "update", "delete"],
  "Restock Management": [],
  Notifications: ["read", "write", "update", "delete"],
  Dashboard: ["read"],
  "Audit Log": [],
  "Low Stock Alerts": ["read"],
  Search: [],
  "Database Monitoring": [],
  "Cache Management": [],
  Support: [],
  "Raw Materials": [],
  Suppliers: [],
};

export const Factory_Employee_MODULE_PERMISSIONS: Record<ModuleName, ActionType[]> = {
  Inventory: ["read"],
  Billing: [],
  Shop: [],
  Employee: [],
  Home: ["read"],
  "Shop Inventory": [],
  "Restock Management": [],
  Notifications: ["read"],
  Dashboard: [],
  "Audit Log": [],
  "Low Stock Alerts": [],
  Search: [],
  "Database Monitoring": [],
  "Cache Management": [],
  Support: [],
  "Raw Materials": [],
  Suppliers: [],
};

export const Outlet_Employee_MODULE_PERMISSIONS: Record<ModuleName, ActionType[]> = {
  Inventory: [],
  Billing: ["read", "write"],
  Shop: [],
  Employee: [],
  Home: ["read"],
  "Shop Inventory": ["read"],
  "Restock Management": [],
  Notifications: ["read"],
  Dashboard: [],
  "Audit Log": [],
  "Low Stock Alerts": [],
  Search: [],
  "Database Monitoring": [],
  "Cache Management": [],
  Support: [],
  "Raw Materials": [],
  Suppliers: [],
};

export const DEFAULT_PERMISSIONS: any = {
  Admin: ADMIN_MODULE_PERMISSIONS,
  Shop_Owner: SHOP_OWNER_MODULE_PERMISSIONS,
  Super_Admin: SUPER_ADMIN_MODULE_PERMISSIONS,
  Factory_Employee: Factory_Employee_MODULE_PERMISSIONS,
  Outlet_Employee: Outlet_Employee_MODULE_PERMISSIONS,
};
