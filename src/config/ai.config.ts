// config/ai.config.ts - Fixed TypeScript errors

import dotenv from "dotenv";
import OpenAI from "openai";
import Bull from "bull";
import { AnalysisConfiguration, AnalysisType } from "../types/analysis.types";

// Load environment variables
dotenv.config();

class AIConfig {
  private static instance: AIConfig;
  public isEnabled: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectTimeout: NodeJS.Timeout | null = null;

  // OpenAI Configuration
  public openai?: OpenAI;
  public openaiConfig?: {
    apiKey: string;
    model: string;
    maxTokens: number;
    temperature: number;
    timeout: number;
  };

  // Queue Configuration
  public analysisQueue?: Bull.Queue;
  public queueConfig?: any;

  // Analysis Configuration - Initialize with default config
  public analysisConfig: AnalysisConfiguration;

  private constructor() {
    // Initialize with default config first
    this.analysisConfig = this.getDefaultAnalysisConfig();

    // Check if AI analysis should be enabled
    this.isEnabled = this.shouldEnableAI();

    if (!this.isEnabled) {
      console.log("ℹ️  AI Analysis is disabled");
      return;
    }

    try {
      this.initializeAIServices();
      console.log("✅ AI Configuration initialized successfully");
    } catch (error) {
      console.error("❌ Failed to initialize AI services:", error);
      this.isEnabled = false;
    }
  }

  public static getInstance(): AIConfig {
    if (!AIConfig.instance) {
      AIConfig.instance = new AIConfig();
    }
    return AIConfig.instance;
  }

  private shouldEnableAI(): boolean {
    // Check if explicitly disabled
    if (process.env.ENABLE_AI_ANALYSIS === "false") {
      console.log(
        "ℹ️  AI Analysis explicitly disabled via ENABLE_AI_ANALYSIS=false"
      );
      return false;
    }

    // Check if in production without proper setup
    if (process.env.NODE_ENV === "production") {
      const hasOpenAI =
        process.env.OPENAI_API_KEY &&
        process.env.OPENAI_API_KEY.startsWith("sk-");
      const hasRedis = process.env.REDIS_URL || process.env.REDIS_HOST;

      if (!hasOpenAI || !hasRedis) {
        console.log(
          "ℹ️  AI Analysis disabled in production - missing OpenAI API key or Redis configuration"
        );
        return false;
      }
    }

    // Enable if we have the required environment variables
    return !!(
      process.env.OPENAI_API_KEY &&
      (process.env.REDIS_URL || process.env.REDIS_HOST)
    );
  }

