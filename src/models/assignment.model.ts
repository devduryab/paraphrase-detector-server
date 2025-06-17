// models/assignment.model.ts
import mongoose, { Schema } from "mongoose";
import {
  IAssignment,
  ISubmission,
  AssignmentType,
  AssignmentStatus,
  SubmissionStatus,
} from "../types/assignment.types";

// Assignment Schema
const AssignmentSchema = new Schema<IAssignment>(
  {
    title: {
      type: String,
      required: [true, "Assignment title is required"],
      trim: true,
      maxlength: [200, "Title cannot exceed 200 characters"],
    },
    description: {
      type: String,
      required: [true, "Assignment description is required"],
      trim: true,
      maxlength: [1000, "Description cannot exceed 1000 characters"],
    },
    instructions: {
      type: String,
      trim: true,
      maxlength: [2000, "Instructions cannot exceed 2000 characters"],
    },
    courseId: {
      type: Schema.Types.ObjectId,
      ref: "Course",
      required: [true, "Course ID is required"],
    },
    facultyId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Faculty ID is required"],
    },
    assignmentType: {
      type: String,
      enum: Object.values(AssignmentType),
      default: AssignmentType.BOTH,
      required: true,
    },
    maxScore: {
      type: Number,
      required: [true, "Maximum score is required"],
      min: [1, "Maximum score must be at least 1"],
      max: [1000, "Maximum score cannot exceed 1000"],
    },
    dueDate: {
      type: Date,
      required: [true, "Due date is required"],
      validate: {
        validator: function (value: Date) {
          return value > new Date();
        },
        message: "Due date must be in the future",
      },
    },
    allowLateSubmission: {
      type: Boolean,
      default: false,
    },
    latePenalty: {
      type: Number,
      min: [0, "Late penalty cannot be negative"],
      max: [100, "Late penalty cannot exceed 100%"],
      default: 0,
    },
    attachmentFiles: [
      {
        type: String,
        trim: true,
      },
    ],
    status: {
      type: String,
      enum: Object.values(AssignmentStatus),
      default: AssignmentStatus.DRAFT,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: function (doc, ret) {
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Indexes for better query performance
AssignmentSchema.index({ courseId: 1 });
AssignmentSchema.index({ facultyId: 1 });
AssignmentSchema.index({ status: 1 });
AssignmentSchema.index({ dueDate: 1 });
AssignmentSchema.index({ createdAt: -1 });

// Pre-save middleware
AssignmentSchema.pre("save", function (next) {
  // If late submission is not allowed, set late penalty to 0
  if (!this.allowLateSubmission) {
    this.latePenalty = 0;
  }
  next();
});

// Submission Schema
const SubmissionSchema = new Schema<ISubmission>(
  {
    assignmentId: {
      type: Schema.Types.ObjectId,
      ref: "Assignment",
      required: [true, "Assignment ID is required"],
    },
    studentId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Student ID is required"],
    },
    submissionText: {
      type: String,
      trim: true,
      maxlength: [5000, "Submission text cannot exceed 5000 characters"],
    },
    submissionFiles: [
      {
        type: String,
        trim: true,
      },
    ],
    submittedAt: {
      type: Date,
      default: Date.now,
    },
    isLate: {
      type: Boolean,
      default: false,
    },
    grade: {
      type: Number,
      min: [0, "Grade cannot be negative"],
      validate: {
        validator: async function (value: number) {
          if (value !== undefined) {
            // Get the assignment to check max score
            const assignment = await mongoose
              .model("Assignment")
              .findById(this.assignmentId);
            return assignment ? value <= assignment.maxScore : true;
          }
          return true;
        },
        message: "Grade cannot exceed assignment's maximum score",
      },
    },
    feedback: {
      type: String,
      trim: true,
      maxlength: [1000, "Feedback cannot exceed 1000 characters"],
    },
    gradedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    gradedAt: {
      type: Date,
    },
    status: {
      type: String,
      enum: Object.values(SubmissionStatus),
      default: SubmissionStatus.SUBMITTED,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: function (doc, ret) {
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Indexes for better query performance
SubmissionSchema.index({ assignmentId: 1 });
SubmissionSchema.index({ studentId: 1 });
SubmissionSchema.index({ status: 1 });
SubmissionSchema.index({ submittedAt: -1 });
SubmissionSchema.index({ isLate: 1 });

// Compound indexes
SubmissionSchema.index({ assignmentId: 1, studentId: 1 }, { unique: true }); // One submission per student per assignment

// Pre-save middleware for submissions
SubmissionSchema.pre("save", async function (next) {
  try {
    // Check if submission is late
    const assignment = await mongoose
      .model("Assignment")
      .findById(this.assignmentId);
    if (assignment && this.submittedAt > assignment.dueDate) {
      this.isLate = true;
      this.status = SubmissionStatus.LATE;
    }

    // Update status when graded
    if (this.grade !== undefined && this.gradedAt) {
      this.status = SubmissionStatus.GRADED;
    }

    next();
  } catch (error: any) {
    next(error);
  }
});

// Static methods for Assignment
AssignmentSchema.statics.getAssignmentStats = async function (
  facultyId?: string,
  courseId?: string
) {
  const matchConditions: any = {};
  if (facultyId)
    matchConditions.facultyId = new mongoose.Types.ObjectId(facultyId);
  if (courseId)
    matchConditions.courseId = new mongoose.Types.ObjectId(courseId);

  const stats = await this.aggregate([
    { $match: matchConditions },
    {
      $group: {
        _id: null,
        totalAssignments: { $sum: 1 },
        activeAssignments: {
          $sum: {
            $cond: [{ $eq: ["$status", AssignmentStatus.ACTIVE] }, 1, 0],
          },
        },
        draftAssignments: {
          $sum: { $cond: [{ $eq: ["$status", AssignmentStatus.DRAFT] }, 1, 0] },
        },
        archivedAssignments: {
          $sum: {
            $cond: [{ $eq: ["$status", AssignmentStatus.ARCHIVED] }, 1, 0],
          },
        },
      },
    },
  ]);

  return (
    stats[0] || {
      totalAssignments: 0,
      activeAssignments: 0,
      draftAssignments: 0,
      archivedAssignments: 0,
    }
  );
};

// Static methods for Submission
SubmissionSchema.statics.getSubmissionStats = async function (
  assignmentId?: string,
  studentId?: string
) {
  const matchConditions: any = {};
  if (assignmentId)
    matchConditions.assignmentId = new mongoose.Types.ObjectId(assignmentId);
  if (studentId)
    matchConditions.studentId = new mongoose.Types.ObjectId(studentId);

  const stats = await this.aggregate([
    { $match: matchConditions },
    {
      $group: {
        _id: null,
        totalSubmissions: { $sum: 1 },
        gradedSubmissions: {
          $sum: {
            $cond: [{ $eq: ["$status", SubmissionStatus.GRADED] }, 1, 0],
          },
        },
        lateSubmissions: {
          $sum: { $cond: ["$isLate", 1, 0] },
        },
        averageGrade: { $avg: "$grade" },
      },
    },
  ]);

  return (
    stats[0] || {
      totalSubmissions: 0,
      gradedSubmissions: 0,
      lateSubmissions: 0,
      averageGrade: 0,
    }
  );
};

// Create and export models
export const Assignment = mongoose.model<IAssignment>(
  "Assignment",
  AssignmentSchema
);
export const Submission = mongoose.model<ISubmission>(
  "Submission",
  SubmissionSchema
);
