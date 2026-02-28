const fs = require('node:fs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const csurf = require('csurf');
const { setFlash } = require('../services/flash.service');

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  return String(value).toLowerCase() === 'true';
}

function parseNumber(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function safeRemoveUploadedFiles(req) {
  const files = [];

  if (req.file && req.file.path) {
    files.push(req.file.path);
  }

  if (Array.isArray(req.files)) {
    for (const file of req.files) {
      if (file && file.path) {
        files.push(file.path);
      }
    }
  } else if (req.files && typeof req.files === 'object') {
    for (const key of Object.keys(req.files)) {
      const entry = req.files[key];
      if (Array.isArray(entry)) {
        for (const file of entry) {
          if (file && file.path) {
            files.push(file.path);
          }
        }
      }
    }
  }

  for (const filePath of files) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (_) {
      // Ignore cleanup failures
    }
  }
}

const securityHeaders = helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
});

const globalRateLimit = rateLimit({
  windowMs: parseNumber(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
  max: parseNumber(process.env.RATE_LIMIT_MAX, 350),
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => /\.(css|js|png|jpe?g|gif|svg|ico|pdf|docx?|pptx?)$/i.test(req.path),
  message: 'عدد الطلبات كبير جدًا. حاول مرة أخرى بعد دقائق قليلة.'
});

const authRateLimit = rateLimit({
  windowMs: parseNumber(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 10 * 60 * 1000),
  max: parseNumber(process.env.AUTH_RATE_LIMIT_MAX, 25),
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: parseBoolean(process.env.AUTH_RATE_LIMIT_SKIP_SUCCESS, true),
  message: 'عدد محاولات تسجيل الدخول كبير. حاول مرة أخرى لاحقًا.'
});

const csrfProtection = csurf({
  value: (req) => {
    if (req.body && req.body._csrf) {
      return req.body._csrf;
    }
    if (req.query && req.query._csrf) {
      return req.query._csrf;
    }
    return req.headers['csrf-token'] || req.headers['x-csrf-token'] || req.headers['x-xsrf-token'];
  }
});

function attachCsrfToken(req, res, next) {
  res.locals.csrfToken = req.csrfToken();
  return next();
}

function csrfErrorHandler(error, req, res, next) {
  if (!error || error.code !== 'EBADCSRFTOKEN') {
    return next(error);
  }

  safeRemoveUploadedFiles(req);

  const isAdminPath = req.originalUrl.startsWith('/admin');
  const message = 'انتهت صلاحية الطلب. حدّث الصفحة ثم أعد المحاولة.';
  if (isAdminPath) {
    setFlash(req, message, 'error');
    return res.redirect(req.get('referer') || '/admin');
  }

  if (req.originalUrl.startsWith('/login')) {
    setFlash(req, message, 'error');
    return res.redirect('/login');
  }

  return res.status(403).render('error', {
    title: 'تحذير أمني',
    message,
    backUrl: '/dashboard'
  });
}

module.exports = {
  securityHeaders,
  globalRateLimit,
  authRateLimit,
  csrfProtection,
  attachCsrfToken,
  csrfErrorHandler
};
