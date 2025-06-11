import jwt from "jsonwebtoken";
import { IUser, SuperAdminCreationResult, UserRole, UserStatus } from "../types/user.types";
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
      // Use single User model instead of checking multiple collections
      const user = (await User.findOne({ email: email.toLowerCase() })
        .select("+password")
        .exec()) as IUser | null;

      if (!user) {
        throw new Error("Invalid email or password");
      }

      // Check if user is active
      if (!user.isActive()) {
        throw new Error("Account is not active. Please contact administrator.");
      }

      // Compare password
      const isPasswordValid = await user.comparePassword(password);
      if (!isPasswordValid) {
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

      return {
        user: userResponse,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      };
    } catch (error: any) {
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
        console.log("👑 Super Admin already exists");
        return {
          user: existingSuperAdmin,
          isNewlyCreated: false,
        };
      }

      // Generate secure random password if not provided
      const providedPassword = process.env.SUPER_ADMIN_PASSWORD;
      const temporaryPassword =
        providedPassword || this.generateSecurePassword();

      // Create default super admin
      const superAdminData = {
        email: process.env.SUPER_ADMIN_EMAIL || "admin@aiparaphrasing.com",
        password: temporaryPassword,
        role: UserRole.SUPER_ADMIN,
        status: UserStatus.ACTIVE,
        profile: {
          firstName: "Super",
          lastName: "Administrator",
          phone: "+1234567890",
        },
        isEmailVerified: true,
        // Add flag to force password change on first login
        mustChangePassword: !providedPassword, // Force change if auto-generated
      };

      const superAdmin = new SuperAdmin(superAdminData);
      await superAdmin.save();

      console.log("👑 Super Admin created successfully");
      console.log(`📧 Email: ${superAdminData.email}`);

      // Only show password if it was auto-generated and only once
      if (!providedPassword) {
        console.log(
          "🔑 TEMPORARY PASSWORD (SAVE THIS - WON'T BE SHOWN AGAIN):"
        );
        console.log(`    ${temporaryPassword}`);
        console.log("⚠️  PASSWORD CHANGE REQUIRED ON FIRST LOGIN");
      } else {
        console.log("🔑 Using password from environment variables");
      }

      console.log("⚠️  Please secure your admin credentials immediately");

      return {
        user: superAdmin,
        isNewlyCreated: true,
        temporaryPassword: !providedPassword ? temporaryPassword : undefined,
      };
    } catch (error: any) {
      console.error("❌ Failed to create Super Admin:", error.message);
      throw new Error("Failed to create Super Admin");
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

  private generateSecurePassword(length: number = 16): string {
    const charset =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
    let password = "";

    // Ensure at least one of each required character type
    const requiredChars = [
      "ABCDEFGHIJKLMNOPQRSTUVWXYZ", // uppercase
      "abcdefghijklmnopqrstuvwxyz", // lowercase
      "0123456789", // numbers
      "!@#$%^&*", // special characters
    ];

    // Add one character from each required set
    requiredChars.forEach((chars) => {
      const randomIndex = crypto.randomInt(0, chars.length);
      password += chars[randomIndex];
    });

    // Fill the rest with random characters
    for (let i = password.length; i < length; i++) {
      const randomIndex = crypto.randomInt(0, charset.length);
      password += charset[randomIndex];
    }

    // Shuffle the password to avoid predictable patterns
    return password
      .split("")
      .sort(() => crypto.randomInt(-1, 2))
      .join("");
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
