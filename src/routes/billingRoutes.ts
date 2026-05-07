import express, { RequestHandler } from "express";

import { authenticateToken } from "../middlewares/auth";
import {
  createBilling,
  createPaymentMethod,
  deletePaymentMethod,
  getNextInvoiceNumber,
  getPaymentMethods,
  getBillingById,
  getBillings,
  getBillingStats,
  updateBillingPaymentStatus,
} from "../controllers/billingController";

const billingRoutes = express.Router();

// Payment method master (global/no RBAC)
billingRoutes.get("/payment-method", getPaymentMethods as RequestHandler);
billingRoutes.post("/payment-method", createPaymentMethod as RequestHandler);
billingRoutes.get("/payment-methods", getPaymentMethods as RequestHandler);
billingRoutes.post("/payment-methods", createPaymentMethod as RequestHandler);

// Apply authentication middleware to protected billing routes
billingRoutes.use(authenticateToken as any);

// Restricted payment method delete (allowed account only)
billingRoutes.delete("/payment-methods/:id", deletePaymentMethod as RequestHandler);

/**
 * @swagger
 * tags:
 *   name: Billing
 *   description: Billing and invoice management endpoints (token required)
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Billing:
 *       type: object
 *       required:
 *         - shopId
 *         - total
 *         - items
 *       properties:
 *         id:
 *           type: string
 *           description: Auto-generated UUID of the billing record
 *         shopId:
 *           type: string
 *           description: ID of the shop
 *         total:
 *           type: number
 *           minimum: 0
 *           description: Total amount of the billing
 *         subtotal:
 *           type: number
 *           minimum: 0
 *           description: Subtotal before taxes
 *         tax:
 *           type: number
 *           minimum: 0
 *           description: Tax amount
 *         discount:
 *           type: number
 *           minimum: 0
 *           description: Discount amount
 *         items:
 *           type: array
 *           description: List of items in the billing
 *           items:
 *             type: object
 *             properties:
 *               productId:
 *                 type: string
 *               productName:
 *                 type: string
 *               quantity:
 *                 type: integer
 *                 minimum: 1
 *               unitPrice:
 *                 type: number
 *                 minimum: 0
 *               totalPrice:
 *                 type: number
 *                 minimum: 0
 *         paymentStatus:
 *           type: string
 *           enum: [pending, paid, overdue, cancelled]
 *           description: Payment status
 *           default: pending
 *         paymentMethod:
 *           type: string
 *           description: Payment method used
 *         notes:
 *           type: string
 *           description: Additional notes
 *         dueDate:
 *           type: string
 *           format: date
 *           description: Payment due date
 *         paidAt:
 *           type: string
 *           format: date-time
 *           description: Payment completion timestamp
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: Creation timestamp
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: Last update timestamp
 *         shop:
 *           type: object
 *           description: Shop details
 *       example:
 *         id: "3fa85f64-5717-4562-b3fc-2c963f66afa6"
 *         shopId: "shop-123"
 *         total: 150.00
 *         subtotal: 130.00
 *         tax: 20.00
 *         discount: 0
 *         items: []
 *         paymentStatus: "pending"
 *         paymentMethod: "cash"
 *         notes: "Monthly invoice"
 *         dueDate: "2023-06-15"
 *         createdAt: "2023-05-16T10:30:00Z"
 *         updatedAt: "2023-05-16T10:30:00Z"
 *     BillingCreate:
 *       type: object
 *       required:
 *         - shopId
 *         - total
 *         - items
 *       properties:
 *         shopId:
 *           type: string
 *           description: ID of the shop
 *         total:
 *           type: number
 *           minimum: 0
 *           description: Total amount
 *         subtotal:
 *           type: number
 *           minimum: 0
 *           description: Subtotal before taxes
 *         tax:
 *           type: number
 *           minimum: 0
 *           description: Tax amount
 *         discount:
 *           type: number
 *           minimum: 0
 *           description: Discount amount
 *         items:
 *           type: array
 *           description: List of items
 *           items:
 *             type: object
 *             required:
 *               - productId
 *               - quantity
 *               - unitPrice
 *             properties:
 *               productId:
 *                 type: string
 *               productName:
 *                 type: string
 *               quantity:
 *                 type: integer
 *                 minimum: 1
 *               unitPrice:
 *                 type: number
 *                 minimum: 0
 *               totalPrice:
 *                 type: number
 *                 minimum: 0
 *         paymentMethod:
 *           type: string
 *           description: Payment method
 *         notes:
 *           type: string
 *           description: Additional notes
 *         dueDate:
 *           type: string
 *           format: date
 *           description: Payment due date
 *     BillingPaymentStatusUpdate:
 *       type: object
 *       required:
 *         - paymentStatus
 *       properties:
 *         paymentStatus:
 *           type: string
 *           enum: [pending, paid, overdue, cancelled]
 *           description: New payment status
 *         paymentMethod:
 *           type: string
 *           description: Payment method used
 *         paidAt:
 *           type: string
 *           format: date-time
 *           description: Payment completion timestamp
 *     BillingStats:
 *       type: object
 *       properties:
 *         totalRevenue:
 *           type: number
 *           description: Total revenue amount
 *         totalInvoices:
 *           type: integer
 *           description: Total number of invoices
 *         paidInvoices:
 *           type: integer
 *           description: Number of paid invoices
 *         pendingInvoices:
 *           type: integer
 *           description: Number of pending invoices
 *         overdueInvoices:
 *           type: integer
 *           description: Number of overdue invoices
 *         averageInvoiceValue:
 *           type: number
 *           description: Average invoice value
 *         monthlyRevenue:
 *           type: array
 *           description: Monthly revenue breakdown
 *           items:
 *             type: object
 *             properties:
 *               month:
 *                 type: string
 *               revenue:
 *                 type: number
 */

