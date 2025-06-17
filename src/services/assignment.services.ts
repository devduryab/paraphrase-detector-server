import { Assignment, Submission } from "../models/assignment.model";
import { Course } from "../models/course.model";
import {
  AssignmentStats,
  AssignmentStatus,
  AssignmentWithDetails,
  CreateAssignmentData,
  CreateSubmissionData,
  GradeSubmissionData,
  SubmissionStatus,
  SubmissionWithDetails,
  UpdateAssignmentData,
} from "../types/assignment.types";
import { UserRole } from "../types/user.types";
import mongoose from "mongoose";

class AssignmentService {
  private static instance: AssignmentService;

  private constructor() {}

  public static getInstance(): AssignmentService {
    if (!AssignmentService.instance) {
      AssignmentService.instance = new AssignmentService();
    }
    return AssignmentService.instance;
  }

  // Create new assignment (Faculty only)
  public async createAssignment(
    assignmentData: CreateAssignmentData,
    facultyId: string
  ): Promise<AssignmentWithDetails> {
    try {
      // Verify faculty is assigned to the course
      const course = await Course.findOne({
        _id: assignmentData.courseId,
        assignedFaculty: facultyId,
      });

      if (!course) {
        throw new Error(
          "You are not authorized to create assignments for this course"
        );
      }

      const assignment = new Assignment({
        ...assignmentData,
        facultyId,
      });

      await assignment.save();

      // Return assignment with populated details
      return await this.getAssignmentById(assignment._id);
    } catch (error: any) {
      throw new Error(error.message || "Failed to create assignment");
    }
  }

  // Get all assignments with filters
  public async getAllAssignments(
    filters: {
      facultyId?: string;
      courseId?: string;
      status?: AssignmentStatus;
      search?: string;
    } = {},
    userRole: string,
    userId: string
  ): Promise<AssignmentWithDetails[]> {
    try {
      const query: any = {};

      // Apply role-based filtering
      if (userRole === UserRole.FACULTY) {
        query.facultyId = userId;
      } else if (userRole === UserRole.STUDENT) {
        // For students, only show assignments from courses they're enrolled in
        const enrolledCourses = await Course.find({
          enrolledStudents: userId,
        }).select("_id");
        query.courseId = { $in: enrolledCourses.map((course) => course._id) };
        query.status = AssignmentStatus.ACTIVE; // Students only see active assignments
      }

      // Apply additional filters
      if (filters.facultyId && userRole === UserRole.SUPER_ADMIN) {
        query.facultyId = filters.facultyId;
      }
      if (filters.courseId) {
        query.courseId = filters.courseId;
      }
      if (filters.status && userRole !== UserRole.STUDENT) {
        query.status = filters.status;
      }
      if (filters.search) {
        query.$or = [
          { title: { $regex: filters.search, $options: "i" } },
          { description: { $regex: filters.search, $options: "i" } },
        ];
      }

      const assignments = await Assignment.find(query)
        .populate("courseId", "name courseId")
        .populate("facultyId", "profile email")
        .sort({ createdAt: -1 });

      // Get submission counts for each assignment
      const assignmentsWithDetails = await Promise.all(
        assignments.map(async (assignment) => {
          const submissionCount = await Submission.countDocuments({
            assignmentId: assignment._id,
          });
          const gradedCount = await Submission.countDocuments({
            assignmentId: assignment._id,
            status: SubmissionStatus.GRADED,
          });

          const courseData = assignment.courseId as any;
          const facultyData = assignment.facultyId as any;

          return {
            ...assignment.toJSON(),
            course: {
              _id: courseData._id.toString(),
              name: courseData.name,
              courseId: courseData.courseId,
            },
            faculty: {
              _id: facultyData._id.toString(),
              profile: facultyData.profile,
              email: facultyData.email,
            },
            submissionCount,
            gradedCount,
          } as AssignmentWithDetails;
        })
      );

      return assignmentsWithDetails;
    } catch (error: any) {
      throw new Error(error.message || "Failed to fetch assignments");
    }
  }

  // Get assignment by ID with details         
  public async getAssignmentById(
    assignmentId: string
  ): Promise<AssignmentWithDetails> {
    try {
      const assignment = await Assignment.findById(assignmentId)
        .populate("courseId", "name courseId")
        .populate("facultyId", "profile email");

      if (!assignment) {
        throw new Error("Assignment not found");
      }

      const [submissionCount, gradedCount] = await Promise.all([
        Submission.countDocuments({ assignmentId: assignment._id }),
        Submission.countDocuments({
          assignmentId: assignment._id,
          status: SubmissionStatus.GRADED,
        }),
      ]);

      const courseData = assignment.courseId as any;
      const facultyData = assignment.facultyId as any;

      return {
        ...assignment.toJSON(),
        course: {
          _id: courseData._id.toString(),
          name: courseData.name,
          courseId: courseData.courseId,
        },
        faculty: {
          _id: facultyData._id.toString(),
          profile: facultyData.profile,
          email: facultyData.email,
        },
        submissionCount,
        gradedCount,
      } as AssignmentWithDetails;
    } catch (error: any) {
      throw new Error(error.message || "Failed to fetch assignment");
    }
  }

