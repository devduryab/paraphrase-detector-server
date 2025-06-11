import { Request, Response } from "express";
import AuthService from "../services/auth.services";
import { User, Student, Faculty, SuperAdmin } from "../models/user.model";
import { UserRole, UserStatus } from "../types/user.types";

class AuthController {
  private authService: AuthService;

  constructor() {
    this.authService = AuthService.getInstance();
  }

  // Login user
  public login = async (req: Request, res: Response): Promise<void> => {
    try {
      const { email, password } = req.body;

      // Validation
      if (!email || !password) {
        res.status(400).json({
          status: "error",
          message: "Email and password are required",
        });
        return;
      }

      // Authenticate user
      const authResult = await this.authService.login(email, password);

      res.status(200).json({
        status: "success",
        message: "Login successful",
        user: authResult.user,
        token: authResult.accessToken,
        refreshToken: authResult.refreshToken,
      });
    } catch (error: any) {
      res.status(401).json({
        status: "error",
        message: error.message || "Login failed",
      });
    }
  };

  // Register new user (Super Admin only)
  public register = async (req: Request, res: Response): Promise<void> => {
    try {
      const { email, password, role, profile, additionalData } = req.body;

      // Validation
      if (!email || !password || !role || !profile) {
        res.status(400).json({
          status: "error",
          message: "Email, password, role, and profile are required",
        });
        return;
      }

      if (!profile.firstName || !profile.lastName) {
        res.status(400).json({
          status: "error",
          message: "First name and last name are required",
        });
        return;
      }

      // Validate role
      if (!Object.values(UserRole).includes(role)) {
        res.status(400).json({
          status: "error",
          message: "Invalid user role",
        });
        return;
      }

      // Register user
      const newUser = await this.authService.registerUser({
        email,
        password,
        role,
        profile,
        additionalData,
      });

      res.status(201).json({
        status: "success",
        message: "User registered successfully",
        data: {
          user: newUser,
        },
      });
    } catch (error: any) {
      res.status(400).json({
        status: "error",
        message: error.message || "Registration failed",
      });
    }
  };

  // Get current user profile
  public getProfile = async (req: Request, res: Response): Promise<void> => {
    try {
      const user = req.user;

      if (!user) {
        res.status(401).json({
          status: "error",
          message: "User not authenticated",
        });
        return;
      }

      res.status(200).json({
        status: "success",
        message: "Profile retrieved successfully",
        data: {
          user: user,
        },
      });
    } catch (error: any) {
      res.status(500).json({
        status: "error",
        message: error.message || "Failed to get profile",
      });
    }
  };

  // Update user profile
  public updateProfile = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user._id;
      const { profile } = req.body;

      if (!profile) {
        res.status(400).json({
          status: "error",
          message: "Profile data is required",
        });
        return;
      }

