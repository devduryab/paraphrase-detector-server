// routes/assignment.routes.ts
import { Router } from "express";
import AuthMiddleware from "../middlewares/auth.middleware";
import ValidationMiddleware from "../middlewares/validation.middleware";
import assignmentControllers from "../controllers/assignment.controllers";

class AssignmentRoutes {
  public router: Router;

  constructor() {
    this.router = Router();
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    // Faculty-only routes (Assignment Management)

    /**
     * @route   POST /api/assignments
     * @desc    Create new assignment
     * @access  Private (Faculty only)
     */
    this.router.post(
      "/",
      AuthMiddleware.authenticate,
      AuthMiddleware.facultyAccess,
      ValidationMiddleware.validateCreateAssignment,
      assignmentControllers.createAssignment
    );

    /**
     * @route   PUT /api/assignments/:assignmentId
     * @desc    Update assignment
     * @access  Private (Faculty only - own assignments)
     */
    this.router.put(
      "/:assignmentId",
      AuthMiddleware.authenticate,
      AuthMiddleware.facultyAccess,
      ValidationMiddleware.validateObjectId("assignmentId"),
      ValidationMiddleware.validateUpdateAssignment,
      assignmentControllers.updateAssignment
    );

    /**
     * @route   DELETE /api/assignments/:assignmentId
     * @desc    Delete assignment
     * @access  Private (Faculty only - own assignments)
     */
    this.router.delete(
      "/:assignmentId",
      AuthMiddleware.authenticate,
      AuthMiddleware.facultyAccess,
      ValidationMiddleware.validateObjectId("assignmentId"),
      assignmentControllers.deleteAssignment
    );

    /**
     * @route   GET /api/assignments/:assignmentId/submissions
     * @desc    Get all submissions for an assignment
     * @access  Private (Faculty only - own assignments)
     */
    this.router.get(
      "/:assignmentId/submissions",
      AuthMiddleware.authenticate,
      AuthMiddleware.facultyAccess,
      ValidationMiddleware.validateObjectId("assignmentId"),
      assignmentControllers.getAssignmentSubmissions
    );

    /**
     * @route   PUT /api/assignments/submissions/:submissionId/grade
     * @desc    Grade a submission
     * @access  Private (Faculty only)
     */
    this.router.put(
      "/submissions/:submissionId/grade",
      AuthMiddleware.authenticate,
      AuthMiddleware.facultyAccess,
      ValidationMiddleware.validateObjectId("submissionId"),
      ValidationMiddleware.validateGradeSubmission,
      assignmentControllers.gradeSubmission
    );

    // Student-only routes (Submissions)

    /**
     * @route   POST /api/assignments/submissions
     * @desc    Create new submission
     * @access  Private (Student only)
     */
    this.router.post(
      "/submissions",
      AuthMiddleware.authenticate,
      AuthMiddleware.studentAccess,
      ValidationMiddleware.validateCreateSubmission,
      assignmentControllers.createSubmission
    );

    /**
     * @route   GET /api/assignments/my-submissions
     * @desc    Get student's own submissions
     * @access  Private (Student only)
     */
    this.router.get(
      "/my-submissions",
      AuthMiddleware.authenticate,
      AuthMiddleware.studentAccess,
      assignmentControllers.getStudentSubmissions
    );

    // Common routes (All authenticated users)

    /**
     * @route   GET /api/assignments
     * @desc    Get all assignments (filtered by role)
     * @access  Private (All authenticated users)
     */
    this.router.get(
      "/",
      AuthMiddleware.authenticate,
      ValidationMiddleware.validateAssignmentQuery,
      assignmentControllers.getAllAssignments
    );

    /**
     * @route   GET /api/assignments/:assignmentId
     * @desc    Get single assignment by ID
     * @access  Private (All authenticated users)
     */
    this.router.get(
      "/:assignmentId",
      AuthMiddleware.authenticate,
      ValidationMiddleware.validateObjectId("assignmentId"),
      assignmentControllers.getAssignmentById
    );

    /**
     * @route   GET /api/assignments/submissions/:submissionId
     * @desc    Get single submission by ID
     * @access  Private (All authenticated users)
     */
    this.router.get(
      "/submissions/:submissionId",
      AuthMiddleware.authenticate,
      ValidationMiddleware.validateObjectId("submissionId"),
      assignmentControllers.getSubmissionById
    );

    // Admin and Faculty routes (Statistics)

    /**
     * @route   GET /api/assignments/stats/overview
     * @desc    Get assignment statistics
     * @access  Private (Faculty and Admin)
     */
    this.router.get(
      "/stats/overview",
      AuthMiddleware.authenticate,
      AuthMiddleware.facultyAccess,
      assignmentControllers.getAssignmentStats
    );
  }
}

export default new AssignmentRoutes().router;
