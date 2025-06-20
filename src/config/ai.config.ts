import dotenv from "dotenv";
import OpenAI from "openai";
import Bull from "bull";
import { AnalysisConfiguration, AnalysisType } from "../types/analysis.types";

// Load environment variables
dotenv.config();

class AIConfig {
  private static instance: AIConfig;

  // OpenAI Configuration
  public readonly openai: OpenAI;
  public readonly openaiConfig: {
    apiKey: string;
    model: string;
    maxTokens: number;
    temperature: number;
    timeout: number;
  };

  // Queue Configuration
  public analysisQueue: Bull.Queue;
  public readonly queueConfig: {
    redis:
      | string
      | {
          host: string;
          port: number;
          password?: string;
        };
    settings: {
      stalledInterval: number;
      maxStalledCount: number;
      retryProcessDelay: number;
      backoffSettings: {
        type: string;
        delay: number;
      };
    };
  };

  // Analysis Configuration
  public readonly analysisConfig: AnalysisConfiguration;

  // File Processing Configuration
  public readonly fileConfig: {
    maxFileSize: number;
    supportedFormats: string[];
    extractionTimeout: number;
    tempDirectory: string;
  };

  // Rate Limiting Configuration
  public readonly rateLimiting: {
    openaiRequestsPerMinute: number;
    analysisRequestsPerHour: number;
    maxConcurrentAnalyses: number;
  };

