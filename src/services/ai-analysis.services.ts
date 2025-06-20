
import mongoose from "mongoose";
import {
  ServiceResponse,
  AnalysisType,
  AnalysisOptions,
  AnalysisStatus,
  IAnalysisResult,
  AnalysisJobData,
  OpenAIAnalysisRequest,
  IntegrityRisk,
  ParaphrasingTechnique,
  FlaggedSection,
  TextExtractionResult,
} from "../types/analysis.types";
import AIConfig from "../config/ai.config";

import AnalysisResult from "../models/analysis.model";
import TextExtractorService from "./text-extractor.services";
import ParaphrasingDetectorService from "./paraphrasing-detector.services";
import QueueService from "./queue.services";

// Import submission model interface (adjust based on your actual model)
interface ISubmission {
  _id: mongoose.Types.ObjectId;
  submissionText?: string;
  submissionFiles?: string[];
  assignmentId: mongoose.Types.ObjectId;
  studentId: mongoose.Types.ObjectId;
  submittedAt: Date;
  isLate: boolean;
  status: string;
}

// Analysis statistics interface
interface AnalysisStatistics {
  totalAnalyses: number;
  completedAnalyses: number;
  pendingAnalyses: number;
  failedAnalyses: number;
  averageConfidence: number;
  averageProcessingTime: number;
  paraphrasedCount: number;
  originalCount: number;
  riskDistribution: {
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
  analysisTypeDistribution: Record<string, number>;
  dailyAnalysisCount: Array<{
    date: string;
    count: number;
  }>;
}

// Submission analysis summary
interface SubmissionAnalysisSummary {
  submissionId: string;
  overallStatus: AnalysisStatus;
  overallRisk: IntegrityRisk;
  overallConfidence: number;
  isParaphrased: boolean;
  analysisCount: number;
  completedAt?: Date;
  flaggedSectionsCount: number;
  detectedTechniques: ParaphrasingTechnique[];
  recommendations: string[];
}

class AIAnalysisService {
  private static instance: AIAnalysisService;
  private aiConfig: AIConfig;
  private textExtractor: TextExtractorService;
  private paraphrasingDetector: ParaphrasingDetectorService;
  private queueService: QueueService;
  private readonly MAX_TEXT_LENGTH = 50000;
  private readonly MIN_TEXT_LENGTH = 50;

  private constructor() {
    this.aiConfig = AIConfig.getInstance();
    this.textExtractor = TextExtractorService.getInstance();
    this.paraphrasingDetector = ParaphrasingDetectorService.getInstance();
    this.queueService = QueueService.getInstance();
  }

  public static getInstance(): AIAnalysisService {
    if (!AIAnalysisService.instance) {
      AIAnalysisService.instance = new AIAnalysisService();
    }
    return AIAnalysisService.instance;
  }

  /**
   * Main entry point: Queue analysis for a submission
   */
  public async queueSubmissionAnalysis(
    submissionId: string,
    analysisTypes: AnalysisType[] = [AnalysisType.PARAPHRASING],
    priority: "low" | "normal" | "high" = "normal",
    options?: Partial<AnalysisOptions>
  ): Promise<
    ServiceResponse<{ jobId: string; estimatedCompletionTime: number }>
  > {
    try {
      // Validate submission exists
      const submissionValidation = await this.validateSubmissionExists(
        submissionId
      );
      if (!submissionValidation.success) {
        return {
          success: false,
          error: submissionValidation.error,
          statusCode: submissionValidation.statusCode,
        };
      }

      // Check for existing pending or processing analysis
      const existingAnalysis = await this.checkExistingAnalysis(
        submissionId,
        analysisTypes
      );
      if (existingAnalysis.hasExisting) {
        return {
          success: false,
          error: existingAnalysis.message,
          statusCode: 409,
        };
      }

      // Default analysis options
      const defaultOptions: AnalysisOptions = {
        includeSourceDetection: true,
        deepAnalysis:
          this.aiConfig.analysisConfig.paraphrasing.enableDeepAnalysis,
        compareWithDatabase:
          this.aiConfig.analysisConfig.paraphrasing.compareWithKnownSources,
        extractTextFromFiles: true,
        languageDetection: false,
      };

      const analysisOptions = { ...defaultOptions, ...options };

      // Validate analysis options
      const optionsValidation = this.validateAnalysisOptions(analysisOptions);
      if (!optionsValidation.isValid) {
        return {
          success: false,
          error: optionsValidation.error,
          statusCode: 400,
        };
      }

      // Create job data
      const jobData: AnalysisJobData = {
        submissionId,
        analysisTypes,
        priority,
        options: analysisOptions,
        retryCount: 0,
        maxRetries: this.aiConfig.analysisConfig.general.retryAttempts,
      };

      // Queue the job
      const queueResult = await this.queueService.addAnalysisJob(jobData);

      if (!queueResult.success) {
        return queueResult;
      }

      console.log(
        `✅ Analysis queued successfully for submission ${submissionId} with job ID ${queueResult.data?.jobId}`
      );

      return {
        success: true,
        data: queueResult.data!,
        message: `Analysis queued successfully for submission ${submissionId}`,
      };
    } catch (error: any) {
      console.error("Error queuing submission analysis:", error);
      return {
        success: false,
        error: error.message || "Failed to queue analysis",
        statusCode: 500,
      };
    }
  }

