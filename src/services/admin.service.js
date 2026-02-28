const { Op } = require('sequelize');
const {
  sequelize,
  Admin,
  Student,
  Professor,
  ProfessorTeachingScope,
  Lecture,
  Sheet,
  AdminAuditLog
} = require('../models');
const { isDefaultPhoto, removeFileIfExists } = require('./file.service');
const {
  normalizeAdminRole,
  canManageAdmins,
  canAssignRole,
  canManageTargetRole,
  getRoleRank,
  isOwner
} = require('../constants/adminRoles');

const DEFAULT_PAGE_SIZE = 10;
const ALLOWED_PAGE_SIZES = [10, 20, 50];
const MULTI_VALUE_SEPARATOR = '|';
const TEACHING_SCOPE_SEPARATOR = '||';
const TEACHING_SCOPE_TABLE_NAME = 'professor_teaching_scopes';
const PROFESSOR_ACADEMIC_YEAR_MAX = 255;
const PROFESSOR_MAJOR_MAX = 255;

let teachingScopeTableAvailableCache = null;

function parsePositiveInteger(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function clipText(value, maxLength) {
  const text = String(value || '').trim();
  if (!text) {
    return '';
  }
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function splitMultiValue(rawValue) {
  const normalizedText = String(rawValue || '')
    .replace(/[،,]/g, MULTI_VALUE_SEPARATOR)
    .trim();

  if (!normalizedText) {
    return [];
  }

  const uniqueValues = [];
  for (const part of normalizedText.split(MULTI_VALUE_SEPARATOR)) {
    const cleaned = String(part || '').trim();
    if (!cleaned) {
      continue;
    }
    if (!uniqueValues.includes(cleaned)) {
      uniqueValues.push(cleaned);
    }
  }
  return uniqueValues;
}

function normalizeMultiSelectInput(rawValue) {
  const values = Array.isArray(rawValue) ? rawValue : [rawValue];
  const normalized = [];

  for (const value of values) {
    const chunks = splitMultiValue(value);
    for (const chunk of chunks) {
      if (!normalized.includes(chunk)) {
        normalized.push(chunk);
      }
    }
  }

  return normalized;
}

function serializeMultiValue(rawValue) {
  return normalizeMultiSelectInput(rawValue).join(MULTI_VALUE_SEPARATOR);
}

function formatMultiValue(rawValue) {
  return splitMultiValue(rawValue).join(' - ');
}

function uniqueTextValues(values) {
  const uniqueValues = [];
  for (const value of values || []) {
    const cleaned = String(value || '').trim();
    if (!cleaned || uniqueValues.includes(cleaned)) {
      continue;
    }
    uniqueValues.push(cleaned);
  }
  return uniqueValues;
}

function toUniqueTeachingScopes(scopes) {
  const seen = new Set();
  const normalized = [];

  for (const scope of scopes || []) {
    const academicYear = String(scope && scope.academic_year ? scope.academic_year : '').trim();
    const major = String(scope && scope.major ? scope.major : '').trim();
    if (!academicYear || !major) {
      continue;
    }

    const key = `${academicYear}${TEACHING_SCOPE_SEPARATOR}${major}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalized.push({ academic_year: academicYear, major });
  }

  return normalized;
}

function parseTeachingScopeValue(rawValue) {
  const value = String(rawValue || '').trim();
  if (!value) {
    return null;
  }

  const parts = value.split(TEACHING_SCOPE_SEPARATOR);
  if (parts.length < 2) {
    return null;
  }

  const academicYear = String(parts[0] || '').trim();
  const major = String(parts.slice(1).join(TEACHING_SCOPE_SEPARATOR) || '').trim();
  if (!academicYear || !major) {
    return null;
  }

  return { academic_year: academicYear, major };
}

function normalizeTeachingScopesInput(rawValue) {
  const values = Array.isArray(rawValue) ? rawValue : [rawValue];
  const scopes = [];

  for (const value of values) {
    const parsed = parseTeachingScopeValue(value);
    if (parsed) {
      scopes.push(parsed);
    }
  }

  return toUniqueTeachingScopes(scopes);
}

function buildTeachingScopesFromLegacyFields(rawData) {
  const years = normalizeMultiSelectInput(rawData && rawData.academic_year);
  const majors = normalizeMultiSelectInput(rawData && rawData.major);
  const scopes = [];

  for (const year of years) {
    for (const major of majors) {
      scopes.push({ academic_year: year, major });
    }
  }

  return toUniqueTeachingScopes(scopes);
}

function extractTeachingScopes(rawData) {
  const fromScopedForm = normalizeTeachingScopesInput(rawData && rawData.teaching_scope);
  if (fromScopedForm.length) {
    return fromScopedForm;
  }
  return buildTeachingScopesFromLegacyFields(rawData);
}

function teachingScopeToPair(scope) {
  return `${scope.academic_year}${TEACHING_SCOPE_SEPARATOR}${scope.major}`;
}

function summarizeTeachingScopes(scopes, fallbackYears, fallbackMajors) {
  const normalizedScopes = toUniqueTeachingScopes(scopes);

  if (!normalizedScopes.length) {
    const years = splitMultiValue(fallbackYears);
    const majors = splitMultiValue(fallbackMajors);
    return {
      years,
      majors,
      yearsText: years.join(' - '),
      majorsText: majors.join(' - '),
      pairsText: ''
    };
  }

  const years = uniqueTextValues(normalizedScopes.map((scope) => scope.academic_year));
  const majors = uniqueTextValues(normalizedScopes.map((scope) => scope.major));
  const pairsText = normalizedScopes.map((scope) => `${scope.major} - ${scope.academic_year}`).join(' | ');

  return {
    years,
    majors,
    yearsText: years.join(' - '),
    majorsText: majors.join(' - '),
    pairsText
  };
}

function serializeLimitedMultiValue(values, maxLength) {
  const normalizedValues = uniqueTextValues(values);
  if (!normalizedValues.length || !maxLength) {
    return '';
  }

  let serialized = '';
  for (const value of normalizedValues) {
    const candidate = serialized ? `${serialized}${MULTI_VALUE_SEPARATOR}${value}` : value;
    if (candidate.length > maxLength) {
      break;
    }
    serialized = candidate;
  }

  if (serialized) {
    return serialized;
  }

  return String(normalizedValues[0]).slice(0, maxLength);
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

function resolveProfessorTeachingScopes(professor) {
  const directScopes = toUniqueTeachingScopes(professor && professor.teachingScopes);
  if (directScopes.length) {
    return directScopes;
  }

  return buildTeachingScopesFromLegacyFields({
    academic_year: professor ? professor.academic_year : '',
    major: professor ? professor.major : ''
  });
}

function withProfessorPlainData(record, hasTeachingScopeTable) {
  if (!record) {
    return null;
  }
  if (hasTeachingScopeTable && typeof record.get === 'function') {
    return record.get({ plain: true });
  }
  return record;
}

async function listProfessorFormOptions() {
  const hasTeachingScopeTable = await isTeachingScopeTableAvailable();
  const queryOptions = {
    attributes: ['professor_id', 'professor_name', 'subject_name', 'academic_year', 'major'],
    order: [['professor_name', 'ASC']]
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

  const professors = await Professor.findAll(queryOptions);
  return professors.map((professorRecord) => {
    const professor = withProfessorPlainData(professorRecord, hasTeachingScopeTable);
    const scopes = resolveProfessorTeachingScopes(professor);

    return {
      professor_id: professor.professor_id,
      professor_name: professor.professor_name,
      subject_name: professor.subject_name,
      teaching_scopes: scopes.map((scope) => ({
        academic_year: scope.academic_year,
        major: scope.major,
        pair: teachingScopeToPair(scope),
        label: `${scope.major} - ${scope.academic_year}`
      }))
    };
  });
}

async function getProfessorByIdWithScopes(professorId) {
  const hasTeachingScopeTable = await isTeachingScopeTableAvailable();
  const queryOptions = {
    attributes: ['professor_id', 'professor_name', 'subject_name', 'professor_photo', 'academic_year', 'major']
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

  const professorRecord = await Professor.findByPk(professorId, queryOptions);
  const professor = withProfessorPlainData(professorRecord, hasTeachingScopeTable);
  if (!professor) {
    return null;
  }

  const teachingScopes = resolveProfessorTeachingScopes(professor);
  return {
    ...professor,
    teachingScopesResolved: teachingScopes
  };
}

function hasExactTeachingScope(scopes, selectedScope) {
  if (!selectedScope || !selectedScope.academic_year || !selectedScope.major) {
    return false;
  }

  return (scopes || []).some(
    (scope) =>
      String(scope.academic_year || '').trim() === String(selectedScope.academic_year || '').trim() &&
      String(scope.major || '').trim() === String(selectedScope.major || '').trim()
  );
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

function normalizeSearchTerm(value) {
  return String(value || '').trim();
}

function normalizePageNumber(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return 1;
  }
  return parsed;
}

function normalizePageSize(value) {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && ALLOWED_PAGE_SIZES.includes(parsed)) {
    return parsed;
  }
  return DEFAULT_PAGE_SIZE;
}

function normalizeCount(value) {
  if (Array.isArray(value)) {
    return value.length;
  }
  return Number(value) || 0;
}

function getPagingConfig(options = {}) {
  const search = normalizeSearchTerm(options.search);
  const page = normalizePageNumber(options.page);
  const pageSize = normalizePageSize(options.pageSize);

  return {
    search,
    page,
    pageSize,
    limit: pageSize,
    offset: (page - 1) * pageSize
  };
}

function buildPaginatedPayload({ rows, count, page, pageSize, search }) {
  const totalItems = normalizeCount(count);
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(page, totalPages);

  return {
    rows,
    searchTerm: search,
    pagination: {
      page: safePage,
      pageSize,
      totalItems,
      totalPages,
      hasPrev: safePage > 1,
      hasNext: safePage < totalPages
    }
  };
}

function buildLikeSearch(search) {
  return `%${search}%`;
}

async function writeAdminAuditLog(entry) {
  const action = clipText(entry.action, 100);
  if (!action) {
    return;
  }

  try {
    await AdminAuditLog.create({
      actor_admin_id: parsePositiveInteger(entry.actorAdminId),
      action,
      target_type: clipText(entry.targetType, 50) || null,
      target_id: clipText(entry.targetId, 100) || null,
      details: clipText(entry.details, 1000) || null,
      ip_address: clipText(entry.ipAddress, 64) || null,
      user_agent: clipText(entry.userAgent, 255) || null
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to write admin audit log:', error.message);
  }
}

function ensureCanManageAdminAccounts(actorRole) {
  if (!canManageAdmins(actorRole)) {
    const error = new Error('\u0647\u0630\u0627 \u0627\u0644\u0625\u062c\u0631\u0627\u0621 \u0645\u062a\u0627\u062d \u0644\u0644\u0645\u062f\u064a\u0631 \u0648\u0645\u0627 \u0641\u0648\u0642 \u0641\u0642\u0637.');
    error.statusCode = 403;
    throw error;
  }
}

function ensureCanManageTargetAdmin(actorRole, targetRole) {
  if (!canManageTargetRole(actorRole, targetRole)) {
    const error = new Error('\u063a\u064a\u0631 \u0645\u0635\u0631\u062d \u0644\u0643 \u0628\u0627\u0644\u062a\u0639\u062f\u064a\u0644 \u0639\u0644\u0649 \u0647\u0630\u0627 \u0627\u0644\u062d\u0633\u0627\u0628 \u0627\u0644\u0625\u062f\u0627\u0631\u064a.');
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

async function listAdmins(options = {}) {
  const { search, page, pageSize, limit, offset } = getPagingConfig(options);

  let where;
  if (search) {
    const orFilters = [{ admin_name: { [Op.like]: buildLikeSearch(search) } }];
    const numericSearch = parsePositiveInteger(search);
    if (numericSearch) {
      orFilters.push({ admin_id: numericSearch });
    }
    where = { [Op.or]: orFilters };
  }

  const result = await Admin.findAndCountAll({
    attributes: ['admin_id', 'admin_name', 'role'],
    where,
    order: [['admin_id', 'ASC']],
    limit,
    offset,
    raw: true
  });

  return buildPaginatedPayload({
    rows: result.rows,
    count: result.count,
    page,
    pageSize,
    search
  });
}

async function getAdminById(adminId) {
  return Admin.findByPk(adminId, {
    attributes: ['admin_id', 'admin_name', 'role'],
    raw: true
  });
}

async function createAdmin(data, actor) {
  const actorPayload = typeof actor === 'object' && actor ? actor : {};
  const actorRole = normalizeAdminRole(typeof actor === 'string' ? actor : actorPayload.role);
  const actorId = typeof actor === 'string' ? null : parsePositiveInteger(actorPayload.adminId);

  ensureCanManageAdminAccounts(actorRole);

  const adminName = String(data.admin_name || '').trim();
  if (!adminName) {
    const error = new Error('\u0645\u0646 \u0641\u0636\u0644\u0643 \u0623\u062f\u062e\u0644 \u0627\u0633\u0645 \u0627\u0644\u0645\u0633\u0624\u0648\u0644.');
    error.statusCode = 400;
    throw error;
  }

  const targetRole = normalizeAdminRole(data.role || 'admin');
  if (!canAssignRole(actorRole, targetRole)) {
    const error = new Error('\u063a\u064a\u0631 \u0645\u0635\u0631\u062d \u0644\u0643 \u0628\u0625\u0636\u0627\u0641\u0629 \u0645\u0633\u0624\u0648\u0644 \u0628\u0647\u0630\u0647 \u0627\u0644\u0631\u062a\u0628\u0629.');
    error.statusCode = 403;
    throw error;
  }

  const createdAdmin = await Admin.create({
    admin_name: adminName,
    role: targetRole
  });

  await writeAdminAuditLog({
    actorAdminId: actorId,
    action: 'ADMIN_CREATE',
    targetType: 'admin',
    targetId: String(createdAdmin.admin_id),
    details: `Created admin '${adminName}' with role '${targetRole}'.`,
    ipAddress: actorPayload.ipAddress,
    userAgent: actorPayload.userAgent
  });

  return {
    admin_id: createdAdmin.admin_id,
    admin_name: createdAdmin.admin_name,
    role: createdAdmin.role
  };
}

async function updateAdmin(targetAdminId, data, actor) {
  const actorPayload = typeof actor === 'object' && actor ? actor : {};
  const actorRole = normalizeAdminRole(actorPayload.role);
  const actorId = parsePositiveInteger(actorPayload.adminId);

  ensureCanManageAdminAccounts(actorRole);

  const originalId = parsePositiveInteger(targetAdminId);
  const adminName = String(data.admin_name || '').trim();

  if (!originalId || !adminName) {
    const error = new Error('\u0628\u064a\u0627\u0646\u0627\u062a \u0627\u0644\u0645\u0633\u0624\u0648\u0644 \u063a\u064a\u0631 \u0645\u0643\u062a\u0645\u0644\u0629 \u0623\u0648 \u063a\u064a\u0631 \u0635\u062d\u064a\u062d\u0629.');
    error.statusCode = 400;
    throw error;
  }

  const targetAdmin = await Admin.findByPk(originalId);
  if (!targetAdmin) {
    const error = new Error('\u0627\u0644\u0645\u0633\u0624\u0648\u0644 \u0627\u0644\u0645\u0637\u0644\u0648\u0628 \u062a\u0639\u062f\u064a\u0644\u0647 \u063a\u064a\u0631 \u0645\u0648\u062c\u0648\u062f.');
    error.statusCode = 404;
    throw error;
  }

  const targetCurrentRole = normalizeAdminRole(targetAdmin.role);
  const requestedRole = normalizeAdminRole(data.role || targetCurrentRole);

  ensureCanManageTargetAdmin(actorRole, targetCurrentRole);

  if (!canAssignRole(actorRole, requestedRole)) {
    const error = new Error('\u063a\u064a\u0631 \u0645\u0635\u0631\u062d \u0644\u0643 \u0628\u062a\u0639\u064a\u064a\u0646 \u0647\u0630\u0647 \u0627\u0644\u0631\u062a\u0628\u0629.');
    error.statusCode = 403;
    throw error;
  }

  if (actorId && actorId === originalId && requestedRole !== actorRole) {
    const error = new Error('\u0644\u0627 \u064a\u0645\u0643\u0646\u0643 \u062a\u063a\u064a\u064a\u0631 \u0631\u062a\u0628\u062a\u0643 \u0645\u0646 \u0646\u0641\u0633 \u0627\u0644\u062d\u0633\u0627\u0628.');
    error.statusCode = 400;
    throw error;
  }

  if (isOwner(targetCurrentRole) && !isOwner(requestedRole)) {
    const ownerCount = await Admin.count({ where: { role: 'owner' } });
    if (ownerCount <= 1) {
      const error = new Error('\u0644\u0627 \u064a\u0645\u0643\u0646 \u062e\u0641\u0636 \u0631\u062a\u0628\u0629 \u0622\u062e\u0631 \u0645\u0627\u0644\u0643 \u0641\u064a \u0627\u0644\u0646\u0638\u0627\u0645.');
      error.statusCode = 400;
      throw error;
    }
  }

  if (actorId && actorId === originalId && getRoleRank(requestedRole) < getRoleRank(actorRole)) {
    const error = new Error('\u0644\u0627 \u064a\u0645\u0643\u0646\u0643 \u062e\u0641\u0636 \u0631\u062a\u0628\u062a\u0643 \u0627\u0644\u062d\u0627\u0644\u064a\u0629.');
    error.statusCode = 400;
    throw error;
  }

  const before = {
    admin_id: targetAdmin.admin_id,
    admin_name: targetAdmin.admin_name,
    role: targetAdmin.role
  };

  targetAdmin.admin_name = adminName;
  targetAdmin.role = requestedRole;
  await targetAdmin.save();

  await writeAdminAuditLog({
    actorAdminId: actorId,
    action: 'ADMIN_UPDATE',
    targetType: 'admin',
    targetId: String(targetAdmin.admin_id),
    details: `Updated admin from ${JSON.stringify(before)} to ${JSON.stringify({
      admin_id: targetAdmin.admin_id,
      admin_name: targetAdmin.admin_name,
      role: targetAdmin.role
    })}`,
    ipAddress: actorPayload.ipAddress,
    userAgent: actorPayload.userAgent
  });

  return {
    admin_id: targetAdmin.admin_id,
    admin_name: targetAdmin.admin_name,
    role: targetAdmin.role
  };
}

async function deleteAdmin(targetAdminId, actor) {
  const actorPayload = typeof actor === 'object' && actor ? actor : {};
  const actorRole = normalizeAdminRole(actorPayload.role);
  const actorId = parsePositiveInteger(actorPayload.adminId);

  ensureCanManageAdminAccounts(actorRole);

  const adminId = parsePositiveInteger(targetAdminId);
  if (!adminId) {
    const error = new Error('\u0645\u0639\u0631\u0641 \u0627\u0644\u0645\u0633\u0624\u0648\u0644 \u063a\u064a\u0631 \u0635\u0627\u0644\u062d.');
    error.statusCode = 400;
    throw error;
  }

  if (actorId && actorId === adminId) {
    const error = new Error('\u0644\u0627 \u064a\u0645\u0643\u0646\u0643 \u062d\u0630\u0641 \u062d\u0633\u0627\u0628\u0643 \u0627\u0644\u062d\u0627\u0644\u064a.');
    error.statusCode = 400;
    throw error;
  }

  const targetAdmin = await Admin.findByPk(adminId);
  if (!targetAdmin) {
    return false;
  }

  const targetRole = normalizeAdminRole(targetAdmin.role);
  ensureCanManageTargetAdmin(actorRole, targetRole);

  if (isOwner(targetRole)) {
    const ownerCount = await Admin.count({ where: { role: 'owner' } });
    if (ownerCount <= 1) {
      const error = new Error('\u0644\u0627 \u064a\u0645\u0643\u0646 \u062d\u0630\u0641 \u0622\u062e\u0631 \u0645\u0627\u0644\u0643 \u0641\u064a \u0627\u0644\u0646\u0638\u0627\u0645.');
      error.statusCode = 400;
      throw error;
    }
  }

  const linkedStudents = await Student.count({ where: { admin_id: adminId } });
  if (linkedStudents > 0) {
    const error = new Error('\u0644\u0627 \u064a\u0645\u0643\u0646 \u062d\u0630\u0641 \u0647\u0630\u0627 \u0627\u0644\u0645\u0633\u0624\u0648\u0644 \u0644\u0648\u062c\u0648\u062f \u0637\u0644\u0627\u0628 \u0645\u0631\u062a\u0628\u0637\u064a\u0646 \u0628\u0647.');
    error.statusCode = 400;
    throw error;
  }

  const targetAdminName = targetAdmin.admin_name;
  await targetAdmin.destroy();

  await writeAdminAuditLog({
    actorAdminId: actorId,
    action: 'ADMIN_DELETE',
    targetType: 'admin',
    targetId: String(adminId),
    details: `Deleted admin '${targetAdminName}'.`,
    ipAddress: actorPayload.ipAddress,
    userAgent: actorPayload.userAgent
  });

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

async function listStudents(options = {}) {
  const { search, page, pageSize, limit, offset } = getPagingConfig(options);

  let where;
  if (search) {
    const orFilters = [{ student_name: { [Op.like]: buildLikeSearch(search) } }];
    const numericSearch = parsePositiveInteger(search);
    if (numericSearch) {
      orFilters.push({ student_id: numericSearch });
    }
    where = { [Op.or]: orFilters };
  }

  const result = await Student.findAndCountAll({
    where,
    order: [['student_id', 'ASC']],
    limit,
    offset,
    raw: true
  });

  return buildPaginatedPayload({
    rows: result.rows,
    count: result.count,
    page,
    pageSize,
    search
  });
}

async function getStudentById(studentId) {
  return Student.findByPk(studentId, { raw: true });
}

async function saveStudent(data, uploadedFile, adminId, actor = null) {
  const isEditMode = Boolean(data.edit_id);
  const requestedStudentId = parsePositiveInteger(data.student_id);
  const originalId = isEditMode ? parsePositiveInteger(data.edit_id) : null;
  const parsedAdminId = parsePositiveInteger(adminId);
  const name = (data.student_name || '').trim();
  const year = (data.academic_year || '').trim();
  const major = (data.major || '').trim();

  if (!requestedStudentId || !name || !year || !major || !parsedAdminId || (isEditMode && !originalId)) {
    const error = new Error('\u0645\u0646 \u0641\u0636\u0644\u0643 \u0623\u062f\u062e\u0644 \u0643\u0648\u062f \u0627\u0644\u0637\u0627\u0644\u0628 \u0648\u0627\u0633\u0645\u0647 \u0648\u0628\u0627\u0642\u064a \u0627\u0644\u0628\u064a\u0627\u0646\u0627\u062a.');
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
        const error = new Error('\u0627\u0644\u0637\u0627\u0644\u0628 \u0627\u0644\u0645\u0637\u0644\u0648\u0628 \u062a\u0639\u062f\u064a\u0644\u0647 \u063a\u064a\u0631 \u0645\u0648\u062c\u0648\u062f.');
        error.statusCode = 404;
        throw error;
      }

      if (requestedStudentId !== originalId) {
        const duplicate = await Student.findByPk(requestedStudentId, { transaction });
        if (duplicate) {
          const error = new Error('\u0647\u0630\u0627 \u0627\u0644\u0643\u0648\u062f \u0627\u0644\u062c\u062f\u064a\u062f \u0645\u0633\u062c\u0644 \u0628\u0627\u0644\u0641\u0639\u0644 \u0644\u0637\u0627\u0644\u0628 \u0622\u062e\u0631.');
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

      await writeAdminAuditLog({
        actorAdminId: parsePositiveInteger(actor && actor.adminId) || parsedAdminId,
        action: 'STUDENT_UPDATE',
        targetType: 'student',
        targetId: String(student.student_id),
        details: `Updated student '${student.student_name}'.`,
        ipAddress: actor ? actor.ipAddress : null,
        userAgent: actor ? actor.userAgent : null
      });

      return { isEditMode: true };
    }

    const duplicate = await Student.findByPk(requestedStudentId, { transaction });
    if (duplicate) {
      const error = new Error('\u0647\u0630\u0627 \u0627\u0644\u0643\u0648\u062f \u0645\u0633\u062c\u0644 \u0628\u0627\u0644\u0641\u0639\u0644 \u0644\u0637\u0627\u0644\u0628 \u0622\u062e\u0631.');
      error.statusCode = 400;
      throw error;
    }

    const student = await Student.create(
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

    await writeAdminAuditLog({
      actorAdminId: parsePositiveInteger(actor && actor.adminId) || parsedAdminId,
      action: 'STUDENT_CREATE',
      targetType: 'student',
      targetId: String(student.student_id),
      details: `Created student '${student.student_name}'.`,
      ipAddress: actor ? actor.ipAddress : null,
      userAgent: actor ? actor.userAgent : null
    });

    return { isEditMode: false };
  } catch (error) {
    await transaction.rollback();
    if (uploadedFile) {
      removeFileIfExists(`/ProfessorsImages/${uploadedFile.filename}`);
    }
    throw error;
  }
}

async function deleteStudent(studentId, actor = null) {
  const student = await Student.findByPk(studentId);
  if (!student) {
    return false;
  }

  const photo = student.student_photo;
  const studentName = student.student_name;
  const safeStudentId = student.student_id;
  await student.destroy();

  if (!isDefaultPhoto(photo)) {
    removeFileIfExists(photo);
  }

  await writeAdminAuditLog({
    actorAdminId: actor && actor.adminId,
    action: 'STUDENT_DELETE',
    targetType: 'student',
    targetId: String(safeStudentId),
    details: `Deleted student '${studentName}'.`,
    ipAddress: actor ? actor.ipAddress : null,
    userAgent: actor ? actor.userAgent : null
  });

  return true;
}

async function listProfessors(options = {}) {
  const { search, page, pageSize, limit, offset } = getPagingConfig(options);
  const hasTeachingScopeTable = await isTeachingScopeTableAvailable();

  let where;
  if (search) {
    where = {
      [Op.or]: [
        { professor_name: { [Op.like]: buildLikeSearch(search) } },
        { subject_name: { [Op.like]: buildLikeSearch(search) } }
      ]
    };
  }

  const queryOptions = {
    attributes: ['professor_id', 'professor_name', 'subject_name', 'professor_photo', 'academic_year', 'major'],
    where,
    order: [['professor_id', 'ASC']],
    limit,
    offset,
    distinct: true
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

  const result = await Professor.findAndCountAll(queryOptions);

  const rows = (result.rows || []).map((professorRecord) => {
    const professor = withProfessorPlainData(professorRecord, hasTeachingScopeTable);
    const summary = summarizeTeachingScopes(
      resolveProfessorTeachingScopes(professor),
      professor.academic_year,
      professor.major
    );

    return {
      professor_id: professor.professor_id,
      professor_name: professor.professor_name,
      subject_name: professor.subject_name,
      professor_photo: professor.professor_photo,
      academic_year: summary.yearsText,
      major: summary.majorsText,
      teaching_scope_text: summary.pairsText
    };
  });

  return buildPaginatedPayload({
    rows,
    count: result.count,
    page,
    pageSize,
    search
  });
}

async function getProfessorById(professorId) {
  const professor = await getProfessorByIdWithScopes(professorId);
  if (!professor) {
    return null;
  }

  const scopesForEdit = toUniqueTeachingScopes(professor.teachingScopesResolved);
  const summary = summarizeTeachingScopes(
    scopesForEdit,
    professor.academic_year,
    professor.major
  );

  return {
    ...professor,
    teaching_scopes: scopesForEdit,
    teaching_scope_pairs: scopesForEdit.map(teachingScopeToPair),
    academic_years: summary.years,
    majors: summary.majors
  };
}

async function createProfessor(data, uploadedFile, actor = null) {
  const name = (data.professor_name || '').trim();
  const subject = (data.subject_name || '').trim();
  const teachingScopes = extractTeachingScopes(data);
  const hasTeachingScopeTable = await isTeachingScopeTableAvailable();
  const years = uniqueTextValues(teachingScopes.map((scope) => scope.academic_year));
  const majors = uniqueTextValues(teachingScopes.map((scope) => scope.major));
  const legacyAcademicYear = serializeLimitedMultiValue(years, PROFESSOR_ACADEMIC_YEAR_MAX);
  const legacyMajor = serializeLimitedMultiValue(majors, PROFESSOR_MAJOR_MAX);

  if (!name || !subject || !teachingScopes.length) {
    const error = new Error('\u0645\u0646 \u0641\u0636\u0644\u0643 \u0623\u0643\u0645\u0644 \u062c\u0645\u064a\u0639 \u0627\u0644\u062d\u0642\u0648\u0644 \u0648\u062d\u062f\u062f \u062a\u062e\u0635\u0635/\u0641\u0631\u0642\u0629 \u0648\u0627\u062d\u062f\u0629 \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644.');
    error.statusCode = 400;
    throw error;
  }

  const photoPath = uploadedFile ? `/ProfessorsImages/${uploadedFile.filename}` : '/ProfessorsImages/default.png';
  const transaction = await sequelize.transaction();

  try {
    const professor = await Professor.create(
      {
        professor_name: name,
        subject_name: subject,
        professor_photo: photoPath,
        academic_year: legacyAcademicYear || null,
        major: legacyMajor || null
      },
      { transaction }
    );

    if (hasTeachingScopeTable) {
      await ProfessorTeachingScope.bulkCreate(
        teachingScopes.map((scope) => ({
          professor_id: professor.professor_id,
          academic_year: scope.academic_year,
          major: scope.major
        })),
        { transaction }
      );
    }

    await transaction.commit();

    await writeAdminAuditLog({
      actorAdminId: actor && actor.adminId,
      action: 'PROFESSOR_CREATE',
      targetType: 'professor',
      targetId: String(professor.professor_id),
      details: `Created professor '${professor.professor_name}' with ${teachingScopes.length} teaching scopes.`,
      ipAddress: actor ? actor.ipAddress : null,
      userAgent: actor ? actor.userAgent : null
    });
  } catch (error) {
    await transaction.rollback();
    if (uploadedFile) {
      removeFileIfExists(`/ProfessorsImages/${uploadedFile.filename}`);
    }
    throw error;
  }
}

async function updateProfessor(professorId, data, uploadedFile, actor = null) {
  const id = parsePositiveInteger(professorId);
  const name = (data.professor_name || '').trim();
  const subject = (data.subject_name || '').trim();
  const teachingScopes = extractTeachingScopes(data);
  const hasTeachingScopeTable = await isTeachingScopeTableAvailable();
  const years = uniqueTextValues(teachingScopes.map((scope) => scope.academic_year));
  const majors = uniqueTextValues(teachingScopes.map((scope) => scope.major));
  const legacyAcademicYear = serializeLimitedMultiValue(years, PROFESSOR_ACADEMIC_YEAR_MAX);
  const legacyMajor = serializeLimitedMultiValue(majors, PROFESSOR_MAJOR_MAX);

  if (!id || !name || !subject || !teachingScopes.length) {
    const error = new Error('\u0645\u0646 \u0641\u0636\u0644\u0643 \u0623\u0643\u0645\u0644 \u062c\u0645\u064a\u0639 \u0627\u0644\u062d\u0642\u0648\u0644 \u0648\u062d\u062f\u062f \u062a\u062e\u0635\u0635/\u0641\u0631\u0642\u0629 \u0648\u0627\u062d\u062f\u0629 \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644.');
    error.statusCode = 400;
    throw error;
  }

  const transaction = await sequelize.transaction();
  let oldPhoto = null;

  try {
    const professor = await Professor.findByPk(id, { transaction });
    if (!professor) {
      if (uploadedFile) {
        removeFileIfExists(`/ProfessorsImages/${uploadedFile.filename}`);
      }
      const error = new Error('\u0627\u0644\u062f\u0643\u062a\u0648\u0631 \u0627\u0644\u0645\u0637\u0644\u0648\u0628 \u062a\u0639\u062f\u064a\u0644\u0647 \u063a\u064a\u0631 \u0645\u0648\u062c\u0648\u062f.');
      error.statusCode = 404;
      throw error;
    }

    oldPhoto = professor.professor_photo;
    const newPhotoPath = uploadedFile ? `/ProfessorsImages/${uploadedFile.filename}` : oldPhoto;

    professor.professor_name = name;
    professor.subject_name = subject;
    professor.academic_year = legacyAcademicYear || null;
    professor.major = legacyMajor || null;
    professor.professor_photo = newPhotoPath || '/ProfessorsImages/default.png';
    await professor.save({ transaction });

    if (hasTeachingScopeTable) {
      await ProfessorTeachingScope.destroy({
        where: { professor_id: id },
        transaction
      });
      await ProfessorTeachingScope.bulkCreate(
        teachingScopes.map((scope) => ({
          professor_id: id,
          academic_year: scope.academic_year,
          major: scope.major
        })),
        { transaction }
      );
    }

    await transaction.commit();

    await writeAdminAuditLog({
      actorAdminId: actor && actor.adminId,
      action: 'PROFESSOR_UPDATE',
      targetType: 'professor',
      targetId: String(id),
      details: `Updated professor '${name}' with ${teachingScopes.length} teaching scopes.`,
      ipAddress: actor ? actor.ipAddress : null,
      userAgent: actor ? actor.userAgent : null
    });
  } catch (error) {
    await transaction.rollback();
    if (uploadedFile) {
      removeFileIfExists(`/ProfessorsImages/${uploadedFile.filename}`);
    }
    throw error;
  }

  if (uploadedFile && oldPhoto && !isDefaultPhoto(oldPhoto)) {
    removeFileIfExists(oldPhoto);
  }

  return true;
}

async function deleteProfessorCascade(professorId, actor = null) {
  const hasTeachingScopeTable = await isTeachingScopeTableAvailable();
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

  const lectureCount = (professor.lectures || []).length;
  const sheetCount = (professor.sheets || []).length;
  const professorName = professor.professor_name;

  const transaction = await sequelize.transaction();
  try {
    await Lecture.destroy({ where: { professor_id: professorId }, transaction });
    await Sheet.destroy({ where: { professor_id: professorId }, transaction });
    if (hasTeachingScopeTable) {
      await ProfessorTeachingScope.destroy({ where: { professor_id: professorId }, transaction });
    }
    await Professor.destroy({ where: { professor_id: professorId }, transaction });
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  for (const filePath of filesToDelete) {
    removeFileIfExists(filePath);
  }

  await writeAdminAuditLog({
    actorAdminId: actor && actor.adminId,
    action: 'PROFESSOR_DELETE',
    targetType: 'professor',
    targetId: String(professorId),
    details: `Deleted professor '${professorName}' with ${lectureCount} lectures and ${sheetCount} sheets.`,
    ipAddress: actor ? actor.ipAddress : null,
    userAgent: actor ? actor.userAgent : null
  });

  return true;
}

async function listLecturesWithProfessors(options = {}) {
  const { search, page, pageSize, limit, offset } = getPagingConfig(options);

  let where;
  if (search) {
    where = {
      [Op.or]: [
        { lecture_name: { [Op.like]: buildLikeSearch(search) } },
        { '$professor.professor_name$': { [Op.like]: buildLikeSearch(search) } }
      ]
    };
  }

  const [professors, lectureResult] = await Promise.all([
    listProfessorFormOptions(),
    Lecture.findAndCountAll({
      include: [{ model: Professor, attributes: ['professor_name', 'subject_name'] }],
      attributes: ['lecture_id', 'lecture_name', 'lecture_file', 'lecture_date'],
      where,
      order: [['lecture_id', 'DESC']],
      limit,
      offset,
      distinct: true,
      subQuery: false
    })
  ]);

  const rows = lectureResult.rows.map((lecture) => ({
    lecture_id: lecture.lecture_id,
    lecture_name: lecture.lecture_name,
    lecture_file: lecture.lecture_file,
    lecture_date: lecture.lecture_date,
    professor_name: lecture.professor ? lecture.professor.professor_name : '',
    subject_name: lecture.professor ? lecture.professor.subject_name : ''
  }));

  const paged = buildPaginatedPayload({
    rows,
    count: lectureResult.count,
    page,
    pageSize,
    search
  });

  return {
    professors,
    lectures: paged.rows,
    pagination: paged.pagination,
    searchTerm: paged.searchTerm
  };
}

async function createLecture(data, uploadedFile, actor = null) {
  const title = (data.lecture_name || '').trim();
  const professorId = parsePositiveInteger(data.professor_id);
  const selectedSubject = String(data.subject_name || '').trim();
  const selectedScope = parseTeachingScopeValue(data.teaching_scope);

  if (!title) {
    if (uploadedFile) {
      removeFileIfExists(`uploads/lectures/${uploadedFile.filename}`);
    }
    const error = new Error('\u0645\u0646 \u0641\u0636\u0644\u0643 \u0623\u062f\u062e\u0644 \u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u0645\u062d\u0627\u0636\u0631\u0629');
    error.statusCode = 400;
    throw error;
  }

  if (!professorId) {
    if (uploadedFile) {
      removeFileIfExists(`uploads/lectures/${uploadedFile.filename}`);
    }
    const error = new Error('\u0645\u0646 \u0641\u0636\u0644\u0643 \u0627\u062e\u062a\u0631 \u062f\u0643\u062a\u0648\u0631 \u0645\u0646 \u0627\u0644\u0642\u0627\u0626\u0645\u0629');
    error.statusCode = 400;
    throw error;
  }

  if (!uploadedFile) {
    const error = new Error('\u0645\u0646 \u0641\u0636\u0644\u0643 \u0627\u062e\u062a\u0631 \u0645\u0644\u0641 \u0627\u0644\u0645\u062d\u0627\u0636\u0631\u0629');
    error.statusCode = 400;
    throw error;
  }

  if (!selectedScope) {
    removeFileIfExists(`uploads/lectures/${uploadedFile.filename}`);
    const error = new Error('\u0645\u0646 \u0641\u0636\u0644\u0643 \u0627\u062e\u062a\u0631 \u0627\u0644\u0642\u0633\u0645 \u0648\u0627\u0644\u0633\u0646\u0629 \u0627\u0644\u062f\u0631\u0627\u0633\u064a\u0629.');
    error.statusCode = 400;
    throw error;
  }

  const professor = await getProfessorByIdWithScopes(professorId);
  if (!professor) {
    removeFileIfExists(`uploads/lectures/${uploadedFile.filename}`);
    const error = new Error('\u0627\u0644\u062f\u0643\u062a\u0648\u0631 \u0627\u0644\u0645\u062e\u062a\u0627\u0631 \u063a\u064a\u0631 \u0645\u0648\u062c\u0648\u062f.');
    error.statusCode = 404;
    throw error;
  }

  if (selectedSubject && selectedSubject !== String(professor.subject_name || '').trim()) {
    removeFileIfExists(`uploads/lectures/${uploadedFile.filename}`);
    const error = new Error('\u0627\u0644\u0645\u0627\u062f\u0629 \u0627\u0644\u0645\u062d\u062f\u062f\u0629 \u0644\u0627 \u062a\u0637\u0627\u0628\u0642 \u0627\u0644\u062f\u0643\u062a\u0648\u0631 \u0627\u0644\u0645\u062e\u062a\u0627\u0631.');
    error.statusCode = 400;
    throw error;
  }

  if (!hasExactTeachingScope(professor.teachingScopesResolved, selectedScope)) {
    removeFileIfExists(`uploads/lectures/${uploadedFile.filename}`);
    const error = new Error('\u0627\u0644\u062f\u0643\u062a\u0648\u0631 \u0627\u0644\u0645\u062e\u062a\u0627\u0631 \u0644\u0627 \u064a\u062f\u0631\u0633 \u0647\u0630\u0627 \u0627\u0644\u0642\u0633\u0645 \u0648\u0627\u0644\u0633\u0646\u0629.');
    error.statusCode = 400;
    throw error;
  }

  try {
    const lecture = await Lecture.create({
      lecture_name: title,
      lecture_date: normalizeDateInput(data.lecture_date),
      lecture_file: `uploads/lectures/${uploadedFile.filename}`,
      professor_id: professorId
    });

    await writeAdminAuditLog({
      actorAdminId: actor && actor.adminId,
      action: 'LECTURE_CREATE',
      targetType: 'lecture',
      targetId: String(lecture.lecture_id),
      details: `Created lecture '${lecture.lecture_name}' for professor '${professor.professor_name}' in ${selectedScope.major} / ${selectedScope.academic_year}.`,
      ipAddress: actor ? actor.ipAddress : null,
      userAgent: actor ? actor.userAgent : null
    });
  } catch (error) {
    removeFileIfExists(`uploads/lectures/${uploadedFile.filename}`);
    throw error;
  }
}

async function deleteLecture(lectureId, actor = null) {
  const lecture = await Lecture.findByPk(lectureId);
  if (!lecture) {
    return false;
  }

  const filePath = lecture.lecture_file;
  const lectureName = lecture.lecture_name;
  const safeLectureId = lecture.lecture_id;
  await lecture.destroy();
  removeFileIfExists(filePath);

  await writeAdminAuditLog({
    actorAdminId: actor && actor.adminId,
    action: 'LECTURE_DELETE',
    targetType: 'lecture',
    targetId: String(safeLectureId),
    details: `Deleted lecture '${lectureName}'.`,
    ipAddress: actor ? actor.ipAddress : null,
    userAgent: actor ? actor.userAgent : null
  });

  return true;
}

async function listSheetsWithProfessors(options = {}) {
  const { search, page, pageSize, limit, offset } = getPagingConfig(options);

  let where;
  if (search) {
    where = {
      [Op.or]: [
        { sheet_name: { [Op.like]: buildLikeSearch(search) } },
        { '$professor.professor_name$': { [Op.like]: buildLikeSearch(search) } }
      ]
    };
  }

  const [professors, sheetResult] = await Promise.all([
    listProfessorFormOptions(),
    Sheet.findAndCountAll({
      include: [{ model: Professor, attributes: ['professor_name', 'subject_name'] }],
      attributes: ['sheet_id', 'sheet_name', 'sheet_file', 'sheet_date'],
      where,
      order: [['sheet_id', 'DESC']],
      limit,
      offset,
      distinct: true,
      subQuery: false
    })
  ]);

  const rows = sheetResult.rows.map((sheet) => ({
    sheet_id: sheet.sheet_id,
    sheet_name: sheet.sheet_name,
    sheet_file: sheet.sheet_file,
    sheet_date: sheet.sheet_date,
    professor_name: sheet.professor ? sheet.professor.professor_name : '',
    subject_name: sheet.professor ? sheet.professor.subject_name : ''
  }));

  const paged = buildPaginatedPayload({
    rows,
    count: sheetResult.count,
    page,
    pageSize,
    search
  });

  return {
    professors,
    sheets: paged.rows,
    pagination: paged.pagination,
    searchTerm: paged.searchTerm
  };
}

async function createSheet(data, uploadedFile, actor = null) {
  const title = (data.sheet_name || '').trim();
  const professorId = parsePositiveInteger(data.professor_id);
  const selectedSubject = String(data.subject_name || '').trim();
  const selectedScope = parseTeachingScopeValue(data.teaching_scope);

  if (!title) {
    if (uploadedFile) {
      removeFileIfExists(`uploads/sheets/${uploadedFile.filename}`);
    }
    const error = new Error('\u0645\u0646 \u0641\u0636\u0644\u0643 \u0623\u062f\u062e\u0644 \u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u0634\u064a\u062a');
    error.statusCode = 400;
    throw error;
  }

  if (!professorId) {
    if (uploadedFile) {
      removeFileIfExists(`uploads/sheets/${uploadedFile.filename}`);
    }
    const error = new Error('\u0645\u0646 \u0641\u0636\u0644\u0643 \u0627\u062e\u062a\u0631 \u062f\u0643\u062a\u0648\u0631 \u0645\u0646 \u0627\u0644\u0642\u0627\u0626\u0645\u0629');
    error.statusCode = 400;
    throw error;
  }

  if (!uploadedFile) {
    const error = new Error('\u0645\u0646 \u0641\u0636\u0644\u0643 \u0627\u062e\u062a\u0631 \u0645\u0644\u0641 \u0627\u0644\u0634\u064a\u062a');
    error.statusCode = 400;
    throw error;
  }

  if (!selectedScope) {
    removeFileIfExists(`uploads/sheets/${uploadedFile.filename}`);
    const error = new Error('\u0645\u0646 \u0641\u0636\u0644\u0643 \u0627\u062e\u062a\u0631 \u0627\u0644\u0642\u0633\u0645 \u0648\u0627\u0644\u0633\u0646\u0629 \u0627\u0644\u062f\u0631\u0627\u0633\u064a\u0629.');
    error.statusCode = 400;
    throw error;
  }

  const professor = await getProfessorByIdWithScopes(professorId);
  if (!professor) {
    removeFileIfExists(`uploads/sheets/${uploadedFile.filename}`);
    const error = new Error('\u0627\u0644\u062f\u0643\u062a\u0648\u0631 \u0627\u0644\u0645\u062e\u062a\u0627\u0631 \u063a\u064a\u0631 \u0645\u0648\u062c\u0648\u062f.');
    error.statusCode = 404;
    throw error;
  }

  if (selectedSubject && selectedSubject !== String(professor.subject_name || '').trim()) {
    removeFileIfExists(`uploads/sheets/${uploadedFile.filename}`);
    const error = new Error('\u0627\u0644\u0645\u0627\u062f\u0629 \u0627\u0644\u0645\u062d\u062f\u062f\u0629 \u0644\u0627 \u062a\u0637\u0627\u0628\u0642 \u0627\u0644\u062f\u0643\u062a\u0648\u0631 \u0627\u0644\u0645\u062e\u062a\u0627\u0631.');
    error.statusCode = 400;
    throw error;
  }

  if (!hasExactTeachingScope(professor.teachingScopesResolved, selectedScope)) {
    removeFileIfExists(`uploads/sheets/${uploadedFile.filename}`);
    const error = new Error('\u0627\u0644\u062f\u0643\u062a\u0648\u0631 \u0627\u0644\u0645\u062e\u062a\u0627\u0631 \u0644\u0627 \u064a\u062f\u0631\u0633 \u0647\u0630\u0627 \u0627\u0644\u0642\u0633\u0645 \u0648\u0627\u0644\u0633\u0646\u0629.');
    error.statusCode = 400;
    throw error;
  }

  try {
    const sheet = await Sheet.create({
      sheet_name: title,
      sheet_date: normalizeDateInput(data.sheet_date),
      sheet_file: `uploads/sheets/${uploadedFile.filename}`,
      professor_id: professorId
    });

    await writeAdminAuditLog({
      actorAdminId: actor && actor.adminId,
      action: 'SHEET_CREATE',
      targetType: 'sheet',
      targetId: String(sheet.sheet_id),
      details: `Created sheet '${sheet.sheet_name}' for professor '${professor.professor_name}' in ${selectedScope.major} / ${selectedScope.academic_year}.`,
      ipAddress: actor ? actor.ipAddress : null,
      userAgent: actor ? actor.userAgent : null
    });
  } catch (error) {
    removeFileIfExists(`uploads/sheets/${uploadedFile.filename}`);
    throw error;
  }
}

async function deleteSheet(sheetId, actor = null) {
  const sheet = await Sheet.findByPk(sheetId);
  if (!sheet) {
    return false;
  }

  const filePath = sheet.sheet_file;
  const sheetName = sheet.sheet_name;
  const safeSheetId = sheet.sheet_id;
  await sheet.destroy();
  removeFileIfExists(filePath);

  await writeAdminAuditLog({
    actorAdminId: actor && actor.adminId,
    action: 'SHEET_DELETE',
    targetType: 'sheet',
    targetId: String(safeSheetId),
    details: `Deleted sheet '${sheetName}'.`,
    ipAddress: actor ? actor.ipAddress : null,
    userAgent: actor ? actor.userAgent : null
  });

  return true;
}

module.exports = {
  ALLOWED_PAGE_SIZES,
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
  deleteSheet,
  writeAdminAuditLog
};
