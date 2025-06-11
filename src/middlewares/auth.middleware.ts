import { Request, Response, NextFunction } from "express";
import { IUser, UserRole } from "../types/user.types";
import AuthService from "../services/auth.services";
import { User } from "../models/user.model";

// Extend Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

class AuthMiddleware {
  private authService: AuthService;

  constructor() {
    this.authService = AuthService.getInstance();
  }

  // Verify JWT token
  public authenticate = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        res.status(401).json({
          status: "error",
          message: "Access token is required",
        });
        return;
      }

      const token = authHeader.substring(7); // Remove 'Bearer ' prefix

      // Verify token
      const decoded = this.authService.verifyToken(token);

      // Use single User model instead of checking multiple collections
      const user = await User.findById(decoded.userId) as IUser | null;

      if (!user) {
        res.status(401).json({
          status: "error",
          message: "User not found",
        });
        return;
      }

      // Check if user is active
      if (!user.isActive()) {
        res.status(401).json({
          status: "error",
          message: "Account is not active",
        });
        return;
      }

      // Add user to request object
      req.user = user;
      next();
    } catch (error: any) {
      res.status(401).json({
        status: "error",
        message: error.message || "Authentication failed",
      });
    }
  };

  // Check if user has required role
  public authorize = (allowedRoles: UserRole[]) => {
    return (req: Request, res: Response, next: NextFunction): void => {
      try {
        if (!req.user) {
          res.status(401).json({
            status: "error",
            message: "Authentication required",
          });
          return;
        }

        if (!allowedRoles.includes(req.user.role)) {
          res.status(403).json({
            status: "error",
            message: "Insufficient permissions",
          });
          return;
        }

        next();
      } catch (error: any) {
        res.status(403).json({
          status: "error",
          message: "Authorization failed",
        });
      }
    };
  };

  // Super Admin only access
  public superAdminOnly = this.authorize([UserRole.SUPER_ADMIN]);

  // Faculty and Super Admin access
  public facultyAccess = this.authorize([
    UserRole.FACULTY,
    UserRole.SUPER_ADMIN,
  ]);

  // Student and above access
  public studentAccess = this.authorize([
    UserRole.STUDENT,
    UserRole.FACULTY,
    UserRole.SUPER_ADMIN,
  ]);

  // Check if user owns the resource or is admin
  public ownerOrAdmin = (userIdField: string = "userId") => {
    return (req: Request, res: Response, next: NextFunction): void => {
      try {
        if (!req.user) {
          res.status(401).json({
            status: "error",
            message: "Authentication required",
          });
          return;
        }

        const resourceUserId = req.params[userIdField] || req.body[userIdField];
        const currentUserId = req.user._id.toString();
        const isAdmin = req.user.role === UserRole.SUPER_ADMIN;

        if (resourceUserId === currentUserId || isAdmin) {
          next();
        } else {
          res.status(403).json({
            status: "error",
            message: "Access denied. You can only access your own resources.",
          });
        }
      } catch (error: any) {
        res.status(403).json({
          status: "error",
          message: "Authorization failed",
        });
      }
    };
  };
}

export default new AuthMiddleware();