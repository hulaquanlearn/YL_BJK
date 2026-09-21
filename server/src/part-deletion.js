const { ApiError } = require('./utils');
const { parseInventoryId, findPendingInventoryOrder } = require('./inventory-guards');
const { assertWorkshopWrite } = require('./workshop-scope');

function normalizeDeleteIds(values) {
  if (!Array.isArray(values) || !values.length) throw new ApiError(400, '请先选择要删除的备件');
  if (values.length > 200) throw new ApiError(400, '每次最多删除200条备件');
  return [...new Set(values.map(value => parseInventoryId(value)))].sort((a, b) => a - b);
}

// Preview and commit share the same guards. Commit always rechecks inside the transaction.
async function deleteParts(pool, user, values, { dryRun = false } = {}) {
  const ids = normalizeDeleteIds(values);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const placeholders = ids.map(() => '?').join(',');
    const [rows] = await connection.query(
      `SELECT i.id, i.part_id AS partId, i.quantity, i.active,
              COALESCE(i.workshop_code,'raw_grain') AS workshopCode,
              p.code AS materialCode, p.name AS materialDesc
       FROM inventory i INNER JOIN parts p ON p.id=i.part_id
       WHERE i.id IN (${placeholders}) ORDER BY i.id FOR UPDATE`, ids
    );
    for (const row of rows) assertWorkshopWrite(user, row.workshopCode);
    const byId = new Map(rows.map(row => [Number(row.id), row]));
    const results = [];
    for (const id of ids) {
      const row = byId.get(id);
      const reasons = [];
      if (!row || row.active === 0) reasons.push('记录不存在或已经删除');
      else {
        if (Number(row.quantity) !== 0) reasons.push(`当前库存为${row.quantity}，须先处理库存`);
        const pending = await findPendingInventoryOrder(connection, [id]);
        if (pending) reasons.push(`盘点单${pending.inventoryNo || pending.id}待审批`);
        const [relations] = await connection.query(
          `SELECT ep.id FROM equipment_parts ep
           INNER JOIN workshop_equipment e ON e.id=ep.equipment_id
           WHERE ep.part_id=? AND COALESCE(e.workshop_code,'raw_grain')=? FOR UPDATE`,
          [row.partId, row.workshopCode]
        );
        if (relations.length) reasons.push('已关联设备型号，请先解除关系');
        const [[otherInventory]] = await connection.query(
          `SELECT COUNT(*) AS total FROM inventory WHERE part_id=? AND COALESCE(active,1)=1 AND id NOT IN (${placeholders})`,
          [row.partId, ...ids]
        );
        if (!Number(otherInventory.total)) {
          const [globalRelations] = await connection.query('SELECT id FROM equipment_parts WHERE part_id=? FOR UPDATE', [row.partId]);
          if (globalRelations.length && !relations.length) reasons.push('其他车间仍有关联设备型号，不能停用最后一条库存对应的物料');
        }
      }
      results.push({ id: String(id), materialCode: row?.materialCode || '', materialDesc: row?.materialDesc || '', canDelete: reasons.length === 0, reason: reasons.join('；') });
    }
    const eligibleIds = results.filter(row => row.canDelete).map(row => row.id);
    const data = { results, eligibleIds, eligibleCount: eligibleIds.length, blockedCount: results.length - eligibleIds.length };
    if (dryRun) {
      await connection.rollback();
      return data;
    }
    if (data.blockedCount) throw new ApiError(409, '部分备件状态已变化或不满足删除条件，本次未删除任何备件', data);
    await connection.query(`UPDATE inventory SET active=0 WHERE id IN (${placeholders})`, ids);
    const partIds = [...new Set(rows.map(row => row.partId))];
    for (const partId of partIds) {
      const [[remaining]] = await connection.query('SELECT COUNT(*) AS total FROM inventory WHERE part_id=? AND COALESCE(active,1)=1', [partId]);
      if (!Number(remaining.total)) await connection.query('UPDATE parts SET active=0 WHERE id=?', [partId]);
    }
    await connection.commit();
    return { ...data, deletedCount: ids.length };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = { normalizeDeleteIds, deleteParts };
