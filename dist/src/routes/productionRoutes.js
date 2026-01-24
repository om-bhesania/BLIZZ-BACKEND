"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const productionController_1 = require("../controllers/productionController");
const auth_1 = require("../middlewares/auth");
const router = express_1.default.Router();
// Apply authentication middleware to all routes
router.use(auth_1.authenticateToken);
/**
 * @swagger
 * tags:
 *   name: Production
 *   description: Production batch management endpoints (Admin only)
 */
/**
 * @swagger
 * /api/production:
 *   post:
 *     summary: Create a new production batch
 *     description: Create a production batch and auto-deduct raw materials (Admin only)
 *     tags: [Production]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - recipeId
 *               - productId
 *               - quantity
 *             properties:
 *               recipeId:
 *                 type: string
 *                 description: Recipe ID to use
 *               productId:
 *                 type: string
 *                 description: Product ID
 *               quantity:
 *                 type: number
 *                 description: Quantity to produce (same as inventory quantity)
 *               notes:
 *                 type: string
 *                 description: Production notes
 *     responses:
 *       201:
 *         description: Production batch created successfully
 *       400:
 *         description: Bad request - validation error or insufficient raw materials
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *       404:
 *         description: Recipe not found
 */
router.post('/', productionController_1.createProductionBatch);
/**
 * @swagger
 * /api/production:
 *   get:
 *     summary: Get all production batches
 *     description: Retrieve production history
 *     tags: [Production]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: productId
 *         schema:
 *           type: string
 *         description: Filter by product ID
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for filtering
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for filtering
 *     responses:
 *       200:
 *         description: Production batches retrieved successfully
 *       401:
 *         description: Unauthorized
 */
router.get('/', productionController_1.getProductionBatches);
/**
 * @swagger
 * /api/production/{id}:
 *   get:
 *     summary: Get production batch by ID
 *     description: Retrieve a specific production batch by its ID
 *     tags: [Production]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Production batch ID
 *     responses:
 *       200:
 *         description: Production batch retrieved successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Production batch not found
 */
router.get('/:id', productionController_1.getProductionBatchById);
/**
 * @swagger
 * /api/production/product/{productId}:
 *   get:
 *     summary: Get productions by product
 *     description: Retrieve all production batches for a specific product
 *     tags: [Production]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *         description: Product ID
 *     responses:
 *       200:
 *         description: Production batches retrieved successfully
 *       401:
 *         description: Unauthorized
 */
router.get('/product/:productId', productionController_1.getProductionsByProduct);
exports.default = router;
