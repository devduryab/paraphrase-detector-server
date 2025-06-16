import { ICourse } from "../types/course.types";
import { Schema } from "mongoose";
import mongoose from "mongoose";

const CourseSchema = new Schema<ICourse>(
  {
    courseId: {
      type: String,
      unique: true,
    },
    name: {
      type: String,
      required: [true, "Course name is required"],
      trim: true,
      maxlength: [100, "Course name cannot exceed 100 characters"],
    },
    maxSlots: {
      type: Number,
      required: [true, "Maximum slots is required"],
      min: [1, "Maximum slots must be at least 1"],
      max: [1000, "Maximum slots cannot exceed 1000"],
    },
    assignedFaculty: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    ],
    enrolledStudents: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    status: {
      type: String,
      enum: ["active", "inactive", "full"],
      default: "active",
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
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

// Index for better query performance
CourseSchema.index({ courseId: 1 });
CourseSchema.index({ status: 1 });
CourseSchema.index({ assignedFaculty: 1 });

// Auto-generate courseId before saving
// Auto-generate courseId before saving
CourseSchema.pre("save", async function (next) {
  if (!this.courseId) {
    try {
      // Generate courseId based on course name
      const namePrefix = this.name
        .replace(/[^a-zA-Z]/g, "") // Remove non-letters
        .substring(0, 4) // Take first 4 letters
        .toUpperCase();

      // Find the last course with similar prefix using the Course model directly
      // Use mongoose.connection to query directly
      const CourseModel = mongoose.connection.collection("courses");
      const lastCourse = await CourseModel.findOne(
        { courseId: { $regex: `^${namePrefix}` } },
        { sort: { courseId: -1 } }
      );

      let nextNumber = 1;
      if (lastCourse && lastCourse.courseId) {
        const lastNumber = parseInt(
          lastCourse.courseId.replace(namePrefix, "")
        );
        nextNumber = isNaN(lastNumber) ? 1 : lastNumber + 1;
      }

      this.courseId = `${namePrefix}${nextNumber.toString().padStart(3, "0")}`;
      console.log("Generated courseId:", this.courseId); // Debug log
    } catch (error) {
      console.error("Error generating courseId:", error);
      return next(error as any);
    }
  }
  next();
});
// Auto-update status to 'full' when slots are filled
CourseSchema.pre("save", function (next) {
  if (
    this.enrolledStudents.length >= this.maxSlots &&
    this.status === "active"
  ) {
    this.status = "full";
  } else if (
    this.enrolledStudents.length < this.maxSlots &&
    this.status === "full"
  ) {
    this.status = "active";
  }
  next();
});

export const Course = mongoose.model<ICourse>("Course", CourseSchema);
