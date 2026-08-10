const mysql = require('mysql2/promise');
const config = require('./config');

const pool = mysql.createPool({
  ...config.mysql,
  waitForConnections: true,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  decimalNumbers: true,
  dateStrings: true,
  charset: config.mysql.charset
});

async function checkDatabase() {
  const connection = await pool.getConnection();
  try {
    await connection.query('SELECT 1');
  } finally {
    connection.release();
  }
}

module.exports = { pool, checkDatabase };
