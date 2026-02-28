require('dotenv').config();
const fs = require('node:fs');

const requiredFiles = [
  'app.js',
  'server.js',
  'src/config/database.js',
  'src/routes/student.routes.js',
  'src/routes/admin.routes.js',
  'views/student/login.ejs',
  'views/admin/login.ejs'
];

const missingFiles = requiredFiles.filter((file) => !fs.existsSync(file));
if (missingFiles.length) {
  console.error('Missing required files:', missingFiles.join(', '));
  process.exit(1);
}

const requiredEnv = ['SESSION_SECRET', 'DB_AUTH_MODE', 'DB_HOST', 'DB_NAME', 'DB_USER'];

const missingEnv = requiredEnv.filter((key) => !String(process.env[key] || '').trim());
if (missingEnv.length) {
  console.error('Missing required environment values:', missingEnv.join(', '));
  process.exit(1);
}

const authMode = String(process.env.DB_AUTH_MODE || '').trim().toLowerCase();
if (authMode === 'sql' && !String(process.env.DB_PASSWORD || '').trim()) {
  console.error('Missing required environment value for SQL auth: DB_PASSWORD');
  process.exit(1);
}

if (authMode === 'ntlm' && !String(process.env.DB_DOMAIN || '').trim()) {
  console.error('Missing required environment value for NTLM auth: DB_DOMAIN');
  process.exit(1);
}

async function checkDbIfRequested() {
  if (String(process.env.CHECK_DB || 'false').toLowerCase() !== 'true') {
    return;
  }

  const { sequelize } = require('../src/models');
  await sequelize.authenticate();
  await sequelize.close();
}

checkDbIfRequested()
  .then(() => {
    console.log('Health check passed.');
  })
  .catch((error) => {
    console.error('Health check failed:', error.message);
    process.exit(1);
  });
