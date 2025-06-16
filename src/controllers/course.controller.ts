import { Request, Response } from "express";
import { CreateCourseData, UpdateCourseData } from "../types/course.types";
import CourseService from "../services/course.services";

class CourseController {
  private courseService: CourseService;

  constructor() {
    this.courseService = CourseService.getInstance();
  }

  // Create new course (Admin only)
  public createCourse = async (req: Request, res: Response): Promise<void> => {
    try {
      const courseData: CreateCourseData = req.body;
      const createdBy = req.user._id;

      const course = await this.courseService.createCourse(
        courseData,
        createdBy
      );

      res.status(201).json({
        status: "success",
        message: "Course created successfully",
        data: { course },
      });
    } catch (error: any) {
      res.status(400).json({
        status: "error",
        message: error.message || "Failed to create course",
      });
    }
  };

  // Get all courses
  public getAllCourses = async (req: Request, res: Response): Promise<void> => {
    try {
      const { status, search, facultyId } = req.query;

      const courses = await this.courseService.getAllCourses({
        status: status as string,
        search: search as string,
        facultyId: facultyId as string,
      });

      res.status(200).json({
        status: "success",
        message: "Courses retrieved successfully",
        data: { courses },
      });
    } catch (error: any) {
      res.status(500).json({
        status: "error",
        message: error.message || "Failed to fetch courses",
      });
    }
  };

  // Get single course by ID
  public getCourseById = async (req: Request, res: Response): Promise<void> => {
    try {
      const courseId = req.params.courseId;
      if (!courseId) {
        res.status(400).json({
          status: "error",
          message: "Course ID is required",
        });
        return;
      }

      const course = await this.courseService.getCourseById(courseId);

      res.status(200).json({
        status: "success",
        message: "Course retrieved successfully",
        data: { course },
      });
    } catch (error: any) {
      res.status(404).json({
        status: "error",
        message: error.message || "Course not found",
      });
    }
  };

  // Update course (Admin only)
  public updateCourse = async (req: Request, res: Response): Promise<void> => {
    try {
      const courseId = req.params.courseId;
      const updateData: UpdateCourseData = req.body;

      if (!courseId) {
        res.status(400).json({
          status: "error",
          message: "Course ID is required",
        });
        return;
      }
      const course = await this.courseService.updateCourse(
        courseId,
        updateData
      );

      res.status(200).json({
        status: "success",
        message: "Course updated successfully",
        data: { course },
      });
    } catch (error: any) {
      res.status(400).json({
        status: "error",
        message: error.message || "Failed to update course",
      });
    }
  };

  // Delete course (Admin only)
  public deleteCourse = async (req: Request, res: Response): Promise<void> => {
    try {
      const courseId = req.params.courseId;
      if (!courseId) {
        res.status(400).json({
          status: "error",
          message: "Course ID is required",
        });
        return;
      }

      await this.courseService.deleteCourse(courseId);

      res.status(200).json({
        status: "success",
        message: "Course deleted successfully",
      });
    } catch (error: any) {
      res.status(400).json({
        status: "error",
        message: error.message || "Failed to delete course",
      });
    }
  };

  // Get available faculty for assignment
  public getAvailableFaculty = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const faculty = await this.courseService.getAvailableFaculty();

      res.status(200).json({
        status: "success",
        message: "Faculty retrieved successfully",
        data: { faculty },
      });
    } catch (error: any) {
      res.status(500).json({
        status: "error",
        message: error.message || "Failed to fetch faculty",
      });
    }
  };

  // Student enrollment
  public enrollStudent = async (req: Request, res: Response): Promise<void> => {
    try {
      const courseId = req.params.courseId;
      const studentId = req.user._id;

      if (!courseId) {
        res.status(400).json({
          status: "error",
          message: "Course ID is required",
        });
        return;
      }

      const course = await this.courseService.enrollStudent(
        courseId,
        studentId
      );

      res.status(200).json({
        status: "success",
        message: "Successfully enrolled in course",
        data: { course },
      });
    } catch (error: any) {
      res.status(400).json({
        status: "error",
        message: error.message || "Failed to enroll in course",
      });
    }
  };

  // Student unenrollment
  public unenrollStudent = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const courseId = req.params.courseId;
      const studentId = req.user._id;
      if (!courseId) {
        res.status(400).json({
          status: "error",
          message: "Course ID is required",
        });
        return;
      }

      const course = await this.courseService.unenrollStudent(
        courseId,
        studentId
      );

      res.status(200).json({
        status: "success",
        message: "Successfully unenrolled from course",
        data: { course },
      });
    } catch (error: any) {
      res.status(400).json({
        status: "error",
        message: error.message || "Failed to unenroll from course",
      });
    }
  };

  // Get faculty courses
  public getFacultyCourses = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const facultyId = req.user._id;

      const courses = await this.courseService.getFacultyCourses(facultyId);

      res.status(200).json({
        status: "success",
        message: "Faculty courses retrieved successfully",
        data: { courses },
      });
    } catch (error: any) {
      res.status(500).json({
        status: "error",
        message: error.message || "Failed to fetch faculty courses",
      });
    }
  };

  // Get student courses
  public getStudentCourses = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const studentId = req.user._id;

      const courses = await this.courseService.getStudentCourses(studentId);

      res.status(200).json({
        status: "success",
        message: "Student courses retrieved successfully",
        data: { courses },
      });
    } catch (error: any) {
      res.status(500).json({
        status: "error",
        message: error.message || "Failed to fetch student courses",
      });
    }
  };

  // Remove student from course (Admin only)
  public removeStudentFromCourse = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const courseId = req.params.courseId as string;
      const studentId = req.params.studentId as string;

      const course = await this.courseService.unenrollStudent(
        courseId,
        studentId
      );

      res.status(200).json({
        status: "success",
        message: "Student removed from course successfully",
        data: { course },
      });
    } catch (error: any) {
      res.status(400).json({
        status: "error",
        message: error.message || "Failed to remove student from course",
      });
    }
  };
}

export default new CourseController();
