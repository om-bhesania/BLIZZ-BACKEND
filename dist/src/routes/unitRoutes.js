"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const unitController_1 = require("../controllers/unitController");
const auth_1 = require("../middlewares/auth");
const router = express_1.default.Router();
// Apply authentication middleware to all unit routes
router.use(auth_1.authenticateToken);
/**
 * @swagger
 * tags:
 *   name: Units
 *   description: Unit management endpoints (token required)
 */
/**
 * @swagger
 * /api/units:
 *   post:
 *     summary: Create a new unit
 *     description: Create a new unit (Admin only)
 *     tags: [Units]
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
 *             properties:
 *               name:
 *                 type: string
 *                 description: Unit name (e.g., "Kilograms")
 *               symbol:
 *                 type: string
 *                 description: Unit symbol (e.g., "kg")
 *               description:
 *                 type: string
 *                 description: Unit description
 *               isActive:
 *                 type: boolean
 *                 description: Whether the unit is active
 *                 default: true
 *     responses:
 *       201:
 *         description: Unit created successfully
 *       400:
 *         description: Bad request - validation error
 *       401:
 *         description: Unauthorized
 *       409:
 *         description: Unit name already exists
 */
router.post('/', unitController_1.createUnit);
/**
 * @swagger
 * /api/units:
 *   get:
 *     summary: Get all units
 *     description: Retrieve list of all active units
 *     tags: [Units]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of units retrieved successfully
 *       401:
 *         description: Unauthorized
 */
router.get('/', unitController_1.getUnits);
/**
 * @swagger
 * /api/units/{id}:
 *   get:
 *     summary: Get unit by ID
 *     description: Retrieve a specific unit by its ID
 *     tags: [Units]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Unit ID
 *     responses:
 *       200:
 *         description: Unit retrieved successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Unit not found
 */
router.get('/:id', unitController_1.getUnitById);
/**
 * @swagger
 * /api/units/{id}:
 *   put:
 *     summary: Update unit by ID
 *     description: Update an existing unit's details (Admin only)
 *     tags: [Units]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Unit ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: Unit name
 *               symbol:
 *                 type: string
 *                 description: Unit symbol
 *               description:
 *                 type: string
 *                 description: Unit description
 *               isActive:
 *                 type: boolean
 *                 description: Whether the unit is active
 *     responses:
 *       200:
 *         description: Unit updated successfully
 *       400:
 *         description: Bad request - validation error
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Unit not found
 */
router.put('/:id', unitController_1.updateUnit);
/**
 * @swagger
 * /api/units/{id}:
 *   delete:
 *     summary: Delete unit by ID
 *     description: Soft delete a unit (Admin only)
 *     tags: [Units]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Unit ID
 *     responses:
 *       200:
 *         description: Unit deleted successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Unit not found
 */
router.delete('/:id', unitController_1.deleteUnit);
exports.default = router;
