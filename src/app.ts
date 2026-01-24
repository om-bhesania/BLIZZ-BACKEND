import cookieParser from "cookie-parser";
import cors from "cors";
import dotenv from "dotenv";
import express, {
  Application,
  NextFunction,
  Request,
  RequestHandler,
  Response,
} from "express";

import swaggerUi from "swagger-ui-express";
import { errorHandler } from "./middlewares/ErrorHandlers/errorHandlers";
import { authRoutes } from "./routes/Auth/authRoutes";
import pingRouter from "./routes/PingRoute";
import roleRoutes from "./routes/Roles/roleRoutes";
import categoryRoutes from "./routes/categoryRoutes";
import unitRoutes from "./routes/unitRoutes";
import flavourRoutes from "./routes/flavourRoutes";
import productRoutes from "./routes/productRoutes";
import shopRoutes from "./routes/shopRoutes";
import notificationRoutes from "./routes/notificationRoutes";
import shopInventoryRoutes from "./routes/shopInventoryRoutes";
import restockRequestRoutes from "./routes/restockRequestRoutes";
import billingRoutes from "./routes/billingRoutes";
import dashboardRoutes from "./routes/dashboardRoutes";
import auditLogRoutes from "./routes/auditLogRoutes";
import lowStockRoutes from "./routes/lowStockRoutes";
import packagingTypeRoutes from "./routes/packagingTypeRoutes";
import employeeRoutes from "./routes/employeeRoutes";
import emailRoutes from "./routes/emailRoutes";
import searchRoutes from "./routes/searchRoutes";
import databaseRoutes from "./routes/databaseRoutes";
import cacheRoutes from "./routes/cacheRoutes";
import holidayRoutes from "./routes/holidayRoutes";
import enhancedAuditRoutes from "./routes/enhancedAuditRoutes";
import chatRoutes from "./routes/chatRoutes";
import chatRequestRoutes from "./routes/chatRequestRoutes";
import paymentRoutes from "./routes/paymentRoutes";
import stockAdjustmentRoutes from "./routes/stockAdjustmentRoutes";
import enhancedDashboardRoutes from "./routes/enhancedDashboardRoutes";
import supplierRoutes from "./routes/supplierRoutes";
import rawMaterialRoutes from "./routes/rawMaterialRoutes";
import rawMaterialInventoryRoutes from "./routes/rawMaterialInventoryRoutes";
import recipeRoutes from "./routes/recipeRoutes";
import productionRoutes from "./routes/productionRoutes";
import swaggerSpecs from "./swaggerConfig";
import apiKeyMiddleware from "./middlewares/apiKeyMiddleware";

// Load environment variables
dotenv.config();

// Initialize app
const app: Application = express();

// CORS Configuration
const corsOptions = {
  origin: (
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void
  ) => {
    const allowed = [
      process.env.FRONTEND_ORIGIN || "http://localhost:5173",
      "http://localhost:8080",
      "http://127.0.0.1:8080",
      "http://127.0.0.1:5173",
      "https://s3l06km6-5173.inc1.devtunnels.ms",
      "https://blizz.shreefood.co.in",
      "https://blizz.shreefood.co.in/",
      "https://api.shreefood.co.in",
      "https://shreefood.co.in",
      "https://www.shreefood.co.in",
      "https://www.api.shreefood.co.in",
      "https://backend.shreefood.co.in",
      "https://www.backend.shreefood.co.in",
    ];

    // Log CORS requests for debugging
    console.log(`[CORS] Request from origin: ${origin}`);

    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      console.log(`[CORS] ✅ No origin - allowing request`);
      return callback(null, true);
    }

    if (allowed.includes(origin)) {
      console.log(`[CORS] ✅ Allowed origin: ${origin}`);
      return callback(null, true);
    }

    console.log(`[CORS] ❌ Blocked origin: ${origin}`);
    console.log(`[CORS] Allowed origins:`, allowed);
    return callback(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "Accept",
  ],
  optionsSuccessStatus: 200, // Some legacy browsers (IE11, various SmartTVs) choke on 204
};

// Middlewares
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Swagger configuration
app.use("/swagger", swaggerUi.serve, swaggerUi.setup(swaggerSpecs));
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpecs));

// Swagger JSON endpoint
app.get("/swagger.json", (req: Request, res: Response) => {
  res.setHeader("Content-Type", "application/json");
  res.send(swaggerSpecs);
});

/**
 * @swagger
 * tags:
 *   name: Health Check
 *   description: System health and status endpoints
 */

/**
 * @swagger
 * /ping:
 *   get:
 *     summary: Health check endpoint
 *     description: Simple ping endpoint to check if the server is running
 *     tags: [Health Check]
 *     responses:
 *       200:
 *         description: Server is running
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: "pong"
 */
app.get("/ping", (req: Request, res: Response) => {
  res.send("pong");
});

// CORS test endpoint
app.get("/cors-test", (req: Request, res: Response) => {
  res.json({
    message: "CORS test successful",
    origin: req.headers.origin,
    timestamp: new Date().toISOString(),
    cors: "working",
  });
});
const apiMiddleware = apiKeyMiddleware as RequestHandler;

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/roles", roleRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/units", unitRoutes);
app.use("/api/products", productRoutes);
app.use("/api/flavours", flavourRoutes);
app.use("/api/shops", shopRoutes);
app.use("/api/shop-inventory", shopInventoryRoutes);
app.use("/api/restock-requests", restockRequestRoutes);
app.use("/api/billing", billingRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/audit-log", auditLogRoutes);
app.use("/api/audit", enhancedAuditRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/chat-requests", chatRequestRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/stock-adjustments", stockAdjustmentRoutes);
app.use("/api/low-stock", lowStockRoutes);
app.use("/api/packaging-types", packagingTypeRoutes);
app.use("/api/employees", employeeRoutes);
app.use("/api/email", emailRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/database", databaseRoutes);
app.use("/api/cache", cacheRoutes);
app.use("/api/holidays", holidayRoutes);
app.use("/api/enhanced-dashboard", enhancedDashboardRoutes);
app.use("/api/suppliers", supplierRoutes);
app.use("/api/raw-materials", rawMaterialRoutes);
app.use("/api/raw-material-inventory", rawMaterialInventoryRoutes);
app.use("/api/recipes", recipeRoutes);
app.use("/api/production", productionRoutes);
app.use("/api/ping", pingRouter);
// Global Error Handler
app.use(errorHandler);

// 404 Handler
app.use((req: Request, res: Response, next: NextFunction) => {
  res.status(404).json({ message: "Route not found" });
});

export default app;
