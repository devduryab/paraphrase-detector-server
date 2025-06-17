import mongoose from "mongoose";

export enum AssignmentType {
  TEXT = "text",
  FILE_UPLOAD = "file_upload",
  BOTH = "both",
}

export enum AssignmentStatus {
  DRAFT = "draft",
  ACTIVE = "active",
  ARCHIVED = "archived",
}

export enum SubmissionStatus {
  NOT_SUBMITTED = "not_submitted",
  SUBMITTED = "submitted",
  LATE = "late",
  GRADED = "graded",
}

export interface IAssignment {
  _id: string;
  title: string;
  description: string;
  instructions?: string;
  courseId: mongoose.Types.ObjectId;
  facultyId: mongoose.Types.ObjectId;
  assignmentType: AssignmentType;
  maxScore: number;
  dueDate: Date;
  allowLateSubmission: boolean;
  latePenalty?: number; // Percentage penalty per day late
  attachmentFiles?: string[]; // File paths for assignment resources
  status: AssignmentStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface ISubmission {
  _id: string;
  assignmentId: mongoose.Types.ObjectId;
  studentId: mongoose.Types.ObjectId;
  submissionText?: string;
  submissionFiles?: string[]; // File paths for submitted files
  submittedAt: Date;
  isLate: boolean;
  grade?: number;
  feedback?: string;
  gradedBy?: mongoose.Types.ObjectId; // Faculty who graded
  gradedAt?: Date;
  status: SubmissionStatus;
  createdAt: Date;
  updatedAt: Date;
}

// Request/Response interfaces
export interface CreateAssignmentData {
  title: string;
  description: string;
  instructions?: string;
  courseId: string;
  assignmentType: AssignmentType;
  maxScore: number;
  dueDate: Date;
  allowLateSubmission: boolean;
  latePenalty?: number;
  status: AssignmentStatus;
}

export interface UpdateAssignmentData {
  title?: string;
  description?: string;
  instructions?: string;
  assignmentType?: AssignmentType;
  maxScore?: number;
  dueDate?: Date;
  allowLateSubmission?: boolean;
  latePenalty?: number;
  status?: AssignmentStatus;
}

export interface CreateSubmissionData {
  assignmentId: string;
  submissionText?: string;
  submissionFiles?: string[];
}

export interface UpdateSubmissionData {
  submissionText?: string;
  submissionFiles?: string[];
}

export interface GradeSubmissionData {
  grade: number;
  feedback?: string;
}

// Response interfaces
export interface AssignmentWithDetails extends IAssignment {
  course: {
    _id: string;
    name: string;
    courseId: string;
  };
  faculty: {
    _id: string;
    profile: {
      firstName: string;
      lastName: string;
    };
    email: string;
  };
  submissionCount: number;
  gradedCount: number;
  submissions?: SubmissionWithDetails[];
}

export interface SubmissionWithDetails extends ISubmission {
  assignment: {
    _id: string;
    title: string;
    maxScore: number;
    dueDate: Date;
  };
  student: {
    _id: string;
    profile: {
      firstName: string;
      lastName: string;
    };
    email: string;
  };
  course?: {
    _id: string;
    name: string;
    courseId: string;
  };
}

export interface AssignmentResponse {
  assignments: AssignmentWithDetails[];
}

export interface SingleAssignmentResponse {
  assignment: AssignmentWithDetails;
}

export interface SubmissionResponse {
  submissions: SubmissionWithDetails[];
}

export interface SingleSubmissionResponse {
  submission: SubmissionWithDetails;
}

export interface AssignmentStats {
  totalAssignments: number;
  activeAssignments: number;
  draftAssignments: number;
  archivedAssignments: number;
  totalSubmissions: number;
  gradedSubmissions: number;
  pendingGrading: number;
  averageGrade: number;
}

export interface ApiResponse<T> {
  status: "success" | "error";
  message: string;
  data?: T;
}
