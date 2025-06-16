import { Router } from 'express';
import AuthMiddleware from '../middlewares/auth.middleware';
import ValidationMiddleware from '../middlewares/validation.middleware';
import courseControllers from '../controllers/course.controller';
class CourseRoutes {
  public router: Router;

  constructor() {
    this.router = Router();
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    
    // Admin routes (Super Admin only)
    
    /**
     * @route   POST /api/courses
     * @desc    Create new course
     * @access  Private (Super Admin only)
     */
    this.router.post(
      '/',
      AuthMiddleware.authenticate,
      AuthMiddleware.superAdminOnly,
      ValidationMiddleware.validateCreateCourse,
      courseControllers.createCourse
    );

    /**
     * @route   GET /api/courses/faculty
     * @desc    Get available faculty for course assignment
     * @access  Private (Super Admin only)
     */
    this.router.get(
      '/faculty',
      AuthMiddleware.authenticate,
      AuthMiddleware.superAdminOnly,
      courseControllers.getAvailableFaculty
    );

    /**
     * @route   PUT /api/courses/:courseId
     * @desc    Update course
     * @access  Private (Super Admin only)
     */
    this.router.put(
      '/:courseId',
      AuthMiddleware.authenticate,
      AuthMiddleware.superAdminOnly,
      ValidationMiddleware.validateObjectId('courseId'),
      ValidationMiddleware.validateUpdateCourse,
      courseControllers.updateCourse
    );

    /**
     * @route   DELETE /api/courses/:courseId
     * @desc    Delete course
     * @access  Private (Super Admin only)
     */
    this.router.delete(
      '/:courseId',
      AuthMiddleware.authenticate,
      AuthMiddleware.superAdminOnly,
      ValidationMiddleware.validateObjectId('courseId'),
      courseControllers.deleteCourse
    );

    /**
     * @route   DELETE /api/courses/:courseId/students/:studentId
     * @desc    Remove student from course
     * @access  Private (Super Admin only)
     */
    this.router.delete(
      '/:courseId/students/:studentId',
      AuthMiddleware.authenticate,
      AuthMiddleware.superAdminOnly,
      ValidationMiddleware.validateObjectId('courseId'),
      ValidationMiddleware.validateObjectId('studentId'),
      courseControllers.removeStudentFromCourse
    );

    // Faculty routes
    
    /**
     * @route   GET /api/courses/my-courses
     * @desc    Get courses assigned to current faculty
     * @access  Private (Faculty only)
     */
    this.router.get(
      '/my-courses',
      AuthMiddleware.authenticate,
      AuthMiddleware.facultyAccess,
      courseControllers.getFacultyCourses
    );

    // Student routes
    
    /**
     * @route   GET /api/courses/my-enrollments
     * @desc    Get courses student is enrolled in
     * @access  Private (Student only)
     */
    this.router.get(
      '/my-enrollments',
      AuthMiddleware.authenticate,
      AuthMiddleware.studentAccess,
      courseControllers.getStudentCourses
    );

    /**
     * @route   POST /api/courses/:courseId/enroll
     * @desc    Enroll student in course
     * @access  Private (Student only)
     */
    this.router.post(
      '/:courseId/enroll',
      AuthMiddleware.authenticate,
      AuthMiddleware.studentAccess,
      ValidationMiddleware.validateObjectId('courseId'),
      courseControllers.enrollStudent
    );

    /**
     * @route   POST /api/courses/:courseId/unenroll
     * @desc    Unenroll student from course
     * @access  Private (Student only)
     */
    this.router.post(
      '/:courseId/unenroll',
      AuthMiddleware.authenticate,
      AuthMiddleware.studentAccess,
      ValidationMiddleware.validateObjectId('courseId'),
      courseControllers.unenrollStudent
    );

    // Common routes (All authenticated users)
    
    /**
     * @route   GET /api/courses
     * @desc    Get all courses with filters
     * @access  Private (All authenticated users)
     */
    this.router.get(
      '/',
      AuthMiddleware.authenticate,
      ValidationMiddleware.validateCourseQuery,
      courseControllers.getAllCourses
    );

    /**
     * @route   GET /api/courses/:courseId
     * @desc    Get single course by ID
     * @access  Private (All authenticated users)
     */
    this.router.get(
      '/:courseId',
      AuthMiddleware.authenticate,
      ValidationMiddleware.validateObjectId('courseId'),
      courseControllers.getCourseById
    );
  }
}

export default new CourseRoutes().router;