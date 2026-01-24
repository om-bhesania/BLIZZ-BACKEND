"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const supplierController_1 = require("../controllers/supplierController");
const auth_1 = require("../middlewares/auth");
const router = express_1.default.Router();
// Apply authentication middleware to all routes
router.use(auth_1.authenticateToken);
/**
 * @swagger
 * tags:
 *   name: Suppliers
 *   description: Supplier management endpoints (Admin only)
 */
/**
 * @swagger
 * /api/suppliers:
 *   post:
 *     summary: Create a new supplier
 *     description: Create a new supplier (Admin only)
 *     tags: [Suppliers]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - contact
 *             properties:
 *               name:
 *                 type: string
 *                 description: Supplier name
 *               contact:
 *                 type: string
 *                 description: Supplier contact number
 *               email:
 *                 type: string
 *                 description: Supplier email address
 *               address:
 *                 type: string
 *                 description: Supplier address
 *     responses:
 *       201:
 *         description: Supplier created successfully
 *       400:
 *         description: Bad request - validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 */
router.post('/', supplierController_1.createSupplier);
/**
 * @swagger
 * /api/suppliers:
 *   get:
 *     summary: Get all suppliers
 *     description: Retrieve list of all suppliers with their materials
 *     tags: [Suppliers]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of suppliers retrieved successfully
 *       401:
 *         description: Unauthorized
 */
router.get('/', supplierController_1.getSuppliers);
/**
 * @swagger
 * /api/suppliers/{id}:
 *   get:
 *     summary: Get supplier by ID
 *     description: Retrieve a specific supplier by its ID with materials and inventory
 *     tags: [Suppliers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Supplier ID
 *     responses:
 *       200:
 *         description: Supplier retrieved successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Supplier not found
 */
router.get("/:id", supplierController_1.getSupplierById);
/**
 * @swagger
 * /api/suppliers/{id}:
 *   put:
 *     summary: Update supplier by ID
 *     description: Update an existing supplier's details (Admin only)
 *     tags: [Suppliers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Supplier ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: Supplier name
 *               contact:
 *                 type: string
 *                 description: Supplier contact number
 *               email:
 *                 type: string
 *                 description: Supplier email address
 *               address:
 *                 type: string
 *                 description: Supplier address
 *               isActive:
 *                 type: boolean
 *                 description: Whether the supplier is active
 *     responses:
 *       200:
 *         description: Supplier updated successfully
 *       400:
 *         description: Bad request - validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *       404:
 *         description: Supplier not found
 */
router.put("/:id", supplierController_1.updateSupplier);
/**
 * @swagger
 * /api/suppliers/{id}:
 *   delete:
 *     summary: Delete supplier by ID
 *     description: Soft delete a supplier (Admin only)
 *     tags: [Suppliers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Supplier ID
 *     responses:
 *       200:
 *         description: Supplier deleted successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *       404:
 *         description: Supplier not found
 */
router.delete("/:id", supplierController_1.deleteSupplier);
exports.default = router;
