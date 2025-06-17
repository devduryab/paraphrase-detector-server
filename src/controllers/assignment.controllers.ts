import { Request, Response } from "express";
import {
  CreateAssignmentData,
  UpdateAssignmentData,
  CreateSubmissionData,
  GradeSubmissionData,
  AssignmentStatus,
} from "../types/assignment.types";
import { UserRole } from "../types/user.types";
import AssignmentService from "../services/assignment.services";

class AssignmentController {
  private assignmentService: AssignmentService;

  constructor() {
    this.assignmentService = AssignmentService.getInstance();
  }

  // Create new assignment (Faculty only)
  public createAssignment = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const assignmentData: CreateAssignmentData = req.body;
      const facultyId = req.user._id;

      const assignment = await this.assignmentService.createAssignment(
        assignmentData,
        facultyId
      );

      res.status(201).json({
        status: "success",
        message: "Assignment created successfully",
        data: { assignment },
      });
    } catch (error: any) {
      res.status(400).json({
        status: "error",
        message: error.message || "Failed to create assignment",
      });
    }
  };

  // Get all assignments
  public getAllAssignments = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const { facultyId, courseId, status, search } = req.query;
      const userRole = req.user.role;
      const userId = req.user._id;

      const assignments = await this.assignmentService.getAllAssignments(
        {
          facultyId: facultyId as string,
          courseId: courseId as string,
          status: status as AssignmentStatus,
          search: search as string,
        },
        userRole,
        userId
      );

      res.status(200).json({
        status: "success",
        message: "Assignments retrieved successfully",
        data: { assignments },
      });
    } catch (error: any) {
      res.status(500).json({
        status: "error",
        message: error.message || "Failed to fetch assignments",
      });
    }
  };

  // Get single assignment by ID
  public getAssignmentById = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const { assignmentId } = req.params;

      if (!assignmentId) {
        res.status(400).json({
          status: "error",
          message: "Assignment ID is required",
        });
        return;
      }

      const assignment = await this.assignmentService.getAssignmentById(
        assignmentId
      );

      res.status(200).json({
        status: "success",
        message: "Assignment retrieved successfully",
        data: { assignment },
      });
    } catch (error: any) {
      res.status(404).json({
        status: "error",
        message: error.message || "Assignment not found",
      });
    }
  };

  // Update assignment (Faculty only)
  public updateAssignment = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const { assignmentId } = req.params;
      const updateData: UpdateAssignmentData = req.body;
      const facultyId = req.user._id;

      if (!assignmentId) {
        res.status(400).json({
          status: "error",
          message: "Assignment ID is required",
        });
        return;
      }

      const assignment = await this.assignmentService.updateAssignment(
        assignmentId,
        updateData,
        facultyId
      );

      res.status(200).json({
        status: "success",
        message: "Assignment updated successfully",
        data: { assignment },
      });
    } catch (error: any) {
      res.status(400).json({
        status: "error",
        message: error.message || "Failed to update assignment",
      });
    }
  };

  // Delete assignment (Faculty only)
  public deleteAssignment = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const { assignmentId } = req.params;
      const facultyId = req.user._id;
      if (!assignmentId) {
        res.status(400).json({
          status: "error",
          message: "Assignment ID is required",
        });
        return;
      }

      await this.assignmentService.deleteAssignment(assignmentId, facultyId);

      res.status(200).json({
        status: "success",
        message: "Assignment deleted successfully",
      });
    } catch (error: any) {
      res.status(400).json({
        status: "error",
        message: error.message || "Failed to delete assignment",
      });
    }
  };

  // Create submission (Student only)
  public createSubmission = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const submissionData: CreateSubmissionData = req.body;
      const studentId = req.user._id;

      const submission = await this.assignmentService.createSubmission(
        submissionData,
        studentId
      );

      res.status(201).json({
        status: "success",
        message: "Submission created successfully",
        data: { submission },
      });
    } catch (error: any) {
      res.status(400).json({
        status: "error",
        message: error.message || "Failed to create submission",
      });
    }
  };

  // Get submissions for an assignment (Faculty)
  public getAssignmentSubmissions = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const { assignmentId } = req.params;
      const facultyId = req.user._id;

      if (!assignmentId) {
        res.status(400).json({
          status: "error",
          message: "Assignment ID is required",
        });
        return;
      }

      const submissions = await this.assignmentService.getAssignmentSubmissions(
        assignmentId,
        facultyId
      );

      res.status(200).json({
        status: "success",
        message: "Submissions retrieved successfully",
        data: { submissions },
      });
    } catch (error: any) {
      res.status(403).json({
        status: "error",
        message: error.message || "Failed to fetch submissions",
      });
    }
  };

  // Grade submission (Faculty only)
  public gradeSubmission = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const { submissionId } = req.params;
      const gradeData: GradeSubmissionData = req.body;
      const facultyId = req.user._id;

      if (!submissionId) {
        res.status(400).json({
          status: "error",
          message: "Assignment ID is required",
        });
        return;
      }

      const submission = await this.assignmentService.gradeSubmission(
        submissionId,
        gradeData,
        facultyId
      );

      res.status(200).json({
        status: "success",
        message: "Submission graded successfully",
        data: { submission },
      });
    } catch (error: any) {
      res.status(400).json({
        status: "error",
        message: error.message || "Failed to grade submission",
      });
    }
  };

  // Get student's submissions (Student only)
  public getStudentSubmissions = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const studentId = req.user._id;

      const submissions = await this.assignmentService.getStudentSubmissions(
        studentId
      );

      res.status(200).json({
        status: "success",
        message: "Student submissions retrieved successfully",
        data: { submissions },
      });
    } catch (error: any) {
      res.status(500).json({
        status: "error",
        message: error.message || "Failed to fetch student submissions",
      });
    }
  };

  // Get assignment statistics
  public getAssignmentStats = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const { facultyId, courseId } = req.query;
      const userRole = req.user.role;
      const userId = req.user._id;

      // For faculty, only show their own stats
      const statsFilter =
        userRole === UserRole.FACULTY
          ? { facultyId: userId, courseId: courseId as string }
          : { facultyId: facultyId as string, courseId: courseId as string };

      const stats = await this.assignmentService.getAssignmentStats(
        statsFilter.facultyId,
        statsFilter.courseId
      );

      res.status(200).json({
        status: "success",
        message: "Assignment statistics retrieved successfully",
        data: { stats },
      });
    } catch (error: any) {
      res.status(500).json({
        status: "error",
        message: error.message || "Failed to fetch assignment statistics",
      });
    }
  };

  // Get submission by ID (for detailed view)
  public getSubmissionById = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const { submissionId } = req.params;

      if (!submissionId) {
        res.status(400).json({
          status: "error",
          message: "Assignment ID is required",
        });
        return;
      }

      const submission = await this.assignmentService.getSubmissionById(
        submissionId
      );

      res.status(200).json({
        status: "success",
        message: "Submission retrieved successfully",
        data: { submission },
      });
    } catch (error: any) {
      res.status(404).json({
        status: "error",
        message: error.message || "Submission not found",
      });
    }
  };
}

export default new AssignmentController();
