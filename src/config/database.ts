import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

class Database {
  private static instance: Database;
  private isConnected: boolean = false;

  private constructor() {}

  public static getInstance(): Database {
    if (!Database.instance) {
      Database.instance = new Database();
    }
    return Database.instance;
  }

  public async connect(): Promise<void> {
    if (this.isConnected) {
      console.log("📁 Database already connected");
      return;
    }

    try {
      const mongoUri =
        process.env.MONGODB_URI ||
        "mongodb://localhost:27017/ai-paraphrasing-system";

      await mongoose.connect(mongoUri, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      });

      this.isConnected = true;
      console.log("✅ Database connected successfully");
      console.log(`📊 Connected to: ${mongoose.connection.name}`);

      // Handle connection events
      mongoose.connection.on("error", (error) => {
        console.error("❌ Database connection error:", error);
        this.isConnected = false;
      });

      mongoose.connection.on("disconnected", () => {
        console.log("⚠️ Database disconnected");
        this.isConnected = false;
      });
    } catch (error) {
      console.error("❌ Database connection failed:", error);
      this.isConnected = false;
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    try {
      await mongoose.disconnect();
      this.isConnected = false;
      console.log("📁 Database disconnected");
    } catch (error) {
      console.error("❌ Error disconnecting database:", error);
      throw error;
    }
  }

  public isConnectionActive(): boolean {
    return this.isConnected && mongoose.connection.readyState === 1;
  }
}

export default Database;