  /**
   * Process submission analysis (called by queue worker)
   */
  public async processSubmissionAnalysis(
    submissionId: string,
    analysisTypes: AnalysisType[],
    options: AnalysisOptions,
    progressCallback?: (progress: number) => void
  ): Promise<ServiceResponse<Partial<IAnalysisResult>>> {
    const startTime = Date.now();

    try {
      console.log(
        `🔄 Starting analysis processing for submission ${submissionId}`
      );
      progressCallback?.(0);

      // Get submission data
      const submissionResult = await this.getSubmissionData(submissionId);
      if (!submissionResult.success || !submissionResult.data) {
        throw new Error(
          submissionResult.error || "Failed to get submission data"
        );
      }

      const submission = submissionResult.data;
      progressCallback?.(10);

      // Extract and prepare text for analysis
      const textResult = await this.extractSubmissionText(submission, options);
      if (!textResult.success || !textResult.data) {
        throw new Error(
          textResult.error || "Failed to extract text from submission"
        );
      }

      const textToAnalyze = textResult.data;
      console.log(
        `📝 Extracted ${textToAnalyze.length} characters for analysis`
      );
      progressCallback?.(30);

      // Validate text for analysis
      const textValidation = this.validateTextForAnalysis(textToAnalyze);
      if (!textValidation.isValid) {
        throw new Error(
          textValidation.reason || "Text is not suitable for analysis"
        );
      }

      progressCallback?.(40);

      // Process each analysis type
      const analysisResults: Partial<IAnalysisResult>[] = [];
      const analysisErrors: string[] = [];

      for (let i = 0; i < analysisTypes.length; i++) {
        const analysisType = analysisTypes[i];
        const baseProgress = 40 + (i * 50) / analysisTypes.length;

        try {
          console.log(`🔍 Processing ${analysisType} analysis...`);

          const result = await this.getSubmissionAnalysis(
            submissionId,
            analysisType as AnalysisType
          );

          if (result.success && result.data && result.data.length > 0) {
            // Add all results to the array
            analysisResults.push(...result.data);
            console.log(
              `✅ ${analysisType} analysis completed with ${result.data.length} results`
            );
          } else {
            analysisErrors.push(`${analysisType}: ${result.error}`);
            console.error(
              `❌ ${analysisType} analysis failed: ${result.error}`
            );
          }
        } catch (analysisError: any) {
          const errorMessage = `${analysisType}: ${analysisError.message}`;
          analysisErrors.push(errorMessage);
          console.error(
            `❌ Analysis failed for type ${analysisType}:`,
            analysisError
          );
        }
      }

      progressCallback?.(90);

      if (analysisResults.length === 0) {
        throw new Error(
          `All analysis types failed. Errors: ${analysisErrors.join("; ")}`
        );
      }

      // Combine results if multiple analysis types
      const combinedResult = this.combineAnalysisResults(analysisResults);
      combinedResult.processingTime = Date.now() - startTime;

      // Save results to database
      await this.saveAnalysisResults(
        submissionId,
        analysisTypes,
        combinedResult
      );

      progressCallback?.(100);

      console.log(
        `✅ Analysis completed for submission ${submissionId} in ${combinedResult.processingTime}ms`
      );

      return {
        success: true,
        data: combinedResult,
        message: `Analysis completed for ${analysisResults.length} analysis types`,
      };
    } catch (error: any) {
      const processingTime = Date.now() - startTime;
      console.error(
        `❌ Error processing submission analysis for ${submissionId}:`,
        error
      );

      // Save error to database
      await this.saveAnalysisError(
        submissionId,
        analysisTypes,
        error.message,
        processingTime
      );

      return {
        success: false,
        error: error.message || "Analysis processing failed",
        statusCode: 500,
      };
    }
  }

  /**
   * Get analysis results for a submission
   */
  public async getSubmissionAnalysis(
    submissionId: string,
    analysisType?: AnalysisType
  ): Promise<ServiceResponse<IAnalysisResult[]>> {
    try {
      if (!mongoose.Types.ObjectId.isValid(submissionId)) {
        return {
          success: false,
          error: "Invalid submission ID format",
          statusCode: 400,
        };
      }

      const query: any = { submissionId };
      if (analysisType) {
        query.analysisType = analysisType;
      }

      const results = await AnalysisResult.find(query)
        .sort({ createdAt: -1 })
        .lean()
        .exec();

      return {
        success: true,
        data: results as IAnalysisResult[],
        message: `Found ${results.length} analysis results`,
      };
    } catch (error: any) {
      console.error("Error getting submission analysis:", error);
      return {
        success: false,
        error: error.message || "Failed to get analysis results",
        statusCode: 500,
      };
    }
  }

  /**
   * Get analysis status for a submission
   */
  public async getAnalysisStatus(submissionId: string): Promise<
    ServiceResponse<{
      status: AnalysisStatus;
      results?: IAnalysisResult[];
      progress?: number;
      estimatedCompletionTime?: number;
      summary?: SubmissionAnalysisSummary;
    }>
  > {
    try {
      if (!mongoose.Types.ObjectId.isValid(submissionId)) {
        return {
          success: false,
          error: "Invalid submission ID format",
          statusCode: 400,
        };
      }

      const results = (await AnalysisResult.find({ submissionId })
        .sort({ createdAt: -1 })
        .lean()
        .exec()) as IAnalysisResult[];

      if (results.length === 0) {
        return {
          success: true,
          data: { status: AnalysisStatus.PENDING },
          message: "No analysis found",
        };
      }

      // Determine overall status
      const statuses = results.map((r) => r.status);
      let overallStatus: AnalysisStatus;

      if (statuses.every((s) => s === AnalysisStatus.COMPLETED)) {
        overallStatus = AnalysisStatus.COMPLETED;
      } else if (statuses.some((s) => s === AnalysisStatus.PROCESSING)) {
        overallStatus = AnalysisStatus.PROCESSING;
      } else if (statuses.some((s) => s === AnalysisStatus.FAILED)) {
        overallStatus = AnalysisStatus.FAILED;
      } else {
        overallStatus = AnalysisStatus.PENDING;
      }

      // Create summary
      const summary = this.createAnalysisSummary(submissionId, results);

      return {
        success: true,
        data: {
          status: overallStatus,
          results: results.filter((r) => r.status === AnalysisStatus.COMPLETED),
          summary,
        },
        message: "Analysis status retrieved successfully",
      };
    } catch (error: any) {
      console.error("Error getting analysis status:", error);
      return {
        success: false,
        error: error.message || "Failed to get analysis status",
        statusCode: 500,
      };
    }
  }

