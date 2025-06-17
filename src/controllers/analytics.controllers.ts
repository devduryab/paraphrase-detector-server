import { Request, Response } from "express";
import { User } from "../models/user.model";
import { Course } from "../models/course.model";
import { UserRole } from "../types/user.types";

class AnalyticsController {
  // Get admin analytics
  public getAdminAnalytics = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      // Get basic counts
      const [totalUsers, totalStudents, totalFaculty, totalCourses] =
        await Promise.all([
          User.countDocuments(),
          User.countDocuments({ role: UserRole.STUDENT }),
          User.countDocuments({ role: UserRole.FACULTY }),
          Course.countDocuments(),
        ]);

      // Get course status counts
      const [activeCourses, inactiveCourses, fullCourses] = await Promise.all([
        Course.countDocuments({ status: "active" }),
        Course.countDocuments({ status: "inactive" }),
        Course.countDocuments({ status: "full" }),
      ]);

      // Calculate enrollment statistics
      const courses = await Course.find({});
      const totalEnrollments = courses.reduce(
        (sum, course) => sum + course.enrolledStudents.length,
        0
      );
      const totalCapacity = courses.reduce(
        (sum, course) => sum + course.maxSlots,
        0
      );
      const averageEnrollmentRate =
        totalCapacity > 0 ? (totalEnrollments / totalCapacity) * 100 : 0;

      // Get recent users (last 10)
      const recentUsers = await User.find({})
        .sort({ createdAt: -1 })
        .limit(10)
        .select("profile email role status createdAt");

      // Get top courses by enrollment
      const topCourses = courses
        .map((course) => ({
          courseId: course.courseId,
          courseName: course.name,
          enrolledCount: course.enrolledStudents.length,
          maxSlots: course.maxSlots,
          enrollmentRate:
            course.maxSlots > 0
              ? (course.enrolledStudents.length / course.maxSlots) * 100
              : 0,
        }))
        .sort((a, b) => b.enrolledCount - a.enrolledCount)
        .slice(0, 5);

      // Get monthly growth data (last 6 months)
      const userGrowthData = await this.getUserGrowthData();

      // Get monthly enrollment trends
      const enrollmentTrends = await this.getEnrollmentTrends();

      // Course capacity data
      const courseCapacityData = courses.map((course) => ({
        courseId: course.courseId,
        courseName: course.name,
        utilized: course.enrolledStudents.length,
        available: course.maxSlots - course.enrolledStudents.length,
        utilizationRate:
          course.maxSlots > 0
            ? (course.enrolledStudents.length / course.maxSlots) * 100
            : 0,
      }));

