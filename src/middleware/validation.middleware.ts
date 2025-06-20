import { Request, Response, NextFunction } from "express";
import Joi, { allow } from "joi";
import { UserRole } from "../types/user.types";
import { AnalysisType, IntegrityRisk } from "../types/analysis.types";

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

  // Course creation validation
  public validateCreateCourse = (
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    const schema = Joi.object({
      name: Joi.string().trim().min(2).max(100).required().messages({
        "string.min": "Course name must be at least 2 characters long",
        "string.max": "Course name cannot exceed 100 characters",
        "any.required": "Course name is required",
      }),
      maxSlots: Joi.number().integer().min(1).max(1000).required().messages({
        "number.min": "Maximum slots must be at least 1",
        "number.max": "Maximum slots cannot exceed 1000",
        "any.required": "Maximum slots is required",
      }),
      assignedFaculty: Joi.array()
        .items(Joi.string().pattern(new RegExp("^[0-9a-fA-F]{24}$")).required())
        .min(1)
        .required()
        .messages({
          "array.min": "At least one faculty member must be assigned",
          "any.required": "Assigned faculty is required",
        }),
      status: Joi.string()
        .valid("active", "inactive")
        .default("active")
        .messages({
          "any.only": "Status must be either 'active' or 'inactive'",
        }),
    });

    this.validate(schema, req.body, res, next);
  };

  // Course update validation
  public validateUpdateCourse = (
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    const schema = Joi.object({
      name: Joi.string().trim().min(2).max(100).optional(),
      maxSlots: Joi.number().integer().min(1).max(1000).optional(),
      assignedFaculty: Joi.array()
        .items(Joi.string().pattern(new RegExp("^[0-9a-fA-F]{24}$")))
        .optional(),
      status: Joi.string().valid("active", "inactive", "full").optional(),
    });

    this.validate(schema, req.body, res, next);
  };

  // Course query validation
  public validateCourseQuery = (
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    const schema = Joi.object({
      status: Joi.string().valid("active", "inactive", "full").optional(),
      search: Joi.string().trim().min(1).optional(),
      facultyId: Joi.string()
        .pattern(new RegExp("^[0-9a-fA-F]{24}$"))
        .optional(),
    });

    this.validate(schema, req.query, res, next, "query", req);
  };

  // Assignment creation validation
  public validateCreateAssignment = (
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    const schema = Joi.object({
      title: Joi.string().trim().min(3).max(200).required().messages({
        "string.min": "Assignment title must be at least 3 characters long",
        "string.max": "Assignment title cannot exceed 200 characters",
        "any.required": "Assignment title is required",
      }),
      description: Joi.string().trim().min(10).max(1000).required().messages({
        "string.min": "Description must be at least 10 characters long",
        "string.max": "Description cannot exceed 1000 characters",
        "any.required": "Assignment description is required",
      }),
      instructions: Joi.string().trim().max(2000).optional().allow(""),
      courseId: Joi.string()
        .pattern(new RegExp("^[0-9a-fA-F]{24}$"))
        .required()
        .messages({
          "string.pattern.base": "Invalid course ID format",
          "any.required": "Course ID is required",
        }),
      assignmentType: Joi.string()
        .valid("text", "file_upload", "both")
        .required()
        .messages({
          "any.only": "Assignment type must be text, file_upload, or both",
          "any.required": "Assignment type is required",
        }),
      maxScore: Joi.number().integer().min(1).max(1000).required().messages({
        "number.min": "Maximum score must be at least 1",
        "number.max": "Maximum score cannot exceed 1000",
        "any.required": "Maximum score is required",
      }),
      dueDate: Joi.date().greater("now").required().messages({
        "date.greater": "Due date must be in the future",
        "any.required": "Due date is required",
      }),
      allowLateSubmission: Joi.boolean().default(false),
      latePenalty: Joi.number().min(0).max(100).optional(),
      status: Joi.string()
        .valid("draft", "active", "archived")
        .default("draft"),
    });

    this.validate(schema, req.body, res, next);
  };

  // Assignment update validation
  public validateUpdateAssignment = (
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    const schema = Joi.object({
      title: Joi.string().trim().min(3).max(200).optional(),
      description: Joi.string().trim().min(10).max(1000).optional(),
      instructions: Joi.string().trim().max(2000).optional().allow(""),
      assignmentType: Joi.string()
        .valid("text", "file_upload", "both")
        .optional(),
      maxScore: Joi.number().integer().min(1).max(1000).optional(),
      dueDate: Joi.date().greater("now").optional(),
      allowLateSubmission: Joi.boolean().optional(),
      latePenalty: Joi.number().min(0).max(100).optional(),
      status: Joi.string().valid("draft", "active", "archived").optional(),
    });

    this.validate(schema, req.body, res, next);
  };

  // Submission creation validation
  public validateCreateSubmission = (
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    const schema = Joi.object({
      assignmentId: Joi.string()
        .pattern(new RegExp("^[0-9a-fA-F]{24}$"))
        .required()
        .messages({
          "string.pattern.base": "Invalid assignment ID format",
          "any.required": "Assignment ID is required",
        }),
      submissionText: Joi.string().trim().max(5000).optional().allow(""),
      submissionFiles: Joi.array().items(Joi.string()).optional(),
    });

    this.validate(schema, req.body, res, next);
  };

  // Grade submission validation
  public validateGradeSubmission = (
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    const schema = Joi.object({
      grade: Joi.number().min(0).required().messages({
        "number.min": "Grade cannot be negative",
        "any.required": "Grade is required",
      }),
      feedback: Joi.string().trim().max(1000).optional().allow(""),
    });

    this.validate(schema, req.body, res, next);
  };

  // Assignment query validation
  public validateAssignmentQuery = (
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    const schema = Joi.object({
      facultyId: Joi.string()
        .pattern(new RegExp("^[0-9a-fA-F]{24}$"))
        .optional(),
      courseId: Joi.string()
        .pattern(new RegExp("^[0-9a-fA-F]{24}$"))
        .optional(),
      status: Joi.string().valid("draft", "active", "archived").optional(),
      search: Joi.string().trim().min(1).optional(),
    });

    this.validate(schema, req.query, res, next, "query", req);
  };

  // Add these additional validation methods to your existing validation.middleware.ts file

  // Validation for batch analysis request
  public validateBatchAnalysisRequest = (
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    const schema = Joi.object({
      submissionIds: Joi.array()
        .items(Joi.string().pattern(/^[0-9a-fA-F]{24}$/))
        .min(1)
        .max(50)
        .required()
        .messages({
          "array.min": "At least one submission ID is required",
          "array.max": "Maximum 50 submissions can be analyzed at once",
          "string.pattern.base": "Invalid submission ID format",
        }),
      analysisTypes: Joi.array()
        .items(Joi.string().valid(...Object.values(AnalysisType)))
        .min(1)
        .max(4)
        .default([AnalysisType.PARAPHRASING]),
      priority: Joi.string().valid("low", "normal", "high").default("normal"),
      options: Joi.object({
        includeSourceDetection: Joi.boolean().default(true),
        deepAnalysis: Joi.boolean().default(false),
        compareWithDatabase: Joi.boolean().default(false),
        extractTextFromFiles: Joi.boolean().default(true),
        languageDetection: Joi.boolean().default(false),
      }).default({}),
    });

    this.validate(schema, req.body, res, next);
  };

  // Validation for batch status query
  public validateBatchStatusQuery = (
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    const schema = Joi.object({
      submissionIds: Joi.string()
        .custom((value, helpers) => {
          try {
            const ids = value.split(",");
            if (ids.length > 50) {
              return helpers.error("array.max");
            }
            for (const id of ids) {
              if (!/^[0-9a-fA-F]{24}$/.test(id.trim())) {
                return helpers.error("string.pattern.base");
              }
            }
            return ids.map((id: any) => id.trim());
          } catch (error) {
            return helpers.error("string.base");
          }
        })
        .required()
        .messages({
          "array.max": "Maximum 50 submission IDs allowed",
          "string.pattern.base": "Invalid submission ID format",
          "any.required": "Submission IDs are required",
        }),
    });

    this.validate(schema, req.query, res, next);
  };

  // Validation for assignment ID parameter
  public validateAssignmentId = (
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    const schema = Joi.object({
      assignmentId: Joi.string()
        .pattern(/^[0-9a-fA-F]{24}$/)
        .required()
        .messages({
          "string.pattern.base": "Invalid assignment ID format",
          "any.required": "Assignment ID is required",
        }),
    });

    this.validate(schema, req.params, res, next);
  };

  // Validation for flagged submissions query
  public validateFlaggedQuery = (
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    const schema = Joi.object({
      riskLevel: Joi.string()
        .valid(...Object.values(IntegrityRisk))
        .optional(),
      confidence: Joi.number().min(0).max(100).optional().messages({
        "number.min": "Confidence must be at least 0",
        "number.max": "Confidence cannot exceed 100",
      }),
      limit: Joi.number().integer().min(1).max(100).default(20),
    });

    this.validate(schema, req.query, res, next);
  };

  // Validation for queue jobs query
  public validateQueueJobsQuery = (
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    const schema = Joi.object({
      status: Joi.string()
        .valid("waiting", "active", "completed", "failed", "delayed", "paused")
        .optional(),
      limit: Joi.number().integer().min(1).max(100).default(20),
      offset: Joi.number().integer().min(0).default(0),
    });

    this.validate(schema, req.query, res, next);
  };

  // Validation for job ID parameter
  public validateJobId = (
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    const schema = Joi.object({
      jobId: Joi.string().required().messages({
        "any.required": "Job ID is required",
      }),
    });

    this.validate(schema, req.params, res, next);
  };

  // Validation for queue cleanup query
  public validateQueueCleanupQuery = (
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    const schema = Joi.object({
      olderThanDays: Joi.number()
        .integer()
        .min(1)
        .max(365)
        .default(7)
        .messages({
          "number.min": "Days must be at least 1",
          "number.max": "Days cannot exceed 365",
        }),
    });

    this.validate(schema, req.query, res, next);
  };

  // Validation for export query
  public validateExportQuery = (
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    const schema = Joi.object({
      startDate: Joi.date().iso().optional(),
      endDate: Joi.date().iso().min(Joi.ref("startDate")).optional(),
      analysisType: Joi.string()
        .valid(...Object.values(AnalysisType))
        .optional(),
      assignmentId: Joi.string()
        .pattern(/^[0-9a-fA-F]{24}$/)
        .optional()
        .messages({
          "string.pattern.base": "Invalid assignment ID format",
        }),
      format: Joi.string().valid("csv", "excel", "json").default("csv"),
    }).and("startDate", "endDate");

    this.validate(schema, req.query, res, next);
  };

  // Validation for report query
  public validateReportQuery = (
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    const schema = Joi.object({
      format: Joi.string().valid("pdf", "excel").default("pdf"),
      includeDetails: Joi.boolean().default(true),
      includeFlaggedOnly: Joi.boolean().default(false),
    });

    this.validate(schema, req.query, res, next);
  };

  // Validation for trends query
  public validateTrendsQuery = (
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    const schema = Joi.object({
      period: Joi.string()
        .valid("week", "month", "semester", "year")
        .default("month"),
      courseId: Joi.string()
        .pattern(/^[0-9a-fA-F]{24}$/)
        .optional()
        .messages({
          "string.pattern.base": "Invalid course ID format",
        }),
      startDate: Joi.date().iso().optional(),
      endDate: Joi.date().iso().min(Joi.ref("startDate")).optional(),
    });

    this.validate(schema, req.query, res, next);
  };

  // Validation for patterns query
  public validatePatternsQuery = (
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    const schema = Joi.object({
      limit: Joi.number().integer().min(1).max(100).default(20),
      minFrequency: Joi.number().integer().min(1).default(5).messages({
        "number.min": "Minimum frequency must be at least 1",
      }),
      analysisType: Joi.string()
        .valid(...Object.values(AnalysisType))
        .optional(),
    });

    this.validate(schema, req.query, res, next);
  };

  // Validation for student ID parameter
  public validateStudentId = (
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    const schema = Joi.object({
      studentId: Joi.string()
        .pattern(/^[0-9a-fA-F]{24}$/)
        .required()
        .messages({
          "string.pattern.base": "Invalid student ID format",
          "any.required": "Student ID is required",
        }),
    });

    this.validate(schema, req.params, res, next);
  };

  // Validation for student insights query
  public validateStudentInsightsQuery = (
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    const schema = Joi.object({
      courseId: Joi.string()
        .pattern(/^[0-9a-fA-F]{24}$/)
        .optional()
        .messages({
          "string.pattern.base": "Invalid course ID format",
        }),
      assignmentId: Joi.string()
        .pattern(/^[0-9a-fA-F]{24}$/)
        .optional()
        .messages({
          "string.pattern.base": "Invalid assignment ID format",
        }),
      includeHistory: Joi.boolean().default(true),
      timeRange: Joi.string()
        .valid("week", "month", "semester", "all")
        .default("semester"),
    });

    this.validate(schema, req.query, res, next);
  };

  // Development-only validation methods
  public validateTestAnalysisRequest = (
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    const schema = Joi.object({
      text: Joi.string().trim().min(50).max(50000).required().messages({
        "string.min": "Text must be at least 50 characters",
        "string.max": "Text cannot exceed 50,000 characters",
        "any.required": "Text is required for analysis",
      }),
      analysisTypes: Joi.array()
        .items(Joi.string().valid(...Object.values(AnalysisType)))
        .min(1)
        .max(4)
        .default([AnalysisType.PARAPHRASING]),
      options: Joi.object({
        includeSourceDetection: Joi.boolean().default(true),
        deepAnalysis: Joi.boolean().default(false),
        compareWithDatabase: Joi.boolean().default(false),
        extractTextFromFiles: Joi.boolean().default(false),
        languageDetection: Joi.boolean().default(false),
      }).default({}),
    });

    this.validate(schema, req.body, res, next);
  };

  public validateStressTestRequest = (
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    const schema = Joi.object({
      concurrentJobs: Joi.number()
        .integer()
        .min(1)
        .max(20)
        .default(5)
        .messages({
          "number.min": "Concurrent jobs must be at least 1",
          "number.max": "Concurrent jobs cannot exceed 20",
        }),
      totalJobs: Joi.number().integer().min(1).max(100).default(10).messages({
        "number.min": "Total jobs must be at least 1",
        "number.max": "Total jobs cannot exceed 100",
      }),
      testType: Joi.string()
        .valid("load", "stress", "endurance")
        .default("load"),
      duration: Joi.number().integer().min(60).max(3600).default(300).messages({
        "number.min": "Duration must be at least 60 seconds",
        "number.max": "Duration cannot exceed 3600 seconds (1 hour)",
      }),
    });

    this.validate(schema, req.body, res, next);
  };

  // Additional validation for complex queries
  public validateAdvancedStatisticsQuery = (
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    const schema = Joi.object({
      startDate: Joi.date().iso().optional(),
      endDate: Joi.date().iso().min(Joi.ref("startDate")).optional(),
      analysisType: Joi.string()
        .valid(...Object.values(AnalysisType))
        .optional(),
      integrityRisk: Joi.string()
        .valid(...Object.values(IntegrityRisk))
        .optional(),
      courseIds: Joi.array()
        .items(Joi.string().pattern(/^[0-9a-fA-F]{24}$/))
        .max(10)
        .optional()
        .messages({
          "array.max": "Maximum 10 course IDs allowed",
          "string.pattern.base": "Invalid course ID format",
        }),
      facultyIds: Joi.array()
        .items(Joi.string().pattern(/^[0-9a-fA-F]{24}$/))
        .max(10)
        .optional()
        .messages({
          "array.max": "Maximum 10 faculty IDs allowed",
          "string.pattern.base": "Invalid faculty ID format",
        }),
      groupBy: Joi.string()
        .valid("day", "week", "month", "course", "faculty", "analysisType")
        .default("week"),
      includeTrends: Joi.boolean().default(false),
      includeComparisons: Joi.boolean().default(false),
      confidenceThreshold: Joi.number().min(0).max(100).optional().messages({
        "number.min": "Confidence threshold must be at least 0",
        "number.max": "Confidence threshold cannot exceed 100",
      }),
    }).and("startDate", "endDate");

    this.validate(schema, req.query, res, next);
  };

  // Validation for file upload analysis
  public validateFileAnalysisRequest = (
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    const schema = Joi.object({
      analysisTypes: Joi.array()
        .items(Joi.string().valid(...Object.values(AnalysisType)))
        .min(1)
        .max(4)
        .default([AnalysisType.PARAPHRASING]),
      priority: Joi.string().valid("low", "normal", "high").default("normal"),
      options: Joi.object({
        includeSourceDetection: Joi.boolean().default(true),
        deepAnalysis: Joi.boolean().default(false),
        compareWithDatabase: Joi.boolean().default(false),
        extractTextFromFiles: Joi.boolean().default(true),
        languageDetection: Joi.boolean().default(false),
        preserveFormatting: Joi.boolean().default(false),
        combineFiles: Joi.boolean().default(true),
      }).default({}),
      metadata: Joi.object({
        assignmentId: Joi.string()
          .pattern(/^[0-9a-fA-F]{24}$/)
          .optional(),
        studentId: Joi.string()
          .pattern(/^[0-9a-fA-F]{24}$/)
          .optional(),
        description: Joi.string().max(500).optional(),
      }).optional(),
    });

    this.validate(schema, req.body, res, next);
  };

  // Validation for webhook configuration
  public validateWebhookConfig = (
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    const schema = Joi.object({
      url: Joi.string().uri().required().messages({
        "string.uri": "Webhook URL must be a valid URI",
        "any.required": "Webhook URL is required",
      }),
      events: Joi.array()
        .items(
          Joi.string().valid(
            "analysis.completed",
            "analysis.failed",
            "analysis.started",
            "batch.completed",
            "high.risk.detected"
          )
        )
        .min(1)
        .required()
        .messages({
          "array.min": "At least one event type must be selected",
        }),
      secret: Joi.string().min(16).max(128).optional().messages({
        "string.min": "Webhook secret must be at least 16 characters",
        "string.max": "Webhook secret cannot exceed 128 characters",
      }),
      active: Joi.boolean().default(true),
      retryAttempts: Joi.number().integer().min(0).max(5).default(3),
      timeout: Joi.number()
        .integer()
        .min(5000)
        .max(30000)
        .default(10000)
        .messages({
          "number.min": "Timeout must be at least 5000ms (5 seconds)",
          "number.max": "Timeout cannot exceed 30000ms (30 seconds)",
        }),
    });

    this.validate(schema, req.body, res, next);
  };

  // Validation for analysis comparison request
  public validateComparisonRequest = (
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    const schema = Joi.object({
      submissionIds: Joi.array()
        .items(Joi.string().pattern(/^[0-9a-fA-F]{24}$/))
        .min(2)
        .max(10)
        .required()
        .messages({
          "array.min": "At least 2 submissions are required for comparison",
          "array.max": "Maximum 10 submissions can be compared at once",
          "string.pattern.base": "Invalid submission ID format",
        }),
      comparisonType: Joi.string()
        .valid("similarity", "patterns", "techniques", "comprehensive")
        .default("comprehensive"),
      includeDetails: Joi.boolean().default(true),
      threshold: Joi.number().min(0).max(100).default(70).messages({
        "number.min": "Threshold must be at least 0",
        "number.max": "Threshold cannot exceed 100",
      }),
    });

    this.validate(schema, req.body, res, next);
  };

  // Validation for custom analysis rules
  public validateCustomRulesRequest = (
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    const schema = Joi.object({
      ruleName: Joi.string().trim().min(3).max(100).required().messages({
        "string.min": "Rule name must be at least 3 characters",
        "string.max": "Rule name cannot exceed 100 characters",
      }),
      description: Joi.string().max(500).optional(),
      conditions: Joi.array()
        .items(
          Joi.object({
            field: Joi.string()
              .valid(
                "confidence",
                "integrityRisk",
                "techniques",
                "flaggedSections"
              )
              .required(),
            operator: Joi.string()
              .valid(
                "equals",
                "greaterThan",
                "lessThan",
                "contains",
                "notContains"
              )
              .required(),
            value: Joi.alternatives()
              .try(Joi.string(), Joi.number(), Joi.array())
              .required(),
          })
        )
        .min(1)
        .required(),
      actions: Joi.array()
        .items(
          Joi.object({
            type: Joi.string()
              .valid(
                "flagForReview",
                "setRiskLevel",
                "sendNotification",
                "requireReanalysis"
              )
              .required(),
            parameters: Joi.object().optional(),
          })
        )
        .min(1)
        .required(),
      priority: Joi.number().integer().min(1).max(10).default(5),
      active: Joi.boolean().default(true),
    });

    this.validate(schema, req.body, res, next);
  };

  // Validation for analysis templates
  public validateAnalysisTemplate = (
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    const schema = Joi.object({
      templateName: Joi.string().trim().min(3).max(100).required().messages({
        "string.min": "Template name must be at least 3 characters",
        "string.max": "Template name cannot exceed 100 characters",
      }),
      description: Joi.string().max(500).optional(),
      analysisTypes: Joi.array()
        .items(Joi.string().valid(...Object.values(AnalysisType)))
        .min(1)
        .max(4)
        .required(),
      options: Joi.object({
        includeSourceDetection: Joi.boolean().default(true),
        deepAnalysis: Joi.boolean().default(false),
        compareWithDatabase: Joi.boolean().default(false),
        extractTextFromFiles: Joi.boolean().default(true),
        languageDetection: Joi.boolean().default(false),
      }).required(),
      defaultPriority: Joi.string()
        .valid("low", "normal", "high")
        .default("normal"),
      category: Joi.string()
        .valid("assignment", "exam", "essay", "research", "general")
        .default("general"),
      isPublic: Joi.boolean().default(false),
      tags: Joi.array().items(Joi.string().max(50)).max(10).optional(),
    });

    this.validate(schema, req.body, res, next);
  };

  // Helper method to validate array of IDs in query string
  private validateIdArray(
    value: string,
    helpers: any,
    maxLength: number = 10
  ): string[] {
    try {
      const ids = value.split(",").map((id) => id.trim());

      if (ids.length > maxLength) {
        return helpers.error("array.max");
      }

      for (const id of ids) {
        if (!/^[0-9a-fA-F]{24}$/.test(id)) {
          return helpers.error("string.pattern.base");
        }
      }

      return ids;
    } catch (error) {
      return helpers.error("string.base");
    }
  }

  public validateAnalysisRequest = (
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    const schema = Joi.object({
      analysisTypes: Joi.array()
        .items(Joi.string().valid(...Object.values(AnalysisType)))
        .min(1)
        .max(4)
        .default([AnalysisType.PARAPHRASING])
        .messages({
          "array.min": "At least one analysis type is required",
          "array.max": "Maximum 4 analysis types allowed",
          "any.only": "Invalid analysis type",
        }),
      priority: Joi.string()
        .valid("low", "normal", "high")
        .default("normal")
        .messages({
          "any.only": "Priority must be low, normal, or high",
        }),
      options: Joi.object({
        includeSourceDetection: Joi.boolean().default(true),
        deepAnalysis: Joi.boolean().default(false),
        compareWithDatabase: Joi.boolean().default(false),
        extractTextFromFiles: Joi.boolean().default(true),
        languageDetection: Joi.boolean().default(false),
      }).default({}),
    });

    this.validate(schema, req.body, res, next);
  };

  // Validation for reanalysis request
  public validateReanalysisRequest = (
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    const schema = Joi.object({
      analysisTypes: Joi.array()
        .items(Joi.string().valid(...Object.values(AnalysisType)))
        .min(1)
        .max(4)
        .required()
        .messages({
          "array.min": "At least one analysis type is required",
          "array.max": "Maximum 4 analysis types allowed",
          "any.only": "Invalid analysis type",
          "any.required": "Analysis types are required for reanalysis",
        }),
      options: Joi.object({
        includeSourceDetection: Joi.boolean(),
        deepAnalysis: Joi.boolean(),
        compareWithDatabase: Joi.boolean(),
        extractTextFromFiles: Joi.boolean(),
        languageDetection: Joi.boolean(),
      }).default({}),
    });

    this.validate(schema, req.body, res, next);
  };

  // Validation for statistics query parameters
  public validateStatisticsQuery = (
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    const schema = Joi.object({
      startDate: Joi.date().iso().optional(),
      endDate: Joi.date().iso().min(Joi.ref("startDate")).optional(),
      analysisType: Joi.string()
        .valid(...Object.values(AnalysisType))
        .optional(),
      integrityRisk: Joi.string()
        .valid(...Object.values(IntegrityRisk))
        .optional(),
    }).and("startDate", "endDate");

    this.validate(schema, req.query, res, next);
  };

  // Validation for recent analyses query parameters
  public validateRecentAnalysesQuery = (
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    const schema = Joi.object({
      limit: Joi.number().integer().min(1).max(100).default(10).messages({
        "number.min": "Limit must be at least 1",
        "number.max": "Limit cannot exceed 100",
      }),
      status: Joi.string()
        .valid("pending", "processing", "completed", "failed")
        .optional(),
    });

    this.validate(schema, req.query, res, next);
  };

  // Validation for risk level parameter
  public validateRiskLevel = (
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    const schema = Joi.object({
      riskLevel: Joi.string()
        .valid(...Object.values(IntegrityRisk))
        .required()
        .messages({
          "any.only":
            "Invalid risk level. Valid values: low, medium, high, critical",
          "any.required": "Risk level is required",
        }),
    });

    this.validate(schema, req.params, res, next);
  };

  // Validation for cleanup days parameter
  public validateCleanupDays = (
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    const schema = Joi.object({
      days: Joi.number().integer().min(1).max(365).required().messages({
        "number.min": "Days must be at least 1",
        "number.max": "Days cannot exceed 365",
        "any.required": "Days parameter is required",
      }),
    });

    this.validate(schema, req.params, res, next);
  };

  // Validation for flag request
  public validateFlagRequest = (
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    const schema = Joi.object({
      reason: Joi.string().trim().min(5).max(500).required().messages({
        "string.min": "Reason must be at least 5 characters",
        "string.max": "Reason cannot exceed 500 characters",
        "any.required": "Reason is required",
      }),
      reviewerNotes: Joi.string().trim().max(1000).optional().messages({
        "string.max": "Reviewer notes cannot exceed 1000 characters",
      }),
    });

    this.validate(schema, req.body, res, next);
  };
}

export default new ValidationMiddleware();