  /**
   * Extract text from submission (text + files)
   */
  private async extractSubmissionText(
    submission: ISubmission,
    options: AnalysisOptions
  ): Promise<ServiceResponse<string>> {
    try {
      let extractedTexts: string[] = [];

      // Add submission text if available
      if (
        submission.submissionText &&
        submission.submissionText.trim().length > 0
      ) {
        const cleanedText = this.textExtractor.cleanTextForAnalysis(
          submission.submissionText
        );
        extractedTexts.push(cleanedText);
      }

      // Extract text from files if enabled and files exist
      if (
        options.extractTextFromFiles &&
        submission.submissionFiles &&
        submission.submissionFiles.length > 0
      ) {
        try {
          // In a real implementation, you would:
          // 1. Fetch file buffers from your storage system (S3, filesystem, etc.)
          // 2. Extract text using TextExtractorService
          // 3. Add extracted text to extractedTexts array

          console.log(
            `📁 Found ${submission.submissionFiles.length} files for text extraction`
          );

          // Placeholder for file processing
          // const fileTexts = await this.extractTextFromFiles(submission.submissionFiles);
          // extractedTexts.push(...fileTexts);
        } catch (fileError: any) {
          console.warn("File text extraction failed:", fileError.message);
          // Continue without file text if extraction fails
        }
      }

      if (extractedTexts.length === 0) {
        return {
          success: false,
          error: "No text content found in submission",
          statusCode: 422,
        };
      }

      // Combine all extracted texts
      const combinedText = extractedTexts.join(
        "\n\n--- Content Separator ---\n\n"
      );

      return {
        success: true,
        data: combinedText,
        message: `Extracted text from ${extractedTexts.length} sources`,
      };
    } catch (error: any) {
      console.error("Error extracting submission text:", error);
      return {
        success: false,
        error: error.message || "Failed to extract submission text",
        statusCode: 500,
      };
    }
  }

  /**
   * Perform analysis based on analysis type
   */
  private async performAnalysis(
    text: string,
    analysisType: AnalysisType,
    options: AnalysisOptions,
    progressCallback?: (progress: number) => void
  ): Promise<ServiceResponse<Partial<IAnalysisResult>>> {
    try {
      progressCallback?.(0);

      // Prepare analysis request
      const analysisRequest: OpenAIAnalysisRequest = {
        text: text,
        analysisType,
        options: {
          maxTokens: this.aiConfig.openaiConfig.maxTokens,
          temperature: this.aiConfig.openaiConfig.temperature,
          includeExplanation: true,
        },
      };

      progressCallback?.(30);

      // Call the appropriate detector based on analysis type
      const detectionResult = await this.paraphrasingDetector.analyzeText(
        analysisRequest
      );

      progressCallback?.(80);

      if (!detectionResult.success || !detectionResult.data) {
        throw new Error(detectionResult.error || "Analysis detection failed");
      }

      const aiResponse = detectionResult.data;

      // Convert to analysis result format
      const analysisResult: Partial<IAnalysisResult> = {
        analysisType,
        status: AnalysisStatus.COMPLETED,
        confidence: this.validateConfidence(aiResponse.confidence),
        isParaphrased: Boolean(aiResponse.isParaphrased),
        similarityScore: this.validateConfidence(
          aiResponse.similarityScore || 0
        ),
        integrityRisk: this.validateIntegrityRisk(aiResponse.integrityRisk),
        detectedTechniques: this.validateTechniques(
          aiResponse.techniques || []
        ),
        originalSources: this.validateSources(aiResponse.originalSources || []),
        suspiciousPatterns: this.extractSuspiciousPatterns(aiResponse),
        aiResponse: {
          rawResponse: JSON.stringify(aiResponse),
          modelUsed: this.aiConfig.openaiConfig.model,
          tokensUsed: 0, // Would be populated from actual API response
          responseTime: 0, // Would be populated from actual API response
        },
        explanation: this.validateExplanation(aiResponse.explanation),
        recommendations: this.validateRecommendations(
          aiResponse.recommendations || []
        ),
        flaggedSections: this.validateFlaggedSections(
          aiResponse.flaggedSections || []
        ),
        processedAt: new Date(),
        processingTime: 0, // Will be calculated by caller
      };

      progressCallback?.(100);

      return {
        success: true,
        data: analysisResult,
        message: "Analysis completed successfully",
      };
    } catch (error: any) {
      console.error("Error performing analysis:", error);
      return {
        success: false,
        error: error.message || "Analysis failed",
        statusCode: 500,
      };
    }
  }

