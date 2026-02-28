const express = require('express');
const path = require('node:path');
const session = require('express-session');
require('dotenv').config();

const studentRoutes = require('./src/routes/student.routes');
const adminRoutes = require('./src/routes/admin.routes');
const { notFoundHandler, errorHandler } = require('./src/middlewares/errorHandler');
const { securityHeaders, globalRateLimit, csrfErrorHandler } = require('./src/middlewares/security');

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  return String(value).toLowerCase() === 'true';
}

function parseSessionSameSite(value) {
  const normalized = String(value || 'lax').toLowerCase();
  if (['lax', 'strict', 'none'].includes(normalized)) {
    return normalized;
  }
  return 'lax';
}

const app = express();

if (parseBoolean(process.env.TRUST_PROXY, false)) {
  app.set('trust proxy', 1);
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(securityHeaders);
app.use(globalRateLimit);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const isProduction = process.env.NODE_ENV === 'production';
const sessionSecret = process.env.SESSION_SECRET || 'change-this-secret';
if (isProduction && sessionSecret === 'change-this-secret') {
  throw new Error('SESSION_SECRET must be set in production.');
}

app.use(
  session({
    name: process.env.SESSION_NAME || 'mohadraty.sid',
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    unset: 'destroy',
    cookie: {
      httpOnly: true,
      secure: parseBoolean(process.env.SESSION_SECURE, isProduction),
      sameSite: parseSessionSameSite(process.env.SESSION_SAME_SITE),
      maxAge: Number(process.env.SESSION_MAX_AGE_MS || 1000 * 60 * 60 * 8)
    }
  })
);

app.use((req, res, next) => {
  res.locals.currentPath = req.path;
  res.locals.session = req.session;
  next();
});

app.use((req, res, next) => {
  if (typeof res.locals.csrfToken === 'undefined') {
    res.locals.csrfToken = '';
  }
  next();
});

app.use('/ProfessorsImages', express.static(path.join(__dirname, 'ProfessorsImages')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/admin', adminRoutes);
app.use('/', studentRoutes);

app.get('/', (req, res) => {
  if (req.session.StudentID) {
    return res.redirect('/dashboard');
  }
  if (req.session.AdminId) {
    return res.redirect('/admin');
  }
  return res.redirect('/login');
});

app.get('/error', (req, res) => {
  res.render('error', {
    title: 'خطأ في النظام',
    message: 'نواجه مشكلة تقنية بسيطة حاليا. يرجى المحاولة مرة أخرى لاحقا أو العودة للرئيسية.',
    backUrl: '/dashboard'
  });
});

app.use(csrfErrorHandler);
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
