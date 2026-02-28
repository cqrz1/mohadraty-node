const express = require('express');
const adminController = require('../controllers/admin.controller');
const { requireAdmin, requireSuperAdmin } = require('../middlewares/auth');
const {
  studentPhotoUpload,
  professorPhotoUpload,
  lectureUpload,
  sheetUpload
} = require('../middlewares/upload');
const { setFlash } = require('../services/flash.service');
const { authRateLimit, csrfProtection, attachCsrfToken } = require('../middlewares/security');

const router = express.Router();

function mapUploadErrorToArabic(code) {
  if (code === 'INVALID_PHOTO_EXTENSION') {
    return 'يُسمح فقط بصور JPG و PNG.';
  }
  if (code === 'INVALID_LECTURE_EXTENSION') {
    return 'يجب أن يكون الملف PDF أو PPT أو PPTX فقط.';
  }
  if (code === 'INVALID_SHEET_EXTENSION') {
    return 'يجب أن يكون الملف PDF أو DOCX فقط.';
  }
  if (code === 'LIMIT_FILE_SIZE') {
    return 'حجم الملف كبير جدًا. الحد الأقصى 20MB.';
  }
  return 'حدث خطأ أثناء رفع الملف.';
}

function uploadSingle(uploadMiddleware, fieldName, redirectPath) {
  return (req, res, next) => {
    uploadMiddleware.single(fieldName)(req, res, (error) => {
      if (!error) {
        return next();
      }

      setFlash(req, mapUploadErrorToArabic(error.message || error.code), 'error');
      return res.redirect(redirectPath);
    });
  };
}

router.get('/login', csrfProtection, attachCsrfToken, adminController.getLogin);
router.post('/login', authRateLimit, csrfProtection, attachCsrfToken, adminController.postLogin);

router.get('/logout', requireAdmin, adminController.logout);
router.get('/', requireAdmin, csrfProtection, attachCsrfToken, adminController.getDashboard);

router.get('/admins', requireAdmin, csrfProtection, attachCsrfToken, adminController.getAdmins);
router.post('/admins/add', requireSuperAdmin, csrfProtection, adminController.postAddAdmin);
router.post('/admins/update/:adminId', requireSuperAdmin, csrfProtection, adminController.postUpdateAdmin);
router.post('/admins/delete/:adminId', requireSuperAdmin, csrfProtection, adminController.postDeleteAdmin);
router.post('/delete/:id', requireSuperAdmin, csrfProtection, adminController.postDeleteAdmin);
router.delete('/delete/:id', requireSuperAdmin, csrfProtection, adminController.postDeleteAdmin);

router.get('/students', requireAdmin, csrfProtection, attachCsrfToken, adminController.getStudents);
router.post(
  '/students/save',
  requireAdmin,
  uploadSingle(studentPhotoUpload, 'student_photo', '/admin/students'),
  csrfProtection,
  adminController.postSaveStudent
);
router.post('/students/delete/:studentId', requireAdmin, csrfProtection, adminController.postDeleteStudent);

router.get('/professors', requireAdmin, csrfProtection, attachCsrfToken, adminController.getProfessors);
router.post(
  '/professors/save',
  requireAdmin,
  uploadSingle(professorPhotoUpload, 'professor_photo', '/admin/professors'),
  csrfProtection,
  adminController.postSaveProfessor
);
router.post('/professors/delete/:professorId', requireSuperAdmin, csrfProtection, adminController.postDeleteProfessor);

router.get('/lectures', requireAdmin, csrfProtection, attachCsrfToken, adminController.getLectures);
router.post(
  '/lectures/add',
  requireAdmin,
  uploadSingle(lectureUpload, 'lecture_file', '/admin/lectures'),
  csrfProtection,
  adminController.postAddLecture
);
router.post('/lectures/delete/:lectureId', requireSuperAdmin, csrfProtection, adminController.postDeleteLecture);

router.get('/sheets', requireAdmin, csrfProtection, attachCsrfToken, adminController.getSheets);
router.post(
  '/sheets/add',
  requireAdmin,
  uploadSingle(sheetUpload, 'sheet_file', '/admin/sheets'),
  csrfProtection,
  adminController.postAddSheet
);
router.post('/sheets/delete/:sheetId', requireSuperAdmin, csrfProtection, adminController.postDeleteSheet);

module.exports = router;
