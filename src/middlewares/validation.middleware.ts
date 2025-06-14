import { Request, Response, NextFunction } from "express";
import Joi, { allow } from "joi";
import { UserRole } from "../types/user.types";

class ValidationMiddleware {
  // Login validation
  public validateLogin = (
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    const schema = Joi.object({
      email: Joi.string().email().required().messages({
        "string.email": "Please provide a valid email address",
        "any.required": "Email is required",
      }),
      password: Joi.string().min(6).required().messages({
        "string.min": "Password must be at least 6 characters long",
        "any.required": "Password is required",
      }),
    });

    this.validate(schema, req.body, res, next, "body", req);
  };

  // User registration validation
  public validateRegister = (
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    const schema = Joi.object({
      email: Joi.string().email().required().messages({
        "string.email": "Please provide a valid email address",
        "any.required": "Email is required",
      }),
      password: Joi.string()
        .min(6)
        .pattern(
          new RegExp("^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*])")
        )
        .required()
        .messages({
          "string.min": "Password must be at least 6 characters long",
          "string.pattern.base":
            "Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character",
          "any.required": "Password is required",
        }),
      role: Joi.string()
        .valid(...Object.values(UserRole))
        .required()
        .messages({
          "any.only": "Invalid user role",
          "any.required": "User role is required",
        }),
      profile: Joi.object({
        firstName: Joi.string().trim().min(2).max(50).required().messages({
          "string.min": "First name must be at least 2 characters long",
          "string.max": "First name cannot exceed 50 characters",
          "any.required": "First name is required",
        }),
        lastName: Joi.string().trim().min(2).max(50).required().messages({
          "string.min": "Last name must be at least 2 characters long",
          "string.max": "Last name cannot exceed 50 characters",
          "any.required": "Last name is required",
        }),
        phone: Joi.string()
          .pattern(new RegExp("^[+]?[1-9][0-9]{7,15}$"))
          .optional()
          .allow("")
          .messages({
            "string.pattern.base": "Please provide a valid phone number",
          }),
      }).required(),
      additionalData: Joi.object().optional(),
    });

    this.validate(schema, req.body, res, next);
  };

  // Profile update validation
  public validateProfileUpdate = (
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    const schema = Joi.object({
      profile: Joi.object({
        firstName: Joi.string().trim().min(2).max(50).required().messages({
          "string.min": "First name must be at least 2 characters long",
          "string.max": "First name cannot exceed 50 characters",
          "any.required": "First name is required",
        }),
        lastName: Joi.string().trim().min(2).max(50).required().messages({
          "string.min": "Last name must be at least 2 characters long",
          "string.max": "Last name cannot exceed 50 characters",
          "any.required": "Last name is required",
        }),
        phone: Joi.string()
          .pattern(new RegExp("^[+]?[1-9][0-9]{7,15}$"))
          .optional()
          .allow("")
          .messages({
            "string.pattern.base": "Please provide a valid phone number",
          }),
        avatar: Joi.string().uri().optional().allow(""),
      }).required(),
    });

    this.validate(schema, req.body, res, next);
  };

  // Password change validation
  public validatePasswordChange = (
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    const schema = Joi.object({
      currentPassword: Joi.string().required().messages({
        "any.required": "Current password is required",
      }),
      newPassword: Joi.string()
        .min(6)
        .pattern(
          new RegExp("^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*])")
        )
        .required()
        .messages({
          "string.min": "New password must be at least 6 characters long",
          "string.pattern.base":
            "New password must contain at least one lowercase letter, one uppercase letter, one number, and one special character",
          "any.required": "New password is required",
        }),
      confirmPassword: Joi.string()
        .valid(Joi.ref("newPassword"))
        .required()
        .messages({
          "any.only": "Confirm password must match new password",
          "any.required": "Confirm password is required",
        }),
    });

    this.validate(schema, req.body, res, next);
  };

  // Refresh token validation
  public validateRefreshToken = (
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    const schema = Joi.object({
      refreshToken: Joi.string().required().messages({
        "any.required": "Refresh token is required",
      }),
    });

    this.validate(schema, req.body, res, next);
  };

  // Query parameters validation for user list
  public validateUserQuery = (
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    const schema = Joi.object({
      page: Joi.number().integer().min(1).default(1),
      limit: Joi.number().integer().min(1).max(100).default(10),
      role: Joi.string()
        .valid(...Object.values(UserRole))
        .optional(),
      status: Joi.string()
        .valid("active", "inactive", "suspended", "pending")
        .optional(),
      search: Joi.string().trim().min(1).optional(),
    });

    this.validate(schema, req.query, res, next, "query", req);
  };

  // User status update validation
  public validateStatusUpdate = (
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    const schema = Joi.object({
      status: Joi.string()
        .valid("active", "inactive", "suspended", "pending")
        .required()
        .messages({
          "any.only":
            "Invalid status. Must be one of: active, inactive, suspended, pending",
          "any.required": "Status is required",
        }),
    });

    this.validate(schema, req.body, res, next);
  };

  // MongoDB ObjectId validation
  public validateObjectId = (paramName: string) => {
    return (req: Request, res: Response, next: NextFunction): void => {
      const schema = Joi.object({
        [paramName]: Joi.string()
          .pattern(new RegExp("^[0-9a-fA-F]{24}$"))
          .required()
          .messages({
            "string.pattern.base": "Invalid ID format",
            "any.required": `${paramName} is required`,
          }),
      });

      this.validate(schema, req.params, res, next, "params", req);
    };
  };

  // User update validation
  public validateUserUpdate = (
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    const schema = Joi.object({
      email: Joi.string().email().optional(),
      role: Joi.string()
        .valid(...Object.values(UserRole))
        .optional(),
      profile: Joi.object({
        firstName: Joi.string().trim().min(2).max(50).optional(),
        lastName: Joi.string().trim().min(2).max(50).optional(),
        phone: Joi.string()
          .pattern(new RegExp("^[+]?[1-9][0-9]{7,15}$"))
          .optional()
          .allow(""),
      }).optional(),
      status: Joi.string()
        .valid("active", "inactive", "suspended", "pending")
        .optional(),
    });

    this.validate(schema, req.body, res, next);
  };

  // Generic validation method
  private validate = (
    schema: Joi.ObjectSchema,
    data: any,
    res: Response,
    next: NextFunction,
    type: string = "body",
    req?: Request
  ): void => {
    const { error, value } = schema.validate(data, {
      abortEarly: false,
      stripUnknown: true,
      allowUnknown: false,
    });

    if (error) {
      const errorMessages = error.details.map((detail) => ({
        field: detail.path.join("."),
        message: detail.message,
      }));

      res.status(400).json({
        status: "error",
        message: "Validation failed",
        errors: errorMessages,
      });
      return;
    }

    // Replace the original data with validated data
    if (req) {
      if (type === "body") {
        (req as any).body = value;
      } else if (type === "query") {
        (req as any).query = value;
      } else if (type === "params") {
        (req as any).params = value;
      }
    }

    next();
  };
}

export default new ValidationMiddleware();