  private constructor() {
    // Validate required environment variables
    this.validateEnvironmentVariables();

    // Initialize OpenAI
    this.openaiConfig = {
      apiKey: process.env.OPENAI_API_KEY!,
      model: process.env.AI_MODEL || "gpt-3.5-turbo",
      maxTokens: parseInt(process.env.AI_MAX_TOKENS || "2000"),
      temperature: parseFloat(process.env.AI_TEMPERATURE || "0.1"),
      timeout: parseInt(process.env.AI_TIMEOUT || "30000"),
    };

    this.openai = new OpenAI({
      apiKey: this.openaiConfig.apiKey,
      timeout: this.openaiConfig.timeout,
    });

    // Initialize Queue Configuration - FIX: Use REDIS_URL if available
    let redisConfig: string | { host: string; port: number; password?: string };

    if (process.env.REDIS_URL) {
      // Use the full Redis URL for cloud providers like Upstash
      redisConfig = process.env.REDIS_URL;
    } else {
      // Fallback to individual Redis configuration for local development
      redisConfig = {
        host: process.env.REDIS_HOST || "localhost",
        port: parseInt(process.env.REDIS_PORT || "6379"),
        password: process.env.REDIS_PASSWORD || undefined,
      };
    }

    this.queueConfig = {
      redis: redisConfig,
      settings: {
        stalledInterval: 30000, // 30 seconds
        maxStalledCount: 3, // Max 3 stalled attempts
        retryProcessDelay: 5000, // 5 seconds delay between retries
        backoffSettings: {
          type: "exponential",
          delay: 2000,
        },
      },
    };

    // Initialize Analysis Queue with enhanced Redis configuration
    this.analysisQueue = new Bull("ai-analysis-queue", {
      redis:
        typeof this.queueConfig.redis === "string"
          ? this.queueConfig.redis // Pass URL string directly
          : {
              // For object configs, spread the existing config and add new options
              ...this.queueConfig.redis,
              maxRetriesPerRequest: 3,
              enableReadyCheck: true,
              lazyConnect: true,
              family: 4,
              keepAlive: 30000,
              connectTimeout: 10000,
              commandTimeout: 5000,

              retryStrategy: (times: number) => {
                const delay = Math.min(times * 50, 2000);
                console.log(
                  `Redis reconnection attempt ${times}, delay: ${delay}ms`
                );
                return delay;
              },
            },
      settings: this.queueConfig.settings,
      defaultJobOptions: {
        removeOnComplete: 10, // Keep 10 completed jobs
        removeOnFail: 50, // Keep 50 failed jobs for debugging
        attempts: 3, // Retry failed jobs 3 times
        backoff: this.queueConfig.settings.backoffSettings,
      },
    });

    // Initialize Analysis Configuration
    this.analysisConfig = {
      paraphrasing: {
        confidenceThreshold: parseInt(
          process.env.PARAPHRASING_CONFIDENCE_THRESHOLD || "70"
        ),
        enableDeepAnalysis: process.env.ENABLE_DEEP_ANALYSIS === "true",
        compareWithKnownSources: process.env.COMPARE_KNOWN_SOURCES === "true",
        detectAIGenerated: process.env.DETECT_AI_GENERATED === "true",
      },
      plagiarism: {
        sourceCheckEnabled: process.env.SOURCE_CHECK_ENABLED === "true",
        internetSearchDepth: parseInt(process.env.INTERNET_SEARCH_DEPTH || "5"),
        academicDatabaseCheck: process.env.ACADEMIC_DATABASE_CHECK === "true",
        minimumMatchLength: parseInt(process.env.MINIMUM_MATCH_LENGTH || "20"),
      },
      general: {
        maxFileSize: parseInt(process.env.MAX_ANALYSIS_FILE_SIZE || "10485760"), // 10MB
        supportedFormats: (
          process.env.SUPPORTED_ANALYSIS_FORMATS || "pdf,docx,txt,doc"
        ).split(","),
        defaultTimeout: parseInt(process.env.ANALYSIS_TIMEOUT || "300000"), // 5 minutes
        retryAttempts: parseInt(process.env.ANALYSIS_RETRY_ATTEMPTS || "3"),
      },
    };

    // Initialize File Configuration
    this.fileConfig = {
      maxFileSize: parseInt(process.env.MAX_FILE_SIZE || "10485760"), // 10MB
      supportedFormats: (
        process.env.ALLOWED_FILE_TYPES || "pdf,doc,docx,txt"
      ).split(","),
      extractionTimeout: parseInt(
        process.env.TEXT_EXTRACTION_TIMEOUT || "60000"
      ), // 1 minute
      tempDirectory: process.env.TEMP_DIRECTORY || "/tmp/ai-analysis",
    };

    // Initialize Rate Limiting
    this.rateLimiting = {
      openaiRequestsPerMinute: parseInt(
        process.env.OPENAI_REQUESTS_PER_MINUTE || "20"
      ),
      analysisRequestsPerHour: parseInt(
        process.env.ANALYSIS_REQUESTS_PER_HOUR || "100"
      ),
      maxConcurrentAnalyses: parseInt(
        process.env.MAX_CONCURRENT_ANALYSES || "5"
      ),
    };

    // Setup queue event listeners
    this.setupQueueEventListeners();

    // Start monitoring Redis connection
    this.monitorRedisConnection();

    console.log("✅ AI Configuration initialized successfully");
    console.log(`🤖 OpenAI Model: ${this.openaiConfig.model}`);

    // Updated logging to show the correct Redis connection info
    if (typeof this.queueConfig.redis === "string") {
      console.log(`📊 Analysis Queue: Connected to Redis URL`);
    } else {
      console.log(
        `📊 Analysis Queue: ${this.queueConfig.redis.host}:${this.queueConfig.redis.port}`
      );
    }
  }

  public static getInstance(): AIConfig {
    if (!AIConfig.instance) {
      AIConfig.instance = new AIConfig();
    }
    return AIConfig.instance;
  }

