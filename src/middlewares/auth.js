const { setFlash } = require('../services/flash.service');

function requireStudent(req, res, next) {
  if (!req.session || !req.session.StudentID) {
    return res.redirect('/login');
  }
  return next();
}

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.AdminId) {
    return res.redirect('/admin/login');
  }
  return next();
}

function requireSuperAdmin(req, res, next) {
  if (!req.session || !req.session.AdminId) {
    return res.redirect('/admin/login');
  }

  if (String(req.session.AdminRole || '').toLowerCase() !== 'superadmin') {
    setFlash(req, 'غير مصرح لك بتنفيذ هذا الإجراء. صلاحية المشرف العام مطلوبة.', 'error');
    return res.redirect('/admin');
  }

  return next();
}

module.exports = {
  requireStudent,
  requireAdmin,
  requireSuperAdmin,
  // Backward-compatible aliases
  studentAuth: requireStudent,
  adminAuth: requireAdmin
};
