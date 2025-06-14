import jwt from "jsonwebtoken";
import {
  IUser,
  SuperAdminCreationResult,
  UserRole,
  UserStatus,
} from "../types/user.types";
import { Faculty, Student, SuperAdmin, User } from "../models/user.model";
import crypto from "crypto";

interface TokenPayload {
  userId: string;
  email: string;
  role: UserRole;
}

interface AuthResponse {
  user: IUser;
  accessToken: string;
  refreshToken: string;
}

class AuthService {
  private static instance: AuthService;

  private constructor() {}

  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  private getModelByRole(role: UserRole) {
    switch (role) {
      case UserRole.STUDENT:
        return Student;
      case UserRole.FACULTY:
        return Faculty;
      case UserRole.SUPER_ADMIN:
        return SuperAdmin;
      default:
        return User;
    }
  }

  public generateTokens(payload: TokenPayload): {
    accessToken: string;
    refreshToken: string;
  } {
    const jwtSecret = process.env.JWT_SECRET;
    const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET;

    if (!jwtSecret || !jwtRefreshSecret) {
      throw new Error("JWT secrets not configured");
    }

    // Use direct values without complex typing
    const accessToken = jwt.sign(payload, jwtSecret, {
      expiresIn: "7d",
    });

    const refreshToken = jwt.sign(payload, jwtRefreshSecret, {
      expiresIn: "30d",
    });

    return { accessToken, refreshToken };
  }

  // Verify JWT token
  public verifyToken(
    token: string,
    isRefreshToken: boolean = false
  ): TokenPayload {
    const secret = isRefreshToken
      ? process.env.JWT_REFRESH_SECRET
      : process.env.JWT_SECRET;

    if (!secret) {
      throw new Error("JWT secret not configured");
    }

    try {
      return jwt.verify(token, secret) as TokenPayload;
    } catch (error: any) {
      if (error.name === "TokenExpiredError") {
        throw new Error("Token has expired");
      } else if (error.name === "JsonWebTokenError") {
        throw new Error("Invalid token");
      }
      throw new Error("Token verification failed");
    }
  }

  // Login user
  public async login(email: string, password: string): Promise<AuthResponse> {
    try {
      console.log("🔍 Login attempt for email:", email);

      // Use single User model instead of checking multiple collections
      const user = (await User.findOne({ email: email.toLowerCase() })
        .select("+password")
        .exec()) as IUser | null;

      console.log("🔍 User found in database:", !!user);
      if (user) {
        console.log("🔍 User role:", user.role);
        console.log("🔍 User status:", user.status);
        console.log("🔍 User has password:", !!user.password);
      }

      if (!user) {
        console.log("❌ No user found for email:", email);
        throw new Error("Invalid email or password");
      }
      console.log("🔍 User status from DB:", user.status);
      console.log("🔍 UserStatus.ACTIVE constant:", UserStatus.ACTIVE);
      console.log("🔍 isActive() result:", user.isActive());
      // Check if user is active
      if (!user.isActive()) {
        console.log("❌ User is not active. Status:", user.status);
        throw new Error("Account is not active. Please contact administrator.");
      }

      // Compare password
      console.log("🔍 Comparing passwords...");
      const isPasswordValid = await user.comparePassword(password);
      console.log("🔍 Password valid:", isPasswordValid);

      if (!isPasswordValid) {
        console.log("❌ Password comparison failed");
        throw new Error("Invalid email or password");
      }

      // Update last login
      user.lastLogin = new Date();
      await user.save();

      // Generate tokens
      const tokenPayload: TokenPayload = {
        userId: user._id,
        email: user.email,
        role: user.role,
      };

      const tokens = this.generateTokens(tokenPayload);

      // Remove password from response
      const userResponse = user.toJSON() as IUser;

      console.log("✅ Login successful for user:", user.email);
      return {
        user: userResponse,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      };
    } catch (error: any) {
      console.error("❌ Login error:", error.message);
      throw new Error(error.message || "Login failed");
    }
  }

