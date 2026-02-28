const ADMIN_ROLES = ['admin', 'manager', 'assistant_owner', 'owner'];

const ROLE_RANK = {
  admin: 1,
  manager: 2,
  assistant_owner: 3,
  owner: 4
};

const ROLE_LABEL_AR = {
  owner: 'المالك',
  assistant_owner: 'مساعد المالك',
  manager: 'مدير',
  admin: 'مسؤول'
};

function normalizeAdminRole(roleValue) {
  const normalized = String(roleValue || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');

  if (normalized === 'superadmin') {
    return 'owner';
  }
  if (normalized === 'assistantowner') {
    return 'assistant_owner';
  }
  if (normalized === 'assistant-owner') {
    return 'assistant_owner';
  }
  if (ADMIN_ROLES.includes(normalized)) {
    return normalized;
  }
  return 'admin';
}

function getRoleRank(roleValue) {
  const role = normalizeAdminRole(roleValue);
  return ROLE_RANK[role] || ROLE_RANK.admin;
}

function isOwner(roleValue) {
  return normalizeAdminRole(roleValue) === 'owner';
}

function canManageAdmins(roleValue) {
  return getRoleRank(roleValue) >= ROLE_RANK.manager;
}

function getAssignableRoles(actorRole) {
  const role = normalizeAdminRole(actorRole);
  if (role === 'owner') {
    return ['owner', 'assistant_owner', 'manager', 'admin'];
  }
  if (role === 'assistant_owner') {
    return ['manager', 'admin'];
  }
  if (role === 'manager') {
    return ['admin'];
  }
  return [];
}

function canAssignRole(actorRole, targetRole) {
  return getAssignableRoles(actorRole).includes(normalizeAdminRole(targetRole));
}

function canManageTargetRole(actorRole, targetRole) {
  const actor = normalizeAdminRole(actorRole);
  const target = normalizeAdminRole(targetRole);

  if (actor === 'owner' && target === 'owner') {
    return true;
  }

  if (getRoleRank(actor) <= getRoleRank(target)) {
    return false;
  }

  if (actor === 'assistant_owner') {
    return target === 'manager' || target === 'admin';
  }
  if (actor === 'manager') {
    return target === 'admin';
  }
  if (actor === 'owner') {
    return true;
  }
  return false;
}

function getRoleLabelAr(roleValue) {
  const role = normalizeAdminRole(roleValue);
  return ROLE_LABEL_AR[role] || ROLE_LABEL_AR.admin;
}

module.exports = {
  ADMIN_ROLES,
  ROLE_RANK,
  ROLE_LABEL_AR,
  normalizeAdminRole,
  getRoleRank,
  isOwner,
  canManageAdmins,
  getAssignableRoles,
  canAssignRole,
  canManageTargetRole,
  getRoleLabelAr
};