  private initializeAIServices(): void {
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

    // Initialize Redis with better error handling
    this.initializeRedis();

    // Update Analysis Configuration
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
        maxFileSize: parseInt(process.env.MAX_ANALYSIS_FILE_SIZE || "10485760"),
        supportedFormats: (
          process.env.SUPPORTED_ANALYSIS_FORMATS || "pdf,docx,txt,doc"
        ).split(","),
        defaultTimeout: parseInt(process.env.ANALYSIS_TIMEOUT || "300000"),
        retryAttempts: parseInt(process.env.ANALYSIS_RETRY_ATTEMPTS || "3"),
      },
    };
  }

  private initializeRedis(): void {
    try {
      let redisConfig: any;

      if (process.env.REDIS_URL) {
        redisConfig = process.env.REDIS_URL;
      } else {
        redisConfig = {
          host: process.env.REDIS_HOST || "localhost",
          port: parseInt(process.env.REDIS_PORT || "6379"),
          password: process.env.REDIS_PASSWORD || undefined,
        };
      }

      this.queueConfig = {
        redis: redisConfig,
        settings: {
          stalledInterval: 30000,
          maxStalledCount: 3,
          retryProcessDelay: 5000,
          backoffSettings: {
            type: "exponential",
            delay: 2000,
          },
        },
      };

      // Create queue with enhanced error handling
      this.analysisQueue = new Bull("ai-analysis-queue", {
        redis:
          typeof redisConfig === "string"
            ? redisConfig
            : {
                ...redisConfig,
                maxRetriesPerRequest: 3,
                enableReadyCheck: false, // Disable ready check to prevent hanging
                lazyConnect: true,
                family: 4,
                keepAlive: 30000,
                connectTimeout: 10000,
                commandTimeout: 5000,
                retryStrategy: (times: number) => {
                  if (times > this.maxReconnectAttempts) {
                    console.log(
                      "❌ Max Redis reconnection attempts reached, disabling AI analysis"
                    );
                    this.disableAIAnalysis();
                    return null; // Stop retrying
                  }
                  const delay = Math.min(times * 1000, 10000);
                  console.log(
                    `🔄 Redis reconnection attempt ${times}/${this.maxReconnectAttempts}, delay: ${delay}ms`
                  );
                  return delay;
                },
              },
        settings: this.queueConfig.settings,
        defaultJobOptions: {
          removeOnComplete: 10,
          removeOnFail: 50,
          attempts: 3,
          backoff: this.queueConfig.settings.backoffSettings,
        },
      });

      this.setupQueueEventListeners();
    } catch (error) {
      console.error("❌ Failed to initialize Redis:", error);
      this.disableAIAnalysis();
    }
  }

  private setupQueueEventListeners(): void {
    if (!this.analysisQueue) return;

    // Queue ready event
    this.analysisQueue.on("ready", () => {
      console.log("✅ Analysis queue is ready");
      this.reconnectAttempts = 0; // Reset counter on successful connection
    });

    // Enhanced error handling
    this.analysisQueue.on("error", (error) => {
      console.error("❌ Analysis queue error:", error.message);

      // Don't attempt reconnection for certain errors
      if (this.shouldDisableOnError(error)) {
        console.log("🚫 Disabling AI analysis due to persistent Redis issues");
        this.disableAIAnalysis();
        return;
      }

      // Limited reconnection attempts
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;

        // Clear existing timeout
        if (this.reconnectTimeout) {
          clearTimeout(this.reconnectTimeout);
        }

        this.reconnectTimeout = setTimeout(() => {
          this.attemptReconnection();
        }, 5000 * this.reconnectAttempts); // Exponential backoff
      } else {
        console.log(
          "❌ Max reconnection attempts reached, disabling AI analysis"
        );
        this.disableAIAnalysis();
      }
    });

    this.analysisQueue.on("waiting", (jobId) => {
      console.log(`⏳ Job ${jobId} is waiting`);
    });

    this.analysisQueue.on("active", (job) => {
      console.log(`🔄 Job ${job.id} started processing`);
    });

    this.analysisQueue.on("completed", (job, result) => {
      console.log(`✅ Job ${job.id} completed`);
    });

    this.analysisQueue.on("failed", (job, error) => {
      console.error(`❌ Job ${job.id} failed:`, error.message);
    });

    this.analysisQueue.on("stalled", (job) => {
      console.warn(`⚠️  Job ${job.id} stalled`);
    });
  }

  private shouldDisableOnError(error: any): boolean {
    const disableErrors = [
      "ECONNRESET",
      "ECONNREFUSED",
      "ETIMEDOUT",
      "ENOTFOUND",
    ];

    return (
      disableErrors.some(
        (errorCode) =>
          error.message.includes(errorCode) || (error as any).code === errorCode
      ) && this.reconnectAttempts >= this.maxReconnectAttempts
    );
  }

  private async attemptReconnection(): Promise<void> {
    if (!this.isEnabled) return;

    try {
      console.log(
        `🔄 Attempting Redis reconnection (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`
      );

      // Close existing connection
      if (this.analysisQueue) {
        await this.analysisQueue.close();
      }

      // Wait before reconnecting
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Reinitialize Redis
      this.initializeRedis();
    } catch (error: any) {
      console.error("❌ Redis reconnection failed:", error.message);

      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        this.disableAIAnalysis();
      }
    }
  }

  private disableAIAnalysis(): void {
    console.log("🚫 Disabling AI Analysis due to Redis connection issues");

    this.isEnabled = false;

    // Clear reconnection timeout
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    // Close queue if exists
    if (this.analysisQueue) {
      this.analysisQueue
        .close()
        .catch((err) => console.error("Error closing queue:", err));
      this.analysisQueue = undefined;
    }
  }

  private getDefaultAnalysisConfig(): AnalysisConfiguration {
    return {
      paraphrasing: {
        confidenceThreshold: 70,
        enableDeepAnalysis: false,
        compareWithKnownSources: false,
        detectAIGenerated: false,
      },
      plagiarism: {
        sourceCheckEnabled: false,
        internetSearchDepth: 0,
        academicDatabaseCheck: false,
        minimumMatchLength: 20,
      },
      general: {
        maxFileSize: 10485760,
        supportedFormats: ["pdf", "docx", "txt", "doc"],
        defaultTimeout: 300000,
        retryAttempts: 0,
      },
    };
  }

  // Health check methods
  public async healthCheck(): Promise<{
    openai: boolean;
    redis: boolean;
    queue: boolean;
    overall: boolean;
  }> {
    if (!this.isEnabled) {
      return {
        openai: false,
        redis: false,
        queue: false,
        overall: false,
      };
    }

    let openaiHealth = false;
    let redisHealth = false;
    let queueHealth = false;

    try {
      if (this.openai) {
        await this.openai.models.list();
        openaiHealth = true;
      }
    } catch (error) {
      console.error("OpenAI health check failed:", error);
    }

    try {
      if (this.analysisQueue) {
        await Promise.race([
          this.analysisQueue.client.ping(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Redis ping timeout")), 5000)
          ),
        ]);
        redisHealth = true;

        await this.analysisQueue.getWaiting();
        queueHealth = true;
      }
    } catch (error) {
      console.error("Redis/Queue health check failed:", error);
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

    // Clear reconnection timeout
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    try {
      if (this.analysisQueue) {
        await this.analysisQueue.close();
        console.log("✅ Analysis queue closed");
      }
    } catch (error) {
      console.error("❌ Error closing analysis queue:", error);
    }

    console.log("✅ AI services shutdown complete");
  }

  // Utility methods for prompts
  public getAnalysisPrompt(analysisType: AnalysisType): string {
    if (!this.isEnabled) {
      return "AI Analysis is disabled";
    }

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
}

export default AIConfig;
