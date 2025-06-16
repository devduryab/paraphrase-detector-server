import mongoose from "mongoose";

export interface ICourse {
  _id: string;
  courseId: string; 
  name: string;
  maxSlots: number;
  assignedFaculty: mongoose.Types.ObjectId[]; 
  enrolledStudents: mongoose.Types.ObjectId[]; 
  status: "active" | "inactive" | "full";
  createdBy: mongoose.Types.ObjectId; 
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCourseData {
  name: string;
  maxSlots: number;
  assignedFaculty: string[];
  status: "active" | "inactive";
}

export interface UpdateCourseData {
  name?: string;
  maxSlots?: number;
  assignedFaculty?: string[];
  status?: "active" | "inactive" | "full";
}

export interface CourseWithDetails extends ICourse {
  facultyDetails: {
    _id: string;
    profile: {
      firstName: string;
      lastName: string;
    };
    email: string;
  }[];
  enrolledCount: number;
  availableSlots: number;
}
