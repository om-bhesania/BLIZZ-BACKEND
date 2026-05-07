"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBillingStats = exports.updateBillingPaymentStatus = exports.getBillingById = exports.getBillings = exports.deletePaymentMethod = exports.createPaymentMethod = exports.getPaymentMethods = exports.getNextInvoiceNumber = exports.createBilling = void 0;
const client_1 = require("../config/client");
const logger_1 = require("../utils/logger");
const roles_1 = require("../config/roles");
const NotificationsController_1 = require("./NotificationsController");
const socketService_1 = require("../services/socketService");
const audit_1 = require("../utils/audit");
// Prisma client types can lag after schema edits on Windows (EPERM on generate).
// Use a narrow fallback delegate so TypeScript remains buildable until regenerate.
const paymentMethodDelegate = client_1.prisma.paymentMethod;
/**
 * Global invoice numbers: BLIZZ/YYYY/NNNNN (5-digit sequence per year).
 * Uses max existing sequence for the year (not latest row by createdAt).
 */
async function computeNextBlizzInvoiceNumber() {
    const year = new Date().getFullYear();
    const prefix = `BLIZZ/${year}/`;
    const rows = await client_1.prisma.billing.findMany({
        where: {
            invoiceNumber: { startsWith: prefix },
        },
        select: { invoiceNumber: true },
    });
    let maxSeq = 0;
    for (const row of rows) {
        const inv = row.invoiceNumber;
        if (!inv || !inv.startsWith(prefix))
            continue;
        const tail = inv.slice(prefix.length);
        const n = parseInt(tail, 10);
        if (Number.isFinite(n) && n > maxSeq)
            maxSeq = n;
    }
    const nextSeq = String(maxSeq + 1).padStart(5, "0");
    return `${prefix}${nextSeq}`;
}
// Create billing
const createBilling = async (req, res) => {
    try {
        const { shopId, invoiceNumber: _clientInvoiceIgnored, customerName, customerEmail, customerContact, items, subtotal: _clientSubtotalIgnored, tax: _clientTaxIgnored = 0, discount = 0, total: _clientTotalIgnored, paymentMethodId, paymentBreakdown, invoiceType = "SHOP", // SHOP | FACTORY
         } = req.body;
        const userId = req.user?.publicId;
        if (!userId) {
            res.status(401).json({ error: "Unauthorized" });
            return;
        }
        // Check if user has access to this shop
        const user = await client_1.prisma.user.findUnique({
            where: { publicId: userId },
        });
        if (!user) {
            res.status(401).json({ error: "User not found" });
            return;
        }
        let shop = null;
        // Handle different invoice types
        if (invoiceType === "FACTORY") {
            // Factory invoices don't require shop validation
            if (!(0, roles_1.isAdmin)(user.role || "")) {
                res.status(403).json({ error: "Only admins can create factory invoices" });
                return;
            }
        }
        else {
            // Shop invoices require shop validation
            if (!shopId) {
                res.status(400).json({ error: "Shop ID is required for shop invoices" });
                return;
            }
            // Check if user manages this shop by querying directly
            const managedShop = await client_1.prisma.shop.findFirst({
                where: {
                    id: shopId,
                    managerId: user.publicId
                },
            });
            const userShopId = managedShop?.id;
            if (!user.role || (!(0, roles_1.isAdmin)(user.role) && shopId !== userShopId)) {
                res.status(403).json({ error: "Access denied to this shop" });
                return;
            }
            // Check if shop exists
            shop = await client_1.prisma.shop.findUnique({
                where: { id: shopId },
            });
            if (!shop) {
                res.status(404).json({ error: "Shop not found" });
                return;
            }
        }
        // Validate items and check stock
        const validatedItems = [];
        const stockUpdates = [];
        for (const item of items) {
            const { productId, quantity } = item;
            // Check if product exists
            const product = await client_1.prisma.product.findUnique({
                where: { id: productId },
            });
            if (!product) {
                res.status(400).json({ error: `Product ${productId} not found` });
                return;
            }
            // For factory invoices, skip shop inventory validation
            const effectiveUnitPrice = Number(product.unitPrice || 0);
            if (invoiceType === "FACTORY") {
                // Calculate item total based on product pricing
                const itemTotal = quantity * effectiveUnitPrice;
                validatedItems.push({
                    productId,
                    productName: item.productName || product.name,
                    quantity,
                    unitPrice: effectiveUnitPrice,
                    total: itemTotal,
                });
            }
            else {
                // For shop invoices, validate shop inventory
                const shopInventory = await client_1.prisma.shopInventory.findFirst({
                    where: {
                        shopId,
                        productId,
                    },
                });
                if (!shopInventory) {
                    res.status(400).json({ error: `Product ${product.name} not available in this shop` });
                    return;
                }
                if (shopInventory.currentStock < quantity) {
                    res.status(400).json({
                        error: `Insufficient stock for ${product.name}. Available: ${shopInventory.currentStock}, Requested: ${quantity}`
                    });
                    return;
                }
                // Calculate item total based on product pricing
                const itemTotal = quantity * effectiveUnitPrice;
                validatedItems.push({
                    productId,
                    productName: item.productName || product.name,
                    quantity,
                    unitPrice: effectiveUnitPrice,
                    total: itemTotal,
                });
                // Prepare stock update for shop invoices
                stockUpdates.push({
                    inventoryId: shopInventory.id,
                    newStock: shopInventory.currentStock - quantity,
                });
            }
        }
        const selectedMethodId = typeof paymentMethodId === "string" ? paymentMethodId : "";
        let selectedMethod = null;
        if (selectedMethodId) {
            selectedMethod = await paymentMethodDelegate.findUnique({
                where: { id: selectedMethodId },
            });
            if (!selectedMethod || !selectedMethod.isActive) {
                res.status(400).json({ error: "Invalid payment method selected" });
                return;
            }
        }
        const breakdownInput = Array.isArray(paymentBreakdown)
            ? paymentBreakdown
            : [];
        const isPartialPayment = selectedMethod?.name.toLowerCase() === "partial payment" ||
            breakdownInput.length > 0;
        let normalizedBreakdown = [];
        if (isPartialPayment) {
            if (!selectedMethod || selectedMethod.name.toLowerCase() !== "partial payment") {
                res.status(400).json({ error: "Select 'Partial Payment' as payment method for split payments" });
                return;
            }
            if (breakdownInput.length === 0) {
                res.status(400).json({ error: "Please add at least one partial payment entry" });
                return;
            }
            const methodIds = breakdownInput
                .map((entry) => String(entry.paymentMethodId || "").trim())
                .filter((id) => !!id);
            const methods = await paymentMethodDelegate.findMany({
                where: {
                    id: { in: methodIds },
                    isActive: true,
                },
            });
            const methodMap = new Map(methods.map((m) => [m.id, m]));
            try {
                normalizedBreakdown = breakdownInput.map((entry) => {
                    const methodId = String(entry.paymentMethodId || "").trim();
                    const amount = Number(entry.amount || 0);
                    const method = methodMap.get(methodId);
                    if (!method || !method.isActive) {
                        throw new Error("Invalid payment method in partial payment");
                    }
                    if (!Number.isFinite(amount) || amount <= 0) {
                        throw new Error("Partial payment amounts must be greater than 0");
                    }
                    if (method.name.toLowerCase() === "partial payment") {
                        throw new Error("Partial payment cannot contain itself");
                    }
                    return {
                        paymentMethodId: method.id,
                        paymentMethodName: method.name,
                        amount: Number(amount.toFixed(2)),
                    };
                });
            }
            catch (e) {
                res.status(400).json({ error: e?.message || "Invalid partial payment breakdown" });
                return;
            }
        }
        // Server-assigned invoice number only (stored on Billing; max+1 from DB per year).
        let nextInvoiceNumber = await computeNextBlizzInvoiceNumber();
        const normalizedSubtotal = Number(validatedItems.reduce((sum, line) => sum + Number(line.unitPrice || 0) * Number(line.quantity || 0), 0)); // GST-inclusive line totals from product prices
        const normalizedDiscount = Number(discount || 0);
        const tax = Number((normalizedSubtotal * (5 / 105)).toFixed(2)); // Extract GST component (5% inclusive)
        const total = Number((normalizedSubtotal - normalizedDiscount).toFixed(2));
        const paidAmount = Number(normalizedBreakdown.reduce((sum, p) => sum + p.amount, 0).toFixed(2));
        const paymentStatus = isPartialPayment
            ? paidAmount >= total
                ? "paid"
                : "pending"
            : "pending";
        const baseData = {
            shopId: invoiceType === "FACTORY" ? null : shopId,
            customerName,
            customerEmail,
            customerContact,
            items: validatedItems,
            subtotal: normalizedSubtotal,
            tax,
            discount,
            total,
            paymentStatus,
            paymentMethod: selectedMethod?.name || null,
            paymentMethodId: selectedMethod?.id || null,
            paymentBreakdown: isPartialPayment ? normalizedBreakdown : null,
            invoiceType,
        };
        const createBillingRow = (num) => client_1.prisma.billing.create({
            data: {
                ...baseData,
                invoiceNumber: num,
                createdBy: user.publicId,
                createdByRole: user.role || null,
            },
            include: { shop: true },
        });
        let billing;
        let lastError;
        for (let attempt = 0; attempt < 5; attempt++) {
            const num = attempt === 0
                ? nextInvoiceNumber
                : await computeNextBlizzInvoiceNumber();
            try {
                billing = await createBillingRow(num);
                lastError = undefined;
                break;
            }
            catch (err) {
                lastError = err;
                const code = err?.code;
                if (code !== "P2002")
                    throw err;
            }
        }
        if (!billing) {
            throw lastError instanceof Error
                ? lastError
                : new Error("Could not assign unique invoice number");
        }
        // Update stock levels only for shop invoices
        if (invoiceType === "SHOP") {
            for (const update of stockUpdates) {
                await client_1.prisma.shopInventory.update({
                    where: { id: update.inventoryId },
                    data: {
                        currentStock: update.newStock,
                        isActive: true,
                        updatedAt: new Date(),
                    },
                });
            }
            // Check for low stock after sale and trigger notifications
            for (const item of validatedItems) {
                const shopInventory = await client_1.prisma.shopInventory.findFirst({
                    where: {
                        shopId,
                        productId: item.productId,
                        isActive: true,
                    },
                });
                if (shopInventory) {
                    const product = await client_1.prisma.product.findUnique({
                        where: { id: item.productId },
                    });
                    if (product && product.minStockLevel &&
                        shopInventory.currentStock <= product.minStockLevel) {
                        const notificationMessage = `🚨 Low stock alert after sale: ${product.name} in ${shop?.name || 'Unknown Shop'} has only ${shopInventory.currentStock} units remaining (min: ${product.minStockLevel})`;
                        // Notify shop manager
                        if (shop?.managerId) {
                            await client_1.prisma.notification.create({
                                data: {
                                    userId: shop.managerId,
                                    type: "LOW_STOCK_ALERT",
                                    category: "INVENTORY",
                                    priority: "HIGH",
                                    message: notificationMessage,
                                    metadata: JSON.stringify({
                                        productId: item.productId,
                                        productName: product.name,
                                        currentStock: shopInventory.currentStock,
                                        minStockLevel: product.minStockLevel,
                                        shopId: shop.id,
                                        shopName: shop.name
                                    })
                                },
                            });
                            (0, NotificationsController_1.emitUserNotification)(shop.managerId, {
                                event: "created",
                                notification: {
                                    type: "LOW_STOCK_ALERT",
                                    category: "INVENTORY",
                                    priority: "HIGH",
                                    message: notificationMessage,
                                },
                            });
                        }
                    }
                }
            }
        }
        // Create appropriate notifications based on invoice type
        if (invoiceType === "FACTORY") {
            // Factory invoice notification - notify all admins
            const adminUsers = await client_1.prisma.user.findMany({
                where: { role: "Admin" },
                select: { publicId: true, name: true }
            });
            const factoryMessage = `🏭 Factory invoice created: ${customerName || 'Customer'} - Total: ₹${total} (Created by ${user.name || user.email})`;
            for (const admin of adminUsers) {
                await client_1.prisma.notification.create({
                    data: {
                        userId: admin.publicId,
                        type: "FACTORY_INVOICE_CREATED",
                        category: "FACTORY",
                        priority: "MEDIUM",
                        message: factoryMessage,
                        metadata: JSON.stringify({
                            invoiceId: billing.id,
                            invoiceNumber: billing.invoiceNumber,
                            createdBy: user.publicId,
                            createdByName: user.name || user.email,
                            total: total,
                            customerName: customerName || 'Customer'
                        })
                    },
                });
                (0, NotificationsController_1.emitUserNotification)(admin.publicId, {
                    event: "created",
                    notification: {
                        type: "FACTORY_INVOICE_CREATED",
                        category: "FACTORY",
                        priority: "MEDIUM",
                        message: factoryMessage,
                    },
                });
            }
        }
        else {
            // Shop invoice notification
            const shopMessage = `🧾 Invoice generated for ${shop?.name || 'Unknown Shop'}: ${customerName || 'Customer'} - Total: ₹${total}${(0, roles_1.isAdmin)(user.role || "") ? ` (Created by Admin: ${user.name || user.email})` : ''}`;
            if (shop?.managerId) {
                await client_1.prisma.notification.create({
                    data: {
                        userId: shop.managerId,
                        type: "SHOP_INVOICE_CREATED",
                        category: "BILLING",
                        priority: "MEDIUM",
                        message: shopMessage,
                        metadata: JSON.stringify({
                            invoiceId: billing.id,
                            invoiceNumber: billing.invoiceNumber,
                            shopId: shop.id,
                            shopName: shop.name,
                            createdBy: user.publicId,
                            createdByName: user.name || user.email,
                            createdByRole: user.role,
                            total: total,
                            customerName: customerName || 'Customer'
                        })
                    },
                });
                (0, NotificationsController_1.emitUserNotification)(shop.managerId, {
                    event: "created",
                    notification: {
                        type: "SHOP_INVOICE_CREATED",
                        category: "BILLING",
                        priority: "MEDIUM",
                        message: shopMessage,
                    },
                });
            }
        }
        // Audit
        await (0, audit_1.logActivity)({
            type: "billing",
            action: "created",
            entity: "Billing",
            entityId: billing.id,
            userId: req.user?.publicId,
            shopId,
            metadata: { total }
        });
        // Broadcast real-time update
        const socketService = (0, socketService_1.getSocketService)();
        socketService.broadcastBillingUpdate(shopId, {
            type: 'created',
            billing: billing,
            timestamp: new Date().toISOString()
        });
        // Emit revenue update for admin dashboard (only for shop invoices)
        if (invoiceType === "SHOP") {
            socketService.emitToAll('revenue_updated', {
                event: 'revenue_updated',
                data: {
                    total: billing.total,
                    shopId: billing.shopId,
                    shopName: shop?.name || 'Unknown Shop',
                    invoiceNumber: billing.invoiceNumber,
                    timestamp: new Date().toISOString()
                }
            });
        }
        res.status(201).json(billing);
    }
    catch (error) {
        logger_1.logger.error("Error creating billing:", error);
        res.status(500).json({ error: "Failed to create billing" });
    }
};
exports.createBilling = createBilling;
// Get next invoice number (same rule as create — max BLIZZ/YYYY/* + 1)
const getNextInvoiceNumber = async (req, res) => {
    try {
        const userId = req.user?.publicId;
        if (!userId) {
            res.status(401).json({ error: "Unauthorized" });
            return;
        }
        const invoiceNumber = await computeNextBlizzInvoiceNumber();
        res.json({ invoiceNumber });
    }
    catch (error) {
        logger_1.logger.error("Error computing next invoice number:", error);
        res.status(500).json({ error: "Failed to compute next invoice number" });
    }
};
exports.getNextInvoiceNumber = getNextInvoiceNumber;
const getPaymentMethods = async (_req, res) => {
    try {
        const methods = await paymentMethodDelegate.findMany({
            where: { isActive: true },
            orderBy: { name: "asc" },
        });
        res.status(200).json(methods);
    }
    catch (error) {
        logger_1.logger.error("Error fetching payment methods:", error);
        res.status(500).json({ error: "Failed to fetch payment methods" });
    }
};
exports.getPaymentMethods = getPaymentMethods;
const createPaymentMethod = async (req, res) => {
    try {
        const name = String(req.body?.name || "").trim();
        if (!name) {
            res.status(400).json({ error: "Payment method name is required" });
            return;
        }
        const existing = await paymentMethodDelegate.findFirst({
            where: { name: { equals: name, mode: "insensitive" } },
        });
        if (existing) {
            res.status(409).json({ error: "Payment method already exists" });
            return;
        }
        const method = await paymentMethodDelegate.create({
            data: { name },
        });
        res.status(201).json(method);
    }
    catch (error) {
        logger_1.logger.error("Error creating payment method:", error);
        res.status(500).json({ error: "Failed to create payment method" });
    }
};
exports.createPaymentMethod = createPaymentMethod;
const deletePaymentMethod = async (req, res) => {
    try {
        const userEmail = String(req.user?.email || "").toLowerCase();
        if (userEmail !== "bhesaniaom@gmail.com") {
            res.status(403).json({ error: "Only bhesaniaom@gmail.com can delete payment methods" });
            return;
        }
        const methodId = String(req.params?.id || "").trim();
        if (!methodId) {
            res.status(400).json({ error: "Payment method id is required" });
            return;
        }
        const existing = await paymentMethodDelegate.findUnique({ where: { id: methodId } });
        if (!existing) {
            res.status(404).json({ error: "Payment method not found" });
            return;
        }
        const usageCount = await client_1.prisma.billing.count({
            where: { paymentMethodId: methodId },
        });
        if (usageCount > 0) {
            res.status(409).json({
                error: "Payment method is used in invoices and cannot be deleted",
            });
            return;
        }
        await paymentMethodDelegate.delete({ where: { id: methodId } });
        res.status(200).json({ message: "Payment method deleted successfully" });
    }
    catch (error) {
        logger_1.logger.error("Error deleting payment method:", error);
        res.status(500).json({ error: "Failed to delete payment method" });
    }
};
exports.deletePaymentMethod = deletePaymentMethod;
// Get billings by shop ID
const getBillings = async (req, res) => {
    try {
        const { shopId } = req.params;
        const userId = req.user?.publicId;
        if (!userId) {
            res.status(401).json({ error: "Unauthorized" });
            return;
        }
        const user = await client_1.prisma.user.findUnique({
            where: { publicId: userId },
        });
        if (!user) {
            res.status(401).json({ error: "User not found" });
            return;
        }
        // Admins can view any shop's billings without shop assignment
        if (!(0, roles_1.isAdmin)(user.role || "")) {
            // Check if user manages this shop by querying directly
            const managedShop = await client_1.prisma.shop.findFirst({
                where: {
                    id: shopId,
                    managerId: user.publicId
                },
            });
            const userShopId = managedShop?.id;
            if (!user.role || shopId !== userShopId) {
                res.status(403).json({ error: "Access denied to this shop" });
                return;
            }
        }
        const billings = await client_1.prisma.billing.findMany({
            where: { shopId },
            include: { shop: true },
            orderBy: { createdAt: "desc" },
        });
        res.status(200).json(billings);
    }
    catch (error) {
        logger_1.logger.error("Error fetching billings:", error);
        res.status(500).json({ error: "Failed to fetch billings" });
    }
};
exports.getBillings = getBillings;
// Get billing by ID
const getBillingById = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.publicId;
        if (!userId) {
            res.status(401).json({ error: "Unauthorized" });
            return;
        }
        const user = await client_1.prisma.user.findUnique({
            where: { publicId: userId },
        });
        if (!user) {
            res.status(401).json({ error: "User not found" });
            return;
        }
        const billing = await client_1.prisma.billing.findUnique({
            where: { id },
            include: {
                shop: true,
            },
        });
        if (!billing) {
            res.status(404).json({ error: "Billing not found" });
            return;
        }
        // Check if user manages this shop by querying directly
        let managedShop = null;
        if (billing.shopId) {
            managedShop = await client_1.prisma.shop.findFirst({
                where: {
                    id: billing.shopId,
                    managerId: user.publicId
                },
            });
        }
        const userShopId = managedShop?.id;
        if (!user.role || (!(0, roles_1.isAdmin)(user.role) && billing.shopId !== userShopId)) {
            res.status(403).json({ error: "Access denied to this billing" });
            return;
        }
        res.status(200).json(billing);
    }
    catch (error) {
        logger_1.logger.error("Error fetching billing:", error);
        res.status(500).json({ error: "Failed to fetch billing" });
    }
};
exports.getBillingById = getBillingById;
// Update billing payment status
const updateBillingPaymentStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { paymentStatus } = req.body;
        const userId = req.user?.publicId;
        if (!userId) {
            res.status(401).json({ error: "Unauthorized" });
            return;
        }
        const user = await client_1.prisma.user.findUnique({
            where: { publicId: userId },
        });
        if (!user) {
            res.status(401).json({ error: "User not found" });
            return;
        }
        const billing = await client_1.prisma.billing.findUnique({
            where: { id },
            include: {
                shop: true,
            },
        });
        if (!billing) {
            res.status(404).json({ error: "Billing not found" });
            return;
        }
        // Check if user manages this shop by querying directly
        let managedShop = null;
        if (billing.shopId) {
            managedShop = await client_1.prisma.shop.findFirst({
                where: {
                    id: billing.shopId,
                    managerId: user.publicId
                },
            });
        }
        const userShopId = managedShop?.id;
        if (!user.role || (!(0, roles_1.isAdmin)(user.role) && billing.shopId !== userShopId)) {
            res.status(403).json({ error: "Access denied to this billing" });
            return;
        }
        if (!["pending", "paid", "failed"].includes(paymentStatus)) {
            res.status(400).json({ error: "Invalid payment status" });
            return;
        }
        const updatedBilling = await client_1.prisma.billing.update({
            where: { id },
            data: {
                paymentStatus,
                updatedAt: new Date(),
            },
            include: {
                shop: true,
            },
        });
        res.status(200).json(updatedBilling);
    }
    catch (error) {
        logger_1.logger.error("Error updating billing payment status:", error);
        res.status(500).json({ error: "Failed to update billing payment status" });
    }
};
exports.updateBillingPaymentStatus = updateBillingPaymentStatus;
// Get billing statistics for a shop
const getBillingStats = async (req, res) => {
    try {
        const { shopId } = req.params;
        const userId = req.user?.publicId;
        if (!userId) {
            res.status(401).json({ error: "Unauthorized" });
            return;
        }
        const user = await client_1.prisma.user.findUnique({
            where: { publicId: userId },
        });
        if (!user) {
            res.status(401).json({ error: "User not found" });
            return;
        }
        // Check if user manages this shop by querying directly
        const managedShop = await client_1.prisma.shop.findFirst({
            where: {
                id: shopId,
                managerId: user.publicId
            },
        });
        const userShopId = managedShop?.id;
        if (!user.role || (!(0, roles_1.isAdmin)(user.role) && shopId !== userShopId)) {
            res.status(403).json({ error: "Access denied to this shop" });
            return;
        }
        // Get billing statistics
        const stats = await client_1.prisma.billing.groupBy({
            by: ['paymentStatus'],
            where: { shopId },
            _count: { id: true },
            _sum: { total: true },
        });
        // Get total counts
        const totalBillings = await client_1.prisma.billing.count({
            where: { shopId },
        });
        const totalRevenue = await client_1.prisma.billing.aggregate({
            where: {
                shopId,
                paymentStatus: "paid",
            },
            _sum: { total: true },
        });
        const result = {
            totalBillings,
            totalRevenue: totalRevenue._sum.total || 0,
            byStatus: stats.reduce((acc, stat) => {
                acc[stat.paymentStatus] = {
                    count: stat._count.id,
                    total: stat._sum.total || 0,
                };
                return acc;
            }, {}),
        };
        res.status(200).json(result);
    }
    catch (error) {
        logger_1.logger.error("Error fetching billing stats:", error);
        res.status(500).json({ error: "Failed to fetch billing stats" });
    }
};
exports.getBillingStats = getBillingStats;