  /**
   * Combine multiple analysis results
   */
  private combineAnalysisResults(
    results: Partial<IAnalysisResult>[]
  ): Partial<IAnalysisResult> {
    if (results.length === 1) {
      return results[0] || {};
    }

    // Calculate weighted averages and combine results
    const totalConfidence = results.reduce(
      (sum, r) => sum + (r.confidence || 0),
      0
    );
    const averageConfidence = Math.round(totalConfidence / results.length);

    const totalSimilarity = results.reduce(
      (sum, r) => sum + (r.similarityScore || 0),
      0
    );
    const averageSimilarity = Math.round(totalSimilarity / results.length);

    // Determine if any analysis detected paraphrasing
    const isParaphrased = results.some((r) => r.isParaphrased);

    // Get highest risk level
    const riskLevels = {
      [IntegrityRisk.LOW]: 1,
      [IntegrityRisk.MEDIUM]: 2,
      [IntegrityRisk.HIGH]: 3,
      [IntegrityRisk.CRITICAL]: 4,
    };

    const highestRisk = results.reduce((highest, r) => {
      const currentRisk = riskLevels[r.integrityRisk as IntegrityRisk] || 1;
      const highestRisk = riskLevels[highest as IntegrityRisk] || 1;
      return currentRisk > highestRisk ? r.integrityRisk! : highest;
    }, IntegrityRisk.LOW);

    // Combine techniques, sources, and patterns
    const allTechniques = results.flatMap((r) => r.detectedTechniques || []);
    const uniqueTechniques = [...new Set(allTechniques)];

    const allSources = results.flatMap((r) => r.originalSources || []);
    const uniqueSources = [...new Set(allSources)];

    const allPatterns = results.flatMap((r) => r.suspiciousPatterns || []);
    const uniquePatterns = [...new Set(allPatterns)];

    const allRecommendations = results.flatMap((r) => r.recommendations || []);
    const uniqueRecommendations = [...new Set(allRecommendations)];

    const allFlaggedSections = results.flatMap((r) => r.flaggedSections || []);

    return {
      analysisType: AnalysisType.PARAPHRASING, // Default type for combined results
      status: AnalysisStatus.COMPLETED,
      confidence: averageConfidence,
      isParaphrased,
      similarityScore: averageSimilarity,
      integrityRisk: highestRisk,
      detectedTechniques: uniqueTechniques,
      originalSources: uniqueSources,
      suspiciousPatterns: uniquePatterns,
      explanation: this.combineExplanations(results),
      recommendations: uniqueRecommendations,
      flaggedSections: allFlaggedSections,
      processedAt: new Date(),
      processingTime: 0,
    };
  }

  /**
   * Create analysis summary
   */
  private createAnalysisSummary(
    submissionId: string,
    results: IAnalysisResult[]
  ): SubmissionAnalysisSummary {
    const completedResults = results.filter(
      (r) => r.status === AnalysisStatus.COMPLETED
    );

    if (completedResults.length === 0) {
      return {
        submissionId,
        overallStatus: results[0]?.status || AnalysisStatus.PENDING,
        overallRisk: IntegrityRisk.LOW,
        overallConfidence: 0,
        isParaphrased: false,
        analysisCount: results.length,
        flaggedSectionsCount: 0,
        detectedTechniques: [],
        recommendations: [],
      };
    }

    // Calculate overall metrics
    const avgConfidence = Math.round(
      completedResults.reduce((sum, r) => sum + r.confidence, 0) /
        completedResults.length
    );

    const isParaphrased = completedResults.some((r) => r.isParaphrased);

    // Get highest risk
    const riskLevels = {
      [IntegrityRisk.LOW]: 1,
      [IntegrityRisk.MEDIUM]: 2,
      [IntegrityRisk.HIGH]: 3,
      [IntegrityRisk.CRITICAL]: 4,
    };

    const overallRisk = completedResults.reduce((highest, r) => {
      const currentRisk = riskLevels[r.integrityRisk] || 1;
      const highestRisk = riskLevels[highest] || 1;
      return currentRisk > highestRisk ? r.integrityRisk : highest;
    }, IntegrityRisk.LOW);

    // Combine techniques and recommendations
    const allTechniques = completedResults.flatMap(
      (r) => r.detectedTechniques || []
    );
    const uniqueTechniques = [...new Set(allTechniques)];

    const allRecommendations = completedResults.flatMap(
      (r) => r.recommendations || []
    );
    const uniqueRecommendations = [...new Set(allRecommendations)];

    const flaggedSectionsCount = completedResults.reduce(
      (sum, r) => sum + (r.flaggedSections?.length || 0),
      0
    );

    return {
      submissionId,
      overallStatus: AnalysisStatus.COMPLETED,
      overallRisk,
      overallConfidence: avgConfidence,
      isParaphrased,
      analysisCount: results.length,
      completedAt: completedResults[0]?.processedAt,
      flaggedSectionsCount,
      detectedTechniques: uniqueTechniques,
      recommendations: uniqueRecommendations,
    };
  }

  /**
   * Combine explanations from multiple analyses
   */
  private combineExplanations(results: Partial<IAnalysisResult>[]): string {
    const explanations = results
      .map((r) => r.explanation)
      .filter((e) => e && e.trim().length > 0);

    if (explanations.length === 0) {
      return "Combined analysis completed with multiple detection methods.";
    }

    if (explanations.length === 1) {
      return explanations[0]!;
    }

    return `Combined Analysis Results:\n\n${explanations
      .map((exp, i) => `Analysis ${i + 1}: ${exp}`)
      .join("\n\n")}`;
  }

  /**
   * Extract suspicious patterns from AI response
   */
  private extractSuspiciousPatterns(aiResponse: any): string[] {
    const patterns: string[] = [];

    // Extract patterns from flagged sections
    if (
      aiResponse.flaggedSections &&
      Array.isArray(aiResponse.flaggedSections)
    ) {
      aiResponse.flaggedSections.forEach((section: any) => {
        if (section && section.reason && typeof section.reason === "string") {
          patterns.push(section.reason);
        }
      });
    }

    // Extract patterns from techniques
    if (aiResponse.techniques && Array.isArray(aiResponse.techniques)) {
      patterns.push(
        ...aiResponse.techniques.map((tech: string) => `Technique: ${tech}`)
      );
    }

    return [...new Set(patterns)]; // Remove duplicates
  }

