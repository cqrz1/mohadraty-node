const { sequelize, Admin, Student, Professor, Lecture, Sheet } = require('../models');
const { isDefaultPhoto, removeFileIfExists } = require('./file.service');

function parsePositiveInteger(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function normalizeAdminRole(roleValue) {
  const normalized = String(roleValue || '').trim().toLowerCase();
  if (normalized === 'superadmin') {
    return 'superadmin';
  }
  return 'admin';
}

function normalizeDateInput(inputDate) {
  if (!inputDate) {
    return new Date();
  }

  const parsed = new Date(inputDate);
  if (Number.isNaN(parsed.getTime())) {
    return new Date();
  }

  return parsed;
}

function ensureSuperAdmin(actorRole) {
  if (normalizeAdminRole(actorRole) !== 'superadmin') {
    const error = new Error('هذا الإجراء متاح للمشرف العام فقط.');
    error.statusCode = 403;
    throw error;
  }
}

async function findAdminForLogin(adminId) {
  return Admin.findByPk(adminId, {
    attributes: ['admin_id', 'admin_name', 'role'],
    raw: true
  });
}

async function listAdmins() {
  return Admin.findAll({
    attributes: ['admin_id', 'admin_name', 'role'],
    order: [['admin_id', 'ASC']],
    raw: true
  });
}

async function getAdminById(adminId) {
  return Admin.findByPk(adminId, {
    attributes: ['admin_id', 'admin_name', 'role'],
    raw: true
  });
}

async function createAdmin(data, actorRole) {
  const adminId = parsePositiveInteger(data.admin_id);
  const adminName = String(data.admin_name || '').trim();

  if (!adminId || !adminName) {
    const error = new Error('من فضلك أدخل كود المسؤول واسمه.');
    error.statusCode = 400;
    throw error;
  }

  let targetRole = 'admin';
  if (normalizeAdminRole(actorRole) === 'superadmin') {
    targetRole = normalizeAdminRole(data.role);
  }

  if (targetRole === 'superadmin' && normalizeAdminRole(actorRole) !== 'superadmin') {
    const error = new Error('غير مسموح بإنشاء مشرف عام.');
    error.statusCode = 403;
    throw error;
  }

  const duplicate = await Admin.findByPk(adminId);
  if (duplicate) {
    const error = new Error('هذا الكود مسجل بالفعل لمسؤول آخر.');
    error.statusCode = 400;
    throw error;
  }

  await Admin.create({
    admin_id: adminId,
    admin_name: adminName,
    role: targetRole
  });

  return { admin_id: adminId, admin_name: adminName, role: targetRole };
}

async function updateAdmin(targetAdminId, data, actor) {
  ensureSuperAdmin(actor.role);

  const originalId = parsePositiveInteger(targetAdminId);
  const requestedId = parsePositiveInteger(data.admin_id);
  const adminName = String(data.admin_name || '').trim();
  const requestedRole = normalizeAdminRole(data.role);

  if (!originalId || !requestedId || !adminName) {
    const error = new Error('بيانات المسؤول غير مكتملة أو غير صحيحة.');
    error.statusCode = 400;
    throw error;
  }

  const targetAdmin = await Admin.findByPk(originalId);
  if (!targetAdmin) {
    const error = new Error('المسؤول المطلوب تعديله غير موجود.');
    error.statusCode = 404;
    throw error;
  }

  if (requestedId !== originalId) {
    const duplicate = await Admin.findByPk(requestedId);
    if (duplicate) {
      const error = new Error('الكود الجديد مستخدم بالفعل لمسؤول آخر.');
      error.statusCode = 400;
      throw error;
    }
  }

  if (actor.adminId === originalId && requestedRole !== 'superadmin') {
    const error = new Error('لا يمكنك إزالة صلاحية المشرف العام من حسابك.');
    error.statusCode = 400;
    throw error;
  }

  if (targetAdmin.role === 'superadmin' && requestedRole !== 'superadmin') {
    const superAdminsCount = await Admin.count({ where: { role: 'superadmin' } });
    if (superAdminsCount <= 1) {
      const error = new Error('لا يمكن إزالة آخر حساب مشرف عام في النظام.');
      error.statusCode = 400;
      throw error;
    }
  }

  targetAdmin.admin_id = requestedId;
  targetAdmin.admin_name = adminName;
  targetAdmin.role = requestedRole;
  await targetAdmin.save();

  return {
    admin_id: targetAdmin.admin_id,
    admin_name: targetAdmin.admin_name,
    role: targetAdmin.role
  };
}

async function deleteAdmin(targetAdminId, actor) {
  ensureSuperAdmin(actor.role);

  const adminId = parsePositiveInteger(targetAdminId);
  if (!adminId) {
    const error = new Error('معرف المسؤول غير صالح.');
    error.statusCode = 400;
    throw error;
  }

  if (actor.adminId === adminId) {
    const error = new Error('لا يمكنك حذف حسابك الحالي.');
    error.statusCode = 400;
    throw error;
  }

  const targetAdmin = await Admin.findByPk(adminId);
  if (!targetAdmin) {
    return false;
  }

  if (targetAdmin.role === 'superadmin') {
    const error = new Error('لا يمكن حذف حساب مشرف عام.');
    error.statusCode = 400;
    throw error;
  }

  const linkedStudents = await Student.count({ where: { admin_id: adminId } });
  if (linkedStudents > 0) {
    const error = new Error('لا يمكن حذف هذا المسؤول لوجود طلاب مرتبطين به.');
    error.statusCode = 400;
    throw error;
  }

  await targetAdmin.destroy();
  return true;
}

async function getAdminStats() {
  const [studentsCount, professorsCount, lecturesCount, sheetsCount, adminsCount] = await Promise.all([
    Student.count(),
    Professor.count(),
    Lecture.count(),
    Sheet.count(),
    Admin.count()
  ]);

  return {
    studentsCount,
    professorsCount,
    lecturesCount,
    sheetsCount,
    adminsCount
  };
}

async function listStudents() {
  return Student.findAll({ order: [['student_id', 'ASC']], raw: true });
}

async function getStudentById(studentId) {
  return Student.findByPk(studentId, { raw: true });
}

async function saveStudent(data, uploadedFile, adminId) {
  const isEditMode = Boolean(data.edit_id);
  const requestedStudentId = parsePositiveInteger(data.student_id);
  const originalId = isEditMode ? parsePositiveInteger(data.edit_id) : null;
  const parsedAdminId = parsePositiveInteger(adminId);
  const name = (data.student_name || '').trim();
  const year = (data.academic_year || '').trim();
  const major = (data.major || '').trim();

  if (!requestedStudentId || !name || !year || !major || !parsedAdminId || (isEditMode && !originalId)) {
    const error = new Error('من فضلك أدخل كود الطالب واسمه وباقي البيانات.');
    error.statusCode = 400;
    throw error;
  }

  const photoPath = uploadedFile ? `/ProfessorsImages/${uploadedFile.filename}` : null;
  const transaction = await sequelize.transaction();

  try {
    let replacedOldPhoto = null;

    if (isEditMode) {
      const student = await Student.findByPk(originalId, { transaction });
      if (!student) {
        const error = new Error('الطالب المطلوب تعديله غير موجود.');
        error.statusCode = 404;
        throw error;
      }

      if (requestedStudentId !== originalId) {
        const duplicate = await Student.findByPk(requestedStudentId, { transaction });
        if (duplicate) {
          const error = new Error('هذا الكود الجديد مسجل بالفعل لطالب آخر.');
          error.statusCode = 400;
          throw error;
        }
      }

      if (uploadedFile && !isDefaultPhoto(student.student_photo)) {
        replacedOldPhoto = student.student_photo;
      }

      student.student_id = requestedStudentId;
      student.student_name = name;
      student.academic_year = year;
      student.major = major;
      student.admin_id = parsedAdminId;
      student.student_photo = photoPath || student.student_photo || '/ProfessorsImages/default.png';
      await student.save({ transaction });

      await transaction.commit();

      if (replacedOldPhoto) {
        removeFileIfExists(replacedOldPhoto);
      }

      return { isEditMode: true };
    }

    const duplicate = await Student.findByPk(requestedStudentId, { transaction });
    if (duplicate) {
      const error = new Error('هذا الكود مسجل بالفعل لطالب آخر.');
      error.statusCode = 400;
      throw error;
    }

    await Student.create(
      {
        student_id: requestedStudentId,
        student_name: name,
        academic_year: year,
        major,
        student_photo: photoPath || '/ProfessorsImages/default.png',
        admin_id: parsedAdminId
      },
      { transaction }
    );

    await transaction.commit();
    return { isEditMode: false };
  } catch (error) {
    await transaction.rollback();
    if (uploadedFile) {
      removeFileIfExists(`/ProfessorsImages/${uploadedFile.filename}`);
    }
    throw error;
  }
}

async function deleteStudent(studentId) {
  const student = await Student.findByPk(studentId);
  if (!student) {
    return false;
  }

  const photo = student.student_photo;
  await student.destroy();

  if (!isDefaultPhoto(photo)) {
    removeFileIfExists(photo);
  }

  return true;
}

async function listProfessors() {
  return Professor.findAll({
    attributes: ['professor_id', 'professor_name', 'subject_name', 'professor_photo', 'academic_year', 'major'],
    order: [['professor_id', 'ASC']],
    raw: true
  });
}

async function getProfessorById(professorId) {
  return Professor.findByPk(professorId, {
    attributes: ['professor_id', 'professor_name', 'subject_name', 'professor_photo', 'academic_year', 'major'],
    raw: true
  });
}

async function createProfessor(data, uploadedFile) {
  const name = (data.professor_name || '').trim();
  const subject = (data.subject_name || '').trim();
  const year = (data.academic_year || '').trim();
  const major = (data.major || '').trim();

  if (!name || !subject || !year || !major) {
    const error = new Error('من فضلك أكمل جميع الحقول.');
    error.statusCode = 400;
    throw error;
  }

  const photoPath = uploadedFile ? `/ProfessorsImages/${uploadedFile.filename}` : '/ProfessorsImages/default.png';

  try {
    await Professor.create({
      professor_name: name,
      subject_name: subject,
      professor_photo: photoPath,
      academic_year: year,
      major
    });
  } catch (error) {
    if (uploadedFile) {
      removeFileIfExists(`/ProfessorsImages/${uploadedFile.filename}`);
    }
    throw error;
  }
}

async function updateProfessor(professorId, data, uploadedFile) {
  const id = parsePositiveInteger(professorId);
  const name = (data.professor_name || '').trim();
  const subject = (data.subject_name || '').trim();
  const year = (data.academic_year || '').trim();
  const major = (data.major || '').trim();

  if (!id || !name || !subject || !year || !major) {
    const error = new Error('من فضلك أكمل جميع الحقول المطلوبة.');
    error.statusCode = 400;
    throw error;
  }

  const professor = await Professor.findByPk(id);
  if (!professor) {
    if (uploadedFile) {
      removeFileIfExists(`/ProfessorsImages/${uploadedFile.filename}`);
    }
    const error = new Error('الدكتور المطلوب تعديله غير موجود.');
    error.statusCode = 404;
    throw error;
  }

  const oldPhoto = professor.professor_photo;
  const newPhotoPath = uploadedFile ? `/ProfessorsImages/${uploadedFile.filename}` : oldPhoto;

  try {
    professor.professor_name = name;
    professor.subject_name = subject;
    professor.academic_year = year;
    professor.major = major;
    professor.professor_photo = newPhotoPath || '/ProfessorsImages/default.png';
    await professor.save();
  } catch (error) {
    if (uploadedFile) {
      removeFileIfExists(`/ProfessorsImages/${uploadedFile.filename}`);
    }
    throw error;
  }

  if (uploadedFile && !isDefaultPhoto(oldPhoto)) {
    removeFileIfExists(oldPhoto);
  }

  return true;
}

async function deleteProfessorCascade(professorId) {
  const professor = await Professor.findByPk(professorId, {
    include: [
      { model: Lecture, attributes: ['lecture_id', 'lecture_file'] },
      { model: Sheet, attributes: ['sheet_id', 'sheet_file'] }
    ]
  });

  if (!professor) {
    return false;
  }

  const filesToDelete = [];
  for (const lecture of professor.lectures || []) {
    filesToDelete.push(lecture.lecture_file);
  }
  for (const sheet of professor.sheets || []) {
    filesToDelete.push(sheet.sheet_file);
  }
  if (!isDefaultPhoto(professor.professor_photo)) {
    filesToDelete.push(professor.professor_photo);
  }

  const transaction = await sequelize.transaction();
  try {
    await Lecture.destroy({ where: { professor_id: professorId }, transaction });
    await Sheet.destroy({ where: { professor_id: professorId }, transaction });
    await Professor.destroy({ where: { professor_id: professorId }, transaction });
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  for (const filePath of filesToDelete) {
    removeFileIfExists(filePath);
  }

  return true;
}

async function listLecturesWithProfessors() {
  const [professors, lectures] = await Promise.all([
    Professor.findAll({ attributes: ['professor_id', 'professor_name'], order: [['professor_name', 'ASC']], raw: true }),
    Lecture.findAll({
      include: [{ model: Professor, attributes: ['professor_name'] }],
      attributes: ['lecture_id', 'lecture_name', 'lecture_file', 'lecture_date'],
      order: [['lecture_id', 'DESC']]
    })
  ]);

  return {
    professors,
    lectures: lectures.map((lecture) => ({
      lecture_id: lecture.lecture_id,
      lecture_name: lecture.lecture_name,
      lecture_file: lecture.lecture_file,
      lecture_date: lecture.lecture_date,
      professor_name: lecture.professor ? lecture.professor.professor_name : ''
    }))
  };
}

async function createLecture(data, uploadedFile) {
  const title = (data.lecture_name || '').trim();
  const professorId = parsePositiveInteger(data.professor_id);

  if (!title) {
    const error = new Error('من فضلك أدخل عنوان المحاضرة');
    error.statusCode = 400;
    throw error;
  }

  if (!professorId) {
    const error = new Error('من فضلك اختر دكتور من القائمة');
    error.statusCode = 400;
    throw error;
  }

  if (!uploadedFile) {
    const error = new Error('من فضلك اختر ملف المحاضرة');
    error.statusCode = 400;
    throw error;
  }

  const professor = await Professor.findByPk(professorId, { raw: true });
  if (!professor) {
    removeFileIfExists(`uploads/lectures/${uploadedFile.filename}`);
    const error = new Error('الدكتور المختار غير موجود.');
    error.statusCode = 404;
    throw error;
  }

  try {
    await Lecture.create({
      lecture_name: title,
      lecture_date: normalizeDateInput(data.lecture_date),
      lecture_file: `uploads/lectures/${uploadedFile.filename}`,
      professor_id: professorId
    });
  } catch (error) {
    removeFileIfExists(`uploads/lectures/${uploadedFile.filename}`);
    throw error;
  }
}

async function deleteLecture(lectureId) {
  const lecture = await Lecture.findByPk(lectureId);
  if (!lecture) {
    return false;
  }

  const filePath = lecture.lecture_file;
  await lecture.destroy();
  removeFileIfExists(filePath);
  return true;
}

async function listSheetsWithProfessors() {
  const [professors, sheets] = await Promise.all([
    Professor.findAll({ attributes: ['professor_id', 'professor_name'], order: [['professor_name', 'ASC']], raw: true }),
    Sheet.findAll({
      include: [{ model: Professor, attributes: ['professor_name'] }],
      attributes: ['sheet_id', 'sheet_name', 'sheet_file', 'sheet_date'],
      order: [['sheet_id', 'DESC']]
    })
  ]);

  return {
    professors,
    sheets: sheets.map((sheet) => ({
      sheet_id: sheet.sheet_id,
      sheet_name: sheet.sheet_name,
      sheet_file: sheet.sheet_file,
      sheet_date: sheet.sheet_date,
      professor_name: sheet.professor ? sheet.professor.professor_name : ''
    }))
  };
}

async function createSheet(data, uploadedFile) {
  const title = (data.sheet_name || '').trim();
  const professorId = parsePositiveInteger(data.professor_id);

  if (!title) {
    const error = new Error('من فضلك أدخل عنوان الشيت');
    error.statusCode = 400;
    throw error;
  }

  if (!professorId) {
    const error = new Error('من فضلك اختر دكتور من القائمة');
    error.statusCode = 400;
    throw error;
  }

  if (!uploadedFile) {
    const error = new Error('من فضلك اختر ملف الشيت');
    error.statusCode = 400;
    throw error;
  }

  const professor = await Professor.findByPk(professorId, { raw: true });
  if (!professor) {
    removeFileIfExists(`uploads/sheets/${uploadedFile.filename}`);
    const error = new Error('الدكتور المختار غير موجود.');
    error.statusCode = 404;
    throw error;
  }

  try {
    await Sheet.create({
      sheet_name: title,
      sheet_date: normalizeDateInput(data.sheet_date),
      sheet_file: `uploads/sheets/${uploadedFile.filename}`,
      professor_id: professorId
    });
  } catch (error) {
    removeFileIfExists(`uploads/sheets/${uploadedFile.filename}`);
    throw error;
  }
}

async function deleteSheet(sheetId) {
  const sheet = await Sheet.findByPk(sheetId);
  if (!sheet) {
    return false;
  }

  const filePath = sheet.sheet_file;
  await sheet.destroy();
  removeFileIfExists(filePath);
  return true;
}

module.exports = {
  findAdminForLogin,
  listAdmins,
  getAdminById,
  createAdmin,
  updateAdmin,
  deleteAdmin,
  getAdminStats,
  listStudents,
  getStudentById,
  saveStudent,
  deleteStudent,
  listProfessors,
  getProfessorById,
  createProfessor,
  updateProfessor,
  deleteProfessorCascade,
  listLecturesWithProfessors,
  createLecture,
  deleteLecture,
  listSheetsWithProfessors,
  createSheet,
  deleteSheet
};
