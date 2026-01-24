"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const rawMaterialInventoryController_1 = require("../controllers/rawMaterialInventoryController");
const auth_1 = require("../middlewares/auth");
const router = express_1.default.Router();
// Apply authentication middleware to all routes
router.use(auth_1.authenticateToken);
/**
 * @swagger
 * tags:
 *   name: Raw Material Inventory
 *   description: Raw material inventory management endpoints (Admin only)
 */
/**
 * @swagger
 * /api/raw-material-inventory:
 *   get:
 *     summary: Get all raw material inventories
 *     description: Retrieve list of all raw material inventories
 *     tags: [Raw Material Inventory]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: location
 *         schema:
 *           type: string
 *         description: Filter by location (Factory, Storeroom)
 *     responses:
 *       200:
 *         description: List of inventories retrieved successfully
 *       401:
 *         description: Unauthorized
 */
router.get('/', rawMaterialInventoryController_1.getRawMaterialInventories);
/**
 * @swagger
 * /api/raw-material-inventory/low-stock:
 *   get:
 *     summary: Get low stock items
 *     description: Retrieve raw materials with stock below minimum level
 *     tags: [Raw Material Inventory]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Low stock items retrieved successfully
 *       401:
 *         description: Unauthorized
 */
router.get('/low-stock', rawMaterialInventoryController_1.getLowStockItems);
/**
 * @swagger
 * /api/raw-material-inventory/{id}:
 *   get:
 *     summary: Get raw material inventory by ID
 *     description: Retrieve a specific inventory record by its ID
 *     tags: [Raw Material Inventory]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Inventory ID
 *     responses:
 *       200:
 *         description: Inventory retrieved successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Inventory not found
 */
router.get('/:id', rawMaterialInventoryController_1.getRawMaterialInventoryById);
/**
 * @swagger
 * /api/raw-material-inventory:
 *   post:
 *     summary: Initialize raw material inventory
 *     description: Set initial stock for a raw material (Admin only)
 *     tags: [Raw Material Inventory]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - rawMaterialId
 *               - quantity
 *             properties:
 *               rawMaterialId:
 *                 type: string
 *                 description: Raw material ID
 *               quantity:
 *                 type: number
 *                 description: Initial stock quantity
 *               minStockLevel:
 *                 type: number
 *                 description: Minimum stock level for alerts
 *               location:
 *                 type: string
 *                 description: Location (Factory, Storeroom)
 *                 default: Factory
 *     responses:
 *       201:
 *         description: Inventory initialized successfully
 *       400:
 *         description: Bad request - validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 */
router.post('/', rawMaterialInventoryController_1.initializeInventory);
/**
 * @swagger
 * /api/raw-material-inventory/{id}:
 *   put:
 *     summary: Update raw material inventory
 *     description: Update inventory quantity or settings (Admin only)
 *     tags: [Raw Material Inventory]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Inventory ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               quantity:
 *                 type: number
 *                 description: New stock quantity
 *               minStockLevel:
 *                 type: number
 *                 description: Minimum stock level
 *               location:
 *                 type: string
 *                 description: Location
 *               notes:
 *                 type: string
 *                 description: Notes for the adjustment
 *     responses:
 *       200:
 *         description: Inventory updated successfully
 *       400:
 *         description: Bad request - validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *       404:
 *         description: Inventory not found
 */
router.put('/:id', rawMaterialInventoryController_1.updateRawMaterialInventory);
exports.default = router;