  /**
   * Save analysis results to database
   */
  private async saveAnalysisResults(
    submissionId: string,
    analysisTypes: AnalysisType[],
    result: Partial<IAnalysisResult>
  ): Promise<void> {
    try {
      for (const analysisType of analysisTypes) {
        // Find existing analysis record
        const existingAnalysis = await AnalysisResult.findOne({
          submissionId,
          analysisType,
        });

        if (existingAnalysis) {
          // Update existing record
          Object.assign(existingAnalysis, result);
          existingAnalysis.status = AnalysisStatus.COMPLETED;
          await existingAnalysis.save();
        } else {
          // Create new record if none exists
          const newAnalysis = new AnalysisResult({
            submissionId: new mongoose.Types.ObjectId(submissionId),
            ...result,
            analysisType,
          });
          await newAnalysis.save();
        }
      }
    } catch (error: any) {
      console.error("Failed to save analysis results:", error);
      throw new Error("Failed to save analysis results to database");
    }
  }

  /**
   * Save analysis error to database
   */
  private async saveAnalysisError(
    submissionId: string,
    analysisTypes: AnalysisType[],
    errorMessage: string,
    processingTime: number
  ): Promise<void> {
    try {
      for (const analysisType of analysisTypes) {
        let existingAnalysis = await AnalysisResult.findOne({
          submissionId,
          analysisType,
        });

        if (existingAnalysis) {
          existingAnalysis.status = AnalysisStatus.FAILED;
          existingAnalysis.errorMessage = errorMessage;
          await existingAnalysis.save();
        } else {
          // Create failed analysis record
          const failedAnalysis = new AnalysisResult({
            submissionId: new mongoose.Types.ObjectId(submissionId),
            analysisType,
            status: AnalysisStatus.FAILED,
            confidence: 0,
            isParaphrased: false,
            similarityScore: 0,
            integrityRisk: IntegrityRisk.LOW,
            detectedTechniques: [],
            originalSources: [],
            suspiciousPatterns: [],
            aiResponse: {
              rawResponse: "",
              modelUsed: this.aiConfig.openaiConfig.model,
              tokensUsed: 0,
              responseTime: 0,
            },
            explanation: "",
            recommendations: [],
            flaggedSections: [],
            processedAt: new Date(),
            processingTime,
            errorMessage,
          });
          await failedAnalysis.save();
        }
      }
    } catch (error: any) {
      console.error("Failed to save analysis error:", error);
    }
  }

  /**
   * Check for existing analysis
   */
  private async checkExistingAnalysis(
    submissionId: string,
    analysisTypes: AnalysisType[]
  ): Promise<{ hasExisting: boolean; message?: string }> {
    try {
      const existingAnalyses = await AnalysisResult.find({
        submissionId,
        analysisType: { $in: analysisTypes },
        status: {
          $in: [
            AnalysisStatus.PENDING,
            AnalysisStatus.PROCESSING,
            AnalysisStatus.COMPLETED,
          ],
        },
      });

      if (existingAnalyses.length > 0) {
        const statuses = existingAnalyses.map((a) => a.status);

        if (statuses.includes(AnalysisStatus.COMPLETED)) {
          return {
            hasExisting: true,
            message:
              "Analysis already completed for this submission. Use reanalyze if you want to run again.",
          };
        }

        if (statuses.includes(AnalysisStatus.PROCESSING)) {
          return {
            hasExisting: true,
            message: "Analysis is currently in progress for this submission.",
          };
        }

        if (statuses.includes(AnalysisStatus.PENDING)) {
          return {
            hasExisting: true,
            message: "Analysis is already queued for this submission.",
          };
        }
      }

      return { hasExisting: false };
    } catch (error: any) {
      console.error("Error checking existing analysis:", error);
      return { hasExisting: false };
    }
  }

  /**
   * Validate submission exists
   */
  private async validateSubmissionExists(
    submissionId: string
  ): Promise<ServiceResponse<boolean>> {
    try {
      if (!mongoose.Types.ObjectId.isValid(submissionId)) {
        return {
          success: false,
          error: "Invalid submission ID format",
          statusCode: 400,
        };
      }

      // In production, you would check your actual Submission model:
      // const Submission = mongoose.model('Submission');
      // const submission = await Submission.findById(submissionId);
      // if (!submission) {
      //   return { success: false, error: 'Submission not found', statusCode: 404 };
      // }

      return {
        success: true,
        data: true,
        message: "Submission exists",
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Failed to validate submission",
        statusCode: 500,
      };
    }
  }

  /**
   * Get submission data
   */
  private async getSubmissionData(
    submissionId: string
  ): Promise<ServiceResponse<ISubmission>> {
    try {
      // In production, you would fetch from your actual Submission model:
      // const Submission = mongoose.model('Submission');
      // const submission = await Submission.findById(submissionId)
      //   .populate('assignmentId', 'title maxScore')
      //   .populate('studentId', 'profile email')
      //   .exec();

      // if (!submission) {
      //   return {
      //     success: false,
      //     error: 'Submission not found',
      //     statusCode: 404
      //   };
      // }

      // For now, create a mock submission with sample text
      const mockSubmission: ISubmission = {
        _id: new mongoose.Types.ObjectId(submissionId),
        submissionText: `This is a sample submission text for analysis. The content discusses various academic topics and demonstrates different writing styles. Students often need to write essays that show their understanding of complex subjects while maintaining originality in their work.`,
        submissionFiles: [],
        assignmentId: new mongoose.Types.ObjectId(),
        studentId: new mongoose.Types.ObjectId(),
        submittedAt: new Date(),
        isLate: false,
        status: "submitted",
      };

      return {
        success: true,
        data: mockSubmission,
        message: "Submission data retrieved successfully",
      };
    } catch (error: any) {
      console.error("Error getting submission data:", error);
      return {
        success: false,
        error: error.message || "Failed to get submission data",
        statusCode: 500,
      };
    }
  }

