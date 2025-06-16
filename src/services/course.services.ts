import { Course } from "../models/course.model";
import { User } from "../models/user.model";
import {
  CreateCourseData,
  UpdateCourseData,
  ICourse,
} from "../types/course.types";
import { UserRole } from "../types/user.types";

class CourseService {
  private static instance: CourseService;

  private constructor() {}

  public static getInstance(): CourseService {
    if (!CourseService.instance) {
      CourseService.instance = new CourseService();
    }
    return CourseService.instance;
  }

  // Create new course
  public async createCourse(
    courseData: CreateCourseData,
    createdBy: string
  ): Promise<ICourse> {
    try {
      // Validate that assigned faculty exist and are actually faculty
      const facultyUsers = await User.find({
        _id: { $in: courseData.assignedFaculty },
        role: UserRole.FACULTY,
        status: "active",
      });

      if (facultyUsers.length !== courseData.assignedFaculty.length) {
        throw new Error(
          "Some assigned faculty members are invalid or inactive"
        );
      }

      const course = new Course({
        ...courseData,
        courseId: undefined,
        createdBy,
        enrolledStudents: [],
      });

      await course.save();
      return course;
    } catch (error: any) {
      throw new Error(error.message || "Failed to create course");
    }
  }

  // Get all courses with details
  public async getAllCourses(
    filters: {
      status?: string;
      search?: string;
      facultyId?: string;
    } = {}
  ): Promise<any[]> {
    try {
      const query: any = {};

      if (filters.status) {
        query.status = filters.status;
      }

      if (filters.search) {
        query.$or = [
          { name: { $regex: filters.search, $options: "i" } },
          { courseId: { $regex: filters.search, $options: "i" } },
        ];
      }

      if (filters.facultyId) {
        query.assignedFaculty = filters.facultyId;
      }

      const courses = await Course.find(query)
        .populate("assignedFaculty", "profile email")
        .populate("createdBy", "profile email")
        .sort({ createdAt: -1 });

      return courses.map((course) => ({
        ...course.toJSON(),
        enrolledCount: course.enrolledStudents.length,
        availableSlots: course.maxSlots - course.enrolledStudents.length,
      }));
    } catch (error: any) {
      throw new Error(error.message || "Failed to fetch courses");
    }
  }

  // Get course by ID with details
  public async getCourseById(courseId: string): Promise<any> {
    try {
      const course = await Course.findById(courseId)
        .populate("assignedFaculty", "profile email")
        .populate("enrolledStudents", "profile email")
        .populate("createdBy", "profile email");

      if (!course) {
        throw new Error("Course not found");
      }

      return {
        ...course.toJSON(),
        enrolledCount: course.enrolledStudents.length,
        availableSlots: course.maxSlots - course.enrolledStudents.length,
      };
    } catch (error: any) {
      throw new Error(error.message || "Failed to fetch course");
    }
  }

  // Update course
  public async updateCourse(
    courseId: string,
    updateData: UpdateCourseData
  ): Promise<ICourse> {
    try {
      // If updating assigned faculty, validate they exist and are faculty
      if (updateData.assignedFaculty) {
        const facultyUsers = await User.find({
          _id: { $in: updateData.assignedFaculty },
          role: UserRole.FACULTY,
          status: "active",
        });

        if (facultyUsers.length !== updateData.assignedFaculty.length) {
          throw new Error(
            "Some assigned faculty members are invalid or inactive"
          );
        }
      }

      const course = await Course.findByIdAndUpdate(
        courseId,
        { $set: updateData },
        { new: true, runValidators: true }
      );

      if (!course) {
        throw new Error("Course not found");
      }

      return course;
    } catch (error: any) {
      throw new Error(error.message || "Failed to update course");
    }
  }

  // Delete course
  public async deleteCourse(courseId: string): Promise<void> {
    try {
      const course = await Course.findById(courseId);

      if (!course) {
        throw new Error("Course not found");
      }

      if (course.enrolledStudents.length > 0) {
        throw new Error("Cannot delete course with enrolled students");
      }

      await Course.findByIdAndDelete(courseId);
    } catch (error: any) {
      throw new Error(error.message || "Failed to delete course");
    }
  }

  // student enrollment
  public async enrollStudent(
    courseId: string,
    studentId: string
  ): Promise<ICourse> {
    try {
      const course = await Course.findById(courseId);

      if (!course) {
        throw new Error("Course not found");
      }

      if (course.status !== "active") {
        throw new Error("Course is not available for enrollment");
      }

      if (course.enrolledStudents.length >= course.maxSlots) {
        throw new Error("Course is full");
      }

      if (course.enrolledStudents.includes(studentId as any)) {
        throw new Error("Student is already enrolled in this course");
      }

      // Check if student already has 4 courses
      const studentCourseCount = await Course.countDocuments({
        enrolledStudents: studentId,
      });

      if (studentCourseCount >= 4) {
        throw new Error("Student cannot enroll in more than 4 courses");
      }

      course.enrolledStudents.push(studentId as any);
      await course.save();

      return course;
    } catch (error: any) {
      throw new Error(error.message || "Failed to enroll student");
    }
  }

  // Student unenrollment
  public async unenrollStudent(
    courseId: string,
    studentId: string
  ): Promise<ICourse> {
    try {
      const course = await Course.findById(courseId);

      if (!course) {
        throw new Error("Course not found");
      }

      const studentIndex = course.enrolledStudents.indexOf(studentId as any);
      if (studentIndex === -1) {
        throw new Error("Student is not enrolled in this course");
      }

      course.enrolledStudents.splice(studentIndex, 1);
      await course.save();

      return course;
    } catch (error: any) {
      throw new Error(error.message || "Failed to unenroll student");
    }
  }

  // Get available faculty for course assignment
  public async getAvailableFaculty(): Promise<any[]> {
    try {
      const faculty = await User.find({
        role: UserRole.FACULTY,
        status: "active",
      }).select("profile email");

      return faculty;
    } catch (error: any) {
      throw new Error(error.message || "Failed to fetch faculty");
    }
  }

  // Get courses for specific faculty
  public async getFacultyCourses(facultyId: string): Promise<any[]> {
    try {
      const courses = await Course.find({
        assignedFaculty: facultyId,
      })
        .populate("enrolledStudents", "profile email")
        .sort({ createdAt: -1 });

      return courses.map((course) => ({
        ...course.toJSON(),
        enrolledCount: course.enrolledStudents.length,
        availableSlots: course.maxSlots - course.enrolledStudents.length,
      }));
    } catch (error: any) {
      throw new Error(error.message || "Failed to fetch faculty courses");
    }
  }

  // Get student's enrolled courses
  public async getStudentCourses(studentId: string): Promise<any[]> {
    try {
      const courses = await Course.find({
        enrolledStudents: studentId,
      })
        .populate("assignedFaculty", "profile email")
        .sort({ createdAt: -1 });

      return courses.map((course) => ({
        ...course.toJSON(),
        enrolledCount: course.enrolledStudents.length,
        availableSlots: course.maxSlots - course.enrolledStudents.length,
      }));
    } catch (error: any) {
      throw new Error(error.message || "Failed to fetch student courses");
    }
  }
}

export default CourseService;
