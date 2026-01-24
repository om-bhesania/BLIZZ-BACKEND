import express, { RequestHandler } from "express";
import {
    createRecipe,
    getRecipes,
    getRecipeById,
    getRecipesByProduct,
    updateRecipe,
    deleteRecipe,
    setDefaultRecipe,
} from "../controllers/recipeController";
import { authenticateToken } from "../middlewares/auth";

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticateToken as any);

/**
 * @swagger
 * tags:
 *   name: Recipes
 *   description: Recipe/BOM management endpoints (Admin only)
 */

/**
 * @swagger
 * /api/recipes:
 *   post:
 *     summary: Create a new recipe
 *     description: Create a new recipe with ingredients (Admin only)
 *     tags: [Recipes]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - productId
 *               - items
 *             properties:
 *               productId:
 *                 type: string
 *                 description: Product ID
 *               name:
 *                 type: string
 *                 description: Recipe name (optional)
 *               description:
 *                 type: string
 *                 description: Recipe description
 *               duration:
 *                 type: integer
 *                 description: Production duration in minutes
 *               yield:
 *                 type: number
 *                 description: Output quantity
 *               items:
 *                 type: array
 *                 description: Recipe items/ingredients
 *                 items:
 *                   type: object
 *                   required:
 *                     - rawMaterialId
 *                     - quantity
 *                     - unit
 *               isDefault:
 *                 type: boolean
 *                 description: Set as default recipe for product
 *     responses:
 *       201:
 *         description: Recipe created successfully
 *       400:
 *         description: Bad request - validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 */
router.post('/', createRecipe as RequestHandler);

/**
 * @swagger
 * /api/recipes:
 *   get:
 *     summary: Get all recipes
 *     description: Retrieve list of all recipes
 *     tags: [Recipes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: productId
 *         schema:
 *           type: string
 *         description: Filter by product ID
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *     responses:
 *       200:
 *         description: List of recipes retrieved successfully
 *       401:
 *         description: Unauthorized
 */
router.get('/', getRecipes as RequestHandler);

/**
 * @swagger
 * /api/recipes/product/{productId}:
 *   get:
 *     summary: Get recipes by product
 *     description: Retrieve all recipes for a specific product
 *     tags: [Recipes]
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
 *         description: Recipes retrieved successfully
 *       401:
 *         description: Unauthorized
 */
router.get('/product/:productId', getRecipesByProduct as RequestHandler);

/**
 * @swagger
 * /api/recipes/{id}:
 *   get:
 *     summary: Get recipe by ID
 *     description: Retrieve a specific recipe by its ID
 *     tags: [Recipes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Recipe ID
 *     responses:
 *       200:
 *         description: Recipe retrieved successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Recipe not found
 */
router.get('/:id', getRecipeById as RequestHandler);

/**
 * @swagger
 * /api/recipes/{id}:
 *   put:
 *     summary: Update recipe by ID
 *     description: Update an existing recipe (Admin only)
 *     tags: [Recipes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Recipe ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               duration:
 *                 type: integer
 *               yield:
 *                 type: number
 *               items:
 *                 type: array
 *               isActive:
 *                 type: boolean
 *               isDefault:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Recipe updated successfully
 *       400:
 *         description: Bad request - validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *       404:
 *         description: Recipe not found
 */
router.put('/:id', updateRecipe as RequestHandler);

/**
 * @swagger
 * /api/recipes/{id}:
 *   delete:
 *     summary: Delete recipe by ID
 *     description: Soft delete a recipe (Admin only)
 *     tags: [Recipes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Recipe ID
 *     responses:
 *       200:
 *         description: Recipe deleted successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *       404:
 *         description: Recipe not found
 */
router.delete('/:id', deleteRecipe as RequestHandler);

/**
 * @swagger
 * /api/recipes/{id}/set-default:
 *   put:
 *     summary: Set default recipe
 *     description: Set a recipe as the default for its product (Admin only)
 *     tags: [Recipes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Recipe ID
 *     responses:
 *       200:
 *         description: Default recipe set successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *       404:
 *         description: Recipe not found
 */
router.put('/:id/set-default', setDefaultRecipe as RequestHandler);

export default router;