  // Update assignment (Faculty only)
  public async updateAssignment(
    assignmentId: string,
    updateData: UpdateAssignmentData,
    facultyId: string
  ): Promise<AssignmentWithDetails> {
    try {
      const assignment = await Assignment.findOne({
        _id: assignmentId,
        facultyId: facultyId,
      });

      if (!assignment) {
        throw new Error(
          "Assignment not found or you're not authorized to update it"
        );
      }

      // Check if there are submissions before allowing certain changes
      const hasSubmissions = await Submission.countDocuments({
        assignmentId: assignmentId,
      });

      if (hasSubmissions > 0) {
        // Restrict certain changes if submissions exist
        if (
          updateData.maxScore &&
          updateData.maxScore !== assignment.maxScore
        ) {
          throw new Error(
            "Cannot change max score after submissions have been made"
          );
        }
        if (
          updateData.assignmentType &&
          updateData.assignmentType !== assignment.assignmentType
        ) {
          throw new Error(
            "Cannot change assignment type after submissions have been made"
          );
        }
      }

      Object.assign(assignment, updateData);
      await assignment.save();

      return await this.getAssignmentById(assignmentId);
    } catch (error: any) {
      throw new Error(error.message || "Failed to update assignment");
    }
  }

  // Delete assignment (Faculty only)
  public async deleteAssignment(
    assignmentId: string,
    facultyId: string
  ): Promise<void> {
    try {
      const assignment = await Assignment.findOne({
        _id: assignmentId,
        facultyId: facultyId,
      });

      if (!assignment) {
        throw new Error(
          "Assignment not found or you're not authorized to delete it"
        );
      }

      // Check if there are submissions
      const submissionCount = await Submission.countDocuments({
        assignmentId: assignmentId,
      });

      if (submissionCount > 0) {
        throw new Error("Cannot delete assignment with existing submissions");
      }

      await Assignment.findByIdAndDelete(assignmentId);
    } catch (error: any) {
      throw new Error(error.message || "Failed to delete assignment");
    }
  }

  // Create submission (Student only)
  public async createSubmission(
    submissionData: CreateSubmissionData,
    studentId: string
  ): Promise<SubmissionWithDetails> {
    try {
      // Check if assignment exists and is active
      const assignment = await Assignment.findOne({
        _id: submissionData.assignmentId,
        status: AssignmentStatus.ACTIVE,
      });

      if (!assignment) {
        throw new Error("Assignment not found or not available for submission");
      }

      // Check if student is enrolled in the course
      const course = await Course.findOne({
        _id: assignment.courseId,
        enrolledStudents: studentId,
      });

      if (!course) {
        throw new Error("You are not enrolled in this course");
      }

      // Check if submission already exists
      const existingSubmission = await Submission.findOne({
        assignmentId: submissionData.assignmentId,
        studentId: studentId,
      });

      if (existingSubmission) {
        throw new Error("You have already submitted this assignment");
      }

      // Check if assignment type requirements are met
      if (
        assignment.assignmentType === "text" &&
        !submissionData.submissionText
      ) {
        throw new Error("Text submission is required for this assignment");
      }
      if (
        assignment.assignmentType === "file_upload" &&
        (!submissionData.submissionFiles ||
          submissionData.submissionFiles.length === 0)
      ) {
        throw new Error("File upload is required for this assignment");
      }

      const submission = new Submission({
        ...submissionData,
        studentId,
        submittedAt: new Date(),
      });

      await submission.save();

      return await this.getSubmissionById(submission._id);
    } catch (error: any) {
      throw new Error(error.message || "Failed to create submission");
    }
  }

