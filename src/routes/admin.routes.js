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

router.get('/login', adminController.getLogin);
router.post('/login', adminController.postLogin);

router.get('/logout', requireAdmin, adminController.logout);
router.get('/', requireAdmin, adminController.getDashboard);

router.get('/admins', requireAdmin, adminController.getAdmins);
router.post('/admins/add', requireAdmin, adminController.postAddAdmin);
router.post('/admins/update/:adminId', requireSuperAdmin, adminController.postUpdateAdmin);
router.post('/admins/delete/:adminId', requireSuperAdmin, adminController.postDeleteAdmin);
router.post('/delete/:id', requireSuperAdmin, adminController.postDeleteAdmin);
router.delete('/delete/:id', requireSuperAdmin, adminController.postDeleteAdmin);

router.get('/students', requireAdmin, adminController.getStudents);
router.post(
  '/students/save',
  requireAdmin,
  uploadSingle(studentPhotoUpload, 'student_photo', '/admin/students'),
  adminController.postSaveStudent
);
router.post('/students/delete/:studentId', requireAdmin, adminController.postDeleteStudent);

router.get('/professors', requireAdmin, adminController.getProfessors);
router.post(
  '/professors/save',
  requireAdmin,
  uploadSingle(professorPhotoUpload, 'professor_photo', '/admin/professors'),
  adminController.postSaveProfessor
);
router.post('/professors/delete/:professorId', requireSuperAdmin, adminController.postDeleteProfessor);

router.get('/lectures', requireAdmin, adminController.getLectures);
router.post(
  '/lectures/add',
  requireAdmin,
  uploadSingle(lectureUpload, 'lecture_file', '/admin/lectures'),
  adminController.postAddLecture
);
router.post('/lectures/delete/:lectureId', requireSuperAdmin, adminController.postDeleteLecture);

router.get('/sheets', requireAdmin, adminController.getSheets);
router.post(
  '/sheets/add',
  requireAdmin,
  uploadSingle(sheetUpload, 'sheet_file', '/admin/sheets'),
  adminController.postAddSheet
);
router.post('/sheets/delete/:sheetId', requireSuperAdmin, adminController.postDeleteSheet);

module.exports = router;
