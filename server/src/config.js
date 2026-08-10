require('dotenv').config();

function numberFromEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: numberFromEnv('PORT', 3000),
  auth: {
    sessionHours: numberFromEnv('SESSION_HOURS', 8)
  },
  mysql: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: numberFromEnv('DB_PORT', 3306),
    user: process.env.DB_USER || 'spareparts',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'spare_parts',
    connectionLimit: numberFromEnv('DB_CONNECTION_LIMIT', 10),
    charset: process.env.DB_CHARSET || 'utf8mb4'
  },
  openclaw: {
    apiUrl: process.env.OPENCLAW_API_URL || 'http://127.0.0.1:14504/v1/chat/completions',
    token: process.env.OPENCLAW_GATEWAY_TOKEN || '',
    model: process.env.OPENCLAW_MODEL || 'openclaw/spare-parts-chat',
    timeoutMs: numberFromEnv('OPENCLAW_TIMEOUT_MS', 120000)
  }
};
