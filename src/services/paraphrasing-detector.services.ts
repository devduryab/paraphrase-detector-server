import OpenAI from "openai";
import {
  OpenAIAnalysisRequest,
  OpenAIAnalysisResponse,
  AnalysisType,
  ServiceResponse,
  ParaphrasingTechnique,
  IntegrityRisk,
  FlaggedSection,
} from "../types/analysis.types";
import AIConfig from "../config/ai.config";

interface RateLimitState {
  requestCount: number;
  windowStart: number;
  isLimited: boolean;
}

class ParaphrasingDetectorService {
  private static instance: ParaphrasingDetectorService;
  private aiConfig: AIConfig;
  private openai: OpenAI;
  private rateLimitState: RateLimitState;

  private constructor() {
    this.aiConfig = AIConfig.getInstance();
    this.openai = this.aiConfig.openai;
    this.rateLimitState = {
      requestCount: 0,
      windowStart: Date.now(),
      isLimited: false,
    };
  }

  public static getInstance(): ParaphrasingDetectorService {
    if (!ParaphrasingDetectorService.instance) {
      ParaphrasingDetectorService.instance = new ParaphrasingDetectorService();
    }
    return ParaphrasingDetectorService.instance;
  }

  /**
   * Main method to analyze text for paraphrasing
   */
  public async analyzeText(
    request: OpenAIAnalysisRequest
  ): Promise<ServiceResponse<OpenAIAnalysisResponse>> {
    try {
      // Check rate limiting
      const rateLimitCheck = this.checkRateLimit();
      if (!rateLimitCheck.allowed) {
        return {
          success: false,
          error: `Rate limit exceeded. Try again in ${rateLimitCheck.retryAfter} seconds`,
          statusCode: 429,
        };
      }

      // Validate input
      const validation = this.validateInput(request);
      if (!validation.isValid) {
        return {
          success: false,
          error: validation.error,
          statusCode: 400,
        };
      }

      // Prepare the prompt
      const prompt = this.buildAnalysisPrompt(request);

      // Make OpenAI API call
      const startTime = Date.now();
      const completion = await this.callOpenAI(prompt, request.options);
      const responseTime = Date.now() - startTime;

      // Update rate limit counter
      this.updateRateLimit();

      // Parse and validate response
      const analysisResult = this.parseOpenAIResponse(
        completion.choices?.[0]?.message?.content || ""
      );

      if (!analysisResult.success || !analysisResult.data) {
        return {
          success: false,
          error: analysisResult.error || "Failed to parse AI response",
          statusCode: 422,
        };
      }

      // Add metadata to response
      const response: OpenAIAnalysisResponse = {
        ...analysisResult.data,
        // Add additional metadata if needed
      };

      return {
        success: true,
        data: response,
        message: "Analysis completed successfully",
      };
    } catch (error: any) {
      console.error("ParaphrasingDetectorService error:", error);

      // Handle specific OpenAI errors
      if (error.status === 429) {
        return {
          success: false,
          error: "OpenAI API rate limit exceeded. Please try again later.",
          statusCode: 429,
        };
      }

      if (error.status === 401) {
        return {
          success: false,
          error: "OpenAI API authentication failed. Please check your API key.",
          statusCode: 401,
        };
      }

      return {
        success: false,
        error: error.message || "AI analysis failed",
        statusCode: 500,
      };
    }
  }

  /**
   * Analyze multiple text segments
   */
  public async analyzeBatch(
    requests: OpenAIAnalysisRequest[]
  ): Promise<ServiceResponse<OpenAIAnalysisResponse[]>> {
    try {
      const results: OpenAIAnalysisResponse[] = [];
      const errors: string[] = [];

      for (let i = 0; i < requests.length; i++) {
        const request = requests[i];

        if (!request) {
          errors.push(`Segment ${i + 1}: Invalid request`);
          continue;
        }

        try {
          const result = await this.analyzeText(request);

          if (result.success && result.data) {
            results.push(result.data);
          } else {
            errors.push(`Segment ${i + 1}: ${result.error}`);
          }

          // Add delay between requests to respect rate limits
          if (i < requests.length - 1) {
            await this.delay(1000); // 1 second delay
          }
        } catch (error: any) {
          errors.push(`Segment ${i + 1}: ${error.message}`);
        }
      }

      if (results.length === 0) {
        return {
          success: false,
          error: `Failed to analyze any segments. Errors: ${errors.join("; ")}`,
          statusCode: 422,
        };
      }

      return {
        success: true,
        data: results,
        message: `Successfully analyzed ${results.length} out of ${requests.length} segments`,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Batch analysis failed",
        statusCode: 500,
      };
    }
  }

