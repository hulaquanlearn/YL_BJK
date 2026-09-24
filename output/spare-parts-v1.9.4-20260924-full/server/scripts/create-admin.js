require('dotenv').config();
const { pool } = require('../src/db');
const { validateUsername, validatePassword, validateDisplayName } = require('../src/password-policy');
const { hashPassword } = require('../src/password');

async function main() {
  const username = validateUsername(process.env.BOOTSTRAP_ADMIN_USERNAME || 'admin');
  const password = validatePassword(process.env.BOOTSTRAP_ADMIN_PASSWORD);
  const displayName = validateDisplayName(process.env.BOOTSTRAP_ADMIN_DISPLAY_NAME || '系统管理员');
  const [rows] = await pool.query('SELECT id FROM app_users WHERE username = ? LIMIT 1', [username]);
  if (rows.length) throw new Error(`账号${username}已存在，脚本不会覆盖现有密码`);
  const passwordHash = await hashPassword(password);
  await pool.query(
    `INSERT INTO app_users (username, password_hash, display_name, role)
     VALUES (?, ?, ?, 'admin')`,
    [username, passwordHash, displayName]
  );
  console.log(`管理员账号${username}创建成功。请立即从.env删除BOOTSTRAP_ADMIN_PASSWORD。`);
}

main()
  .catch(error => { console.error(error.message); process.exitCode = 1; })
  .finally(() => pool.end());
