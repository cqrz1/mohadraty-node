const adminService = require('../services/admin.service');
const { getFlash, setFlash } = require('../services/flash.service');

const STUDENT_YEAR_OPTIONS = ['الفرقة الأولى', 'الفرقة الثانية', 'الفرقة الثالثة', 'الفرقة الرابعة'];
const MAJOR_OPTIONS = ['نظم ومعلومات الأعمال', 'محاسبة ومراجعة'];

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

function isSuperAdmin(req) {
  return String(req.session.AdminRole || '').toLowerCase() === 'superadmin';
}

function adminViewData(req, activePath) {
  return {
    adminId: req.session.AdminId,
    adminUsername: req.session.AdminUsername,
    adminRole: req.session.AdminRole || 'admin',
    isSuperAdmin: isSuperAdmin(req),
    activePath
  };
}

function renderAdminLogin(res, payload) {
  return res.render('admin/login', {
    title: 'دخول الإدارة',
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
        message: 'من فضلك أدخل اسم المستخدم وكلمة المرور',
        formData: { username, password: '' }
      });
    }

    if (!/^\d+$/.test(passwordText)) {
      return renderAdminLogin(res, {
        message: 'كلمة المرور غير صحيحة (يجب أن تكون أرقامًا)',
        formData: { username, password: '' }
      });
    }

    const adminId = Number(passwordText);
    const admin = await adminService.findAdminForLogin(adminId);

    if (!admin || String(admin.admin_name).trim() !== username) {
      return renderAdminLogin(res, {
        message: 'اسم المستخدم أو كلمة المرور غير صحيحة',
        formData: { username, password: '' }
      });
    }

    await regenerateSession(req);
    req.session.AdminId = admin.admin_id;
    req.session.AdminUsername = admin.admin_name;
    req.session.AdminRole = admin.role || 'admin';
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
        message: `حدث خطأ أثناء الاتصال بالخادم: ${error.message}`,
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
      title: 'لوحة تحكم المسؤول',
      ...adminViewData(req, '/admin'),
      stats
    });
  } catch (error) {
    return next(error);
  }
}

async function getAdmins(req, res, next) {
  try {
    const [admins, flash] = await Promise.all([
      adminService.listAdmins(),
      Promise.resolve(getFlash(req))
    ]);

    let editAdmin = null;
    const editId = parsePositiveId(req.query.editId);
    if (editId && isSuperAdmin(req)) {
      editAdmin = await adminService.getAdminById(editId);
    }

    return res.render('admin/admins', {
      title: 'إدارة المسؤولين',
      ...adminViewData(req, '/admin/admins'),
      admins,
      editAdmin,
      flash
    });
  } catch (error) {
    return next(error);
  }
}

async function postAddAdmin(req, res) {
  try {
    await adminService.createAdmin(req.body, req.session.AdminRole);
    setFlash(req, 'تمت إضافة المسؤول بنجاح.', 'success');
    return res.redirect('/admin/admins');
  } catch (error) {
    setFlash(req, error.message || 'حدث خطأ أثناء إضافة المسؤول.', 'error');
    return res.redirect('/admin/admins');
  }
}

async function postUpdateAdmin(req, res) {
  try {
    const adminId = parsePositiveId(req.params.adminId);
    if (!adminId) {
      setFlash(req, 'معرف المسؤول غير صالح.', 'error');
      return res.redirect('/admin/admins');
    }

    const updatedAdmin = await adminService.updateAdmin(adminId, req.body, {
      adminId: req.session.AdminId,
      role: req.session.AdminRole
    });

    if (adminId === req.session.AdminId) {
      req.session.AdminUsername = updatedAdmin.admin_name;
      req.session.AdminRole = updatedAdmin.role;
      await saveSession(req);
    }

    setFlash(req, 'تم تعديل بيانات المسؤول بنجاح.', 'success');
    return res.redirect('/admin/admins');
  } catch (error) {
    setFlash(req, error.message || 'حدث خطأ أثناء تعديل المسؤول.', 'error');
    return res.redirect(`/admin/admins?editId=${encodeURIComponent(req.params.adminId)}`);
  }
}