  private validateEnvironmentVariables(): void {
    const requiredVars = ["OPENAI_API_KEY"];

    // Check for either REDIS_URL or individual Redis variables
    const hasRedisUrl = process.env.REDIS_URL;
    const hasRedisHost = process.env.REDIS_HOST;

    if (!hasRedisUrl && !hasRedisHost) {
      requiredVars.push("REDIS_URL or REDIS_HOST");
    }

    const missingVars = requiredVars.filter((varName) => {
      if (varName === "REDIS_URL or REDIS_HOST") {
        return !hasRedisUrl && !hasRedisHost;
      }
      return !process.env[varName];
    });

    if (missingVars.length > 0) {
      throw new Error(
        `Missing required environment variables: ${missingVars.join(", ")}\n` +
          "Please ensure these are set in your .env file"
      );
    }

    // Validate OpenAI API Key format
    if (!process.env.OPENAI_API_KEY?.startsWith("sk-")) {
      console.warn(
        '⚠️  OpenAI API Key format may be invalid (should start with "sk-")'
      );
    }

    console.log("✅ Environment variables validated");
  }

  private setupQueueEventListeners(): void {
    // Queue monitoring events
    this.analysisQueue.on("ready", () => {
      console.log("✅ Analysis queue is ready");
    });

    this.analysisQueue.on("error", (error) => {
      console.error("❌ Analysis queue error:", error);

      // Attempt to reconnect if it's a connection error
      if (
        error.message.includes("ECONNREFUSED") ||
        error.message.includes("ECONNRESET")
      ) {
        console.log("🔄 Attempting to reconnect Redis...");
        setTimeout(() => {
          this.reconnectRedis();
        }, 5000);
      }
    });

    this.analysisQueue.on("waiting", (jobId) => {
      console.log(`⏳ Job ${jobId} is waiting`);
    });

    this.analysisQueue.on("active", (job) => {
      console.log(`🔄 Job ${job.id} started processing`);
    });

    this.analysisQueue.on("completed", (job, result) => {
      console.log(`✅ Job ${job.id} completed:`, result);
    });

    this.analysisQueue.on("failed", (job, error) => {
      console.error(`❌ Job ${job.id} failed:`, error.message);
    });

    this.analysisQueue.on("stalled", (job) => {
      console.warn(`⚠️  Job ${job.id} stalled`);
    });
  }

  private async reconnectRedis(): Promise<void> {
    try {
      console.log("🔄 Attempting Redis reconnection...");

      // Close existing connection
      await this.analysisQueue.close();

      // Wait a bit before reconnecting
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Recreate the queue with enhanced configuration
      this.analysisQueue = new Bull("ai-analysis-queue", {
        redis:
          typeof this.queueConfig.redis === "string"
            ? this.queueConfig.redis // Bull handles URL parsing
            : this.queueConfig.redis,
        settings: this.queueConfig.settings,
        defaultJobOptions: {
          removeOnComplete: 10,
          removeOnFail: 50,
          attempts: 3,
          backoff: this.queueConfig.settings.backoffSettings,
        },
      });

      // Re-setup event listeners
      this.setupQueueEventListeners();

      console.log("✅ Redis reconnected successfully");
    } catch (error: any) {
      console.error("❌ Redis reconnection failed:", error);

      // Retry after a longer delay
      setTimeout(() => {
        this.reconnectRedis();
      }, 10000);
    }
  }

  public async monitorRedisConnection(): Promise<void> {
    setInterval(async () => {
      try {
        await this.analysisQueue.client.ping();
        console.log("📡 Redis connection: OK");
      } catch (error: any) {
        console.error("📡 Redis connection: FAILED -", error.message);
        this.reconnectRedis();
      }
    }, 30000); // Check every 30 seconds
  }

  // Utility methods
  public getAnalysisPrompt(analysisType: AnalysisType): string {
    const prompts = {
      [AnalysisType.PARAPHRASING]: this.getParaphrasingPrompt(),
      [AnalysisType.PLAGIARISM]: this.getPlagiarismPrompt(),
      [AnalysisType.SIMILARITY]: this.getSimilarityPrompt(),
      [AnalysisType.CONTENT_ANALYSIS]: this.getContentAnalysisPrompt(),
    };

    return prompts[analysisType] || prompts[AnalysisType.PARAPHRASING];
  }

