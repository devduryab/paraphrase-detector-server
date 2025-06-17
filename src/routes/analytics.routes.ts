// routes/analytics.routes.ts
import { Router } from "express";
import AuthMiddleware from "../middlewares/auth.middleware";
import analyticsControllers from "../controllers/analytics.controllers";

class AnalyticsRoutes {
  public router: Router;

  constructor() {
    this.router = Router();
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    /**
     * @route   GET /api/analytics/admin
     * @desc    Get admin analytics dashboard data
     * @access  Private (Super Admin only)
     */
    this.router.get(
      "/admin",
      AuthMiddleware.authenticate,
      AuthMiddleware.superAdminOnly,
      analyticsControllers.getAdminAnalytics
    );

    /**
     * @route   GET /api/analytics/faculty
     * @desc    Get faculty analytics dashboard data
     * @access  Private (Faculty only)
     */
    this.router.get(
      "/faculty",
      AuthMiddleware.authenticate,
      AuthMiddleware.facultyAccess,
      analyticsControllers.getFacultyAnalytics
    );

    /**
     * @route   GET /api/analytics/student
     * @desc    Get student analytics dashboard data
     * @access  Private (Student only)
     */
    this.router.get(
      "/student",
      AuthMiddleware.authenticate,
      AuthMiddleware.studentAccess,
      analyticsControllers.getStudentAnalytics
    );
  }
}

export default new AnalyticsRoutes().router;