async function postDeleteAdmin(req, res) {
  try {
    const adminId = parsePositiveId(req.params.adminId || req.params.id);
    if (!adminId) {
      setFlash(req, 'معرف المسؤول غير صالح.', 'error');
      return res.redirect('/admin/admins');
    }

    const deleted = await adminService.deleteAdmin(adminId, {
      adminId: req.session.AdminId,
      role: req.session.AdminRole
    });

    if (!deleted) {
      setFlash(req, 'المسؤول المطلوب غير موجود.', 'error');
      return res.redirect('/admin/admins');
    }

    setFlash(req, 'تم حذف المسؤول بنجاح.', 'success');
    return res.redirect('/admin/admins');
  } catch (error) {
    setFlash(req, error.message || 'حدث خطأ أثناء حذف المسؤول.', 'error');
    return res.redirect('/admin/admins');
  }
}

async function getStudents(req, res, next) {
  try {
    const [students, flash] = await Promise.all([
      adminService.listStudents(),
      Promise.resolve(getFlash(req))
    ]);

    let editStudent = null;
    const editId = parsePositiveId(req.query.editId);
    if (editId) {
      editStudent = await adminService.getStudentById(editId);
    }

    return res.render('admin/students', {
      title: 'إدارة الطلاب',
      ...adminViewData(req, '/admin/students'),
      students,
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
    const result = await adminService.saveStudent(req.body, req.file, req.session.AdminId);
    setFlash(req, result.isEditMode ? 'تم تعديل بيانات الطالب بنجاح.' : 'تم إضافة الطالب بنجاح.', 'success');
    return res.redirect('/admin/students');
  } catch (error) {
    setFlash(req, error.message || 'حدث خطأ أثناء الحفظ.', 'error');
    return res.redirect(`/admin/students${redirectEdit}`);
  }
}

async function postDeleteStudent(req, res) {
  try {
    const studentId = parsePositiveId(req.params.studentId);
    if (!studentId) {
      setFlash(req, 'معرف الطالب غير صالح.', 'error');
      return res.redirect('/admin/students');
    }

    const deleted = await adminService.deleteStudent(studentId);
    if (!deleted) {
      setFlash(req, 'الطالب المطلوب غير موجود.', 'error');
      return res.redirect('/admin/students');
    }

    setFlash(req, 'تم حذف الطالب بنجاح.', 'success');
    return res.redirect('/admin/students');
  } catch (error) {
    setFlash(req, `حدث خطأ أثناء الحذف: ${error.message}`, 'error');
    return res.redirect('/admin/students');
  }
}

async function getProfessors(req, res, next) {
  try {
    const [professors, flash] = await Promise.all([
      adminService.listProfessors(),
      Promise.resolve(getFlash(req))
    ]);

    let editProfessor = null;
    const editId = parsePositiveId(req.query.editId);
    if (editId) {
      editProfessor = await adminService.getProfessorById(editId);
    }

    return res.render('admin/professors', {
      title: 'إدارة الدكاترة',
      ...adminViewData(req, '/admin/professors'),
      professors,
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
      await adminService.updateProfessor(editId, req.body, req.file);
      setFlash(req, 'تم تعديل بيانات الدكتور بنجاح.', 'success');
      return res.redirect('/admin/professors');
    }

    await adminService.createProfessor(req.body, req.file);
    setFlash(req, 'تم إضافة الدكتور بنجاح.', 'success');
    return res.redirect('/admin/professors');
  } catch (error) {
    setFlash(req, error.message || 'حدث خطأ أثناء الحفظ.', 'error');
    return res.redirect(editId ? `/admin/professors?editId=${editId}` : '/admin/professors');
  }
}

async function postDeleteProfessor(req, res) {
  try {
    const professorId = parsePositiveId(req.params.professorId);
    if (!professorId) {
      setFlash(req, 'معرف الدكتور غير صالح.', 'error');
      return res.redirect('/admin/professors');
    }

    const deleted = await adminService.deleteProfessorCascade(professorId);
    if (!deleted) {
      setFlash(req, 'الدكتور المطلوب غير موجود.', 'error');
      return res.redirect('/admin/professors');
    }

    setFlash(req, 'تم حذف الدكتور وكل متعلقاته بنجاح.', 'success');
    return res.redirect('/admin/professors');
  } catch (error) {
    setFlash(req, `حدث خطأ أثناء الحذف: ${error.message}`, 'error');
    return res.redirect('/admin/professors');
  }
}

async function getLectures(req, res, next) {
  try {
    const [data, flash] = await Promise.all([
      adminService.listLecturesWithProfessors(),
      Promise.resolve(getFlash(req))
    ]);

    return res.render('admin/lectures', {
      title: 'إدارة المحاضرات',
      ...adminViewData(req, '/admin/lectures'),
      professors: data.professors,
      lectures: data.lectures,
      flash
    });
  } catch (error) {
    return next(error);
  }
}

async function postAddLecture(req, res) {
  try {
    await adminService.createLecture(req.body, req.file);
    setFlash(req, 'تمت إضافة المحاضرة بنجاح!', 'success');
    return res.redirect('/admin/lectures');
  } catch (error) {
    setFlash(req, error.message || 'حدث خطأ أثناء الرفع.', 'error');
    return res.redirect('/admin/lectures');
  }
}

async function postDeleteLecture(req, res) {
  try {
    const lectureId = parsePositiveId(req.params.lectureId);
    if (!lectureId) {
      setFlash(req, 'معرف المحاضرة غير صالح.', 'error');
      return res.redirect('/admin/lectures');
    }

    const deleted = await adminService.deleteLecture(lectureId);
    if (!deleted) {
      setFlash(req, 'المحاضرة المطلوبة غير موجودة.', 'error');
      return res.redirect('/admin/lectures');
    }

    setFlash(req, 'تم حذف المحاضرة بنجاح.', 'success');
    return res.redirect('/admin/lectures');
  } catch (error) {
    setFlash(req, `حدث خطأ أثناء الحذف: ${error.message}`, 'error');
    return res.redirect('/admin/lectures');
  }
}

async function getSheets(req, res, next) {
  try {
    const [data, flash] = await Promise.all([
      adminService.listSheetsWithProfessors(),
      Promise.resolve(getFlash(req))
    ]);

    return res.render('admin/sheets', {
      title: 'إدارة الشيتات',
      ...adminViewData(req, '/admin/sheets'),
      professors: data.professors,
      sheets: data.sheets,
      flash
    });
  } catch (error) {
    return next(error);
  }
}

async function postAddSheet(req, res) {
  try {
    await adminService.createSheet(req.body, req.file);
    setFlash(req, 'تمت إضافة الشيت بنجاح!', 'success');
    return res.redirect('/admin/sheets');
  } catch (error) {
    setFlash(req, error.message || 'حدث خطأ أثناء الرفع.', 'error');
    return res.redirect('/admin/sheets');
  }
}

async function postDeleteSheet(req, res) {
  try {
    const sheetId = parsePositiveId(req.params.sheetId);
    if (!sheetId) {
      setFlash(req, 'معرف الشيت غير صالح.', 'error');
      return res.redirect('/admin/sheets');
    }

    const deleted = await adminService.deleteSheet(sheetId);
    if (!deleted) {
      setFlash(req, 'الشيت المطلوب غير موجود.', 'error');
      return res.redirect('/admin/sheets');
    }

    setFlash(req, 'تم حذف الشيت بنجاح.', 'success');
    return res.redirect('/admin/sheets');
  } catch (error) {
    setFlash(req, `حدث خطأ أثناء الحذف: ${error.message}`, 'error');
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
