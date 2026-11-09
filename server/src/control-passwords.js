'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { ApiError } = require('./utils');

function canRead(user) {
  return ['admin', 'qu_making'].includes(user?.role)
    || (user?.role === 'viewer' && user.staffWorkshopCode === 'qu_making');
}
function canManage(user) { return ['admin', 'qu_making'].includes(user?.role); }
const unavailable = () => new ApiError(503, '中控密码资料暂不可用，请联系系统管理员检查私有存储');
const publicRow = ({ password, ...row }) => ({ ...row, configured: Boolean(password) });

// Passwords and their revision history stay encrypted outside every static root.
// Synchronous atomic replacement serializes writes in the project's single API process.
function createStore(directory = path.resolve(__dirname, '../.private/control-passwords')) {
  const file = path.join(directory, 'vault.json'), keyFile = path.join(directory, 'key');
  function readFile(name) {
    const stat = fs.lstatSync(name);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024
      || (process.platform !== 'win32' && (stat.mode & 0o077))) throw unavailable();
    return fs.readFileSync(name);
  }
  function key(create = false) {
    try {
      if (create && !fs.existsSync(keyFile)) {
        fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
        fs.writeFileSync(keyFile, crypto.randomBytes(32), { flag: 'wx', mode: 0o600 });
      }
      const value = readFile(keyFile);
      if (value.length !== 32) throw unavailable();
      return value;
    } catch { throw unavailable(); }
  }
  function read() {
    try {
      if (!fs.existsSync(file)) return { revision: 'initial', rows: Array.from({ length: 9 }, (_, i) => ({
        id: i + 1, name: `${i + 1}号电脑`, username: '', password: '', note: '', updatedAt: null, updatedBy: ''
      })) };
      const envelope = JSON.parse(readFile(file).toString('utf8'));
      if (envelope.version !== 1) throw unavailable();
      const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(envelope.iv, 'base64'));
      decipher.setAAD(Buffer.from('control-passwords:v1'));
      decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
      const state = JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.data, 'base64')), decipher.final()]).toString('utf8'));
      if (typeof state.revision !== 'string' || state.rows?.length !== 9
        || state.rows.some((row, i) => row.id !== i + 1 || typeof row.password !== 'string')) throw unavailable();
      return state;
    } catch { throw unavailable(); }
  }
  function write(state) {
    const secret = key(true), iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', secret, iv);
    cipher.setAAD(Buffer.from('control-passwords:v1'));
    const data = Buffer.concat([cipher.update(JSON.stringify(state), 'utf8'), cipher.final()]);
    const envelope = JSON.stringify({ version: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') });
    const temp = path.join(directory, `.pending-${crypto.randomUUID()}`);
    try {
      if (fs.existsSync(file)) {
        const history = path.join(directory, 'history');
        fs.mkdirSync(history, { recursive: true, mode: 0o700 });
        fs.writeFileSync(path.join(history, `${Date.now()}-${crypto.randomUUID()}.json`), readFile(file), { flag: 'wx', mode: 0o600 });
      }
      fs.writeFileSync(temp, envelope, { flag: 'wx', mode: 0o600 });
      fs.renameSync(temp, file);
    } catch { throw unavailable(); }
  }
  function id(value) {
    if (!/^[1-9]$/.test(String(value))) throw new ApiError(404, '电脑不存在');
    return Number(value);
  }
  function text(value, label, max, required = false) {
    if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)
      || (required && !value.trim())) throw new ApiError(400, `${label}格式无效`);
    return value.trim();
  }
  return {
    list() { const state = read(); return { revision: state.revision, rows: state.rows.map(publicRow) }; },
    secret(value) { return { password: read().rows[id(value) - 1].password }; },
    update(value, body, user) {
      const number = id(value), state = read();
      if (body?.revision !== state.revision) throw new ApiError(409, '资料已被其他人更新，请刷新后重试');
      const row = state.rows[number - 1];
      const patch = { name: text(body.name, '电脑名称', 80, true), username: text(body.username, '登录账号', 120), note: text(body.note, '备注', 500) };
      // Omitted password preserves the current secret. Explicit empty clears it.
      if (Object.hasOwn(body, 'password')) {
        if (typeof body.password !== 'string' || body.password.length > 256 || /[\r\n\u0000]/.test(body.password)) throw new ApiError(400, '密码格式无效');
        patch.password = body.password;
      }
      Object.assign(row, patch, { updatedAt: new Date().toISOString(), updatedBy: String(user.displayName || user.username || '管理员').slice(0, 80) });
      state.revision = crypto.randomUUID();
      write(state);
      return { revision: state.revision, row: publicRow(row) };
    }
  };
}
module.exports = { canRead, canManage, createStore };
