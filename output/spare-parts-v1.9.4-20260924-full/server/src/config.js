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
  openclaw: {
    contextTransferEnabled: process.env.AI_CONTEXT_TRANSFER_ENABLED === 'true',
    apiUrl: process.env.OPENCLAW_API_URL || 'http://127.0.0.1:14504/v1/chat/completions',
    token: process.env.OPENCLAW_GATEWAY_TOKEN || '',
    model: process.env.OPENCLAW_MODEL || 'openclaw/spare-parts-chat',
    visionModel: process.env.OPENCLAW_VISION_MODEL || '',
    timeoutMs: numberFromEnv('OPENCLAW_TIMEOUT_MS', 120000)
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
  plc: {
    agentToken: process.env.PLC_AGENT_TOKEN || '',
    uploadDir: process.env.PLC_UPLOAD_DIR
      ? path.resolve(process.env.PLC_UPLOAD_DIR)
      : path.resolve(__dirname, '../uploads/plc-programs'),
    maxFileSize: Math.min(
      Math.max(numberFromEnv('PLC_MAX_FILE_SIZE', 50 * 1024 * 1024), 1024 * 1024),
      200 * 1024 * 1024
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
