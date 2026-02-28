const { sequelize, Student, Professor, ProfessorTeachingScope, Lecture, Sheet } = require('../models');

const MULTI_VALUE_SEPARATOR = '|';
const TEACHING_SCOPE_TABLE_NAME = 'professor_teaching_scopes';

let teachingScopeTableAvailableCache = null;

function splitMultiValue(rawValue) {
  const normalizedText = String(rawValue || '')
    .replace(/[،,]/g, MULTI_VALUE_SEPARATOR)
    .trim();

  if (!normalizedText) {
    return [];
  }

  return normalizedText
    .split(MULTI_VALUE_SEPARATOR)
    .map((value) => String(value || '').trim())
    .filter(Boolean);
}

function professorMatchesLegacyFields(professor, studentYear, studentMajor) {
  const year = String(studentYear || '').trim();
  const major = String(studentMajor || '').trim();
  if (!year || !major || !professor) {
    return false;
  }

  const allowedYears = splitMultiValue(professor.academic_year);
  const allowedMajors = splitMultiValue(professor.major);
  return allowedYears.includes(year) && allowedMajors.includes(major);
}

function hasScopeMatch(scopes, studentYear, studentMajor) {
  const year = String(studentYear || '').trim();
  const major = String(studentMajor || '').trim();
  if (!year || !major || !Array.isArray(scopes)) {
    return false;
  }

  return scopes.some(
    (scope) =>
      String(scope && scope.academic_year ? scope.academic_year : '').trim() === year &&
      String(scope && scope.major ? scope.major : '').trim() === major
  );
}

function professorMatchesStudent(professor, studentYear, studentMajor) {
  if (!professor) {
    return false;
  }

  const scopes = Array.isArray(professor.teachingScopes) ? professor.teachingScopes : [];
  if (scopes.length) {
    return hasScopeMatch(scopes, studentYear, studentMajor);
  }

  return professorMatchesLegacyFields(professor, studentYear, studentMajor);
}

async function isTeachingScopeTableAvailable() {
  if (typeof teachingScopeTableAvailableCache === 'boolean') {
    return teachingScopeTableAvailableCache;
  }

  try {
    await sequelize.getQueryInterface().describeTable(TEACHING_SCOPE_TABLE_NAME);
    teachingScopeTableAvailableCache = true;
  } catch (error) {
    try {
      await sequelize.query(`
IF OBJECT_ID(N'dbo.professor_teaching_scopes', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.professor_teaching_scopes (
    scope_id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    professor_id INT NOT NULL,
    academic_year NVARCHAR(50) NOT NULL,
    major NVARCHAR(100) NOT NULL,
    CONSTRAINT FK_professor_teaching_scopes_professors
      FOREIGN KEY (professor_id) REFERENCES dbo.professors(professor_id) ON DELETE CASCADE
  );
END
`);

      await sequelize.query(`
IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = N'UQ_professor_teaching_scope'
    AND object_id = OBJECT_ID(N'dbo.professor_teaching_scopes')
)
BEGIN
  CREATE UNIQUE INDEX UQ_professor_teaching_scope
    ON dbo.professor_teaching_scopes (professor_id, academic_year, major);
END
`);

      teachingScopeTableAvailableCache = true;
    } catch (createError) {
      teachingScopeTableAvailableCache = false;
    }
  }

  return teachingScopeTableAvailableCache;
}

function toPlainProfessorRecord(record, hasTeachingScopeTable) {
  if (!record) {
    return null;
  }
  if (hasTeachingScopeTable && typeof record.get === 'function') {
    return record.get({ plain: true });
  }
  return record;
}

async function listProfessorsWithOptionalScopes() {
  const hasTeachingScopeTable = await isTeachingScopeTableAvailable();
  const queryOptions = {
    attributes: ['professor_id', 'professor_name', 'subject_name', 'professor_photo', 'academic_year', 'major'],
    order: [['professor_id', 'ASC']]
  };

  if (hasTeachingScopeTable) {
    queryOptions.include = [
      {
        model: ProfessorTeachingScope,
        as: 'teachingScopes',
        attributes: ['academic_year', 'major'],
        required: false
      }
    ];
  } else {
    queryOptions.raw = true;
  }

  const records = await Professor.findAll(queryOptions);
  return records.map((record) => toPlainProfessorRecord(record, hasTeachingScopeTable));
}

async function getProfessorByIdWithOptionalScopes(professorId) {
  const hasTeachingScopeTable = await isTeachingScopeTableAvailable();
  const queryOptions = {
    attributes: ['professor_id', 'professor_name', 'subject_name', 'academic_year', 'major']
  };

  if (hasTeachingScopeTable) {
    queryOptions.include = [
      {
        model: ProfessorTeachingScope,
        as: 'teachingScopes',
        attributes: ['academic_year', 'major'],
        required: false
      }
    ];
  } else {
    queryOptions.raw = true;
  }

  const record = await Professor.findByPk(professorId, queryOptions);
  return toPlainProfessorRecord(record, hasTeachingScopeTable);
}

async function findStudentForLogin(studentId) {
  return Student.findByPk(studentId, { raw: true });
}

async function getFilteredProfessorsForStudent(studentYear, studentMajor) {
  const professors = await listProfessorsWithOptionalScopes();

  return professors
    .filter((professor) => professorMatchesStudent(professor, studentYear, studentMajor))
    .map((professor) => ({
      professor_id: professor.professor_id,
      professor_name: professor.professor_name,
      subject_name: professor.subject_name,
      professor_photo: professor.professor_photo
    }));
}

async function getProfessorForStudentAccess(professorId, studentYear, studentMajor) {
  const professor = await getProfessorByIdWithOptionalScopes(professorId);

  if (!professor) {
    return null;
  }

  if (!professorMatchesStudent(professor, studentYear, studentMajor)) {
    return null;
  }

  return {
    professor_id: professor.professor_id,
    professor_name: professor.professor_name,
    subject_name: professor.subject_name
  };
}

async function getLecturesForStudentProfessor(professorId, studentYear, studentMajor) {
  const professor = await getProfessorForStudentAccess(professorId, studentYear, studentMajor);
  if (!professor) {
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
  const professor = await getProfessorForStudentAccess(professorId, studentYear, studentMajor);
  if (!professor) {
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