  /**
   * Build the analysis prompt based on analysis type
   */
  private buildAnalysisPrompt(request: OpenAIAnalysisRequest): string {
    const basePrompt = this.aiConfig.getAnalysisPrompt(request.analysisType);

    return `${basePrompt}

Text to analyze:
"${request.text}"

Please analyze this text carefully and respond with valid JSON only. Do not include any explanatory text outside the JSON structure.`;
  }

  /**
   * Call OpenAI API with proper configuration
   */
  private async callOpenAI(
    prompt: string,
    options?: OpenAIAnalysisRequest["options"]
  ): Promise<OpenAI.Chat.Completions.ChatCompletion> {
    const requestOptions: OpenAI.Chat.Completions.ChatCompletionCreateParams = {
      model: this.aiConfig.openaiConfig.model,
      messages: [
        {
          role: "system",
          content:
            "You are an expert AI assistant specialized in detecting paraphrased content and analyzing academic integrity. Always respond with valid JSON format only.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: options?.maxTokens || this.aiConfig.openaiConfig.maxTokens,
      temperature:
        options?.temperature || this.aiConfig.openaiConfig.temperature,
      response_format: { type: "json_object" }, // Ensure JSON response
    };

    return await this.openai.chat.completions.create(requestOptions);
  }

  /**
   * Parse and validate OpenAI response
   */
  private parseOpenAIResponse(
    responseText: string
  ): ServiceResponse<OpenAIAnalysisResponse> {
    try {
      // Clean the response text
      const cleanedResponse = responseText.trim();

      // Parse JSON
      const parsed = JSON.parse(cleanedResponse);

      // Validate required fields
      const validation = this.validateOpenAIResponse(parsed);
      if (!validation.isValid) {
        return {
          success: false,
          error: `Invalid AI response format: ${validation.error}`,
          statusCode: 422,
        };
      }

      // Convert and sanitize the response
      const response: OpenAIAnalysisResponse = {
        confidence: Math.max(0, Math.min(100, Number(parsed.confidence) || 0)),
        isParaphrased: Boolean(parsed.isParaphrased),
        techniques: this.sanitizeTechniques(parsed.techniques || []),
        integrityRisk: this.sanitizeIntegrityRisk(parsed.integrityRisk),
        explanation: String(parsed.explanation || "").trim(),
        recommendations: this.sanitizeRecommendations(
          parsed.recommendations || []
        ),
        flaggedSections: this.sanitizeFlaggedSections(
          parsed.flaggedSections || []
        ),
        similarityScore: Math.max(
          0,
          Math.min(100, Number(parsed.similarityScore) || 0)
        ),
        originalSources: this.sanitizeOriginalSources(
          parsed.originalSources || []
        ),
      };

      return {
        success: true,
        data: response,
      };
    } catch (error: any) {
      console.error("Failed to parse OpenAI response:", error);
      return {
        success: false,
        error: "Failed to parse AI response as valid JSON",
        statusCode: 422,
      };
    }
  }

  /**
   * Validate OpenAI response structure
   */
  private validateOpenAIResponse(parsed: any): {
    isValid: boolean;
    error?: string;
  } {
    if (typeof parsed !== "object" || parsed === null) {
      return { isValid: false, error: "Response is not a valid object" };
    }

    const requiredFields = [
      "confidence",
      "isParaphrased",
      "integrityRisk",
      "explanation",
    ];

    for (const field of requiredFields) {
      if (!(field in parsed)) {
        return { isValid: false, error: `Missing required field: ${field}` };
      }
    }

    if (
      typeof parsed.confidence !== "number" &&
      typeof parsed.confidence !== "string"
    ) {
      return { isValid: false, error: "Confidence must be a number" };
    }

    if (typeof parsed.isParaphrased !== "boolean") {
      return { isValid: false, error: "isParaphrased must be a boolean" };
    }

    return { isValid: true };
  }

  /**
   * Sanitize techniques array
   */
  private sanitizeTechniques(techniques: any[]): ParaphrasingTechnique[] {
    const validTechniques = Object.values(ParaphrasingTechnique);
    return techniques
      .filter(
        (t) =>
          typeof t === "string" &&
          validTechniques.includes(t as ParaphrasingTechnique)
      )
      .map((t) => t as ParaphrasingTechnique);
  }

  /**
   * Sanitize integrity risk
   */
  private sanitizeIntegrityRisk(risk: any): IntegrityRisk {
    const validRisks = Object.values(IntegrityRisk);
    if (
      typeof risk === "string" &&
      validRisks.includes(risk as IntegrityRisk)
    ) {
      return risk as IntegrityRisk;
    }
    return IntegrityRisk.LOW; // Default fallback
  }

  /**
   * Sanitize recommendations array
   */
  private sanitizeRecommendations(recommendations: any[]): string[] {
    return recommendations
      .filter((r) => typeof r === "string" && r.trim().length > 0)
      .map((r) => String(r).trim())
      .slice(0, 10); // Limit to 10 recommendations
  }

  /**
   * Sanitize flagged sections
   */
  private sanitizeFlaggedSections(sections: any[]): FlaggedSection[] {
    return sections
      .filter(
        (s) =>
          typeof s === "object" &&
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
        confidence: Math.max(0, Math.min(100, Number(s.confidence) || 0)),
        suggestedAction: String(s.suggestedAction || "").trim(),
      }))
      .slice(0, 20); // Limit to 20 flagged sections
  }

