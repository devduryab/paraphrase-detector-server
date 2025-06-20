import { Router } from "express";
import AnalysisController from "../controllers/analysis.controller"; // Fixed: use .controller (singular)
import AuthMiddleware from "../middleware/auth.middleware"; // Fixed: use singular 'middleware'
import ValidationMiddleware from "../middleware/validation.middleware"; // Fixed: use singular 'middleware'
import { UserRole } from "../types/user.types";

class AnalysisRoutes {
  public router: Router;
  private analysisController: AnalysisController;

  constructor() {
    this.router = Router();
    this.analysisController = new AnalysisController();
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    // ============================================
    // SUBMISSION ANALYSIS ROUTES
    // ============================================

    /**
     * @route   GET /api/analysis/submissions/:submissionId
     * @desc    Get analysis results for a submission
     * @access  Private (Faculty, Super Admin, Student - own submissions)
     * @query   { analysisType?: string }
     */
    this.router.get(
      "/submissions/:submissionId",
      AuthMiddleware.authenticate,
      AuthMiddleware.authorize([UserRole.STUDENT, UserRole.FACULTY, UserRole.SUPER_ADMIN]),
      ValidationMiddleware.validateObjectId("submissionId"),
      this.analysisController.getSubmissionAnalysis
    );

    /**
     * @route   GET /api/analysis/submissions/:submissionId/status
     * @desc    Get analysis status for a submission
     * @access  Private (Faculty, Super Admin, Student - own submissions)
     */
    this.router.get(
      "/submissions/:submissionId/status",
      AuthMiddleware.authenticate,
      AuthMiddleware.authorize([UserRole.STUDENT, UserRole.FACULTY, UserRole.SUPER_ADMIN]),
      ValidationMiddleware.validateObjectId("submissionId"),
      this.analysisController.getAnalysisStatus
    );

    /**
     * @route   POST /api/analysis/submissions/:submissionId/reanalyze
     * @desc    Reanalyze a submission with new options
     * @access  Private (Faculty, Super Admin)
     * @body    { analysisTypes: string[], options?: object }
     */
    this.router.post(
      "/submissions/:submissionId/reanalyze",
      AuthMiddleware.authenticate,
      AuthMiddleware.authorize([UserRole.FACULTY, UserRole.SUPER_ADMIN]),
      ValidationMiddleware.validateObjectId("submissionId"),
      this.analysisController.reanalyzeSubmission
    );

    /**
     * @route   DELETE /api/analysis/submissions/:submissionId/cancel
     * @desc    Cancel pending analysis for a submission
     * @access  Private (Faculty, Super Admin)
     */
    this.router.delete(
      "/submissions/:submissionId/cancel",
      AuthMiddleware.authenticate,
      AuthMiddleware.authorize([UserRole.FACULTY, UserRole.SUPER_ADMIN]),
      ValidationMiddleware.validateObjectId("submissionId"),
      this.analysisController.cancelAnalysis
    );

    // ============================================
    // ANALYSIS RESULTS ROUTES
    // ============================================

    /**
     * @route   GET /api/analysis/results/:analysisId
     * @desc    Get specific analysis result by ID
     * @access  Private (Faculty, Super Admin)
     */
    this.router.get(
      "/results/:analysisId",
      AuthMiddleware.authenticate,
      AuthMiddleware.authorize([UserRole.FACULTY, UserRole.SUPER_ADMIN]),
      ValidationMiddleware.validateObjectId("analysisId"),
      this.analysisController.getAnalysisById
    );

    /**
     * @route   PUT /api/analysis/results/:analysisId/flag
     * @desc    Flag analysis result for review
     * @access  Private (Faculty, Super Admin)
     * @body    { reason: string, reviewerNotes?: string }
     */
    this.router.put(
      "/results/:analysisId/flag",
      AuthMiddleware.authenticate,
      AuthMiddleware.authorize([UserRole.FACULTY, UserRole.SUPER_ADMIN]),
      ValidationMiddleware.validateObjectId("analysisId"),
      this.analysisController.flagAnalysisForReview
    );

    // ============================================
    // STATISTICS AND REPORTING ROUTES
    // ============================================

    /**
     * @route   GET /api/analysis/statistics
     * @desc    Get analysis statistics
     * @access  Private (Faculty, Super Admin)
     * @query   { startDate?: date, endDate?: date, analysisType?: string, integrityRisk?: string }
     */
    this.router.get(
      "/statistics",
      AuthMiddleware.authenticate,
      AuthMiddleware.authorize([UserRole.FACULTY, UserRole.SUPER_ADMIN]),
      this.analysisController.getAnalysisStatistics
    );

    /**
     * @route   GET /api/analysis/recent
     * @desc    Get recent analyses
     * @access  Private (Faculty, Super Admin)
     * @query   { limit?: number, status?: string }
     */
    this.router.get(
      "/recent",
      AuthMiddleware.authenticate,
      AuthMiddleware.authorize([UserRole.FACULTY, UserRole.SUPER_ADMIN]),
      this.analysisController.getRecentAnalyses
    );

    /**
     * @route   GET /api/analysis/risk/:riskLevel
     * @desc    Get analyses by risk level
     * @access  Private (Faculty, Super Admin)
     * @query   { limit?: number }
     * @params  { riskLevel: 'low' | 'medium' | 'high' | 'critical' }
     */
    this.router.get(
      "/risk/:riskLevel",
      AuthMiddleware.authenticate,
      AuthMiddleware.authorize([UserRole.FACULTY, UserRole.SUPER_ADMIN]),
      this.analysisController.getAnalysesByRisk
    );

    // ============================================
    // BATCH OPERATIONS ROUTES
    // ============================================

    /**
     * @route   POST /api/analysis/batch/analyze
     * @desc    Queue analysis for multiple submissions
     * @access  Private (Faculty, Super Admin)
     * @body    { submissionIds: string[], analysisTypes: string[], priority: string, options?: object }
     */
    this.router.post(
      "/batch/analyze",
      AuthMiddleware.authenticate,
      AuthMiddleware.authorize([UserRole.FACULTY, UserRole.SUPER_ADMIN]),
      this.analysisController.batchAnalyzeSubmissions
    );

    /**
     * @route   GET /api/analysis/batch/status
     * @desc    Get batch analysis status
     * @access  Private (Faculty, Super Admin)
     * @query   { submissionIds: string[] }
     */
    this.router.get(
      "/batch/status",
      AuthMiddleware.authenticate,
      AuthMiddleware.authorize([UserRole.FACULTY, UserRole.SUPER_ADMIN]),
      this.analysisController.getAnalysisStatus
    );

    // ============================================
    // ASSIGNMENT-LEVEL ANALYSIS ROUTES
    // ============================================

    /**
     * @route   POST /api/analysis/assignments/:assignmentId/analyze-all
     * @desc    Analyze all submissions for an assignment
     * @access  Private (Faculty, Super Admin)
     * @body    { analysisTypes: string[], priority: string, options?: object }
     */
    this.router.post(
      "/assignments/:assignmentId/analyze-all",
      AuthMiddleware.authenticate,
      AuthMiddleware.authorize([UserRole.FACULTY, UserRole.SUPER_ADMIN]),
      ValidationMiddleware.validateObjectId("assignmentId"),
      this.analysisController.analyzeAssignmentSubmissions
    );

    /**
     * @route   GET /api/analysis/assignments/:assignmentId/summary
     * @desc    Get analysis summary for all submissions in an assignment
     * @access  Private (Faculty, Super Admin)
     */
    this.router.get(
      "/assignments/:assignmentId/summary",
      AuthMiddleware.authenticate,
      AuthMiddleware.authorize([UserRole.FACULTY, UserRole.SUPER_ADMIN]),
      ValidationMiddleware.validateObjectId("assignmentId"),
      this.analysisController.getAssignmentAnalysisSummary
    );

    /**
     * @route   GET /api/analysis/assignments/:assignmentId/flagged
     * @desc    Get flagged submissions for an assignment
     * @access  Private (Faculty, Super Admin)
     * @query   { riskLevel?: string, confidence?: number }
     */
    this.router.get(
      "/assignments/:assignmentId/flagged",
      AuthMiddleware.authenticate,
      AuthMiddleware.authorize([UserRole.FACULTY, UserRole.SUPER_ADMIN]),
      ValidationMiddleware.validateObjectId("assignmentId"),
      this.analysisController.getFlaggedSubmissions
    );

    // ============================================
    // QUEUE MANAGEMENT ROUTES
    // ============================================

    /**
     * @route   GET /api/analysis/queue/status
     * @desc    Get queue status and statistics
     * @access  Private (Super Admin)
     */
    this.router.get(
      "/queue/status",
      AuthMiddleware.authenticate,
      AuthMiddleware.superAdminOnly,
      this.analysisController.getQueueStatus
    );

    /**
     * @route   POST /api/analysis/queue/pause
     * @desc    Pause queue processing
     * @access  Private (Super Admin)
     */
    this.router.post(
      "/queue/pause",
      AuthMiddleware.authenticate,
      AuthMiddleware.superAdminOnly,
      this.analysisController.pauseQueue
    );

    /**
     * @route   POST /api/analysis/queue/resume
     * @desc    Resume queue processing
     * @access  Private (Super Admin)
     */
    this.router.post(
      "/queue/resume",
      AuthMiddleware.authenticate,
      AuthMiddleware.superAdminOnly,
      this.analysisController.resumeQueue
    );

    /**
     * @route   GET /api/analysis/queue/jobs
     * @desc    Get queue jobs with filtering
     * @access  Private (Super Admin)
     * @query   { status?: string, limit?: number, offset?: number }
     */
    this.router.get(
      "/queue/jobs",
      AuthMiddleware.authenticate,
      AuthMiddleware.superAdminOnly,
      this.analysisController.getQueueJobs
    );

    /**
     * @route   DELETE /api/analysis/queue/jobs/:jobId
     * @desc    Cancel or remove a specific queue job
     * @access  Private (Super Admin)
     */
    this.router.delete(
      "/queue/jobs/:jobId",
      AuthMiddleware.authenticate,
      AuthMiddleware.superAdminOnly,
      ValidationMiddleware.validateObjectId("jobId"),
      this.analysisController.cancelQueueJob
    );

    /**
     * @route   POST /api/analysis/queue/jobs/:jobId/retry
     * @desc    Retry a failed queue job
     * @access  Private (Super Admin)
     */
    this.router.post(
      "/queue/jobs/:jobId/retry",
      AuthMiddleware.authenticate,
      AuthMiddleware.superAdminOnly,
      ValidationMiddleware.validateObjectId("jobId"),
      this.analysisController.retryQueueJob
    );

    /**
     * @route   DELETE /api/analysis/queue/cleanup
     * @desc    Clean up old completed/failed jobs
     * @access  Private (Super Admin)
     * @query   { olderThanDays?: number }
     */
    this.router.delete(
      "/queue/cleanup",
      AuthMiddleware.authenticate,
      AuthMiddleware.superAdminOnly,
      this.analysisController.cleanupQueueJobs
    );

    // ============================================
    // SYSTEM MANAGEMENT ROUTES
    // ============================================

    /**
     * @route   GET /api/analysis/health
     * @desc    Get health status of analysis services
     * @access  Private (Super Admin)
     */
    this.router.get(
      "/health",
      AuthMiddleware.authenticate,
      AuthMiddleware.superAdminOnly,
      this.analysisController.getHealthStatus
    );

    /**
     * @route   GET /api/analysis/health/detailed
     * @desc    Get detailed health status with performance metrics
     * @access  Private (Super Admin)
     */
    this.router.get(
      "/health/detailed",
      AuthMiddleware.authenticate,
      AuthMiddleware.superAdminOnly,
      this.analysisController.getDetailedHealthStatus
    );

    /**
     * @route   POST /api/analysis/config/reload
     * @desc    Reload AI configuration without restart
     * @access  Private (Super Admin)
     */
    this.router.post(
      "/config/reload",
      AuthMiddleware.authenticate,
      AuthMiddleware.superAdminOnly,
      this.analysisController.reloadConfiguration
    );

    /**
     * @route   GET /api/analysis/config
     * @desc    Get current AI configuration (sanitized)
     * @access  Private (Super Admin)
     */
    this.router.get(
      "/config",
      AuthMiddleware.authenticate,
      AuthMiddleware.superAdminOnly,
      this.analysisController.getConfiguration
    );

    /**
     * @route   DELETE /api/analysis/cleanup/:days
     * @desc    Cleanup old analysis results
     * @access  Private (Super Admin)
     * @params  { days: number } - Delete results older than this many days
     */
    this.router.delete(
      "/cleanup/:days",
      AuthMiddleware.authenticate,
      AuthMiddleware.superAdminOnly,
      this.analysisController.cleanupOldAnalyses
    );

    // ============================================
    // EXPORT AND IMPORT ROUTES
    // ============================================

    /**
     * @route   GET /api/analysis/export/csv
     * @desc    Export analysis results as CSV
     * @access  Private (Faculty, Super Admin)
     * @query   { startDate?: date, endDate?: date, analysisType?: string, assignmentId?: string }
     */
    this.router.get(
      "/export/csv",
      AuthMiddleware.authenticate,
      AuthMiddleware.authorize([UserRole.FACULTY, UserRole.SUPER_ADMIN]),
      this.analysisController.exportAnalysisCSV
    );

    /**
     * @route   GET /api/analysis/export/report/:assignmentId
     * @desc    Generate and download assignment analysis report
     * @access  Private (Faculty, Super Admin)
     * @query   { format?: 'pdf' | 'excel' }
     */
    this.router.get(
      "/export/report/:assignmentId",
      AuthMiddleware.authenticate,
      AuthMiddleware.authorize([UserRole.FACULTY, UserRole.SUPER_ADMIN]),
      ValidationMiddleware.validateObjectId("assignmentId"),
      this.analysisController.generateAssignmentReport
    );

    // ============================================
    // ANALYTICS AND INSIGHTS ROUTES
    // ============================================

    /**
     * @route   GET /api/analysis/insights/trends
     * @desc    Get paraphrasing trends over time
     * @access  Private (Faculty, Super Admin)
     * @query   { period?: 'week' | 'month' | 'semester', courseId?: string }
     */
    this.router.get(
      "/insights/trends",
      AuthMiddleware.authenticate,
      AuthMiddleware.authorize([UserRole.FACULTY, UserRole.SUPER_ADMIN]),
      this.analysisController.getParaphrasingTrends
    );

    /**
     * @route   GET /api/analysis/insights/patterns
     * @desc    Get common paraphrasing patterns detected
     * @access  Private (Faculty, Super Admin)
     * @query   { limit?: number, minFrequency?: number }
     */
    this.router.get(
      "/insights/patterns",
      AuthMiddleware.authenticate,
      AuthMiddleware.authorize([UserRole.FACULTY, UserRole.SUPER_ADMIN]),
      this.analysisController.getCommonPatterns
    );

    /**
     * @route   GET /api/analysis/insights/student/:studentId
     * @desc    Get analysis insights for a specific student
     * @access  Private (Faculty, Super Admin)
     * @query   { courseId?: string, assignmentId?: string }
     */
    this.router.get(
      "/insights/student/:studentId",
      AuthMiddleware.authenticate,
      AuthMiddleware.authorize([UserRole.FACULTY, UserRole.SUPER_ADMIN]),
      ValidationMiddleware.validateObjectId("studentId"),
      this.analysisController.getStudentInsights
    );

    // ============================================
    // TESTING AND DEBUG ROUTES (Development Only)
    // ============================================

    if (process.env.NODE_ENV === "development") {
      /**
       * @route   POST /api/analysis/test/analyze-text
       * @desc    Test analysis with raw text input (Development only)
       * @access  Private (Super Admin)
       * @body    { text: string, analysisTypes: string[], options?: object }
       */
      this.router.post(
        "/test/analyze-text",
        AuthMiddleware.authenticate,
        AuthMiddleware.superAdminOnly,
        this.analysisController.testAnalyzeText
      );

      /**
       * @route   GET /api/analysis/test/mock-submission
       * @desc    Create mock submission for testing (Development only)
       * @access  Private (Super Admin)
       */
      this.router.get(
        "/test/mock-submission",
        AuthMiddleware.authenticate,
        AuthMiddleware.superAdminOnly,
        this.analysisController.createMockSubmission
      );

      /**
       * @route   POST /api/analysis/test/stress-test
       * @desc    Run stress test on analysis system (Development only)
       * @access  Private (Super Admin)
       * @body    { concurrentJobs?: number, totalJobs?: number }
       */
      this.router.post(
        "/test/stress-test",
        AuthMiddleware.authenticate,
        AuthMiddleware.superAdminOnly,
        this.analysisController.runStressTest
      );
    }

    console.log(
      "✅ Analysis routes initialized with comprehensive endpoint coverage"
    );
    console.log(`📊 Total routes registered: ${this.countRoutes()}`);
    console.log(
      "🔐 All routes are protected with authentication and role-based authorization"
    );
  }

  /**
   * Count the total number of routes registered
   */
  private countRoutes(): number {
    let count = 0;
    this.router.stack.forEach((layer: any) => {
      if (layer.route) {
        count += Object.keys(layer.route.methods).length;
      }
    });
    return count;
  }
}

export default new AnalysisRoutes().router;