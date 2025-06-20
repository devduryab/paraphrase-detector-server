// src/services/queue.service.ts

import Bull, { Job, Queue } from "bull";
import {
  AnalysisJobData,
  AnalysisJobResult,
  AnalysisStatus,
  AnalysisType,
  ServiceResponse,
} from "../types/analysis.types";
import AIConfig from "../config/ai.config";
import AnalysisResult from "../models/analysis.model";

interface QueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
}

interface JobPriority {
  high: number;
  normal: number;
  low: number;
}

class QueueService {
  private static instance: QueueService;
  private aiConfig: AIConfig;
  private analysisQueue: Queue;
  private isProcessing: boolean = false;
  private jobPriorities: JobPriority = {
    high: 1,
    normal: 5,
    low: 10,
  };

  private constructor() {
    this.aiConfig = AIConfig.getInstance();

    // Check if AI is enabled
    if (!this.aiConfig.isEnabled || !this.aiConfig.analysisQueue) {
      console.log("⚠️  Queue service initialized but AI is disabled");
      // Create a mock queue object to prevent errors
      this.analysisQueue = this.createMockQueue();
      return;
    }

    this.analysisQueue = this.aiConfig.analysisQueue;
    this.setupQueueProcessors();
    this.setupQueueEvents();
  }

  private createMockQueue(): any {
    return {
      process: () =>
        console.log("⚠️  Queue processing disabled - AI is not available"),
      add: () => Promise.resolve({ id: "mock-job-id" }),
      on: () => {},
      getWaiting: () => Promise.resolve([]),
      getActive: () => Promise.resolve([]),
      getCompleted: () => Promise.resolve([]),
      getFailed: () => Promise.resolve([]),
      getDelayed: () => Promise.resolve([]),
      getJob: () => Promise.resolve(null),
      pause: () => Promise.resolve(),
      resume: () => Promise.resolve(),
      close: () => Promise.resolve(),
    };
  }

  public static getInstance(): QueueService {
    if (!QueueService.instance) {
      QueueService.instance = new QueueService();
    }
    return QueueService.instance;
  }

  /**
   * Add analysis job to queue
   */
  public async addAnalysisJob(
    jobData: AnalysisJobData
  ): Promise<
    ServiceResponse<{ jobId: string; estimatedCompletionTime: number }>
  > {
    try {
      // Validate job data
      const validation = this.validateJobData(jobData);
      if (!validation.isValid) {
        return {
          success: false,
          error: validation.error,
          statusCode: 400,
        };
      }

      // Check if analysis already exists
      const existingAnalysis = await AnalysisResult.findOne({
        submissionId: jobData.submissionId,
        analysisType: { $in: jobData.analysisTypes },
      });

      if (
        existingAnalysis &&
        existingAnalysis.status !== AnalysisStatus.FAILED
      ) {
        return {
          success: false,
          error:
            "Analysis already exists or is in progress for this submission",
          statusCode: 409,
        };
      }

      // Create analysis record(s) in database
      const analysisRecords = await this.createAnalysisRecords(jobData);

      // Add job to queue with appropriate priority
      const job = await this.analysisQueue.add(
        "analyze-submission",
        {
          ...jobData,
          analysisIds: analysisRecords.map((record) => record._id.toString()),
          createdAt: new Date().toISOString(),
        },
        {
          priority: this.jobPriorities[jobData.priority],
          attempts: jobData.maxRetries || 3,
          backoff: {
            type: "exponential",
            delay: 2000,
          },
          removeOnComplete: 10,
          removeOnFail: 50,
        }
      );

      // Calculate estimated completion time
      const queueStats = await this.getQueueStats();
      const estimatedCompletionTime = this.calculateEstimatedCompletionTime(
        queueStats,
        jobData.priority
      );

      return {
        success: true,
        data: {
          jobId: job.id?.toString() || "",
          estimatedCompletionTime,
        },
        message: "Analysis job added to queue successfully",
      };
    } catch (error: any) {
      console.error("Failed to add analysis job:", error);
      return {
        success: false,
        error: error.message || "Failed to queue analysis job",
        statusCode: 500,
      };
    }
  }

  /**
   * Setup queue processors
   */
  private setupQueueProcessors(): void {
    // Main analysis processor
    this.analysisQueue.process(
      "analyze-submission",
      5,
      async (job: Job<AnalysisJobData>) => {
        return await this.processAnalysisJob(job);
      }
    );

    console.log("✅ Queue processors initialized");
  }

