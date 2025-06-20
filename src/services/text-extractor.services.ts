// services/text-extractor.services.ts - Fix for missing fileConfig

import mammoth from "mammoth";
import pdfParse from "pdf-parse";
import path from "path";
import { TextExtractionResult, ServiceResponse } from "../types/analysis.types";
import AIConfig from "../config/ai.config";

class TextExtractorService {
  private static instance: TextExtractorService;
  private aiConfig: AIConfig;
  
  // ADD: Default file configuration when AI is disabled
  private readonly defaultFileConfig = {
    maxFileSize: 10485760, // 10MB
    supportedFormats: ["pdf", "doc", "docx", "txt"],
    extractionTimeout: 60000,
    tempDirectory: "/tmp/ai-analysis",
  };

  private constructor() {
    this.aiConfig = AIConfig.getInstance();
  }

  public static getInstance(): TextExtractorService {
    if (!TextExtractorService.instance) {
      TextExtractorService.instance = new TextExtractorService();
    }
    return TextExtractorService.instance;
  }

  // ADD: Helper method to get file config
  private getFileConfig() {
    // Use AI config if available, otherwise use defaults
    return this.aiConfig.isEnabled && this.aiConfig.analysisConfig 
      ? {
          maxFileSize: this.aiConfig.analysisConfig.general?.maxFileSize || this.defaultFileConfig.maxFileSize,
          supportedFormats: this.aiConfig.analysisConfig.general?.supportedFormats || this.defaultFileConfig.supportedFormats,
          extractionTimeout: this.defaultFileConfig.extractionTimeout,
          tempDirectory: this.defaultFileConfig.tempDirectory,
        }
      : this.defaultFileConfig;
  }

  /**
   * Extract text from file buffer based on file type
   * @param fileBuffer - The file buffer to extract text from
   * @param fileName - Original filename to determine file type
   * @param fileSize - Size of the file in bytes
   * @returns Promise<ServiceResponse<TextExtractionResult>>
   */
  public async extractTextFromFile(
    fileBuffer: Buffer,
    fileName: string,
    fileSize: number
  ): Promise<ServiceResponse<TextExtractionResult>> {
    const startTime = Date.now();

    try {
      // CHANGE: Use helper method instead of direct access
      const fileConfig = this.getFileConfig();

      // Validate file size
      if (fileSize > fileConfig.maxFileSize) {
        return {
          success: false,
          error: `File size ${fileSize} bytes exceeds maximum allowed size of ${fileConfig.maxFileSize} bytes`,
          statusCode: 400,
        };
      }

      // Get file extension
      const fileExtension = this.getFileExtension(fileName).toLowerCase();

      // Validate file type
      if (!fileConfig.supportedFormats.includes(fileExtension)) {
        return {
          success: false,
          error: `File type '${fileExtension}' is not supported. Supported formats: ${fileConfig.supportedFormats.join(
            ", "
          )}`,
          statusCode: 400,
        };
      }

      // Extract text based on file type
      let extractionResult: TextExtractionResult;

      switch (fileExtension) {
        case "pdf":
          extractionResult = await this.extractFromPDF(
            fileBuffer,
            fileName,
            fileSize
          );
          break;
        case "docx":
          extractionResult = await this.extractFromDOCX(
            fileBuffer,
            fileName,
            fileSize
          );
          break;
        case "doc":
          extractionResult = await this.extractFromDOC(
            fileBuffer,
            fileName,
            fileSize
          );
          break;
        case "txt":
          extractionResult = await this.extractFromTXT(
            fileBuffer,
            fileName,
            fileSize
          );
          break;
        default:
          return {
            success: false,
            error: `Unsupported file type: ${fileExtension}`,
            statusCode: 400,
          };
      }

      // Validate extraction result
      if (
        !extractionResult.extractedText ||
        extractionResult.extractedText.trim().length === 0
      ) {
        return {
          success: false,
          error: "No text could be extracted from the file",
          statusCode: 422,
        };
      }

      // Calculate processing time
      extractionResult.metadata.extractionTime = Date.now() - startTime;

      return {
        success: true,
        data: extractionResult,
        message: "Text extracted successfully",
      };
    } catch (error: any) {
      console.error("Text extraction error:", error);
      return {
        success: false,
        error: error.message || "Failed to extract text from file",
        statusCode: 500,
      };
    }
  }