      // Update user profile
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        { $set: { profile } },
        { new: true, runValidators: true }
      );

      if (!updatedUser) {
        res.status(404).json({
          status: "error",
          message: "User not found",
        });
        return;
      }

      res.status(200).json({
        status: "success",
        message: "Profile updated successfully",
        data: {
          user: updatedUser,
        },
      });
    } catch (error: any) {
      res.status(400).json({
        status: "error",
        message: error.message || "Profile update failed",
      });
    }
  };

  // Change password
  public changePassword = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const userId = req.user._id;
      const { currentPassword, newPassword, confirmPassword } = req.body;

      // Validation
      if (!currentPassword || !newPassword || !confirmPassword) {
        res.status(400).json({
          status: "error",
          message:
            "Current password, new password, and confirm password are required",
        });
        return;
      }

      if (newPassword !== confirmPassword) {
        res.status(400).json({
          status: "error",
          message: "New password and confirm password do not match",
        });
        return;
      }

      if (newPassword.length < 6) {
        res.status(400).json({
          status: "error",
          message: "New password must be at least 6 characters long",
        });
        return;
      }

      // Change password
      await this.authService.changePassword(
        userId,
        currentPassword,
        newPassword
      );

      res.status(200).json({
        status: "success",
        message: "Password changed successfully",
      });
    } catch (error: any) {
      res.status(400).json({
        status: "error",
        message: error.message || "Password change failed",
      });
    }
  };

  // Refresh token
  public refreshToken = async (req: Request, res: Response): Promise<void> => {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        res.status(400).json({
          status: "error",
          message: "Refresh token is required",
        });
        return;
      }

      // Verify refresh token
      const decoded = this.authService.verifyToken(refreshToken, true);

      // Get user
      const user = await this.authService.getUserById(decoded.userId);
      if (!user || !user.isActive()) {
        res.status(401).json({
          status: "error",
          message: "Invalid refresh token",
        });
        return;
      }

      // Generate new tokens
      const tokenPayload = {
        userId: user._id,
        email: user.email,
        role: user.role,
      };

      const tokens = this.authService.generateTokens(tokenPayload);

      res.status(200).json({
        status: "success",
        message: "Token refreshed successfully",
        data: {
          tokens: {
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
          },
        },
      });
    } catch (error: any) {
      res.status(401).json({
        status: "error",
        message: error.message || "Token refresh failed",
      });
    }
  };

  // Logout (client-side token removal)
  public logout = async (req: Request, res: Response): Promise<void> => {
    try {
      res.status(200).json({
        status: "success",
        message: "Logout successful. Please remove tokens from client storage.",
      });
    } catch (error: any) {
      res.status(500).json({
        status: "error",
        message: "Logout failed",
      });
    }
  };

  // Get all users (Super Admin only)
  public getAllUsers = async (req: Request, res: Response): Promise<void> => {
    try {
      const { page = 1, limit = 10, role, status, search } = req.query;

      // Build filter
      const filter: any = {};
      if (role) filter.role = role;
      if (status) filter.status = status;
      if (search) {
        filter.$or = [
          { email: { $regex: search, $options: "i" } },
          { "profile.firstName": { $regex: search, $options: "i" } },
          { "profile.lastName": { $regex: search, $options: "i" } },
        ];
      }

      // Pagination
      const skip = (Number(page) - 1) * Number(limit);

      const users = await User.find(filter)
        .skip(skip)
        .limit(Number(limit))
        .sort({ createdAt: -1 });

      const total = await User.countDocuments(filter);

      res.status(200).json({
        status: "success",
        message: "Users retrieved successfully",
        data: {
          users,
          collections: {
            students: await User.countDocuments({ role: UserRole.STUDENT }),
            faculty: await User.countDocuments({ role: UserRole.FACULTY }),
            superAdmins: await User.countDocuments({ role: UserRole.SUPER_ADMIN }),
          },
          pagination: {
            currentPage: Number(page),
            totalPages: Math.ceil(total / Number(limit)),
            totalUsers: total,
            limit: Number(limit),
          },
        },
      });
    } catch (error: any) {
      res.status(500).json({
        status: "error",
        message: error.message || "Failed to get users",
      });
    }
  };

  // Update user status (Super Admin only)
  public updateUserStatus = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const { userId } = req.params;
      const { status } = req.body;

      if (!Object.values(UserStatus).includes(status)) {
        res.status(400).json({
          status: "error",
          message: "Invalid status",
        });
        return;
      }

      const user = await User.findByIdAndUpdate(
        userId,
        { status },
        { new: true }
      );

      if (!user) {
        res.status(404).json({
          status: "error",
          message: "User not found",
        });
        return;
      }

      res.status(200).json({
        status: "success",
        message: "User status updated successfully",
        data: { user },
      });
    } catch (error: any) {
      res.status(400).json({
        status: "error",
        message: error.message || "Status update failed",
      });
    }
  };

  // Delete user (Super Admin only)
  public deleteUser = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;

      // Prevent super admin from deleting themselves
      if (userId === req.user._id.toString()) {
        res.status(400).json({
          status: "error",
          message: "You cannot delete your own account",
        });
        return;
      }

      const user = await User.findByIdAndDelete(userId);

      if (!user) {
        res.status(404).json({
          status: "error",
          message: "User not found",
        });
        return;
      }

      res.status(200).json({
        status: "success",
        message: "User deleted successfully",
      });
    } catch (error: any) {
      res.status(400).json({
        status: "error",
        message: error.message || "User deletion failed",
      });
    }
  };
}

export default new AuthController();