  /**
   * Setup queue event listeners
   */
  private setupQueueEvents(): void {
    this.analysisQueue.on(
      "completed",
      async (job: Job, result: AnalysisJobResult) => {
        console.log(`✅ Analysis job ${job.id} completed successfully`);
        await this.handleJobCompletion(job, result);
      }
    );

    this.analysisQueue.on("failed", async (job: Job, error: Error) => {
      console.error(`❌ Analysis job ${job.id} failed:`, error.message);
      await this.handleJobFailure(job, error);
    });

    this.analysisQueue.on("stalled", async (job: Job) => {
      console.warn(`⚠️ Analysis job ${job.id} stalled`);
      await this.handleJobStalled(job);
    });

    this.analysisQueue.on("progress", (job: Job, progress: number) => {
      console.log(`🔄 Analysis job ${job.id} progress: ${progress}%`);
    });
  }

  /**
   * Process analysis job
   */
  private async processAnalysisJob(
    job: Job<AnalysisJobData>
  ): Promise<AnalysisJobResult> {
    const startTime = Date.now();

    try {
      console.log(
        `🔄 Processing analysis job ${job.id} for submission ${job.data.submissionId}`
      );

      // Update job progress
      await job.progress(10);

      // Import analysis service (avoid circular dependencies)
      const { default: AIAnalysisService } = await import(
        "../services/ai-analysis.services"
      );
      const analysisService = AIAnalysisService.getInstance();

      // Update job progress
      await job.progress(20);

      // Process the analysis
      const result = await analysisService.processSubmissionAnalysis(
        job.data.submissionId,
        job.data.analysisTypes,
        job.data.options,
        (progress: number) => job.progress(20 + progress * 0.7) // Map 0-100 to 20-90
      );

      // Update job progress
      await job.progress(95);

      if (!result.success) {
        throw new Error(result.error || "Analysis processing failed");
      }

      // Final progress update
      await job.progress(100);

      const processingTime = Date.now() - startTime;

      return {
        success: true,
        processingTime,
        results: result.data,
      };
    } catch (error: any) {
      const processingTime = Date.now() - startTime;

      console.error(`❌ Analysis job ${job.id} processing error:`, error);

      return {
        success: false,
        error: error.message || "Analysis processing failed",
        processingTime,
      };
    }
  }

  /**
   * Handle successful job completion
   */
  private async handleJobCompletion(
    job: Job<AnalysisJobData>,
    result: AnalysisJobResult
  ): Promise<void> {
    try {
      // Update analysis records in database
      if (job.data.analysisIds) {
        for (const analysisId of job.data.analysisIds) {
          const analysis = await AnalysisResult.findById(analysisId);
          if (analysis) {
            analysis.status = AnalysisStatus.COMPLETED;
            analysis.processedAt = new Date();
            analysis.processingTime = result.processingTime;
            await analysis.save();
          }
        }
      }

      // Could add notification logic here
      // await this.notifyJobCompletion(job.data.submissionId, result);
    } catch (error: any) {
      console.error("Error handling job completion:", error);
    }
  }

  /**
   * Handle job failure
   */
  private async handleJobFailure(
    job: Job<AnalysisJobData>,
    error: Error
  ): Promise<void> {
    try {
      // Update analysis records in database
      if (job.data.analysisIds) {
        for (const analysisId of job.data.analysisIds) {
          const analysis = await AnalysisResult.findById(analysisId);
          if (analysis) {
            analysis.status = AnalysisStatus.FAILED;
            analysis.errorMessage = error.message;
            await analysis.save();
          }
        }
      }

      // Could add notification logic here
      // await this.notifyJobFailure(job.data.submissionId, error.message);
    } catch (dbError: any) {
      console.error("Error handling job failure:", dbError);
    }
  }

  /**
   * Handle stalled job
   */
  private async handleJobStalled(job: Job<AnalysisJobData>): Promise<void> {
    try {
      // Update analysis records to processing status
      if (job.data.analysisIds) {
        for (const analysisId of job.data.analysisIds) {
          const analysis = await AnalysisResult.findById(analysisId);
          if (analysis && analysis.status === AnalysisStatus.PENDING) {
            analysis.status = AnalysisStatus.PROCESSING;
            await analysis.save();
          }
        }
      }
    } catch (error: any) {
      console.error("Error handling stalled job:", error);
    }
  }

