const express = require('express');
const { pool } = require('../db');
const { ApiError, asyncHandler } = require('../utils');
const { requireRole } = require('../auth');
const { validateUsername, validatePassword, validateDisplayName } = require('../password-policy');
const { hashPassword } = require('../password');
const { WORKSHOPS, ROLE_LABELS } = require('../workshop-scope');
const { normalizeStaffIdentity } = require('../staff-identity');

const router = express.Router();
router.use((req,res,next) => {
  if (req.user?.role === 'viewer' && ['GET','HEAD'].includes(req.method) && ['/','/roles'].includes(req.path)) return next();
  return requireRole('admin')(req,res,next);
});
const ALLOWED_ROLES = new Set(['admin', 'viewer', ...WORKSHOPS.map(item => item.role)]);
router.get('/roles', (_req, res) => res.json({success:true,data:Object.entries(ROLE_LABELS).map(([value,label])=>({value,label}))}));

router.get('/', asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT id, username, display_name AS displayName, role,
            staff_workshop_code AS staffWorkshopCode, staff_position AS staffPosition, enabled,
            last_login_at AS lastLoginAt, created_at AS createdAt
     FROM app_users ORDER BY role = 'admin' DESC, username ASC`
  );
  res.json({ success: true, data: rows.map(row => req.user.role === 'viewer'
    ? { id:String(row.id), username:row.username, displayName:row.displayName, role:row.role,
      staffWorkshopCode:row.staffWorkshopCode || null, staffPosition:row.staffPosition || null, enabled:Boolean(row.enabled) }
    : { ...row, staffWorkshopCode:row.staffWorkshopCode || null, staffPosition:row.staffPosition || null,
      id:String(row.id), enabled:Boolean(row.enabled) }) });
}));

router.post('/', asyncHandler(async (req, res) => {
  const username = validateUsername(req.body?.username);
  const password = validatePassword(req.body?.password);
  const displayName = validateDisplayName(req.body?.displayName);
  const role = String(req.body?.role || 'viewer');
  if (!ALLOWED_ROLES.has(role)) throw new ApiError(400, '角色无效');
  const identity = normalizeStaffIdentity(role, req.body?.staffWorkshopCode, req.body?.staffPosition, { required: role === 'viewer' });
  const passwordHash = await hashPassword(password);
  try {
    const [result] = await pool.query(
      `INSERT INTO app_users (username, password_hash, display_name, role, staff_workshop_code, staff_position)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [username, passwordHash, displayName, role, identity.staffWorkshopCode, identity.staffPosition]
    );
    res.status(201).json({ success: true, msg: '账号创建成功', data: { id: String(result.insertId) } });
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') throw new ApiError(409, '用户名已存在');
    throw error;
  }
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) throw new ApiError(400, '账号ID无效');
  const updates = [];
  const params = [];
  const [existingRows] = await pool.query('SELECT role, staff_workshop_code, staff_position FROM app_users WHERE id=? LIMIT 1', [id]);
  if (!existingRows.length) throw new ApiError(404, '账号不存在');
  const existing = existingRows[0];
  if (req.body?.displayName !== undefined) {
    updates.push('display_name = ?');
    params.push(validateDisplayName(req.body.displayName));
  }
  if (req.body?.role !== undefined) {
    if (!ALLOWED_ROLES.has(req.body.role)) throw new ApiError(400, '角色无效');
    if (String(id) === String(req.user.id) && req.body.role !== 'admin') throw new ApiError(400, '不能取消自己的管理员权限');
    updates.push('role = ?');
    params.push(req.body.role);
  }
  if (req.body?.role !== undefined || req.body?.staffWorkshopCode !== undefined || req.body?.staffPosition !== undefined) {
    const nextRole = req.body?.role ?? existing.role;
    const identity = normalizeStaffIdentity(nextRole,
      req.body?.staffWorkshopCode !== undefined ? req.body.staffWorkshopCode : existing.staff_workshop_code,
      req.body?.staffPosition !== undefined ? req.body.staffPosition : existing.staff_position,
      { required: nextRole === 'viewer' });
    updates.push('staff_workshop_code = ?', 'staff_position = ?');
    params.push(identity.staffWorkshopCode, identity.staffPosition);
  }
  if (req.body?.enabled !== undefined) {
    const enabled = Boolean(req.body.enabled);
    if (String(id) === String(req.user.id) && !enabled) throw new ApiError(400, '不能停用自己的账号');
    updates.push('enabled = ?');
    params.push(enabled ? 1 : 0);
    if (!enabled) updates.push('token_version = token_version + 1');
  }
  if (!updates.length) throw new ApiError(400, '没有可更新的账号信息');
  params.push(id);
  const [result] = await pool.query(`UPDATE app_users SET ${updates.join(', ')} WHERE id = ?`, params);
  if (!result.affectedRows) throw new ApiError(404, '账号不存在');
  if (req.body?.enabled === false) await pool.query('DELETE FROM app_sessions WHERE user_id = ?', [id]);
  res.json({ success: true, msg: '账号更新成功' });
}));

router.post('/:id/reset-password', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) throw new ApiError(400, '账号ID无效');
  const password = validatePassword(req.body?.password);
  const passwordHash = await hashPassword(password);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.query(
      'UPDATE app_users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?',
      [passwordHash, id]
    );
    if (!result.affectedRows) throw new ApiError(404, '账号不存在');
    await connection.query('DELETE FROM app_sessions WHERE user_id = ?', [id]);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
  res.json({ success: true, msg: '密码已重置，该账号需重新登录' });
}));

module.exports = router;
