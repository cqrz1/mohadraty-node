const path = require('node:path');
const fs = require('node:fs');
const multer = require('multer');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function extname(fileName) {
  return path.extname(fileName || '').toLowerCase();
}

function buildUploader(destination, allowedExtensions, fileNameBuilder, invalidMessage) {
  ensureDir(destination);

  const storage = multer.diskStorage({
    destination(req, file, cb) {
      cb(null, destination);
    },
    filename(req, file, cb) {
      const extension = extname(file.originalname);
      cb(null, fileNameBuilder(req, extension));
    }
  });

  return multer({
    storage,
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter(req, file, cb) {
      const extension = extname(file.originalname);
      if (!allowedExtensions.includes(extension)) {
        const error = new Error(invalidMessage);
        error.statusCode = 400;
        return cb(error);
      }

      return cb(null, true);
    }
  });
}

const studentPhotoUpload = buildUploader(
  path.join(process.cwd(), 'ProfessorsImages'),
  ['.jpg', '.jpeg', '.png'],
  (req, extension) => `student_${req.body.student_id || 'temp'}_${Date.now()}${extension}`,
  'INVALID_PHOTO_EXTENSION'
);

const professorPhotoUpload = buildUploader(
  path.join(process.cwd(), 'ProfessorsImages'),
  ['.jpg', '.jpeg', '.png'],
  (req, extension) => `prof_${Date.now()}_${Math.floor(Math.random() * 1000)}${extension}`,
  'INVALID_PHOTO_EXTENSION'
);

const lectureUpload = buildUploader(
  path.join(process.cwd(), 'uploads', 'lectures'),
  ['.pdf', '.ppt', '.pptx'],
  (req, extension) => `${Date.now()}${extension}`,
  'INVALID_LECTURE_EXTENSION'
);

const sheetUpload = buildUploader(
  path.join(process.cwd(), 'uploads', 'sheets'),
  ['.pdf', '.docx'],
  (req, extension) => `${Date.now()}${extension}`,
  'INVALID_SHEET_EXTENSION'
);

module.exports = {
  studentPhotoUpload,
  professorPhotoUpload,
  lectureUpload,
  sheetUpload
};
