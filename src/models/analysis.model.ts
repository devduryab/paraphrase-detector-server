// src/models/analysis.model.ts

import mongoose, { Schema, Document } from "mongoose";
import {
  IAnalysisResult,
  AnalysisStatus,
  AnalysisType,
  IntegrityRisk,
  ParaphrasingTechnique,
  FlaggedSection,
} from "../types/analysis.types";

// Interface for the Mongoose document
export interface IAnalysisDocument extends IAnalysisResult, Document {
  _id: mongoose.Types.ObjectId;
}

// Schema for flagged sections
const FlaggedSectionSchema = new Schema<FlaggedSection>(
  {
    startIndex: {
      type: Number,
      required: true,
      min: 0,
    },
    endIndex: {
      type: Number,
      required: true,
      min: 0,
    },
    text: {
      type: String,
      required: true,
      trim: true,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
    },
    confidence: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    suggestedAction: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { _id: false }
);

// Schema for AI response metadata
const AIResponseSchema = new Schema(
  {
    rawResponse: {
      type: String,
      required: true,
    },
    modelUsed: {
      type: String,
      required: true,
      default: "gpt-3.5-turbo",
    },
    tokensUsed: {
      type: Number,
      min: 0,
    },
    responseTime: {
      type: Number,
      min: 0,
    },
  },
  { _id: false }
);

// Main Analysis Result Schema
const AnalysisResultSchema = new Schema<IAnalysisDocument>(
  {
    submissionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Submission",
      required: true,
      index: true,
    },

    analysisType: {
      type: String,
      enum: Object.values(AnalysisType),
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: Object.values(AnalysisStatus),
      required: true,
      default: AnalysisStatus.PENDING,
      index: true,
    },

    // Core analysis results
    confidence: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
      index: true,
    },

    isParaphrased: {
      type: Boolean,
      required: true,
      index: true,
    },

    similarityScore: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
      default: 0,
    },

    integrityRisk: {
      type: String,
      enum: Object.values(IntegrityRisk),
      required: true,
      index: true,
    },

    // Detailed findings
    detectedTechniques: [
      {
        type: String,
        enum: Object.values(ParaphrasingTechnique),
      },
    ],

    originalSources: [
      {
        type: String,
        trim: true,
      },
    ],

    suspiciousPatterns: [
      {
        type: String,
        trim: true,
      },
    ],

    // AI response data
    aiResponse: {
      type: AIResponseSchema,
      required: true,
    },

    // Recommendations and explanations
    explanation: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },

    recommendations: [
      {
        type: String,
        trim: true,
        maxlength: 500,
      },
    ],

    flaggedSections: [FlaggedSectionSchema],

    // Processing metadata
    processedAt: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },

    processingTime: {
      type: Number,
      required: true,
      min: 0,
    },

    errorMessage: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        delete ret.__v;
        return ret;
      },
    },
    toObject: {
      virtuals: true,
    },
  }
);

// Indexes for better query performance
AnalysisResultSchema.index(
  { submissionId: 1, analysisType: 1 },
  { unique: true }
);
AnalysisResultSchema.index({ status: 1, createdAt: -1 });
AnalysisResultSchema.index({ confidence: -1 });
AnalysisResultSchema.index({ integrityRisk: 1, isParaphrased: 1 });
AnalysisResultSchema.index({ processedAt: -1 });

// Virtual for getting risk level as number
AnalysisResultSchema.virtual("riskLevel").get(function () {
  const riskLevels = {
    [IntegrityRisk.LOW]: 1,
    [IntegrityRisk.MEDIUM]: 2,
    [IntegrityRisk.HIGH]: 3,
    [IntegrityRisk.CRITICAL]: 4,
  };
  return riskLevels[this.integrityRisk] || 1;
});

// Virtual for human-readable processing time
AnalysisResultSchema.virtual("processingTimeFormatted").get(function () {
  if (this.processingTime < 1000) {
    return `${this.processingTime}ms`;
  } else if (this.processingTime < 60000) {
    return `${(this.processingTime / 1000).toFixed(1)}s`;
  } else {
    return `${(this.processingTime / 60000).toFixed(1)}m`;
  }
});

// Virtual for overall risk score (combination of confidence and integrity risk)
AnalysisResultSchema.virtual("overallRiskScore").get(function (this: any) {
  const riskMultiplier = this.get("riskLevel");
  const confidenceScore = this.isParaphrased
    ? this.confidence
    : 100 - this.confidence;
  return Math.min(100, Math.round(confidenceScore * riskMultiplier * 0.25));
});

