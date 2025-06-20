// Update your existing server.ts file with these additions

import express, { Application, Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import Database from "./config/database";
import AuthService from "./services/auth.services";
import AIConfig from "./config/ai.config"; // Add this import
import authRoutes from "./routes/auth.routes";
import courseRoutes from "./routes/course.routes";
import analyticsRoutes from "./routes/analytics.routes";
import assignmentRoutes from "./routes/assignment.routes";
import analysisRoutes from "./routes/analysis.routes";

// Load environment variables
dotenv.config();

class Server {
  private app: Application;
  private port: number;
  private database: Database;
  private authService: AuthService;
  private aiConfig: AIConfig; // Add this property

  constructor() {
    this.app = express();
    this.port = parseInt(process.env.PORT || "5000");
    this.database = Database.getInstance();
    this.authService = AuthService.getInstance();
    this.aiConfig = AIConfig.getInstance(); // Initialize AI config

    this.initializeMiddlewares();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  private initializeMiddlewares(): void {
    // Security middleware
    this.app.use(helmet());

    // CORS configuration - WORKS FOR BOTH LOCAL AND PRODUCTION
    const allowedOrigins = [
      "http://localhost:3000", // Local frontend
      "http://localhost:3001", // Alternative local port
      "https://ai-paraphrasing-frontend.vercel.app", // Production frontend
    ];

    this.app.use(
      cors({
        origin: allowedOrigins,
        credentials: true,
      })
    );

    // Rest of your middleware...
    this.app.use(express.json({ limit: "10mb" }));
    this.app.use(express.urlencoded({ extended: true, limit: "10mb" }));

    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 100,
      message: "Too many requests from this IP, please try again later.",
    });
    this.app.use(limiter);
  }

  private initializeRoutes(): void {
    // Health check route with AI services status
    this.app.get("/health", async (req: Request, res: Response) => {
      try {
        const aiHealth = await this.aiConfig.healthCheck();

        res.status(200).json({
          status: "success",
          message: "AI Paraphrasing System API is running!",
          timestamp: new Date().toISOString(),
          environment: process.env.NODE_ENV,
          database: this.database.isConnectionActive()
            ? "connected"
            : "disconnected",
          aiServices: {
            overall: aiHealth.overall,
            openai: aiHealth.openai,
            redis: aiHealth.redis,
            queue: aiHealth.queue,
          },
        });
      } catch (error) {
        res.status(200).json({
          status: "success",
          message: "AI Paraphrasing System API is running!",
          timestamp: new Date().toISOString(),
          environment: process.env.NODE_ENV,
          database: this.database.isConnectionActive()
            ? "connected"
            : "disconnected",
          aiServices: {
            overall: false,
            error: "AI services health check failed",
          },
        });
      }
    });

    // API base route with updated endpoints
    this.app.get("/api", (req: Request, res: Response) => {
      res.status(200).json({
        status: "success",
        message: "Welcome to AI Paraphrasing Detection System API",
        version: "1.0.0",
        endpoints: {
          health: "/health",
          auth: "/api/auth",
          courses: "/api/courses",
          assignments: "/api/assignments",
          analytics: "/api/analytics",
          analysis: "/api/analysis", // Add this new endpoint
        },
        features: [
          "User Authentication & Authorization",
          "Course Management",
          "Assignment Creation & Submission",
          "AI-Powered Paraphrasing Detection",
          "Real-time Analysis Status",
          "Comprehensive Analytics",
          "Queue-based Processing",
        ],
      });
    });

    // Authentication routes
    this.app.use("/api/auth", authRoutes);

    // Course routes
    this.app.use("/api/courses", courseRoutes);

    // Analytics routes
    this.app.use("/api/analytics", analyticsRoutes);

    // Assignment routes
    this.app.use("/api/assignments", assignmentRoutes);

    // Analysis routes - ADD THIS NEW ROUTE
    this.app.use("/api/analysis", analysisRoutes);

    // 404 handler
    this.app.use("*", (req: Request, res: Response) => {
      res.status(404).json({
        status: "error",
        message: `Route ${req.originalUrl} not found`,
        availableEndpoints: [
          "/health",
          "/api",
          "/api/auth",
          "/api/courses",
          "/api/assignments",
          "/api/analytics",
          "/api/analysis",
        ],
      });
    });
  }

  private initializeErrorHandling(): void {
    this.app.use(
      (error: any, req: Request, res: Response, next: NextFunction) => {
        console.error("Error:", error);

        // Handle specific AI service errors
        if (error.message?.includes("OpenAI")) {
          res.status(503).json({
            status: "error",
            message: "AI service temporarily unavailable",
            ...(process.env.NODE_ENV === "development" && {
              details: error.message,
            }),
          });
          return;
        }

        // Handle Redis/Queue errors
        if (
          error.message?.includes("Redis") ||
          error.message?.includes("Queue")
        ) {
          res.status(503).json({
            status: "error",
            message: "Analysis queue service temporarily unavailable",
            ...(process.env.NODE_ENV === "development" && {
              details: error.message,
            }),
          });
          return;
        }

        res.status(error.status || 500).json({
          status: "error",
          message: error.message || "Internal server error",
          ...(process.env.NODE_ENV === "development" && { stack: error.stack }),
        });
      }
    );
  }

  public async start(): Promise<void> {
    try {
      // Connect to database
      console.log("🔌 Connecting to database...");
      await this.database.connect();

      // Initialize AI services (this will also validate environment variables)
      console.log("🤖 Initializing AI services...");
      // AI config is already initialized in constructor

      // Create default Super Admin
      console.log("👑 Setting up Super Admin...");
      await this.authService.forceResetSuperAdmin();

      // Start server
      this.app.listen(this.port, () => {
        console.log("\n🚀 Server started successfully!");
        console.log(`📡 Server running on port: ${this.port}`);
        console.log(`🌍 Environment: ${process.env.NODE_ENV}`);
        console.log(`🔗 Health check: http://localhost:${this.port}/health`);
        console.log(`📊 API base: http://localhost:${this.port}/api`);
        console.log(
          `🔐 Auth endpoints: http://localhost:${this.port}/api/auth`
        );
        console.log(
          `🧠 Analysis endpoints: http://localhost:${this.port}/api/analysis`
        );
        console.log("⏰ Server started at:", new Date().toISOString());
        console.log("\n📋 Available Analysis Endpoints:");
        console.log("   POST /api/analysis/submissions/:id/analyze");
        console.log("   GET  /api/analysis/submissions/:id");
        console.log("   GET  /api/analysis/submissions/:id/status");
        console.log("   POST /api/analysis/submissions/:id/reanalyze");
        console.log("   GET  /api/analysis/statistics");
        console.log("   GET  /api/analysis/health");
        console.log("   GET  /api/analysis/queue/status");
      });
    } catch (error: any) {
      console.error("❌ Failed to start server:", error.message);

      // Graceful shutdown of AI services if startup fails
      try {
        await this.aiConfig.shutdown();
      } catch (shutdownError) {
        console.error("❌ Error during AI services shutdown:", shutdownError);
      }

      process.exit(1);
    }
  }

  // Graceful shutdown handler
  public async shutdown(): Promise<void> {
    console.log("\n🔄 Shutting down server...");

    try {
      // Shutdown AI services
      await this.aiConfig.shutdown();
      console.log("✅ AI services shutdown complete");

      // Close database connection
      await this.database.disconnect();
      console.log("✅ Database disconnected");

      console.log("✅ Server shutdown complete");
      process.exit(0);
    } catch (error: any) {
      console.error("❌ Error during shutdown:", error);
      process.exit(1);
    }
  }
}

// Handle graceful shutdown
process.on("SIGTERM", async () => {
  console.log("SIGTERM received, shutting down gracefully...");
  const server = new Server();
  await server.shutdown();
});

process.on("SIGINT", async () => {
  console.log("SIGINT received, shutting down gracefully...");
  const server = new Server();
  await server.shutdown();
});

// Start the server
const server = new Server();
server.start();