  // Create Super Admin (Default)
  public async createSuperAdmin(): Promise<SuperAdminCreationResult> {
    try {
      // Check if super admin already exists
      const existingSuperAdmin = await User.findOne({
        role: UserRole.SUPER_ADMIN,
      });

      if (existingSuperAdmin) {
        console.log("✅ Super Admin already exists - skipping creation");
        return {
          user: existingSuperAdmin,
          isNewlyCreated: false,
        };
      }

      // Create super admin ONLY if it doesn't exist
      console.log("🆕 Creating super admin for the first time...");

      const superAdminData = {
        email: "admin@aiparaphrasing.com", // Hardcoded
        password: "Admin@123456", // Hardcoded
        role: UserRole.SUPER_ADMIN,
        status: UserStatus.ACTIVE,
        profile: {
          firstName: "Super",
          lastName: "Administrator",
        },
        isEmailVerified: true,
      };

      const superAdmin = new SuperAdmin(superAdminData);
      await superAdmin.save();

      console.log("👑 Super Admin created successfully");
      console.log(`📧 Email: ${superAdminData.email}`);
      console.log(`🔑 Password: ${superAdminData.password}`);
      console.log("✅ Use these credentials to login");

      return {
        user: superAdmin,
        isNewlyCreated: true,
      };
    } catch (error: any) {
      console.error("❌ Failed to create Super Admin:", error.message);
      throw new Error("Failed to create Super Admin");
    }
  }

  public async forceResetSuperAdmin(): Promise<SuperAdminCreationResult> {
    try {
      console.log("🚨 FORCE RESETTING SUPER ADMIN...");

      // Step 1: Delete ALL super admins
      const deleteResult = await User.deleteMany({
        role: UserRole.SUPER_ADMIN,
      });
      console.log(
        `🗑️ Deleted ${deleteResult.deletedCount} existing super admin(s)`
      );

      // Step 2: Create fresh super admin with known credentials
      console.log(
        "🆕 Creating fresh super admin with hardcoded credentials..."
      );

      const superAdminData = {
        email: "admin@aiparaphrasing.com",
        password: "Admin@123456", // This will be properly hashed by the pre-save hook
        role: UserRole.SUPER_ADMIN,
        status: UserStatus.ACTIVE,
        profile: {
          firstName: "Super",
          lastName: "Administrator",
        },
        isEmailVerified: true,
      };

      // Create and save - this will trigger password hashing
      const superAdmin = new SuperAdmin(superAdminData);
      await superAdmin.save();

      console.log("✅ Fresh super admin created successfully!");
      console.log("📧 Email: admin@aiparaphrasing.com");
      console.log("🔑 Password: Admin@123456");
      console.log("🔒 Password has been properly hashed and stored");

      // Verify the new admin was created correctly
      const verifyAdmin = await User.findOne({
        role: UserRole.SUPER_ADMIN,
      }).select("+password");
      console.log("🔍 Verification - New admin exists:", !!verifyAdmin);
      console.log(
        "🔍 Verification - New admin has password:",
        !!verifyAdmin?.password
      );

      return {
        user: superAdmin,
        isNewlyCreated: true,
      };
    } catch (error: any) {
      console.error("❌ Force reset failed:", error.message);
      throw new Error("Failed to force reset super admin");
    }
  }

  // Register new user (Only Super Admin can do this)
  public async registerUser(userData: {
    email: string;
    password: string;
    role: UserRole;
    profile: {
      firstName: string;
      lastName: string;
      phone?: string;
    };
    additionalData?: any;
  }): Promise<IUser> {
    try {
      // Check if user already exists
      const existingUser = await User.findOne({
        email: userData.email.toLowerCase(),
      });

      if (existingUser) {
        throw new Error("User with this email already exists");
      }

      // Get the appropriate model based on role
      const UserModel = this.getModelByRole(userData.role);

      // Create new user in the appropriate collection
      const newUser = new UserModel({
        email: userData.email.toLowerCase(),
        password: userData.password,
        role: userData.role,
        status: UserStatus.ACTIVE,
        profile: userData.profile,
        isEmailVerified: false,
      });

      await newUser.save();
      return newUser;
    } catch (error: any) {
      throw new Error(error.message || "User registration failed");
    }
  }

  // Get user by ID
  public async getUserById(userId: string): Promise<IUser | null> {
    try {
      const user = (await User.findById(userId).exec()) as IUser | null;
      return user;
    } catch (error) {
      return null;
    }
  }

  // Change password
  public async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    try {
      const user = (await User.findById(userId).select(
        "+password"
      )) as IUser | null;

      if (!user) {
        throw new Error("User not found");
      }

      const isCurrentPasswordValid = await user.comparePassword(
        currentPassword
      );
      if (!isCurrentPasswordValid) {
        throw new Error("Current password is incorrect");
      }

      user.password = newPassword;
      await user.save();
    } catch (error: any) {
      throw new Error(error.message || "Password change failed");
    }
  }

  public async requiresPasswordChange(userId: string): Promise<boolean> {
    try {
      const user = await User.findById(userId);
      return user?.mustChangePassword || false;
    } catch (error) {
      return false;
    }
  }
}

export default AuthService;
