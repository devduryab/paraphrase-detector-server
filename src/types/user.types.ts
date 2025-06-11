import { Document } from "mongoose";



export enum UserRole {
  SUPER_ADMIN = "super_admin",
  FACULTY = "faculty",
  STUDENT = "student",
}

export enum UserStatus {
  ACTIVE = "active",
  INACTIVE = "inactive",
  SUSPENDED = "suspended",
  PENDING = "pending",
}

export interface IUser extends Document {
  _id: string;
  email: string;
  password: string;
  role: UserRole;
  status: UserStatus;
  profile: {
    firstName: string;
    lastName: string;
    phone?: string;
    avatar?: string;
  };
  lastLogin?: Date;
  isEmailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
  mustChangePassword: boolean; 
  passwordChangedAt?: Date;

  // Methods
  comparePassword(candidatePassword: string): Promise<boolean>;
  getFullName(): string;
  isActive(): boolean;
}

export interface IStudent extends IUser {
  studentId: string;
  enrolledCourses: string[]; // Course IDs
  semester: number;
  department: string;
  requestedCourses?: string[]; // Pending course requests
}

export interface IFaculty extends IUser {
  facultyId: string;
  department: string;
  subjects: string[]; // Subjects they can teach
  assignedCourses: string[]; // Currently assigned courses
  qualifications: string[];
}

export interface ISuperAdmin extends IUser {
  adminLevel: number; // 1 = Super Admin, 2 = Sub Admin (future use)
  permissions: string[];
}


export interface SuperAdminCreationResult {
  user: IUser;
  isNewlyCreated: boolean;
  temporaryPassword?: string;
}