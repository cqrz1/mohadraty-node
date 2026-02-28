const { Sequelize } = require('sequelize');
require('dotenv').config();

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  return String(value).toLowerCase() === 'true';
}

function parseNumber(value, fallback, name) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a valid number.`);
  }

  return parsed;
}

const dbName = String(process.env.DB_NAME || '').trim();
if (!dbName) {
  throw new Error('DB_NAME is required.');
}

const authMode = String(process.env.DB_AUTH_MODE || 'sql').trim().toLowerCase();
if (!['sql', 'ntlm'].includes(authMode)) {
  throw new Error('DB_AUTH_MODE must be either "sql" or "ntlm".');
}

const host = String(process.env.DB_HOST || 'localhost').trim();
const port = parseNumber(process.env.DB_PORT, 1433, 'DB_PORT');
const dbUser = String(process.env.DB_USER || '').trim();
const dbPassword = String(process.env.DB_PASSWORD || '');
const instanceName = String(process.env.DB_INSTANCE || '').trim();
const useInstance = parseBoolean(process.env.DB_USE_INSTANCE, false) && Boolean(instanceName);

const dialectOptions = {
  options: {
    encrypt: parseBoolean(process.env.DB_ENCRYPT, false),
    trustServerCertificate: parseBoolean(process.env.DB_TRUST_CERT, true),
    enableArithAbort: true,
    requestTimeout: parseNumber(process.env.DB_REQUEST_TIMEOUT_MS, 30000, 'DB_REQUEST_TIMEOUT_MS'),
    ...(useInstance ? { instanceName } : {})
  }
};

if (authMode === 'ntlm') {
  const domain = String(process.env.DB_DOMAIN || process.env.USERDOMAIN || '').trim();
  const userName = dbUser || String(process.env.USERNAME || '').trim();

  if (!domain || !userName) {
    throw new Error('NTLM authentication requires DB_DOMAIN and DB_USER.');
  }

  dialectOptions.authentication = {
    type: 'ntlm',
    options: {
      domain,
      userName,
      password: dbPassword
    }
  };
}

if (authMode === 'sql' && (!dbUser || !dbPassword)) {
  throw new Error('SQL authentication requires DB_USER and DB_PASSWORD.');
}

const sequelize = new Sequelize({
  dialect: 'mssql',
  database: dbName,
  username: dbUser,
  password: dbPassword,
  host,
  ...(useInstance ? {} : { port }),
  logging: parseBoolean(process.env.DB_LOGGING, false) ? console.log : false,
  pool: {
    max: parseNumber(process.env.DB_POOL_MAX, 10, 'DB_POOL_MAX'),
    min: parseNumber(process.env.DB_POOL_MIN, 0, 'DB_POOL_MIN'),
    acquire: parseNumber(process.env.DB_POOL_ACQUIRE_MS, 30000, 'DB_POOL_ACQUIRE_MS'),
    idle: parseNumber(process.env.DB_POOL_IDLE_MS, 10000, 'DB_POOL_IDLE_MS')
  },
  dialectOptions
});

module.exports = sequelize;
