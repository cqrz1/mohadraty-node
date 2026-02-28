const adminService = require('../services/admin.service');
const { getFlash, setFlash } = require('../services/flash.service');
const {
  normalizeAdminRole,
  canManageAdmins,
  canManageTargetRole,
  getAssignableRoles,
  getRoleRank,
  getRoleLabelAr
} = require('../constants/adminRoles');

const STUDENT_YEAR_OPTIONS = ['\u0627\u0644\u0641\u0631\u0642\u0629 \u0627\u0644\u0623\u0648\u0644\u0649', '\u0627\u0644\u0641\u0631\u0642\u0629 \u0627\u0644\u062b\u0627\u0646\u064a\u0629', '\u0627\u0644\u0641\u0631\u0642\u0629 \u0627\u0644\u062b\u0627\u0644\u062b\u0629', '\u0627\u0644\u0641\u0631\u0642\u0629 \u0627\u0644\u0631\u0627\u0628\u0639\u0629'];
const MAJOR_OPTIONS = ['\u0646\u0638\u0645 \u0648\u0645\u0639\u0644\u0648\u0645\u0627\u062a \u0627\u0644\u0623\u0639\u0645\u0627\u0644', '\u0645\u062d\u0627\u0633\u0628\u0629 \u0648\u0645\u0631\u0627\u062c\u0639\u0629'];
const PAGE_SIZE_OPTIONS = adminService.ALLOWED_PAGE_SIZES || [10, 20, 50];

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function parsePositiveId(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function parseListOptions(query) {
  const page = parsePositiveId(query.page) || 1;
  const pageSize = parsePositiveId(query.page_size) || PAGE_SIZE_OPTIONS[0];
  const search = String(query.q || '').trim();

  return { page, pageSize, search };
}

function getActorContext(req) {
  return {
    adminId: req.session.AdminId,
    role: normalizeAdminRole(req.session.AdminRole),
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  };
}

function getCurrentRole(req) {
  return normalizeAdminRole(req.session.AdminRole || 'admin');
}

function adminViewData(req, activePath) {
  const currentRole = getCurrentRole(req);
  return {
    adminId: req.session.AdminId,
    adminUsername: req.session.AdminUsername,
    adminRole: currentRole,
    adminRoleLabel: getRoleLabelAr(currentRole),
    canManageAdmins: canManageAdmins(currentRole),
    canDeleteContent: getRoleRank(currentRole) >= 2,
    assignableRoles: getAssignableRoles(currentRole),
    activePath
  };
}

function renderAdminLogin(res, payload) {
  return res.render('admin/login', {
    title: '\u062f\u062e\u0648\u0644 \u0627\u0644\u0625\u062f\u0627\u0631\u0629',
    message: payload.message || '',
    formData: payload.formData || { username: '', password: '' }
  });
}

async function getLogin(req, res) {
  if (req.session.AdminId) {
    return res.redirect('/admin');
  }

  const flash = getFlash(req);
  return renderAdminLogin(res, {
    message: flash ? flash.message : ''
  });
}

async function postLogin(req, res, next) {
  try {
    const username = String(req.body.username || '').trim();
    const passwordText = String(req.body.password || '').trim();

    if (!username || !passwordText) {
      return renderAdminLogin(res, {
        message: '\u0645\u0646 \u0641\u0636\u0644\u0643 \u0623\u062f\u062e\u0644 \u0627\u0633\u0645 \u0627\u0644\u0645\u0633\u062a\u062e\u062f\u0645 \u0648\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631',
        formData: { username, password: '' }
      });
    }

    if (!/^\d+$/.test(passwordText)) {
      return renderAdminLogin(res, {
        message: '\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u063a\u064a\u0631 \u0635\u062d\u064a\u062d\u0629 (\u064a\u062c\u0628 \u0623\u0646 \u062a\u0643\u0648\u0646 \u0623\u0631\u0642\u0627\u0645\u064b\u0627)',
        formData: { username, password: '' }
      });
    }

    const adminId = Number(passwordText);
    const admin = await adminService.findAdminForLogin(adminId);

    if (!admin || String(admin.admin_name).trim() !== username) {
      return renderAdminLogin(res, {
        message: '\u0627\u0633\u0645 \u0627\u0644\u0645\u0633\u062a\u062e\u062f\u0645 \u0623\u0648 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u063a\u064a\u0631 \u0635\u062d\u064a\u062d\u0629',
        formData: { username, password: '' }
      });
    }

    await regenerateSession(req);
    req.session.AdminId = admin.admin_id;
    req.session.AdminUsername = admin.admin_name;
    req.session.AdminRole = normalizeAdminRole(admin.role || 'admin');
    delete req.session.StudentID;
    delete req.session.StudentName;
    delete req.session.StudentYear;
    delete req.session.StudentMajor;
    delete req.session.SelectedProfID;
    await saveSession(req);

    return res.redirect('/admin');
  } catch (error) {
    if (!res.headersSent) {
      return renderAdminLogin(res, {
        message: `\u062d\u062f\u062b \u062e\u0637\u0623 \u0623\u062b\u0646\u0627\u0621 \u0627\u0644\u0627\u062a\u0635\u0627\u0644 \u0628\u0627\u0644\u062e\u0627\u062f\u0645: ${error.message}`,
        formData: {
          username: String(req.body.username || '').trim(),
          password: ''
        }
      });
    }
    return next(error);
  }
}

async function getDashboard(req, res, next) {
  try {
    const stats = await adminService.getAdminStats();

    return res.render('admin/dashboard', {
      title: '\u0644\u0648\u062d\u0629 \u062a\u062d\u0643\u0645 \u0627\u0644\u0645\u0633\u0624\u0648\u0644',
      ...adminViewData(req, '/admin'),
      stats
    });
  } catch (error) {
    return next(error);
  }
}

async function getAdmins(req, res, next) {
  try {
    const currentRole = getCurrentRole(req);
    const listOptions = parseListOptions(req.query);
    const [adminsData, flash] = await Promise.all([
      adminService.listAdmins(listOptions),
      Promise.resolve(getFlash(req))
    ]);
    let viewFlash = flash;

    const admins = (adminsData.rows || []).map((adminItem) => {
      const normalizedRole = normalizeAdminRole(adminItem.role);
      const canManageTarget = canManageTargetRole(currentRole, normalizedRole);

      return {
        ...adminItem,
        role: normalizedRole,
        roleLabel: getRoleLabelAr(normalizedRole),
        canEdit: canManageTarget,
        canDelete: canManageTarget && adminItem.admin_id !== req.session.AdminId
      };
    });

    let editAdmin = null;
    const editId = parsePositiveId(req.query.editId);
    if (editId && canManageAdmins(currentRole)) {
      const candidate = await adminService.getAdminById(editId);
      if (candidate && canManageTargetRole(currentRole, normalizeAdminRole(candidate.role))) {
        editAdmin = {
          ...candidate,
          role: normalizeAdminRole(candidate.role)
        };
      } else if (candidate) {
        viewFlash = {
          message: '\u063a\u064a\u0631 \u0645\u0635\u0631\u062d \u0644\u0643 \u0628\u062a\u0639\u062f\u064a\u0644 \u0647\u0630\u0627 \u0627\u0644\u062d\u0633\u0627\u0628.',
          type: 'error'
        };
      }
    }

    return res.render('admin/admins', {
      title: '\u0625\u062f\u0627\u0631\u0629 \u0627\u0644\u0645\u0633\u0624\u0648\u0644\u064a\u0646',
      ...adminViewData(req, '/admin/admins'),
      admins,
      pagination: adminsData.pagination,
      searchTerm: adminsData.searchTerm,
      pageSizeOptions: PAGE_SIZE_OPTIONS,
      editAdmin,
      flash: viewFlash
    });
  } catch (error) {
    return next(error);
  }
}
async function postAddAdmin(req, res) {
  try {
    const createdAdmin = await adminService.createAdmin(req.body, getActorContext(req));
    setFlash(
      req,
      `\u062a\u0645\u062a \u0625\u0636\u0627\u0641\u0629 \u0627\u0644\u0645\u0633\u0624\u0648\u0644 \u0628\u0646\u062c\u0627\u062d. \u0643\u0648\u062f \u062a\u0633\u062c\u064a\u0644 \u062f\u062e\u0648\u0644\u0647: ${createdAdmin.admin_id}`,
      'success'
    );
    return res.redirect('/admin/admins');
  } catch (error) {
    setFlash(req, error.message || '\u062d\u062f\u062b \u062e\u0637\u0623 \u0623\u062b\u0646\u0627\u0621 \u0625\u0636\u0627\u0641\u0629 \u0627\u0644\u0645\u0633\u0624\u0648\u0644.', 'error');
    return res.redirect('/admin/admins');
  }
}

async function postUpdateAdmin(req, res) {
  try {
    const adminId = parsePositiveId(req.params.adminId);
    if (!adminId) {
      setFlash(req, '\u0645\u0639\u0631\u0641 \u0627\u0644\u0645\u0633\u0624\u0648\u0644 \u063a\u064a\u0631 \u0635\u0627\u0644\u062d.', 'error');
      return res.redirect('/admin/admins');
    }

    const updatedAdmin = await adminService.updateAdmin(adminId, req.body, {
      adminId: req.session.AdminId,
      role: req.session.AdminRole,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    if (adminId === req.session.AdminId) {
      req.session.AdminUsername = updatedAdmin.admin_name;
      req.session.AdminRole = normalizeAdminRole(updatedAdmin.role);
      await saveSession(req);
    }

    setFlash(req, '\u062a\u0645 \u062a\u0639\u062f\u064a\u0644 \u0628\u064a\u0627\u0646\u0627\u062a \u0627\u0644\u0645\u0633\u0624\u0648\u0644 \u0628\u0646\u062c\u0627\u062d.', 'success');
    return res.redirect('/admin/admins');
  } catch (error) {
    setFlash(req, error.message || '\u062d\u062f\u062b \u062e\u0637\u0623 \u0623\u062b\u0646\u0627\u0621 \u062a\u0639\u062f\u064a\u0644 \u0627\u0644\u0645\u0633\u0624\u0648\u0644.', 'error');
    return res.redirect(`/admin/admins?editId=${encodeURIComponent(req.params.adminId)}`);
  }
}

async function postDeleteAdmin(req, res) {
  try {
    const adminId = parsePositiveId(req.params.adminId || req.params.id);
    if (!adminId) {
      setFlash(req, '\u0645\u0639\u0631\u0641 \u0627\u0644\u0645\u0633\u0624\u0648\u0644 \u063a\u064a\u0631 \u0635\u0627\u0644\u062d.', 'error');
      return res.redirect('/admin/admins');
    }

    const deleted = await adminService.deleteAdmin(adminId, {
      adminId: req.session.AdminId,
      role: req.session.AdminRole,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    if (!deleted) {
      setFlash(req, '\u0627\u0644\u0645\u0633\u0624\u0648\u0644 \u0627\u0644\u0645\u0637\u0644\u0648\u0628 \u063a\u064a\u0631 \u0645\u0648\u062c\u0648\u062f.', 'error');
      return res.redirect('/admin/admins');
    }

    setFlash(req, '\u062a\u0645 \u062d\u0630\u0641 \u0627\u0644\u0645\u0633\u0624\u0648\u0644 \u0628\u0646\u062c\u0627\u062d.', 'success');
    return res.redirect('/admin/admins');
  } catch (error) {
    setFlash(req, error.message || '\u062d\u062f\u062b \u062e\u0637\u0623 \u0623\u062b\u0646\u0627\u0621 \u062d\u0630\u0641 \u0627\u0644\u0645\u0633\u0624\u0648\u0644.', 'error');
    return res.redirect('/admin/admins');
  }
}

async function getStudents(req, res, next) {
  try {
    const listOptions = parseListOptions(req.query);
    const [studentsData, flash] = await Promise.all([
      adminService.listStudents(listOptions),
      Promise.resolve(getFlash(req))
    ]);

    let editStudent = null;
    const editId = parsePositiveId(req.query.editId);
    if (editId) {
      editStudent = await adminService.getStudentById(editId);
    }

    return res.render('admin/students', {
      title: '\u0625\u062f\u0627\u0631\u0629 \u0627\u0644\u0637\u0644\u0627\u0628',
      ...adminViewData(req, '/admin/students'),
      students: studentsData.rows,
      pagination: studentsData.pagination,
      searchTerm: studentsData.searchTerm,
      pageSizeOptions: PAGE_SIZE_OPTIONS,
      editStudent,
      formOptions: {
        years: STUDENT_YEAR_OPTIONS,
        majors: MAJOR_OPTIONS
      },
      flash
    });
  } catch (error) {
    return next(error);
  }
}

async function postSaveStudent(req, res) {
  const editId = parsePositiveId(req.body.edit_id);
  const redirectEdit = editId ? `?editId=${editId}` : '';

  try {
    const result = await adminService.saveStudent(req.body, req.file, req.session.AdminId, getActorContext(req));
    setFlash(req, result.isEditMode ? '\u062a\u0645 \u062a\u0639\u062f\u064a\u0644 \u0628\u064a\u0627\u0646\u0627\u062a \u0627\u0644\u0637\u0627\u0644\u0628 \u0628\u0646\u062c\u0627\u062d.' : '\u062a\u0645 \u0625\u0636\u0627\u0641\u0629 \u0627\u0644\u0637\u0627\u0644\u0628 \u0628\u0646\u062c\u0627\u062d.', 'success');
    return res.redirect('/admin/students');
  } catch (error) {
    setFlash(req, error.message || '\u062d\u062f\u062b \u062e\u0637\u0623 \u0623\u062b\u0646\u0627\u0621 \u0627\u0644\u062d\u0641\u0638.', 'error');
    return res.redirect(`/admin/students${redirectEdit}`);
  }
}

async function postDeleteStudent(req, res) {
  try {
    const studentId = parsePositiveId(req.params.studentId);
    if (!studentId) {
      setFlash(req, '\u0645\u0639\u0631\u0641 \u0627\u0644\u0637\u0627\u0644\u0628 \u063a\u064a\u0631 \u0635\u0627\u0644\u062d.', 'error');
      return res.redirect('/admin/students');
    }

    const deleted = await adminService.deleteStudent(studentId, getActorContext(req));
    if (!deleted) {
      setFlash(req, '\u0627\u0644\u0637\u0627\u0644\u0628 \u0627\u0644\u0645\u0637\u0644\u0648\u0628 \u063a\u064a\u0631 \u0645\u0648\u062c\u0648\u062f.', 'error');
      return res.redirect('/admin/students');
    }

    setFlash(req, '\u062a\u0645 \u062d\u0630\u0641 \u0627\u0644\u0637\u0627\u0644\u0628 \u0628\u0646\u062c\u0627\u062d.', 'success');
    return res.redirect('/admin/students');
  } catch (error) {
    setFlash(req, `\u062d\u062f\u062b \u062e\u0637\u0623 \u0623\u062b\u0646\u0627\u0621 \u0627\u0644\u062d\u0630\u0641: ${error.message}`, 'error');
    return res.redirect('/admin/students');
  }
}

async function getProfessors(req, res, next) {
  try {
    const listOptions = parseListOptions(req.query);
    const [professorsData, flash] = await Promise.all([
      adminService.listProfessors(listOptions),
      Promise.resolve(getFlash(req))
    ]);

    let editProfessor = null;
    const editId = parsePositiveId(req.query.editId);
    if (editId) {
      editProfessor = await adminService.getProfessorById(editId);
    }

    return res.render('admin/professors', {
      title: '\u0625\u062f\u0627\u0631\u0629 \u0627\u0644\u062f\u0643\u0627\u062a\u0631\u0629',
      ...adminViewData(req, '/admin/professors'),
      professors: professorsData.rows,
      pagination: professorsData.pagination,
      searchTerm: professorsData.searchTerm,
      pageSizeOptions: PAGE_SIZE_OPTIONS,
      editProfessor,
      formOptions: {
        years: STUDENT_YEAR_OPTIONS,
        majors: MAJOR_OPTIONS
      },
      flash
    });
  } catch (error) {
    return next(error);
  }
}

async function postSaveProfessor(req, res) {
  const editId = parsePositiveId(req.body.edit_id);

  try {
    if (editId) {
      await adminService.updateProfessor(editId, req.body, req.file, getActorContext(req));
      setFlash(req, '\u062a\u0645 \u062a\u0639\u062f\u064a\u0644 \u0628\u064a\u0627\u0646\u0627\u062a \u0627\u0644\u062f\u0643\u062a\u0648\u0631 \u0628\u0646\u062c\u0627\u062d.', 'success');
      return res.redirect('/admin/professors');
    }

    await adminService.createProfessor(req.body, req.file, getActorContext(req));
    setFlash(req, '\u062a\u0645 \u0625\u0636\u0627\u0641\u0629 \u0627\u0644\u062f\u0643\u062a\u0648\u0631 \u0628\u0646\u062c\u0627\u062d.', 'success');
    return res.redirect('/admin/professors');
  } catch (error) {
    setFlash(req, error.message || '\u062d\u062f\u062b \u062e\u0637\u0623 \u0623\u062b\u0646\u0627\u0621 \u0627\u0644\u062d\u0641\u0638.', 'error');
    return res.redirect(editId ? `/admin/professors?editId=${editId}` : '/admin/professors');
  }
}

async function postDeleteProfessor(req, res) {
  try {
    const professorId = parsePositiveId(req.params.professorId);
    if (!professorId) {
      setFlash(req, '\u0645\u0639\u0631\u0641 \u0627\u0644\u062f\u0643\u062a\u0648\u0631 \u063a\u064a\u0631 \u0635\u0627\u0644\u062d.', 'error');
      return res.redirect('/admin/professors');
    }

    const deleted = await adminService.deleteProfessorCascade(professorId, getActorContext(req));
    if (!deleted) {
      setFlash(req, '\u0627\u0644\u062f\u0643\u062a\u0648\u0631 \u0627\u0644\u0645\u0637\u0644\u0648\u0628 \u063a\u064a\u0631 \u0645\u0648\u062c\u0648\u062f.', 'error');
      return res.redirect('/admin/professors');
    }

    setFlash(req, '\u062a\u0645 \u062d\u0630\u0641 \u0627\u0644\u062f\u0643\u062a\u0648\u0631 \u0648\u0643\u0644 \u0645\u062a\u0639\u0644\u0642\u0627\u062a\u0647 \u0628\u0646\u062c\u0627\u062d.', 'success');
    return res.redirect('/admin/professors');
  } catch (error) {
    setFlash(req, `\u062d\u062f\u062b \u062e\u0637\u0623 \u0623\u062b\u0646\u0627\u0621 \u0627\u0644\u062d\u0630\u0641: ${error.message}`, 'error');
    return res.redirect('/admin/professors');
  }
}

async function getLectures(req, res, next) {
  try {
    const listOptions = parseListOptions(req.query);
    const [data, flash] = await Promise.all([
      adminService.listLecturesWithProfessors(listOptions),
      Promise.resolve(getFlash(req))
    ]);

    return res.render('admin/lectures', {
      title: '\u0625\u062f\u0627\u0631\u0629 \u0627\u0644\u0645\u062d\u0627\u0636\u0631\u0627\u062a',
      ...adminViewData(req, '/admin/lectures'),
      professors: data.professors,
      lectures: data.lectures,
      pagination: data.pagination,
      searchTerm: data.searchTerm,
      pageSizeOptions: PAGE_SIZE_OPTIONS,
      flash
    });
  } catch (error) {
    return next(error);
  }
}

async function postAddLecture(req, res) {
  try {
    await adminService.createLecture(req.body, req.file, getActorContext(req));
    setFlash(req, '\u062a\u0645\u062a \u0625\u0636\u0627\u0641\u0629 \u0627\u0644\u0645\u062d\u0627\u0636\u0631\u0629 \u0628\u0646\u062c\u0627\u062d!', 'success');
    return res.redirect('/admin/lectures');
  } catch (error) {
    setFlash(req, error.message || '\u062d\u062f\u062b \u062e\u0637\u0623 \u0623\u062b\u0646\u0627\u0621 \u0627\u0644\u0631\u0641\u0639.', 'error');
    return res.redirect('/admin/lectures');
  }
}

async function postDeleteLecture(req, res) {
  try {
    const lectureId = parsePositiveId(req.params.lectureId);
    if (!lectureId) {
      setFlash(req, '\u0645\u0639\u0631\u0641 \u0627\u0644\u0645\u062d\u0627\u0636\u0631\u0629 \u063a\u064a\u0631 \u0635\u0627\u0644\u062d.', 'error');
      return res.redirect('/admin/lectures');
    }

    const deleted = await adminService.deleteLecture(lectureId, getActorContext(req));
    if (!deleted) {
      setFlash(req, '\u0627\u0644\u0645\u062d\u0627\u0636\u0631\u0629 \u0627\u0644\u0645\u0637\u0644\u0648\u0628\u0629 \u063a\u064a\u0631 \u0645\u0648\u062c\u0648\u062f\u0629.', 'error');
      return res.redirect('/admin/lectures');
    }

    setFlash(req, '\u062a\u0645 \u062d\u0630\u0641 \u0627\u0644\u0645\u062d\u0627\u0636\u0631\u0629 \u0628\u0646\u062c\u0627\u062d.', 'success');
    return res.redirect('/admin/lectures');
  } catch (error) {
    setFlash(req, `\u062d\u062f\u062b \u062e\u0637\u0623 \u0623\u062b\u0646\u0627\u0621 \u0627\u0644\u062d\u0630\u0641: ${error.message}`, 'error');
    return res.redirect('/admin/lectures');
  }
}

async function getSheets(req, res, next) {
  try {
    const listOptions = parseListOptions(req.query);
    const [data, flash] = await Promise.all([
      adminService.listSheetsWithProfessors(listOptions),
      Promise.resolve(getFlash(req))
    ]);

    return res.render('admin/sheets', {
      title: '\u0625\u062f\u0627\u0631\u0629 \u0627\u0644\u0634\u064a\u062a\u0627\u062a',
      ...adminViewData(req, '/admin/sheets'),
      professors: data.professors,
      sheets: data.sheets,
      pagination: data.pagination,
      searchTerm: data.searchTerm,
      pageSizeOptions: PAGE_SIZE_OPTIONS,
      flash
    });
  } catch (error) {
    return next(error);
  }
}

async function postAddSheet(req, res) {
  try {
    await adminService.createSheet(req.body, req.file, getActorContext(req));
    setFlash(req, '\u062a\u0645\u062a \u0625\u0636\u0627\u0641\u0629 \u0627\u0644\u0634\u064a\u062a \u0628\u0646\u062c\u0627\u062d!', 'success');
    return res.redirect('/admin/sheets');
  } catch (error) {
    setFlash(req, error.message || '\u062d\u062f\u062b \u062e\u0637\u0623 \u0623\u062b\u0646\u0627\u0621 \u0627\u0644\u0631\u0641\u0639.', 'error');
    return res.redirect('/admin/sheets');
  }
}

async function postDeleteSheet(req, res) {
  try {
    const sheetId = parsePositiveId(req.params.sheetId);
    if (!sheetId) {
      setFlash(req, '\u0645\u0639\u0631\u0641 \u0627\u0644\u0634\u064a\u062a \u063a\u064a\u0631 \u0635\u0627\u0644\u062d.', 'error');
      return res.redirect('/admin/sheets');
    }

    const deleted = await adminService.deleteSheet(sheetId, getActorContext(req));
    if (!deleted) {
      setFlash(req, '\u0627\u0644\u0634\u064a\u062a \u0627\u0644\u0645\u0637\u0644\u0648\u0628 \u063a\u064a\u0631 \u0645\u0648\u062c\u0648\u062f.', 'error');
      return res.redirect('/admin/sheets');
    }

    setFlash(req, '\u062a\u0645 \u062d\u0630\u0641 \u0627\u0644\u0634\u064a\u062a \u0628\u0646\u062c\u0627\u062d.', 'success');
    return res.redirect('/admin/sheets');
  } catch (error) {
    setFlash(req, `\u062d\u062f\u062b \u062e\u0637\u0623 \u0623\u062b\u0646\u0627\u0621 \u0627\u0644\u062d\u0630\u0641: ${error.message}`, 'error');
    return res.redirect('/admin/sheets');
  }
}

function logout(req, res) {
  req.session.destroy(() => {
    res.clearCookie(process.env.SESSION_NAME || 'mohadraty.sid');
    res.redirect('/admin/login');
  });
}

module.exports = {
  getLogin,
  postLogin,
  getDashboard,
  getAdmins,
  postAddAdmin,
  postUpdateAdmin,
  postDeleteAdmin,
  getStudents,
  postSaveStudent,
  postDeleteStudent,
  getProfessors,
  postSaveProfessor,
  postDeleteProfessor,
  getLectures,
  postAddLecture,
  postDeleteLecture,
  getSheets,
  postAddSheet,
  postDeleteSheet,
  logout
};