  /**
   * Validate text for analysis
   */
  private validateTextForAnalysis(text: string): {
    isValid: boolean;
    reason?: string;
  } {
    const trimmedText = text.trim();

    if (trimmedText.length < this.MIN_TEXT_LENGTH) {
      return {
        isValid: false,
        reason: `Text is too short for analysis (minimum ${this.MIN_TEXT_LENGTH} characters, got ${trimmedText.length})`,
      };
    }

    if (trimmedText.length > this.MAX_TEXT_LENGTH) {
      return {
        isValid: false,
        reason: `Text is too long for analysis (maximum ${this.MAX_TEXT_LENGTH} characters, got ${trimmedText.length})`,
      };
    }

    // Check for minimum word count
    const wordCount = trimmedText
      .split(/\s+/)
      .filter((word) => word.length > 0).length;
    if (wordCount < 10) {
      return {
        isValid: false,
        reason: `Text contains too few words for analysis (minimum 10 words, got ${wordCount})`,
      };
    }

    return { isValid: true };
  }

  /**
   * Validate analysis options
   */
  private validateAnalysisOptions(options: AnalysisOptions): {
    isValid: boolean;
    error?: string;
  } {
    if (typeof options !== "object" || options === null) {
      return { isValid: false, error: "Analysis options must be an object" };
    }

    // Validate boolean options
    const booleanOptions = [
      "includeSourceDetection",
      "deepAnalysis",
      "compareWithDatabase",
      "extractTextFromFiles",
      "languageDetection",
    ];

    for (const option of booleanOptions) {
      if (
        option in options &&
        typeof options[option as keyof AnalysisOptions] !== "boolean"
      ) {
        return { isValid: false, error: `${option} must be a boolean value` };
      }
    }

    return { isValid: true };
  }

  // Validation helper methods
  private validateConfidence(confidence: number): number {
    const num = Number(confidence);
    if (isNaN(num)) return 0;
    return Math.max(0, Math.min(100, Math.round(num)));
  }

  private validateIntegrityRisk(risk: any): IntegrityRisk {
    const validRisks = Object.values(IntegrityRisk);
    if (
      typeof risk === "string" &&
      validRisks.includes(risk as IntegrityRisk)
    ) {
      return risk as IntegrityRisk;
    }
    return IntegrityRisk.LOW;
  }

  private validateTechniques(techniques: any[]): ParaphrasingTechnique[] {
    if (!Array.isArray(techniques)) return [];

    const validTechniques = Object.values(ParaphrasingTechnique);
    return techniques
      .filter(
        (t) =>
          typeof t === "string" &&
          validTechniques.includes(t as ParaphrasingTechnique)
      )
      .map((t) => t as ParaphrasingTechnique)
      .slice(0, 10); // Limit to 10 techniques
  }

  private validateSources(sources: any[]): string[] {
    if (!Array.isArray(sources)) return [];

    return sources
      .filter((s) => typeof s === "string" && s.trim().length > 0)
      .map((s) => String(s).trim())
      .slice(0, 10); // Limit to 10 sources
  }

  private validateExplanation(explanation: any): string {
    if (typeof explanation !== "string") return "";
    return String(explanation).trim().slice(0, 2000); // Limit to 2000 characters
  }

  private validateRecommendations(recommendations: any[]): string[] {
    if (!Array.isArray(recommendations)) return [];

    return recommendations
      .filter((r) => typeof r === "string" && r.trim().length > 0)
      .map((r) => String(r).trim())
      .slice(0, 10); // Limit to 10 recommendations
  }

  private validateFlaggedSections(sections: any[]): FlaggedSection[] {
    if (!Array.isArray(sections)) return [];

    return sections
      .filter(
        (s) =>
          typeof s === "object" &&
          s !== null &&
          typeof s.startIndex === "number" &&
          typeof s.endIndex === "number" &&
          s.startIndex >= 0 &&
          s.endIndex > s.startIndex
      )
      .map((s) => ({
        startIndex: Math.max(0, Number(s.startIndex)),
        endIndex: Math.max(0, Number(s.endIndex)),
        text: String(s.text || "").trim(),
        reason: String(s.reason || "").trim(),
        confidence: this.validateConfidence(s.confidence || 0),
        suggestedAction: String(s.suggestedAction || "").trim(),
      }))
      .slice(0, 20); // Limit to 20 flagged sections
  }

