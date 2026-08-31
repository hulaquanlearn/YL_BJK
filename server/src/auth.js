const crypto = require('crypto');
const config = require('./config');
const { pool } = require('./db');
const { ApiError, asyncHandler } = require('./utils');
const { workshopForRole } = require('./workshop-scope');

function publicUser(row) {
  return {
    id: String(row.id),
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    enabled: Boolean(row.enabled),
    workshopCode: workshopForRole(row.role)
  };
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const hours = Math.min(Math.max(Number(config.auth.sessionHours) || 8, 1), 168);
  const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
  await pool.query('DELETE FROM app_sessions WHERE expires_at <= NOW()');
  await pool.query(
    'INSERT INTO app_sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
    [userId, hashToken(token), expiresAt]
  );
  return token;
}

const requireAuth = asyncHandler(async (req, _res, next) => {
  const authorization = String(req.get('authorization') || '');
  const match = authorization.match(/^Bearer\s+([A-Za-z0-9_-]{40,100})$/);
  if (!match) throw new ApiError(401, '请先登录');

  const [rows] = await pool.query(
    `SELECT u.id, u.username, u.display_name, u.role, u.enabled, s.id AS session_id
     FROM app_sessions s
     INNER JOIN app_users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > NOW()
     LIMIT 1`,
    [hashToken(match[1])]
  );
  const user = rows[0];
  if (!user || !Number(user.enabled)) throw new ApiError(401, '登录已过期，请重新登录');
  req.user = publicUser(user);
  req.sessionId = user.session_id;
  next();
});

function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      next(new ApiError(403, '当前账号没有此操作权限'));
      return;
    }
    next();
  };
}

function assertAuthConfig() {
  const hours = Number(config.auth.sessionHours);
  if (!Number.isFinite(hours) || hours < 1 || hours > 168) {
    throw new Error('SESSION_HOURS必须为1至168之间的数字');
  }
}

module.exports = { publicUser, createSession, requireAuth, requireRole, assertAuthConfig };
