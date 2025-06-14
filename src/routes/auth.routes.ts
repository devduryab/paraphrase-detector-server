import { Router } from "express";
import AuthController from "../controllers/auth.controllers";
import AuthMiddleware from "../middlewares/auth.middleware";
import ValidationMiddleware from "../middlewares/validation.middleware";

class AuthRoutes {
  public router: Router;

  constructor() {
    this.router = Router();
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    // Public routes (No authentication required)

    /**
     * @route   POST /api/auth/login
     * @desc    Login user (All roles)
     * @access  Public
     */
    this.router.post(
      "/login",
      ValidationMiddleware.validateLogin,
      AuthController.login
    );

    /**
     * @route   POST /api/auth/refresh-token
     * @desc    Refresh access token
     * @access  Public
     */
    this.router.post(
      "/refresh-token",
      ValidationMiddleware.validateRefreshToken,
      AuthController.refreshToken
    );

    // Protected routes (Authentication required)

    /**
     * @route   GET /api/auth/verify
     * @desc    Verify JWT token
     * @access  Private
     */
    this.router.get("/verify", AuthMiddleware.authenticate, (req, res) => {
      res.status(200).json({
        status: "success",
        message: "Token verified successfully",
        user: req.user,
      });
    });

    /**
     * @route   GET /api/auth/profile
     * @desc    Get current user profile
     * @access  Private (All authenticated users)
     */
    this.router.get(
      "/profile",
      AuthMiddleware.authenticate,
      AuthController.getProfile
    );

    /**
     * @route   PUT /api/auth/profile
     * @desc    Update current user profile
     * @access  Private (All authenticated users)
     */
    this.router.put(
      "/profile",
      AuthMiddleware.authenticate,
      ValidationMiddleware.validateProfileUpdate,
      AuthController.updateProfile
    );

    /**
     * @route   POST /api/auth/change-password
     * @desc    Change user password
     * @access  Private (All authenticated users)
     */
    this.router.post(
      "/change-password",
      AuthMiddleware.authenticate,
      ValidationMiddleware.validatePasswordChange,
      AuthController.changePassword
    );

    /**
     * @route   POST /api/auth/logout
     * @desc    Logout user (client-side token removal)
     * @access  Private (All authenticated users)
     */
    this.router.post(
      "/logout",
      AuthMiddleware.authenticate,
      AuthController.logout
    );

    // Super Admin only routes

    /**
     * @route   POST /api/auth/register
     * @desc    Register new user (Student/Faculty)
     * @access  Private (Super Admin only)
     */
    this.router.post(
      "/register",
      AuthMiddleware.authenticate,
      AuthMiddleware.superAdminOnly,
      ValidationMiddleware.validateRegister,
      AuthController.register
    );

    /**
     * @route   GET /api/auth/users
     * @desc    Get all users with pagination and filters
     * @access  Private (Super Admin only)
     */
    this.router.get(
      "/users",
      AuthMiddleware.authenticate,
      AuthMiddleware.superAdminOnly,
      ValidationMiddleware.validateUserQuery,
      AuthController.getAllUsers
    );

    /**
     * @route   PUT /api/auth/users/:userId/status
     * @desc    Update user status (active/inactive/suspended)
     * @access  Private (Super Admin only)
     */
    this.router.put(
      "/users/:userId/status",
      AuthMiddleware.authenticate,
      AuthMiddleware.superAdminOnly,
      ValidationMiddleware.validateObjectId("userId"),
      ValidationMiddleware.validateStatusUpdate,
      AuthController.updateUserStatus
    );

    /**
     * @route   DELETE /api/auth/users/:userId
     * @desc    Delete user
     * @access  Private (Super Admin only)
     */
    this.router.delete(
      "/users/:userId",
      AuthMiddleware.authenticate,
      AuthMiddleware.superAdminOnly,
      ValidationMiddleware.validateObjectId("userId"),
      AuthController.deleteUser
    );

    // Test routes for development

    /**
     * @route   GET /api/auth/test-protected
     * @desc    Test protected route
     * @access  Private (All authenticated users)
     */
    this.router.get(
      "/test-protected",
      AuthMiddleware.authenticate,
      (req, res) => {
        res.json({
          status: "success",
          message: "Protected route accessed successfully",
          user: {
            id: req.user._id,
            email: req.user.email,
            role: req.user.role,
            name: req.user.getFullName(),
          },
        });
      }
    );

    /**
     * @route   GET /api/auth/test-admin
     * @desc    Test super admin only route
     * @access  Private (Super Admin only)
     */
    this.router.get(
      "/test-admin",
      AuthMiddleware.authenticate,
      AuthMiddleware.superAdminOnly,
      (req, res) => {
        res.json({
          status: "success",
          message: "Super Admin route accessed successfully",
          user: {
            id: req.user._id,
            email: req.user.email,
            role: req.user.role,
            name: req.user.getFullName(),
          },
        });
      }
    );

    /**
     * @route   GET /api/auth/users/:userId
     * @desc    Get single user by ID
     * @access  Private (Super Admin only)
     */
    this.router.get(
      "/users/:userId",
      AuthMiddleware.authenticate,
      AuthMiddleware.superAdminOnly,
      ValidationMiddleware.validateObjectId("userId"),
      AuthController.getUserById
    );

    /**
     * @route   PUT /api/auth/users/:userId
     * @desc    Update user details
     * @access  Private (Super Admin only)
     */
    this.router.put(
      "/users/:userId",
      AuthMiddleware.authenticate,
      AuthMiddleware.superAdminOnly,
      ValidationMiddleware.validateObjectId("userId"),
      ValidationMiddleware.validateUserUpdate,
      AuthController.updateUser
    );
  }
}

export default new AuthRoutes().router;