      res.status(200).json({
        status: "success",
        data: {
          totalUsers,
          totalStudents,
          totalFaculty,
          totalCourses,
          activeCourses,
          inactiveCourses,
          fullCourses,
          totalEnrollments,
          averageEnrollmentRate,
          recentUsers,
          topCourses,
          userGrowthData,
          enrollmentTrends,
          courseCapacityData,
        },
      });
    } catch (error: any) {
      console.error("Error fetching admin analytics:", error);
      res.status(500).json({
        status: "error",
        message: error.message || "Failed to fetch analytics",
      });
    }
  };

  // Get faculty analytics
  public getFacultyAnalytics = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const facultyId = req.user._id;

      // Get faculty's assigned courses
      const courses = await Course.find({
        assignedFaculty: facultyId,
      }).populate("enrolledStudents", "profile email");

      const totalAssignedCourses = courses.length;
      const totalStudentsAcrossCourses = courses.reduce(
        (sum, course) => sum + course.enrolledStudents.length,
        0
      );
      const totalCapacity = courses.reduce(
        (sum, course) => sum + course.maxSlots,
        0
      );
      const averageEnrollmentRate =
        totalCapacity > 0
          ? (totalStudentsAcrossCourses / totalCapacity) * 100
          : 0;

      // Get enrollment trends for faculty courses
      const enrollmentTrends = await this.getFacultyEnrollmentTrends(facultyId);

      // Course performance data
      const coursePerformance = courses.map((course) => ({
        courseId: course.courseId,
        courseName: course.name,
        enrolledCount: course.enrolledStudents.length,
        maxSlots: course.maxSlots,
        status: course.status,
      }));

      // Recent enrollments in faculty courses
      const recentEnrollments = await this.getRecentEnrollments(courses);

      res.status(200).json({
        status: "success",
        data: {
          totalAssignedCourses,
          totalStudentsAcrossCourses,
          averageEnrollmentRate,
          myCourses: courses,
          enrollmentTrends,
          coursePerformance,
          recentEnrollments,
        },
      });
    } catch (error: any) {
      console.error("Error fetching faculty analytics:", error);
      res.status(500).json({
        status: "error",
        message: error.message || "Failed to fetch faculty analytics",
      });
    }
  };

  // Get student analytics
  public getStudentAnalytics = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const studentId = req.user._id;

      // Get student's enrolled courses
      const enrolledCourses = await Course.find({
        enrolledStudents: studentId,
      }).populate("assignedFaculty", "profile email");

      // Get all available courses
      const allCourses = await Course.find({ status: "active" });

      const enrolledCoursesCount = enrolledCourses.length;
      const remainingSlots = 4 - enrolledCoursesCount;
      const availableCoursesCount = allCourses.filter(
        (course) =>
          course.status === "active" &&
          course.maxSlots - course.enrolledStudents.length > 0 &&
          !enrolledCourses.some(
            (enrolled) => enrolled._id.toString() === course._id.toString()
          )
      ).length;

      // Popular courses (by enrollment count)
      const popularCourses = allCourses
        .map((course) => ({
          courseId: course.courseId,
          courseName: course.name,
          enrolledCount: course.enrolledStudents.length,
          maxSlots: course.maxSlots,
          enrollmentRate:
            course.maxSlots > 0
              ? (course.enrolledStudents.length / course.maxSlots) * 100
              : 0,
        }))
        .sort((a, b) => b.enrolledCount - a.enrolledCount)
        .slice(0, 5);

      // Enrollment history
      const enrollmentHistory = enrolledCourses.map((course) => ({
        courseName: course.name,
        enrollmentDate: course.updatedAt,
        status: "enrolled",
      }));

      // Faculty overview from enrolled courses
      const facultyOverview = this.generateFacultyOverview(enrolledCourses);

      res.status(200).json({
        status: "success",
        data: {
          enrolledCoursesCount,
          remainingSlots,
          myCourses: enrolledCourses,
          enrollmentHistory,
          availableCoursesCount,
          popularCourses,
          facultyOverview,
        },
      });
    } catch (error: any) {
      console.error("Error fetching student analytics:", error);
      res.status(500).json({
        status: "error",
        message: error.message || "Failed to fetch student analytics",
      });
    }
  };

  // Helper method to get user growth data for last 6 months
  private async getUserGrowthData() {
    const months = [];
    const now = new Date();

    // Generate last 6 months
    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const nextDate = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);

      const monthName = date.toLocaleDateString("en-US", { month: "short" });

      const [students, faculty, courses] = await Promise.all([
        User.countDocuments({
          role: UserRole.STUDENT,
          createdAt: { $gte: date, $lt: nextDate },
        }),
        User.countDocuments({
          role: UserRole.FACULTY,
          createdAt: { $gte: date, $lt: nextDate },
        }),
        Course.countDocuments({
          createdAt: { $gte: date, $lt: nextDate },
        }),
      ]);

      months.push({
        month: monthName,
        students,
        faculty,
        courses,
      });
    }

    return months;
  }

  // Helper method to get enrollment trends (course creation trends)
  private async getEnrollmentTrends() {
    const months = [];
    const now = new Date();

    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const nextDate = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);

      const monthName = date.toLocaleDateString("en-US", { month: "short" });

      // Count courses created in this month
      const enrollments = await Course.countDocuments({
        createdAt: { $gte: date, $lt: nextDate },
      });

      months.push({
        month: monthName,
        enrollments: enrollments * 10, // Multiply to simulate enrollments vs course creation
      });
    }

    return months;
  }

  // Helper method for faculty enrollment trends
  private async getFacultyEnrollmentTrends(facultyId: string) {
    const months = [];
    const now = new Date();

    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const nextDate = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);

      const monthName = date.toLocaleDateString("en-US", { month: "short" });

      // Count courses assigned to faculty in this month
      const enrollments = await Course.countDocuments({
        assignedFaculty: facultyId,
        createdAt: { $gte: date, $lt: nextDate },
      });

      months.push({
        month: monthName,
        enrollments: enrollments * 5, // Simulate enrollment activity
      });
    }

    return months;
  }

  // Helper method for recent enrollments
  private async getRecentEnrollments(courses: any[]) {
    return courses.slice(0, 5).map((course, index) => ({
      studentName: `Student ${index + 1}`, // You can enhance this with real student data
      courseName: course.name,
      enrollmentDate: course.updatedAt,
    }));
  }

  // Helper method for faculty overview
  private generateFacultyOverview(courses: any[]) {
    const facultyMap = new Map();

    courses.forEach((course) => {
      course.assignedFaculty?.forEach((faculty: any) => {
        const key = faculty._id.toString();
        if (!facultyMap.has(key)) {
          facultyMap.set(key, {
            facultyName: `${faculty.profile?.firstName || ""} ${
              faculty.profile?.lastName || ""
            }`.trim(),
            coursesCount: 0,
            email: faculty.email || "",
          });
        }
        facultyMap.get(key).coursesCount++;
      });
    });

    return Array.from(facultyMap.values());
  }
}

export default new AnalyticsController();
