"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const rawMaterialController_1 = require("../controllers/rawMaterialController");
const auth_1 = require("../middlewares/auth");
const router = express_1.default.Router();
// Apply authentication middleware to all routes
router.use(auth_1.authenticateToken);
/**
 * @swagger
 * tags:
 *   name: Raw Materials
 *   description: Raw material management endpoints (Admin only)
 */
/**
 * @swagger
 * /api/raw-materials:
 *   post:
 *     summary: Create a new raw material
 *     description: Create a new raw material (Admin only)
 *     tags: [Raw Materials]
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
 *               - unit
 *             properties:
 *               name:
 *                 type: string
 *                 description: Raw material name
 *               description:
 *                 type: string
 *                 description: Raw material description
 *               unit:
 *                 type: string
 *                 description: Unit of measurement (pieces, kg, g, liters, ml, mm, cm, m, etc.)
 *     responses:
 *       201:
 *         description: Raw material created successfully
 *       400:
 *         description: Bad request - validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *       409:
 *         description: Raw material name already exists
 */
router.post('/', rawMaterialController_1.createRawMaterial);
/**
 * @swagger
 * /api/raw-materials:
 *   get:
 *     summary: Get all raw materials
 *     description: Retrieve list of all active raw materials
 *     tags: [Raw Materials]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of raw materials retrieved successfully
 *       401:
 *         description: Unauthorized
 */
router.get('/', rawMaterialController_1.getRawMaterials);
/**
 * @swagger
 * /api/raw-materials/{id}:
 *   get:
 *     summary: Get raw material by ID
 *     description: Retrieve a specific raw material by its ID
 *     tags: [Raw Materials]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Raw material ID
 *     responses:
 *       200:
 *         description: Raw material retrieved successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Raw material not found
 */
router.get('/:id', rawMaterialController_1.getRawMaterialById);
/**
 * @swagger
 * /api/raw-materials/{id}:
 *   put:
 *     summary: Update raw material by ID
 *     description: Update an existing raw material's details (Admin only)
 *     tags: [Raw Materials]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Raw material ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: Raw material name
 *               description:
 *                 type: string
 *                 description: Raw material description
 *               unit:
 *                 type: string
 *                 description: Unit of measurement
 *               isActive:
 *                 type: boolean
 *                 description: Whether the raw material is active
 *     responses:
 *       200:
 *         description: Raw material updated successfully
 *       400:
 *         description: Bad request - validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *       404:
 *         description: Raw material not found
 */
router.put('/:id', rawMaterialController_1.updateRawMaterial);
/**
 * @swagger
 * /api/raw-materials/{id}:
 *   delete:
 *     summary: Delete raw material by ID
 *     description: Soft delete a raw material (Admin only)
 *     tags: [Raw Materials]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Raw material ID
 *     responses:
 *       200:
 *         description: Raw material deleted successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *       404:
 *         description: Raw material not found
 */
router.delete('/:id', rawMaterialController_1.deleteRawMaterial);
exports.default = router;