  /**
   * Sanitize original sources
   */
  private sanitizeOriginalSources(sources: any[]): string[] {
    return sources
      .filter((s) => typeof s === "string" && s.trim().length > 0)
      .map((s) => String(s).trim())
      .slice(0, 10); // Limit to 10 sources
  }

  /**
   * Validate input request
   */
  private validateInput(request: OpenAIAnalysisRequest): {
    isValid: boolean;
    error?: string;
  } {
    if (!request.text || typeof request.text !== "string") {
      return { isValid: false, error: "Text is required and must be a string" };
    }

    if (request.text.trim().length < 10) {
      return {
        isValid: false,
        error: "Text must be at least 10 characters long",
      };
    }

    if (request.text.length > 50000) {
      return {
        isValid: false,
        error: "Text is too long (maximum 50,000 characters)",
      };
    }

    if (!Object.values(AnalysisType).includes(request.analysisType)) {
      return { isValid: false, error: "Invalid analysis type" };
    }

    return { isValid: true };
  }

  /**
   * Check rate limiting
   */
  private checkRateLimit(): { allowed: boolean; retryAfter?: number } {
    const now = Date.now();
    const windowMs = 60000; // 1 minute window
    const maxRequests = this.aiConfig.rateLimiting.openaiRequestsPerMinute;

    // Reset window if expired
    if (now - this.rateLimitState.windowStart > windowMs) {
      this.rateLimitState = {
        requestCount: 0,
        windowStart: now,
        isLimited: false,
      };
    }

    // Check if limit exceeded
    if (this.rateLimitState.requestCount >= maxRequests) {
      const retryAfter = Math.ceil(
        (windowMs - (now - this.rateLimitState.windowStart)) / 1000
      );
      return {
        allowed: false,
        retryAfter,
      };
    }

    return { allowed: true };
  }

  /**
   * Update rate limit counter
   */
  private updateRateLimit(): void {
    this.rateLimitState.requestCount++;
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Health check for OpenAI service
   */
  public async healthCheck(): Promise<{ available: boolean; error?: string }> {
    try {
      await this.openai.models.list();
      return { available: true };
    } catch (error: any) {
      return {
        available: false,
        error: error.message || "OpenAI service unavailable",
      };
    }
  }

  /**
   * Get service statistics
   */
  public getServiceStats(): {
    rateLimitStatus: RateLimitState;
    configuration: {
      model: string;
      maxTokens: number;
      temperature: number;
    };
  } {
    return {
      rateLimitStatus: { ...this.rateLimitState },
      configuration: {
        model: this.aiConfig.openaiConfig.model,
        maxTokens: this.aiConfig.openaiConfig.maxTokens,
        temperature: this.aiConfig.openaiConfig.temperature,
      },
    };
  }
}

export default ParaphrasingDetectorService;