/**
 * @swagger
 * /api/billing:
 *   post:
 *     summary: Create a new billing record
 *     description: Create a new billing record (invoice) for a shop. Shop Owners can only create billings for their managed shops.
 *     tags: [Billing]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BillingCreate'
 *     responses:
 *       201:
 *         description: Billing record created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Billing'
 *       400:
 *         description: Bad request - validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Access denied to shop
 *       404:
 *         description: Shop not found
 *       500:
 *         description: Internal server error
 */
billingRoutes.post("/", createBilling as RequestHandler);

// Get next invoice number
billingRoutes.get("/next-invoice-number", getNextInvoiceNumber as RequestHandler);

/**
 * @swagger
 * /api/billing/{shopId}:
 *   get:
 *     summary: Get billing records by shop
 *     description: Retrieve all billing records for a specific shop. Shop Owners can only access their managed shops.
 *     tags: [Billing]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: shopId
 *         required: true
 *         schema:
 *           type: string
 *         description: Shop ID
 *     responses:
 *       200:
 *         description: Billing records retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Billing'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Access denied to shop
 *       404:
 *         description: Shop not found
 *       500:
 *         description: Internal server error
 */
billingRoutes.get("/:shopId", getBillings as RequestHandler);

/**
 * @swagger
 * /api/billing/{shopId}/stats:
 *   get:
 *     summary: Get billing statistics by shop
 *     description: Retrieve billing statistics and analytics for a specific shop. Shop Owners can only access their managed shops.
 *     tags: [Billing]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: shopId
 *         required: true
 *         schema:
 *           type: string
 *         description: Shop ID
 *     responses:
 *       200:
 *         description: Billing statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BillingStats'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Access denied to shop
 *       404:
 *         description: Shop not found
 *       500:
 *         description: Internal server error
 */
billingRoutes.get("/:shopId/stats", getBillingStats as RequestHandler);

/**
 * @swagger
 * /api/billing/billing/{id}:
 *   get:
 *     summary: Get billing record by ID
 *     description: Retrieve a specific billing record by its ID. Access is restricted based on user role and shop access.
 *     tags: [Billing]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Billing record ID
 *     responses:
 *       200:
 *         description: Billing record retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Billing'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Access denied
 *       404:
 *         description: Billing record not found
 *       500:
 *         description: Internal server error
 */
billingRoutes.get("/billing/:id", getBillingById as RequestHandler);

/**
 * @swagger
 * /api/billing/billing/{id}/payment-status:
 *   patch:
 *     summary: Update billing payment status
 *     description: Update the payment status of a billing record. Shop Owners can only update billings for their managed shops.
 *     tags: [Billing]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Billing record ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BillingPaymentStatusUpdate'
 *     responses:
 *       200:
 *         description: Billing payment status updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Billing'
 *       400:
 *         description: Bad request - validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Access denied
 *       404:
 *         description: Billing record not found
 *       500:
 *         description: Internal server error
 */
billingRoutes.patch("/billing/:id/payment-status", updateBillingPaymentStatus as RequestHandler);

export default billingRoutes;
