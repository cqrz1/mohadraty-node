const path = require('node:path');
const fs = require('node:fs');

function normalizeDbPath(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    return '';
  }

  return filePath.replace(/\\/g, '/').replace(/^\/+/, '');
}

function resolveFromDbPath(filePath) {
  const normalized = normalizeDbPath(filePath);
  if (!normalized) {
    return null;
  }

  const root = process.cwd();
  const absolute = path.resolve(root, normalized);
  const relative = path.relative(root, absolute);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return null;
  }

  return absolute;
}

function isDefaultPhoto(filePath) {
  const normalized = normalizeDbPath(filePath).toLowerCase();
  return !normalized || normalized.endsWith('default.png');
}

function removeFileIfExists(filePath) {
  const absolute = resolveFromDbPath(filePath);
  if (!absolute) {
    return;
  }

  try {
    if (fs.existsSync(absolute)) {
      fs.unlinkSync(absolute);
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(`Failed to remove file: ${absolute}`, error.message);
  }
}

module.exports = {
  normalizeDbPath,
  resolveFromDbPath,
  isDefaultPhoto,
  removeFileIfExists
};
