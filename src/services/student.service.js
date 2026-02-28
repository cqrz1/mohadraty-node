const { Student, Professor, Lecture, Sheet } = require('../models');

async function findStudentForLogin(studentId) {
  return Student.findByPk(studentId, { raw: true });
}

async function getFilteredProfessorsForStudent(studentYear, studentMajor) {
  return Professor.findAll({
    where: {
      academic_year: studentYear,
      major: studentMajor
    },
    attributes: ['professor_id', 'professor_name', 'subject_name', 'professor_photo'],
    order: [['professor_id', 'ASC']],
    raw: true
  });
}

async function getProfessorForStudentAccess(professorId, studentYear, studentMajor) {
  return Professor.findOne({
    where: {
      professor_id: professorId,
      academic_year: studentYear,
      major: studentMajor
    },
    attributes: ['professor_id', 'professor_name', 'subject_name'],
    raw: true
  });
}

async function getLecturesForStudentProfessor(professorId, studentYear, studentMajor) {
  const hasAccess = await Professor.findOne({
    where: {
      professor_id: professorId,
      academic_year: studentYear,
      major: studentMajor
    },
    attributes: ['professor_id'],
    raw: true
  });

  if (!hasAccess) {
    return { hasAccess: false, lectures: [] };
  }

  const lectures = await Lecture.findAll({
    where: { professor_id: professorId },
    include: [
      {
        model: Professor,
        attributes: ['professor_name']
      }
    ],
    attributes: ['lecture_id', 'lecture_name', 'lecture_file'],
    order: [['lecture_id', 'DESC']]
  });

  return {
    hasAccess: true,
    lectures: lectures.map((item) => ({
      lecture_id: item.lecture_id,
      lecture_name: item.lecture_name,
      lecture_file: item.lecture_file,
      professor_name: item.professor ? item.professor.professor_name : ''
    }))
  };
}

async function getSheetsForStudentProfessor(professorId, studentYear, studentMajor) {
  const hasAccess = await Professor.findOne({
    where: {
      professor_id: professorId,
      academic_year: studentYear,
      major: studentMajor
    },
    attributes: ['professor_id'],
    raw: true
  });

  if (!hasAccess) {
    return { hasAccess: false, sheets: [] };
  }

  const sheets = await Sheet.findAll({
    where: { professor_id: professorId },
    include: [
      {
        model: Professor,
        attributes: ['professor_name']
      }
    ],
    attributes: ['sheet_id', 'sheet_name', 'sheet_file'],
    order: [['sheet_id', 'DESC']]
  });

  return {
    hasAccess: true,
    sheets: sheets.map((item) => ({
      sheet_id: item.sheet_id,
      sheet_name: item.sheet_name,
      sheet_file: item.sheet_file,
      professor_name: item.professor ? item.professor.professor_name : ''
    }))
  };
}

module.exports = {
  findStudentForLogin,
  getFilteredProfessorsForStudent,
  getProfessorForStudentAccess,
  getLecturesForStudentProfessor,
  getSheetsForStudentProfessor
};
