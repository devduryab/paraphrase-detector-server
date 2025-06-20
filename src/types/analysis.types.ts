
import { ObjectId, Types } from 'mongoose';

// Enums for analysis status and types
export enum AnalysisStatus {
  PENDING = 'pending',
  PROCESSING = 'processing', 
  COMPLETED = 'completed',
  FAILED = 'failed'
}

export enum AnalysisType {
  PARAPHRASING = 'paraphrasing',
  PLAGIARISM = 'plagiarism',
  SIMILARITY = 'similarity',
  CONTENT_ANALYSIS = 'content_analysis'
}

export enum IntegrityRisk {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum ParaphrasingTechnique {
  SYNONYM_REPLACEMENT = 'synonym_replacement',
  SENTENCE_RESTRUCTURING = 'sentence_restructuring',
  VOICE_CHANGE = 'voice_change',
  WORD_ORDER_CHANGE = 'word_order_change',
  PARAGRAPH_RESTRUCTURING = 'paragraph_restructuring',
  CONCEPTUAL_PARAPHRASING = 'conceptual_paraphrasing'
}

// Core interfaces
export interface IAnalysisResult {
  _id?: Types.ObjectId;
  submissionId: ObjectId;
  analysisType: AnalysisType;
  status: AnalysisStatus;
  
  // Core analysis results
  confidence: number; // 0-100
  isParaphrased: boolean;
  similarityScore: number; // 0-100
  integrityRisk: IntegrityRisk;
  
  // Detailed findings
  detectedTechniques: ParaphrasingTechnique[];
  originalSources: string[];
  suspiciousPatterns: string[];
  
  // AI response data
  aiResponse: {
    rawResponse: string;
    modelUsed: string;
    tokensUsed?: number;
    responseTime?: number;
  };
  
  // Recommendations and explanations
  explanation: string;
  recommendations: string[];
  flaggedSections: FlaggedSection[];
  
  // Processing metadata
  processedAt: Date;
  processingTime: number; // milliseconds
  errorMessage?: string;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

export interface FlaggedSection {
  startIndex: number;
  endIndex: number;
  text: string;
  reason: string;
  confidence: number;
  suggestedAction: string;
}

// Request/Response interfaces for API
export interface AnalysisRequest {
  submissionId: string;
  analysisTypes: AnalysisType[];
  priority?: 'low' | 'normal' | 'high';
  options?: AnalysisOptions;
}

export interface AnalysisOptions {
  includeSourceDetection: boolean;
  deepAnalysis: boolean;
  compareWithDatabase: boolean;
  extractTextFromFiles: boolean;
  languageDetection: boolean;
}

export interface AnalysisResponse {
  analysisId: string;
  submissionId: string;
  status: AnalysisStatus;
  results?: IAnalysisResult;
  estimatedCompletionTime?: number;
  queuePosition?: number;
}

// Queue job interfaces
export interface AnalysisJobData {
  submissionId: string;
  analysisTypes: AnalysisType[];
  priority: 'low' | 'normal' | 'high';
  options: AnalysisOptions;
  retryCount?: number;
  maxRetries?: number;
  analysisIds?: string[];
}

export interface AnalysisJobResult {
  success: boolean;
  analysisId?: string;
  error?: string;
  processingTime: number;
  results?: Partial<IAnalysisResult>;
}

// OpenAI specific interfaces
export interface OpenAIAnalysisRequest {
  text: string;
  analysisType: AnalysisType;
  options?: {
    maxTokens?: number;
    temperature?: number;
    includeExplanation?: boolean;
  };
}

export interface OpenAIAnalysisResponse {
  confidence: number;
  isParaphrased: boolean;
  techniques: ParaphrasingTechnique[];
  integrityRisk: IntegrityRisk;
  explanation: string;
  recommendations: string[];
  flaggedSections: FlaggedSection[];
  similarityScore?: number;
  originalSources?: string[];
}

// Text extraction interfaces
export interface TextExtractionResult {
  extractedText: string;
  wordCount: number;
  characterCount: number;
  pageCount?: number;
  extractionMethod: 'direct' | 'ocr' | 'parsing';
  confidence: number;
  metadata: {
    fileType: string;
    fileSize: number;
    extractionTime: number;
  };
}

// Database query interfaces
export interface AnalysisQuery {
  submissionId?: string;
  status?: AnalysisStatus;
  analysisType?: AnalysisType;
  integrityRisk?: IntegrityRisk;
  dateRange?: {
    startDate: Date;
    endDate: Date;
  };
  confidence?: {
    min: number;
    max: number;
  };
}

export interface AnalysisStats {
  totalAnalyses: number;
  completedAnalyses: number;
  pendingAnalyses: number;
  failedAnalyses: number;
  averageConfidence: number;
  averageProcessingTime: number;
  detectionRate: {
    paraphrased: number;
    original: number;
  };
  riskDistribution: {
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
}

// Service response interfaces
export interface ServiceResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  statusCode?: number;
}

// Export commonly used types
export type AnalysisResultDocument = IAnalysisResult & {
  _id: ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateAnalysisData = Omit<IAnalysisResult, '_id' | 'createdAt' | 'updatedAt'>;
export type UpdateAnalysisData = Partial<Omit<IAnalysisResult, '_id' | 'submissionId' | 'createdAt'>>;

// Validation interfaces
export interface AnalysisValidation {
  isValidSubmission: boolean;
  hasRequiredFields: boolean;
  isTextExtractable: boolean;
  errors: string[];
  warnings: string[];
}

// Configuration interfaces for different analysis types
export interface ParaphrasingAnalysisConfig {
  confidenceThreshold: number;
  enableDeepAnalysis: boolean;
  compareWithKnownSources: boolean;
  detectAIGenerated: boolean;
}

export interface PlagiarismAnalysisConfig {
  sourceCheckEnabled: boolean;
  internetSearchDepth: number;
  academicDatabaseCheck: boolean;
  minimumMatchLength: number;
}

export interface AnalysisConfiguration {
  paraphrasing: ParaphrasingAnalysisConfig;
  plagiarism: PlagiarismAnalysisConfig;
  general: {
    maxFileSize: number;
    supportedFormats: string[];
    defaultTimeout: number;
    retryAttempts: number;
  };
}