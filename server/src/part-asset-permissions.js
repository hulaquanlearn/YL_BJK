const { ApiError } = require('./utils');
const { workshopForRole } = require('./workshop-scope');

function assertAssetScope(user, workshops) {
  if (user?.role === 'admin') return;
  const own = workshopForRole(user?.role);
  if (!own || !['raw_grain', 'qu_making', 'brewing'].includes(user.role)
    || !workshops.length || workshops.some(code => code !== own)) {
    throw new ApiError(403, '共用物料资源仅系统管理员可修改；车间管理员只能修改本车间独占物料');
  }
}

async function withPartAssetWrite(pool, user, partIds, action, beforeLocks) {
  const ids = [...new Set(partIds.map(Number))].sort((a, b) => a - b);
  if (!ids.length || ids.some(id => !Number.isSafeInteger(id) || id < 1)) throw new ApiError(400, '备件ID无效');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    if (beforeLocks) await beforeLocks(connection);
    // Adding inventory for an existing master also locks parts first. Keep the
    // ownership check and resource write under the same master locks.
    const placeholders = ids.map(() => '?').join(',');
    const [parts] = await connection.query(`SELECT id FROM parts WHERE id IN (${placeholders}) AND COALESCE(active,1)=1 ORDER BY id FOR UPDATE`, ids);
    if (parts.length !== ids.length) throw new ApiError(404, '部分备件不存在或已停用');
    const [rows] = await connection.query(`SELECT part_id,COALESCE(workshop_code,'raw_grain') AS workshopCode FROM inventory WHERE part_id IN (${placeholders}) AND COALESCE(active,1)=1 ORDER BY id FOR UPDATE`, ids);
    for (const id of ids) assertAssetScope(user, rows.filter(row => Number(row.part_id) === id).map(row => row.workshopCode));
    const result = await action(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
}

module.exports = { assertAssetScope, withPartAssetWrite };
