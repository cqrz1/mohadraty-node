const { setFlash } = require('../services/flash.service');
const { getRoleRank, normalizeAdminRole } = require('../constants/adminRoles');

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

// Backward-compatible: now means Manager+ (manager / assistant_owner / owner)
function requireSuperAdmin(req, res, next) {
  if (!req.session || !req.session.AdminId) {
    return res.redirect('/admin/login');
  }

  if (getRoleRank(req.session.AdminRole) < 2) {
    setFlash(req, 'غير مصرح لك بتنفيذ هذا الإجراء. صلاحية إدارية أعلى مطلوبة.', 'error');
    return res.redirect('/admin');
  }

  return next();
}

function requireOwner(req, res, next) {
  if (!req.session || !req.session.AdminId) {
    return res.redirect('/admin/login');
  }

  if (normalizeAdminRole(req.session.AdminRole) !== 'owner') {
    setFlash(req, 'هذا الإجراء متاح للمالك فقط.', 'error');
    return res.redirect('/admin');
  }

  return next();
}

module.exports = {
  requireStudent,
  requireAdmin,
  requireSuperAdmin,
  requireOwner,
  // Backward-compatible aliases
  studentAuth: requireStudent,
  adminAuth: requireAdmin
};