  /**
   * Get analysis statistics
   */
  public async getAnalysisStatistics(
    dateRange?: { startDate: Date; endDate: Date },
    filters?: { analysisType?: AnalysisType; integrityRisk?: IntegrityRisk }
  ): Promise<ServiceResponse<AnalysisStatistics>> {
    try {
      const matchQuery: any = {};

      if (dateRange) {
        matchQuery.createdAt = {
          $gte: dateRange.startDate,
          $lte: dateRange.endDate,
        };
      }

      if (filters?.analysisType) {
        matchQuery.analysisType = filters.analysisType;
      }

      if (filters?.integrityRisk) {
        matchQuery.integrityRisk = filters.integrityRisk;
      }

      const [basicStats, riskDistribution, typeDistribution, dailyStats] =
        await Promise.all([
          // Basic statistics
          AnalysisResult.aggregate([
            { $match: matchQuery },
            {
              $group: {
                _id: null,
                totalAnalyses: { $sum: 1 },
                completedAnalyses: {
                  $sum: {
                    $cond: [
                      { $eq: ["$status", AnalysisStatus.COMPLETED] },
                      1,
                      0,
                    ],
                  },
                },
                pendingAnalyses: {
                  $sum: {
                    $cond: [{ $eq: ["$status", AnalysisStatus.PENDING] }, 1, 0],
                  },
                },
                failedAnalyses: {
                  $sum: {
                    $cond: [{ $eq: ["$status", AnalysisStatus.FAILED] }, 1, 0],
                  },
                },
                averageConfidence: {
                  $avg: {
                    $cond: [
                      { $eq: ["$status", AnalysisStatus.COMPLETED] },
                      "$confidence",
                      null,
                    ],
                  },
                },
                averageProcessingTime: {
                  $avg: {
                    $cond: [
                      { $eq: ["$status", AnalysisStatus.COMPLETED] },
                      "$processingTime",
                      null,
                    ],
                  },
                },
                paraphrasedCount: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          { $eq: ["$status", AnalysisStatus.COMPLETED] },
                          "$isParaphrased",
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
                originalCount: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          { $eq: ["$status", AnalysisStatus.COMPLETED] },
                          { $not: "$isParaphrased" },
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
              },
            },
          ]),

          // Risk distribution
          AnalysisResult.aggregate([
            { $match: { ...matchQuery, status: AnalysisStatus.COMPLETED } },
            {
              $group: {
                _id: "$integrityRisk",
                count: { $sum: 1 },
              },
            },
          ]),

          // Analysis type distribution
          AnalysisResult.aggregate([
            { $match: matchQuery },
            {
              $group: {
                _id: "$analysisType",
                count: { $sum: 1 },
              },
            },
          ]),

          // Daily analysis count
          AnalysisResult.aggregate([
            { $match: matchQuery },
            {
              $group: {
                _id: {
                  $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
                },
                count: { $sum: 1 },
              },
            },
            { $sort: { _id: 1 } },
            { $limit: 30 }, // Last 30 days
          ]),
        ]);

      // Process results
      const stats = basicStats[0] || {
        totalAnalyses: 0,
        completedAnalyses: 0,
        pendingAnalyses: 0,
        failedAnalyses: 0,
        averageConfidence: 0,
        averageProcessingTime: 0,
        paraphrasedCount: 0,
        originalCount: 0,
      };

      // Process risk distribution
      const riskDist = {
        low: 0,
        medium: 0,
        high: 0,
        critical: 0,
      };

      riskDistribution.forEach((item) => {
        if (item._id && item._id in riskDist) {
          riskDist[item._id as keyof typeof riskDist] = item.count;
        }
      });

      // Process type distribution
      const typeDist: Record<string, number> = {};
      typeDistribution.forEach((item) => {
        typeDist[item._id] = item.count;
      });

      // Process daily stats
      const dailyAnalysisCount = dailyStats.map((item) => ({
        date: item._id,
        count: item.count,
      }));

      const analysisStatistics: AnalysisStatistics = {
        ...stats,
        riskDistribution: riskDist,
        analysisTypeDistribution: typeDist,
        dailyAnalysisCount,
      };

      return {
        success: true,
        data: analysisStatistics,
        message: "Analysis statistics retrieved successfully",
      };
    } catch (error: any) {
      console.error("Error getting analysis statistics:", error);
      return {
        success: false,
        error: error.message || "Failed to get analysis statistics",
        statusCode: 500,
      };
    }
  }

  /**
   * Reanalyze submission with different options
   */
  public async reanalyzeSubmission(
    submissionId: string,
    analysisTypes: AnalysisType[],
    options?: Partial<AnalysisOptions>
  ): Promise<
    ServiceResponse<{ jobId: string; estimatedCompletionTime: number }>
  > {
    try {
      // Validate submission exists
      const submissionValidation = await this.validateSubmissionExists(
        submissionId
      );
      if (!submissionValidation.success) {
        return {
          success: false,
          error: submissionValidation.error,
          statusCode: submissionValidation.statusCode,
        };
      }

      // Delete existing analysis results
      const deleteResult = await AnalysisResult.deleteMany({
        submissionId,
        analysisType: { $in: analysisTypes },
      });

      console.log(
        `🗑️ Deleted ${deleteResult.deletedCount} existing analysis results for reanalysis`
      );

      // Queue new analysis with high priority
      return await this.queueSubmissionAnalysis(
        submissionId,
        analysisTypes,
        "high",
        options
      );
    } catch (error: any) {
      console.error("Error reanalyzing submission:", error);
      return {
        success: false,
        error: error.message || "Failed to reanalyze submission",
        statusCode: 500,
      };
    }
  }

  /**
   * Cancel pending analysis
   */
  public async cancelAnalysis(
    submissionId: string
  ): Promise<ServiceResponse<boolean>> {
    try {
      // Find pending or processing analyses
      const pendingAnalyses = await AnalysisResult.find({
        submissionId,
        status: { $in: [AnalysisStatus.PENDING, AnalysisStatus.PROCESSING] },
      });

      if (pendingAnalyses.length === 0) {
        return {
          success: false,
          error: "No pending or processing analyses found for this submission",
          statusCode: 404,
        };
      }

      // Mark analyses as failed
      for (const analysis of pendingAnalyses) {
        analysis.status = AnalysisStatus.FAILED;
        analysis.errorMessage = "Analysis cancelled by user";
        await analysis.save();
      }

      // Try to cancel queue jobs (this would require job IDs which we don't store currently)
      // In a production system, you'd want to store job IDs in the analysis records

      return {
        success: true,
        data: true,
        message: `Cancelled ${pendingAnalyses.length} pending analyses`,
      };
    } catch (error: any) {
      console.error("Error cancelling analysis:", error);
      return {
        success: false,
        error: error.message || "Failed to cancel analysis",
        statusCode: 500,
      };
    }
  }

