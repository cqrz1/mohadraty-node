const studentService = require('../services/student.service');
const { getFlash } = require('../services/flash.service');

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

function renderLogin(res, payload) {
  return res.render('student/login', {
    title: 'تسجيل الدخول',
    message: payload.message || '',
    messageType: payload.messageType || 'error',
    formData: payload.formData || { student_id: '', student_name: '' }
  });
}

async function getLogin(req, res) {
  if (req.session.StudentID) {
    return res.redirect('/dashboard');
  }

  const flash = getFlash(req);
  return renderLogin(res, {
    message: flash ? flash.message : '',
    messageType: flash ? flash.type : 'error'
  });
}

async function postLogin(req, res, next) {
  try {
    const idText = String(req.body.student_id || '').trim();
    const name = String(req.body.student_name || '').trim();

    if (!idText || !name) {
      return renderLogin(res, {
        message: 'من فضلك أدخل الكود والاسم.',
        messageType: 'warning',
        formData: { student_id: idText, student_name: name }
      });
    }

    if (!/^\d+$/.test(idText)) {
      return renderLogin(res, {
        message: 'كود الطالب يجب أن يكون أرقامًا فقط.',
        messageType: 'error',
        formData: { student_id: idText, student_name: name }
      });
    }

    const studentId = Number(idText);
    const student = await studentService.findStudentForLogin(studentId);

    if (!student || String(student.student_name || '').trim() !== name) {
      return renderLogin(res, {
        message: 'الطالب غير مسجل أو الاسم غير مطابق. تأكد من صحة البيانات.',
        messageType: 'error',
        formData: { student_id: idText, student_name: name }
      });
    }

    await regenerateSession(req);
    req.session.StudentID = student.student_id;
    req.session.StudentName = student.student_name;
    req.session.StudentYear = student.academic_year;
    req.session.StudentMajor = student.major;
    delete req.session.AdminId;
    delete req.session.AdminUsername;
    await saveSession(req);

    return res.redirect('/dashboard');
  } catch (error) {
    if (!res.headersSent) {
      return renderLogin(res, {
        message: `حدث خطأ أثناء الاتصال بالنظام: ${error.message}`,
        messageType: 'error',
        formData: {
          student_id: String(req.body.student_id || '').trim(),
          student_name: String(req.body.student_name || '').trim()
        }
      });
    }
    return next(error);
  }
}

async function getDashboard(req, res) {
  try {
    const professors = await studentService.getFilteredProfessorsForStudent(
      req.session.StudentYear,
      req.session.StudentMajor
    );

    return res.render('student/dashboard', {
      title: 'لوحة التحكم',
      professors,
      message: professors.length ? '' : 'لا يوجد دكاترة متاحين لفرقتك وتخصصك حاليًا.',
      studentName: req.session.StudentName
    });
  } catch (error) {
    return res.render('student/dashboard', {
      title: 'لوحة التحكم',
      professors: [],
      message: `حدث خطأ أثناء تحميل البيانات: ${error.message}`,
      studentName: req.session.StudentName
    });
  }
}

async function postSelectProfessor(req, res, next) {
  try {
    const professorId = Number(req.body.professor_id);
    if (!professorId || Number.isNaN(professorId)) {
      return res.redirect('/dashboard');
    }

    const professor = await studentService.getProfessorForStudentAccess(
      professorId,
      req.session.StudentYear,
      req.session.StudentMajor
    );

    if (!professor) {
      return res.redirect('/dashboard');
    }

    req.session.SelectedProfID = String(professor.professor_id);
    await saveSession(req);
    return res.redirect('/professor');
  } catch (error) {
    return next(error);
  }
}

async function getProfessor(req, res) {
  try {
    const professorId = Number(req.session.SelectedProfID);
    if (!professorId || Number.isNaN(professorId)) {
      return res.redirect('/dashboard');
    }

    const professor = await studentService.getProfessorForStudentAccess(
      professorId,
      req.session.StudentYear,
      req.session.StudentMajor
    );

    if (!professor) {
      return res.redirect('/dashboard');
    }

    return res.render('student/professor', {
      title: 'محتوى الدكتور',
      professor
    });
  } catch (error) {
    return res.redirect('/dashboard');
  }
}

async function getLectures(req, res) {
  try {
    const professorId = Number(req.session.SelectedProfID);
    if (!professorId || Number.isNaN(professorId)) {
      return res.redirect('/dashboard');
    }

    const data = await studentService.getLecturesForStudentProfessor(
      professorId,
      req.session.StudentYear,
      req.session.StudentMajor
    );

    if (!data.hasAccess) {
      return res.redirect('/dashboard');
    }

    return res.render('student/lectures', {
      title: 'المحاضرات',
      lectures: data.lectures,
      message: data.lectures.length ? '' : 'لا توجد محاضرات متاحة لهذا الدكتور حتى الآن.'
    });
  } catch (error) {
    return res.redirect('/dashboard');
  }
}

async function getSheets(req, res) {
  try {
    const professorId = Number(req.session.SelectedProfID);
    if (!professorId || Number.isNaN(professorId)) {
      return res.redirect('/dashboard');
    }

    const data = await studentService.getSheetsForStudentProfessor(
      professorId,
      req.session.StudentYear,
      req.session.StudentMajor
    );

    if (!data.hasAccess) {
      return res.redirect('/dashboard');
    }

    return res.render('student/sheets', {
      title: 'الشيتات',
      sheets: data.sheets,
      message: data.sheets.length ? '' : 'لا توجد شيتات متاحة لهذا الدكتور حتى الآن.'
    });
  } catch (error) {
    return res.redirect('/dashboard');
  }
}

function logout(req, res) {
  req.session.destroy(() => {
    res.clearCookie(process.env.SESSION_NAME || 'mohadraty.sid');
    res.redirect('/login');
  });
}

module.exports = {
  getLogin,
  postLogin,
  getDashboard,
  postSelectProfessor,
  getProfessor,
  getLectures,
  getSheets,
  logout
};