  /**
   * Create analysis records in database
   */
  private async createAnalysisRecords(
    jobData: AnalysisJobData
  ): Promise<any[]> {
    const records = [];

    for (const analysisType of jobData.analysisTypes) {
      const analysisRecord = new AnalysisResult({
        submissionId: jobData.submissionId,
        analysisType: analysisType,
        status: AnalysisStatus.PENDING,
        confidence: 0,
        isParaphrased: false,
        similarityScore: 0,
        integrityRisk: "low",
        detectedTechniques: [],
        originalSources: [],
        suspiciousPatterns: [],
        aiResponse: {
          rawResponse: "",
          modelUsed: this.aiConfig.openaiConfig?.model || "gpt-3.5-turbo",
          tokensUsed: 0,
          responseTime: 0,
        },
        explanation: "",
        recommendations: [],
        flaggedSections: [],
        processedAt: new Date(),
        processingTime: 0,
      });

      await analysisRecord.save();
      records.push(analysisRecord);
    }

    return records;
  }

  /**
   * Validate job data
   */
  private validateJobData(jobData: AnalysisJobData): {
    isValid: boolean;
    error?: string;
  } {
    if (!jobData.submissionId) {
      return { isValid: false, error: "Submission ID is required" };
    }

    if (!jobData.analysisTypes || jobData.analysisTypes.length === 0) {
      return {
        isValid: false,
        error: "At least one analysis type is required",
      };
    }

    const validAnalysisTypes = Object.values(AnalysisType);
    const invalidTypes = jobData.analysisTypes.filter(
      (type) => !validAnalysisTypes.includes(type)
    );

    if (invalidTypes.length > 0) {
      return {
        isValid: false,
        error: `Invalid analysis types: ${invalidTypes.join(", ")}`,
      };
    }

    const validPriorities = ["low", "normal", "high"];
    if (!validPriorities.includes(jobData.priority)) {
      return { isValid: false, error: "Invalid priority level" };
    }

    return { isValid: true };
  }

  /**
   * Calculate estimated completion time
   */
  private calculateEstimatedCompletionTime(
    stats: QueueStats,
    priority: string
  ): number {
    const baseProcessingTime = 30000; // 30 seconds per job
    const queuePosition = this.calculateQueuePosition(stats, priority);

    return Math.ceil((queuePosition * baseProcessingTime) / 5);
  }

  /**
   * Calculate queue position based on priority
   */
  private calculateQueuePosition(stats: QueueStats, priority: string): number {
    switch (priority) {
      case "high":
        return 1; // High priority jobs go first
      case "normal":
        return Math.ceil(stats.waiting * 0.3); // Normal priority in middle
      case "low":
        return stats.waiting; // Low priority at end
      default:
        return stats.waiting;
    }
  }

  /**
   * Get queue statistics
   */
  public async getQueueStats(): Promise<QueueStats> {
    try {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        this.analysisQueue.getWaiting(),
        this.analysisQueue.getActive(),
        this.analysisQueue.getCompleted(),
        this.analysisQueue.getFailed(),
        this.analysisQueue.getDelayed(),
      ]);