  /**
   * Get recent analyses
   */
  public async getRecentAnalyses(
    limit: number = 10,
    status?: AnalysisStatus
  ): Promise<ServiceResponse<IAnalysisResult[]>> {
    try {
      const query: any = {};
      if (status) {
        query.status = status;
      }

      const analyses = await AnalysisResult.find(query)
        .sort({ createdAt: -1 })
        .limit(Math.min(limit, 100)) // Cap at 100
        .lean()
        .exec();

      return {
        success: true,
        data: analyses as IAnalysisResult[],
        message: `Retrieved ${analyses.length} recent analyses`,
      };
    } catch (error: any) {
      console.error("Error getting recent analyses:", error);
      return {
        success: false,
        error: error.message || "Failed to get recent analyses",
        statusCode: 500,
      };
    }
  }

  /**
   * Get analyses by risk level
   */
  public async getAnalysesByRisk(
    riskLevel: IntegrityRisk,
    limit: number = 10
  ): Promise<ServiceResponse<IAnalysisResult[]>> {
    try {
      const analyses = await AnalysisResult.find({
        integrityRisk: riskLevel,
        status: AnalysisStatus.COMPLETED,
      })
        .sort({ confidence: -1, createdAt: -1 })
        .limit(Math.min(limit, 100))
        .lean()
        .exec();

      return {
        success: true,
        data: analyses as IAnalysisResult[],
        message: `Retrieved ${analyses.length} analyses with ${riskLevel} risk`,
      };
    } catch (error: any) {
      console.error("Error getting analyses by risk:", error);
      return {
        success: false,
        error: error.message || "Failed to get analyses by risk level",
        statusCode: 500,
      };
    }
  }

  /**
   * Health check for AI analysis service
   */
  public async healthCheck(): Promise<{
    healthy: boolean;
    services: {
      textExtractor: boolean;
      paraphrasingDetector: boolean;
      queue: boolean;
      database: boolean;
      openai: boolean;
    };
    performance: {
      averageProcessingTime: number;
      successRate: number;
      queueLength: number;
    };
    error?: string;
  }> {
    try {
      const [detectorHealth, queueHealth, aiConfigHealth] = await Promise.all([
        this.paraphrasingDetector.healthCheck(),
        this.queueService.healthCheck(),
        this.aiConfig.healthCheck(),
      ]);

      // Test database connection
      const dbHealth = mongoose.connection.readyState === 1;

      // Get performance metrics
      const performanceStats = await this.getPerformanceMetrics();

      const services = {
        textExtractor: true, // Text extractor doesn't have external dependencies
        paraphrasingDetector: detectorHealth.available,
        queue: queueHealth.healthy,
        database: dbHealth,
        openai: aiConfigHealth.openai,
      };

      const healthy = Object.values(services).every(
        (status) => status === true
      );

      return {
        healthy,
        services,
        performance: performanceStats,
        error: !healthy ? "Some services are unavailable" : undefined,
      };
    } catch (error: any) {
      console.error("Health check error:", error);
      return {
        healthy: false,
        services: {
          textExtractor: false,
          paraphrasingDetector: false,
          queue: false,
          database: false,
          openai: false,
        },
        performance: {
          averageProcessingTime: 0,
          successRate: 0,
          queueLength: 0,
        },
        error: error.message || "Health check failed",
      };
    }
  }

  /**
   * Get performance metrics
   */
  private async getPerformanceMetrics(): Promise<{
    averageProcessingTime: number;
    successRate: number;
    queueLength: number;
  }> {
    try {
      const [avgProcessingTime, successRate, queueStats] = await Promise.all([
        // Average processing time for completed analyses in last 24 hours
        AnalysisResult.aggregate([
          {
            $match: {
              status: AnalysisStatus.COMPLETED,
              processedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
            },
          },
          {
            $group: {
              _id: null,
              avgTime: { $avg: "$processingTime" },
            },
          },
        ]),

        // Success rate in last 24 hours
        AnalysisResult.aggregate([
          {
            $match: {
              createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
            },
          },
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              successful: {
                $sum: {
                  $cond: [{ $eq: ["$status", AnalysisStatus.COMPLETED] }, 1, 0],
                },
              },
            },
          },
        ]),

        // Queue statistics
        this.queueService.getQueueStats(),
      ]);

      const avgTime = avgProcessingTime[0]?.avgTime || 0;
      const successData = successRate[0];
      const successRateValue = successData
        ? (successData.successful / successData.total) * 100
        : 100;
      const queueLength = queueStats.waiting + queueStats.active;

      return {
        averageProcessingTime: Math.round(avgTime),
        successRate: Math.round(successRateValue),
        queueLength,
      };
    } catch (error: any) {
      console.error("Error getting performance metrics:", error);
      return {
        averageProcessingTime: 0,
        successRate: 0,
        queueLength: 0,
      };
    }
  }

  /**
   * Cleanup old analysis results
   */
  public async cleanupOldAnalyses(
    olderThanDays: number = 90
  ): Promise<ServiceResponse<{ deletedCount: number }>> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      const deleteResult = await AnalysisResult.deleteMany({
        createdAt: { $lt: cutoffDate },
        status: { $in: [AnalysisStatus.COMPLETED, AnalysisStatus.FAILED] },
      });

      console.log(
        `🧹 Cleaned up ${deleteResult.deletedCount} old analysis results`
      );

      return {
        success: true,
        data: { deletedCount: deleteResult.deletedCount },
        message: `Cleaned up ${deleteResult.deletedCount} analysis results older than ${olderThanDays} days`,
      };
    } catch (error: any) {
      console.error("Error cleaning up old analyses:", error);
      return {
        success: false,
        error: error.message || "Failed to cleanup old analyses",
        statusCode: 500,
      };
    }
  }
}

export default AIAnalysisService;