// Pre-save middleware
AnalysisResultSchema.pre("save", function (next) {
  // Ensure processedAt is set when status changes to completed
  if (this.status === AnalysisStatus.COMPLETED && !this.processedAt) {
    this.processedAt = new Date();
  }

  // Validate flagged sections indices
  if (this.flaggedSections && this.flaggedSections.length > 0) {
    for (const section of this.flaggedSections) {
      if (section.startIndex >= section.endIndex) {
        return next(
          new Error("Flagged section startIndex must be less than endIndex")
        );
      }
    }
  }

  next();
});

// Static methods
AnalysisResultSchema.statics = {
  // Find analysis by submission ID and type
  findBySubmissionAndType: function (
    submissionId: string,
    analysisType: AnalysisType
  ) {
    return this.findOne({ submissionId, analysisType });
  },

  // Get pending analyses
  findPending: function () {
    return this.find({ status: AnalysisStatus.PENDING }).sort({ createdAt: 1 });
  },

  // Get analyses by risk level
  findByRiskLevel: function (riskLevel: IntegrityRisk) {
    return this.find({ integrityRisk: riskLevel }).sort({ confidence: -1 });
  },

  // Get recent analyses
  findRecent: function (limit: number = 10) {
    return this.find({ status: AnalysisStatus.COMPLETED })
      .sort({ processedAt: -1 })
      .limit(limit)
      .populate("submissionId");
  },

  // Get analysis statistics
  getStats: async function () {
    const stats = await this.aggregate([
      {
        $group: {
          _id: null,
          totalAnalyses: { $sum: 1 },
          completedAnalyses: {
            $sum: {
              $cond: [{ $eq: ["$status", AnalysisStatus.COMPLETED] }, 1, 0],
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
          averageConfidence: { $avg: "$confidence" },
          averageProcessingTime: { $avg: "$processingTime" },
          paraphrasedCount: {
            $sum: { $cond: ["$isParaphrased", 1, 0] },
          },
          originalCount: {
            $sum: { $cond: [{ $not: "$isParaphrased" }, 1, 0] },
          },
        },
      },
    ]);

    return (
      stats[0] || {
        totalAnalyses: 0,
        completedAnalyses: 0,
        pendingAnalyses: 0,
        failedAnalyses: 0,
        averageConfidence: 0,
        averageProcessingTime: 0,
        paraphrasedCount: 0,
        originalCount: 0,
      }
    );
  },

  // Get risk distribution
  getRiskDistribution: async function () {
    const distribution = await this.aggregate([
      { $match: { status: AnalysisStatus.COMPLETED } },
      {
        $group: {
          _id: "$integrityRisk",
          count: { $sum: 1 },
        },
      },
    ]);

    const result = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    };

    distribution.forEach((item) => {
      result[item._id as keyof typeof result] = item.count;
    });

    return result;
  },
};

// Instance methods
AnalysisResultSchema.methods = {
  // Check if analysis is completed
  isCompleted: function () {
    return this.status === AnalysisStatus.COMPLETED;
  },

  // Check if analysis failed
  isFailed: function () {
    return this.status === AnalysisStatus.FAILED;
  },

  // Check if analysis is high risk
  isHighRisk: function () {
    return (
      this.integrityRisk === IntegrityRisk.HIGH ||
      this.integrityRisk === IntegrityRisk.CRITICAL
    );
  },

  // Get summary of analysis
  getSummary: function () {
    return {
      id: this._id,
      submissionId: this.submissionId,
      isParaphrased: this.isParaphrased,
      confidence: this.confidence,
      riskLevel: this.integrityRisk,
      overallScore: this.overallRiskScore,
      flaggedSectionsCount: this.flaggedSections?.length || 0,
      processedAt: this.processedAt,
      processingTime: this.processingTimeFormatted,
    };
  },

  // Mark as failed with error message
  markAsFailed: function (errorMessage: string) {
    this.status = AnalysisStatus.FAILED;
    this.errorMessage = errorMessage;
    this.processedAt = new Date();
    return this.save();
  },

  // Mark as completed with results
  markAsCompleted: function (results: Partial<IAnalysisResult>) {
    this.status = AnalysisStatus.COMPLETED;
    this.processedAt = new Date();

    // Update with provided results
    Object.assign(this, results);

    return this.save();
  },
};

// Create and export the model
export const AnalysisResult = mongoose.model<IAnalysisDocument>(
  "AnalysisResult",
  AnalysisResultSchema
);

// Export default
export default AnalysisResult;