  // Get submission by ID                     Error
  public async getSubmissionById(
    submissionId: string
  ): Promise<SubmissionWithDetails> {
    try {
      const submission = await Submission.findById(submissionId)
        .populate("assignmentId", "title maxScore dueDate")
        .populate("studentId", "profile email")
        .populate({
          path: "assignmentId",
          populate: {
            path: "courseId",
            select: "name courseId",
          },
        });

      if (!submission) {
        throw new Error("Submission not found");
      }

      const assignmentData = submission.assignmentId as any;
      const studentData = submission.studentId as any;

      return {
        ...submission.toJSON(),
        assignment: {
          _id: assignmentData._id.toString(),
          title: assignmentData.title,
          maxScore: assignmentData.maxScore,
          dueDate: assignmentData.dueDate,
        },
        student: {
          _id: studentData._id.toString(),
          profile: studentData.profile,
          email: studentData.email,
        },
        course: assignmentData.courseId
          ? {
              _id: assignmentData.courseId._id.toString(),
              name: assignmentData.courseId.name,
              courseId: assignmentData.courseId.courseId,
            }
          : undefined,
      } as SubmissionWithDetails;
    } catch (error: any) {
      throw new Error(error.message || "Failed to fetch submission");
    }
  }
  // Get submissions for an assignment (Faculty)
  public async getAssignmentSubmissions(
    assignmentId: string,
    facultyId: string
  ): Promise<SubmissionWithDetails[]> {
    try {
      // Verify faculty owns the assignment
      const assignment = await Assignment.findOne({
        _id: assignmentId,
        facultyId: facultyId,
      });

      if (!assignment) {
        throw new Error(
          "Assignment not found or you're not authorized to view submissions"
        );
      }

      const submissions = await Submission.find({ assignmentId })
        .populate("studentId", "profile email")
        .populate("assignmentId", "title maxScore dueDate")
        .sort({ submittedAt: -1 });

      return submissions.map((submission) => {
        const assignmentData = submission.assignmentId as any;
        const studentData = submission.studentId as any;

        return {
          ...submission.toJSON(),
          assignment: {
            _id: assignmentData._id.toString(),
            title: assignmentData.title,
            maxScore: assignmentData.maxScore,
            dueDate: assignmentData.dueDate,
          },
          student: {
            _id: studentData._id.toString(),
            profile: studentData.profile,
            email: studentData.email,
          },
        };
      }) as SubmissionWithDetails[];
    } catch (error: any) {
      throw new Error(error.message || "Failed to fetch submissions");
    }
  }

  // Grade submission (Faculty only)
  public async gradeSubmission(
    submissionId: string,
    gradeData: GradeSubmissionData,
    facultyId: string
  ): Promise<SubmissionWithDetails> {
    try {
      const submission = await Submission.findById(submissionId).populate(
        "assignmentId"
      );

      if (!submission) {
        throw new Error("Submission not found");
      }

      // Verify faculty owns the assignment
      const assignment = submission.assignmentId as any;
      if (assignment.facultyId.toString() !== facultyId) {
        throw new Error("You are not authorized to grade this submission");
      }

      // Validate grade
      if (gradeData.grade > assignment.maxScore) {
        throw new Error(
          `Grade cannot exceed maximum score of ${assignment.maxScore}`
        );
      }

      submission.grade = gradeData.grade;
      submission.feedback = gradeData.feedback;
      submission.gradedBy = new mongoose.Types.ObjectId(facultyId);
      submission.gradedAt = new Date();
      submission.status = SubmissionStatus.GRADED;

      await submission.save();

      return await this.getSubmissionById(submissionId);
    } catch (error: any) {
      throw new Error(error.message || "Failed to grade submission");
    }
  }

  // Get student's submissions
  public async getStudentSubmissions(
    studentId: string
  ): Promise<SubmissionWithDetails[]> {
    try {
      const submissions = await Submission.find({ studentId })
        .populate("assignmentId", "title maxScore dueDate")
        .populate({
          path: "assignmentId",
          populate: {
            path: "courseId",
            select: "name courseId",
          },
        })
        .sort({ submittedAt: -1 });

      return submissions.map((submission) => {
        const assignmentData = submission.assignmentId as any;
        return {
          ...submission.toJSON(),
          assignment: {
            _id: assignmentData._id.toString(),
            title: assignmentData.title,
            maxScore: assignmentData.maxScore,
            dueDate: assignmentData.dueDate,
          },
          student: {
            _id: studentId,
            profile: { firstName: "", lastName: "" },
            email: "",
          },
          course: assignmentData.courseId
            ? {
                _id: assignmentData.courseId._id.toString(),
                name: assignmentData.courseId.name,
                courseId: assignmentData.courseId.courseId,
              }
            : undefined,
        };
      }) as SubmissionWithDetails[];
    } catch (error: any) {
      throw new Error(error.message || "Failed to fetch student submissions");
    }
  }
  // Get assignment statistics
  public async getAssignmentStats(
    facultyId?: string,
    courseId?: string
  ): Promise<AssignmentStats> {
    try {
      const assignmentStats = await (Assignment as any).getAssignmentStats(
        facultyId,
        courseId
      );
      const submissionStats = await (Submission as any).getSubmissionStats();

      return {
        ...assignmentStats,
        totalSubmissions: submissionStats.totalSubmissions,
        gradedSubmissions: submissionStats.gradedSubmissions,
        pendingGrading:
          submissionStats.totalSubmissions - submissionStats.gradedSubmissions,
        averageGrade: submissionStats.averageGrade || 0,
      };
    } catch (error: any) {
      throw new Error(error.message || "Failed to fetch assignment statistics");
    }
  }
}

export default AssignmentService;
