const express = require('express');
const rateLimit = require('express-rate-limit');
const { pool } = require('../db');
const { ApiError, asyncHandler } = require('../utils');
const { publicUser, createSession, requireAuth, setAssetCookie, clearAssetCookie } = require('../auth');
const { validatePassword } = require('../password-policy');
const { hashPassword, verifyPassword } = require('../password');

const router = express.Router();
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, msg: '登录尝试过多，请15分钟后再试' }
});

const passwordChangeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: true, legacyHeaders: false,
  keyGenerator: req => String(req.user.id),
  message: { success: false, msg: '密码验证尝试过多，请15分钟后再试' }
});

router.post('/login', loginLimiter, asyncHandler(async (req, res) => {
  const username = String(req.body?.username || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!username || !password) throw new ApiError(400, '请输入用户名和密码');

  const [rows] = await pool.query(
    `SELECT id, username, password_hash, display_name, role, staff_workshop_code, staff_position,
            enabled, token_version
     FROM app_users WHERE username = ? LIMIT 1`,
    [username]
  );
  const user = rows[0];
  const valid = user ? await verifyPassword(password, user.password_hash) : false;
  if (!valid || !Number(user.enabled)) throw new ApiError(401, '用户名或密码错误');

  await pool.query('UPDATE app_users SET last_login_at = NOW() WHERE id = ?', [user.id]);
  const token = await createSession(user.id);
  setAssetCookie({get:()=>`Bearer ${token}`}, res);
  res.json({ success: true, data: { token, user: publicUser(user) } });
}));

router.get('/me', requireAuth, (req, res) => {
  setAssetCookie(req, res);
  res.json({ success: true, data: { user: req.user } });
});

router.post('/logout', requireAuth, asyncHandler(async (req, res) => {
  await pool.query('DELETE FROM app_sessions WHERE id = ?', [req.sessionId]);
  clearAssetCookie(res);
  res.json({ success: true, msg: '已退出登录' });
}));

router.post('/change-password', requireAuth, passwordChangeLimiter, asyncHandler(async (req, res) => {
  const oldPassword = String(req.body?.oldPassword || '');
  const newPassword = validatePassword(req.body?.newPassword);
  const [rows] = await pool.query('SELECT password_hash FROM app_users WHERE id = ? LIMIT 1', [req.user.id]);
  if (!rows.length || !(await verifyPassword(oldPassword, rows[0].password_hash))) {
    throw new ApiError(400, '原密码不正确');
  }
  if (await verifyPassword(newPassword, rows[0].password_hash)) throw new ApiError(400, '新密码不能与原密码相同');
  const passwordHash = await hashPassword(newPassword);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('UPDATE app_users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?', [passwordHash, req.user.id]);
    await connection.query('DELETE FROM app_sessions WHERE user_id = ?', [req.user.id]);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
  clearAssetCookie(res);
  res.json({ success: true, msg: '密码修改成功，请重新登录' });
}));

module.exports = router;