  /**
   * Extract text from PDF buffer
   */
  private async extractFromPDF(
    buffer: Buffer,
    fileName: string,
    fileSize: number
  ): Promise<TextExtractionResult> {
    try {
      const data = await pdfParse(buffer, {
        max: 0, // Parse all pages
        version: "v1.10.100",
      });

      return {
        extractedText: data.text.trim(),
        wordCount: this.countWords(data.text),
        characterCount: data.text.length,
        pageCount: data.numpages,
        extractionMethod: "parsing",
        confidence: this.calculateExtractionConfidence(data.text, "pdf"),
        metadata: {
          fileType: "pdf",
          fileSize: fileSize,
          extractionTime: 0, // Will be set by caller
        },
      };
    } catch (error: any) {
      throw new Error(`PDF extraction failed: ${error.message}`);
    }
  }

  /**
   * Extract text from DOCX buffer
   */
  private async extractFromDOCX(
    buffer: Buffer,
    fileName: string,
    fileSize: number
  ): Promise<TextExtractionResult> {
    try {
      const result = await mammoth.extractRawText({ buffer });

      const extractedText = result.value.trim();

      // Check for conversion warnings
      if (result.messages.length > 0) {
        console.warn(
          "DOCX extraction warnings:",
          result.messages.map((m) => m.message)
        );
      }

      return {
        extractedText,
        wordCount: this.countWords(extractedText),
        characterCount: extractedText.length,
        extractionMethod: "parsing",
        confidence: this.calculateExtractionConfidence(extractedText, "docx"),
        metadata: {
          fileType: "docx",
          fileSize: fileSize,
          extractionTime: 0,
        },
      };
    } catch (error: any) {
      throw new Error(`DOCX extraction failed: ${error.message}`);
    }
  }

  /**
   * Extract text from DOC buffer (legacy Word format)
   * Note: This is a simplified approach. For production, consider using a more robust solution
   */
  private async extractFromDOC(
    buffer: Buffer,
    fileName: string,
    fileSize: number
  ): Promise<TextExtractionResult> {
    try {
      // For DOC files, we'll try to extract using mammoth (may have limited support)
      // In production, you might want to use a specialized library or service
      const result = await mammoth.extractRawText({ buffer });

      const extractedText = result.value.trim();

      return {
        extractedText,
        wordCount: this.countWords(extractedText),
        characterCount: extractedText.length,
        extractionMethod: "parsing",
        confidence: this.calculateExtractionConfidence(extractedText, "doc"),
        metadata: {
          fileType: "doc",
          fileSize: fileSize,
          extractionTime: 0,
        },
      };
    } catch (error: any) {
      throw new Error(
        `DOC extraction failed: ${error.message}. Consider converting to DOCX format.`
      );
    }
  }

  /**
   * Extract text from TXT buffer
   */
  private async extractFromTXT(
    buffer: Buffer,
    fileName: string,
    fileSize: number
  ): Promise<TextExtractionResult> {
    try {
      const extractedText = buffer.toString("utf8").trim();

      return {
        extractedText,
        wordCount: this.countWords(extractedText),
        characterCount: extractedText.length,
        extractionMethod: "direct",
        confidence: 100, // TXT files have 100% confidence
        metadata: {
          fileType: "txt",
          fileSize: fileSize,
          extractionTime: 0,
        },
      };
    } catch (error: any) {
      throw new Error(`TXT extraction failed: ${error.message}`);
    }
  }

  /**
   * Extract text from multiple files
   */
  public async extractFromMultipleFiles(
    files: Array<{ buffer: Buffer; fileName: string; fileSize: number }>
  ): Promise<ServiceResponse<TextExtractionResult[]>> {
    try {
      const results: TextExtractionResult[] = [];
      const errors: string[] = [];

      for (const file of files) {
        const result = await this.extractTextFromFile(
          file.buffer,
          file.fileName,
          file.fileSize
        );

        if (result.success && result.data) {
          results.push(result.data);
        } else {
          errors.push(`${file.fileName}: ${result.error}`);
        }
      }

      if (results.length === 0) {
        return {
          success: false,
          error: `Failed to extract text from any files. Errors: ${errors.join(
            "; "
          )}`,
          statusCode: 422,
        };
      }

      return {
        success: true,
        data: results,
        message: `Successfully extracted text from ${results.length} out of ${files.length} files`,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Failed to process multiple files",
        statusCode: 500,
      };
    }
  }

