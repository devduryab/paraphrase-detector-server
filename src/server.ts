import express, { Application, Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import Database from "./config/database";
import AuthService from "./services/auth.services";
import authRoutes from "./routes/auth.routes";
import courseRoutes from "./routes/course.routes";
import analyticsRoutes from "./routes/analytics.routes";
import assignmentRoutes from "./routes/assignment.routes";

// Load environment variables
dotenv.config();

class Server {
  private app: Application;
  private port: number;
  private database: Database;
  private authService: AuthService;

  constructor() {
    this.app = express();
    this.port = parseInt(process.env.PORT || "5000");
    this.database = Database.getInstance();
    this.authService = AuthService.getInstance();

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
    // Health check route
    this.app.get("/health", (req: Request, res: Response) => {
      res.status(200).json({
        status: "success",
        message: "AI Paraphrasing System API is running!",
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV,
        database: this.database.isConnectionActive()
          ? "connected"
          : "disconnected",
      });
    });

    // API base route
    this.app.get("/api", (req: Request, res: Response) => {
      res.status(200).json({
        status: "success",
        message: "Welcome to AI Paraphrasing Detection System API",
        version: "1.0.0",
        endpoints: {
          health: "/health",
          auth: "/api/auth",
          students: "/api/students",
          faculty: "/api/faculty",
          admin: "/api/admin",
        },
      });
    });

    // Authentication routes
    this.app.use("/api/auth", authRoutes);

    // Course routes - ADD THIS LINE
    this.app.use("/api/courses", courseRoutes);

    // Analytics routes

    this.app.use("/api/analytics", analyticsRoutes);

    // Assignment Routes.

    this.app.use("/api/assignments", assignmentRoutes);

    // 404 handler
    this.app.use("*", (req: Request, res: Response) => {
      res.status(404).json({
        status: "error",
        message: `Route ${req.originalUrl} not found`,
      });
    });
  }

  private initializeErrorHandling(): void {
    this.app.use(
      (error: any, req: Request, res: Response, next: NextFunction) => {
        console.error("Error:", error);

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
        console.log("⏰ Server started at:", new Date().toISOString());
      });
    } catch (error: any) {
      console.error("❌ Failed to start server:", error.message);
      process.exit(1);
    }
  }
}

// Start the server
const server = new Server();
server.start();
