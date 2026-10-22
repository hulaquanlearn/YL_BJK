const path = require('path');
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
  rawDutyAiSummary: {
    enabled: process.env.RAW_DUTY_AI_SUMMARY_ENABLED === 'true',
    provider: 'deepseek',
    apiUrl: 'https://api.deepseek.com/chat/completions',
    token: process.env.DEEPSEEK_API_KEY || '',
    model: process.env.RAW_DUTY_AI_MODEL || 'deepseek-flash',
    timeoutMs: 60000
  },
  knowledgeAi: {
    enabled: process.env.KNOWLEDGE_AI_ENABLED !== 'false',
    apiUrl: 'https://api.deepseek.com/chat/completions',
    token: process.env.DEEPSEEK_API_KEY || '',
    model: process.env.KNOWLEDGE_AI_MODEL || 'deepseek-flash',
    timeoutMs: 60000
  },
  knowledge: {
    uploadDir: process.env.KNOWLEDGE_UPLOAD_DIR
      ? path.resolve(process.env.KNOWLEDGE_UPLOAD_DIR)
      : path.resolve(__dirname, '../uploads/fermentation-knowledge'),
    maxFileSize: Math.min(
      Math.max(numberFromEnv('KNOWLEDGE_MAX_FILE_SIZE', 500 * 1024 * 1024), 1024 * 1024),
      500 * 1024 * 1024
    )
  },
  parts: {
    uploadDir: process.env.PARTS_UPLOAD_DIR
      ? path.resolve(process.env.PARTS_UPLOAD_DIR)
      : path.resolve(__dirname, '../uploads/part-images'),
    modelDir: process.env.PART_MODELS_UPLOAD_DIR
      ? path.resolve(process.env.PART_MODELS_UPLOAD_DIR)
      : path.resolve(__dirname, '../uploads/part-models'),
    maxFileSize: Math.min(
      Math.max(numberFromEnv('PARTS_MAX_FILE_SIZE', 10 * 1024 * 1024), 1024 * 1024),
      50 * 1024 * 1024
    )
  }
};