  /**
   * Combine extracted text from multiple sources
   */
  public combineExtractedTexts(
    textResults: TextExtractionResult[],
    separator: string = "\n\n--- Document Separator ---\n\n"
  ): string {
    return textResults
      .map((result) => result.extractedText)
      .filter((text) => text && text.trim().length > 0)
      .join(separator);
  }

  /**
   * Validate if text is suitable for analysis
   */
  public validateTextForAnalysis(text: string): {
    isValid: boolean;
    reason?: string;
    wordCount: number;
    characterCount: number;
  } {
    const trimmedText = text.trim();
    const wordCount = this.countWords(trimmedText);
    const characterCount = trimmedText.length;

    // Check minimum length
    if (characterCount < 50) {
      return {
        isValid: false,
        reason:
          "Text is too short for meaningful analysis (minimum 50 characters)",
        wordCount,
        characterCount,
      };
    }

    // Check maximum length
    if (characterCount > 50000) {
      return {
        isValid: false,
        reason: "Text is too long for analysis (maximum 50,000 characters)",
        wordCount,
        characterCount,
      };
    }

    // Check for minimum word count
    if (wordCount < 10) {
      return {
        isValid: false,
        reason: "Text contains too few words for analysis (minimum 10 words)",
        wordCount,
        characterCount,
      };
    }

    return {
      isValid: true,
      wordCount,
      characterCount,
    };
  }

  /**
   * Utility: Get file extension from filename
   */
  private getFileExtension(fileName: string): string {
    return path.extname(fileName).substring(1);
  }

  /**
   * Utility: Count words in text
   */
  private countWords(text: string): number {
    return text
      .trim()
      .split(/\s+/)
      .filter((word) => word.length > 0).length;
  }

  /**
   * Utility: Calculate extraction confidence based on file type and content
   */
  private calculateExtractionConfidence(
    text: string,
    fileType: string
  ): number {
    let confidence = 100;

    // Base confidence by file type
    const baseConfidence: Record<string, number> = {
      txt: 100,
      docx: 95,
      pdf: 85,
      doc: 75,
    };

    confidence = baseConfidence[fileType] || 50;

    // Reduce confidence if text seems corrupted
    const corruptionIndicators = [
      /[^\x20-\x7E\n\r\t]/g, // Non-printable characters
      /\uFFFD/g, // Replacement characters
      /[^\w\s.,!?;:'"()-]/g, // Unusual characters
    ];

    let corruptionScore = 0;
    for (const indicator of corruptionIndicators) {
      const matches = text.match(indicator);
      if (matches) {
        corruptionScore += matches.length;
      }
    }

    // Reduce confidence based on corruption
    const corruptionPercentage = (corruptionScore / text.length) * 100;
    confidence = Math.max(20, confidence - corruptionPercentage * 2);

    return Math.round(confidence);
  }

  /**
   * Clean extracted text for analysis
   */
  public cleanTextForAnalysis(text: string): string {
    return (
      text
        // Normalize whitespace
        .replace(/\s+/g, " ")
        // Remove excessive line breaks
        .replace(/\n{3,}/g, "\n\n")
        // Remove special characters that might interfere with analysis
        .replace(/[\uFFFD\u0000-\u001F\u007F-\u009F]/g, "")
        // Trim
        .trim()
    );
  }

  /**
   * Get extraction statistics
   */
  public getExtractionStats(results: TextExtractionResult[]): {
    totalFiles: number;
    totalWordCount: number;
    totalCharacterCount: number;
    averageConfidence: number;
    fileTypeDistribution: Record<string, number>;
  } {
    const stats = {
      totalFiles: results.length,
      totalWordCount: results.reduce((sum, r) => sum + r.wordCount, 0),
      totalCharacterCount: results.reduce(
        (sum, r) => sum + r.characterCount,
        0
      ),
      averageConfidence:
        results.reduce((sum, r) => sum + r.confidence, 0) / results.length,
      fileTypeDistribution: {} as Record<string, number>,
    };

    // Calculate file type distribution
    results.forEach((result) => {
      const fileType = result.metadata.fileType;
      stats.fileTypeDistribution[fileType] =
        (stats.fileTypeDistribution[fileType] || 0) + 1;
    });

    return stats;
  }
}

export default TextExtractorService;