  private getParaphrasingPrompt(): string {
    return `You are an AI assistant specialized in detecting paraphrased content in academic submissions.

Your task is to analyze the provided text and determine if it shows signs of being paraphrased from other sources.

Analyze the following aspects:
1. **Paraphrasing Likelihood**: Rate from 0-100% how likely this text is paraphrased
2. **Paraphrasing Techniques**: Identify specific techniques used (synonym replacement, sentence restructuring, etc.)
3. **Academic Integrity**: Assess if this represents potential academic dishonesty
4. **Flagged Sections**: Identify specific parts that seem paraphrased
5. **Recommendations**: Suggest actions for the instructor

Consider these paraphrasing indicators:
- Unusual synonym choices or word substitutions
- Awkward sentence structures that preserve original meaning
- Inconsistent writing style or voice changes
- Technical terms replaced with simpler equivalents
- Passive voice usage to obscure original structure
- Conceptual similarity with different expression

Respond in valid JSON format with this structure:
{
  "confidence": number (0-100),
  "isParaphrased": boolean,
  "techniques": string[],
  "integrityRisk": "low" | "medium" | "high" | "critical",
  "explanation": string,
  "recommendations": string[],
  "flaggedSections": [
    {
      "startIndex": number,
      "endIndex": number,
      "text": string,
      "reason": string,
      "confidence": number,
      "suggestedAction": string
    }
  ],
  "similarityScore": number (0-100)
}`;
  }

  private getPlagiarismPrompt(): string {
    return `You are an AI assistant specialized in detecting plagiarism in academic content.
    
Analyze the text for direct copying, unauthorized use of sources, and improper attribution.
Focus on identifying exact matches, near-exact matches, and suspicious patterns that indicate plagiarism.`;
  }

  private getSimilarityPrompt(): string {
    return `You are an AI assistant specialized in content similarity analysis.
    
Compare the provided text segments and identify similarities in structure, content, and expression.
Provide detailed similarity scores and highlight matching sections.`;
  }

  private getContentAnalysisPrompt(): string {
    return `You are an AI assistant specialized in general content analysis for academic integrity.
    
Perform comprehensive analysis including writing quality, consistency, originality indicators, and academic standards compliance.`;
  }

  // Health check methods
  public async healthCheck(): Promise<{
    openai: boolean;
    redis: boolean;
    queue: boolean;
    overall: boolean;
  }> {
    let openaiHealth = false;
    let redisHealth = false;
    let queueHealth = false;

    try {
      // Test OpenAI connection
      await this.openai.models.list();
      openaiHealth = true;
    } catch (error) {
      console.error("OpenAI health check failed:", error);
    }

    try {
      // Test Redis connection with timeout
      const pingPromise = this.analysisQueue.client.ping();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Redis ping timeout")), 5000)
      );

      await Promise.race([pingPromise, timeoutPromise]);
      redisHealth = true;
    } catch (error) {
      console.error("Redis health check failed:", error);
      // Attempt reconnection on health check failure
      this.reconnectRedis();
    }

    try {
      // Test Queue health
      await this.analysisQueue.getWaiting();
      queueHealth = true;
    } catch (error) {
      console.error("Queue health check failed:", error);
    }

    const overall = openaiHealth && redisHealth && queueHealth;

    return {
      openai: openaiHealth,
      redis: redisHealth,
      queue: queueHealth,
      overall,
    };
  }

  // Graceful shutdown
  public async shutdown(): Promise<void> {
    console.log("🔄 Shutting down AI services...");

    try {
      await this.analysisQueue.close();
      console.log("✅ Analysis queue closed");
    } catch (error) {
      console.error("❌ Error closing analysis queue:", error);
    }

    console.log("✅ AI services shutdown complete");
  }
}

export default AIConfig;