      return {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        delayed: delayed.length,
        paused: 0,
      };
    } catch (error: any) {
      console.error("Error getting queue stats:", error);
      return {
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
        paused: 0,
      };
    }
  }

  /**
   * Get job by ID
   */
  public async getJob(
    jobId: string
  ): Promise<ServiceResponse<Job<AnalysisJobData> | null>> {
    try {
      const job = await this.analysisQueue.getJob(jobId);

      return {
        success: true,
        data: job,
        message: job ? "Job found" : "Job not found",
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Failed to get job",
        statusCode: 500,
      };
    }
  }

  /**
   * Cancel job by ID
   */
  public async cancelJob(jobId: string): Promise<ServiceResponse<boolean>> {
    try {
      const job = await this.analysisQueue.getJob(jobId);

      if (!job) {
        return {
          success: false,
          error: "Job not found",
          statusCode: 404,
        };
      }

      // Check if job can be cancelled
      const state = await job.getState();
      if (state === "completed" || state === "failed") {
        return {
          success: false,
          error: `Cannot cancel job in ${state} state`,
          statusCode: 400,
        };
      }

      await job.remove();

      // Update analysis records if they exist
      const jobData = job.data as AnalysisJobData;
      if (jobData.analysisIds) {
        for (const analysisId of jobData.analysisIds) {
          const analysis = await AnalysisResult.findById(analysisId);
          if (analysis) {
            analysis.status = AnalysisStatus.FAILED;
            analysis.errorMessage = "Job cancelled by user";
            await analysis.save();
          }
        }
      }

      return {
        success: true,
        data: true,
        message: "Job cancelled successfully",
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Failed to cancel job",
        statusCode: 500,
      };
    }
  }

  /**
   * Retry failed job
   */
  public async retryJob(
    jobId: string
  ): Promise<ServiceResponse<{ newJobId: string }>> {
    try {
      const job = await this.analysisQueue.getJob(jobId);

      if (!job) {
        return {
          success: false,
          error: "Job not found",
          statusCode: 404,
        };
      }

      const state = await job.getState();
      if (state !== "failed") {
        return {
          success: false,
          error: `Cannot retry job in ${state} state`,
          statusCode: 400,
        };
      }

      // Create new job with same data
      const jobData = job.data as AnalysisJobData;
      const retryResult = await this.addAnalysisJob({
        ...jobData,
        retryCount: (jobData.retryCount || 0) + 1,
      });

      if (!retryResult.success) {
        return {
          success: false,
          error: retryResult.error,
          statusCode: retryResult.statusCode,
        };
      }

      return {
        success: true,
        data: { newJobId: retryResult.data!.jobId },
        message: "Job retry initiated successfully",
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Failed to retry job",
        statusCode: 500,
      };
    }
  }

  /**
   * Clean up old jobs
   */
  public async cleanupOldJobs(
    olderThanDays: number = 7
  ): Promise<ServiceResponse<{ removedCount: number }>> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      // Clean completed jobs
      const completedJobs = await this.analysisQueue.getCompleted();
      const failedJobs = await this.analysisQueue.getFailed();

      let removedCount = 0;

      // Remove old completed jobs
      for (const job of completedJobs) {
        if (job.timestamp && job.timestamp < cutoffDate.getTime()) {
          await job.remove();
          removedCount++;
        }
      }

      // Remove old failed jobs
      for (const job of failedJobs) {
        if (job.timestamp && job.timestamp < cutoffDate.getTime()) {
          await job.remove();
          removedCount++;
        }
      }

      return {
        success: true,
        data: { removedCount },
        message: `Cleaned up ${removedCount} old jobs`,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Failed to cleanup old jobs",
        statusCode: 500,
      };
    }
  }

  /**
   * Pause queue processing
   */
  public async pauseQueue(): Promise<ServiceResponse<boolean>> {
    try {
      await this.analysisQueue.pause();
      this.isProcessing = false;

      return {
        success: true,
        data: true,
        message: "Queue paused successfully",
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Failed to pause queue",
        statusCode: 500,
      };
    }
  }

  /**
   * Resume queue processing
   */
  public async resumeQueue(): Promise<ServiceResponse<boolean>> {
    try {
      await this.analysisQueue.resume();
      this.isProcessing = true;

      return {
        success: true,
        data: true,
        message: "Queue resumed successfully",
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Failed to resume queue",
        statusCode: 500,
      };
    }
  }

  /**
   * Health check for queue service
   */
  public async healthCheck(): Promise<{
    healthy: boolean;
    error?: string;
    stats?: QueueStats;
  }> {
    try {
      const stats = await this.getQueueStats();

      return {
        healthy: true,
        stats,
      };
    } catch (error: any) {
      return {
        healthy: false,
        error: error.message || "Queue health check failed",
      };
    }
  }

  /**
   * Graceful shutdown
   */
  public async shutdown(): Promise<void> {
    try {
      console.log("🔄 Shutting down queue service...");

      // Wait for active jobs to complete (with timeout)
      const activeJobs = await this.analysisQueue.getActive();
      if (activeJobs.length > 0) {
        console.log(
          `⏳ Waiting for ${activeJobs.length} active jobs to complete...`
        );

        // Wait up to 30 seconds for jobs to complete
        const timeout = setTimeout(() => {
          console.log("⏰ Shutdown timeout reached, forcing close...");
        }, 30000);

        // Wait for jobs to complete
        while ((await this.analysisQueue.getActive()).length > 0) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        clearTimeout(timeout);
      }

      await this.analysisQueue.close();
      console.log("✅ Queue service shutdown complete");
    } catch (error: any) {
      console.error("❌ Error during queue shutdown:", error);
    }
  }
}

export default QueueService;
