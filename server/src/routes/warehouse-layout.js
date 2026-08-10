const express = require('express');
const { pool } = require('../db');
const { ApiError, asyncHandler } = require('../utils');
const { requireRole } = require('../auth');
const { parseShelfNo, normalizeShelfName, renumberLocationCode, toShelf } = require('../warehouse-layout');

const router = express.Router();

const SHELF_SELECT = `
  SELECT s.id, s.layout_key AS layoutKey, s.shelf_no AS shelfNo,
         s.display_name AS customName, s.workshop_group AS workshopGroup,
         s.warehouse_code AS warehouseCode, s.is_vendor AS isVendor,
         s.position_x AS positionX, s.position_z AS positionZ,
         s.rotation_y AS rotationY, s.width, s.depth, s.height,
         s.default_levels AS defaultLevels, s.sort_order AS sortOrder,
         COUNT(i.id) AS partsCount,
         COALESCE(MAX(i.layer), 0) AS maxLayer,
         COALESCE(MAX(i.slot), 0) AS maxSlot,
         COALESCE(SUM(CASE WHEN p.safety_stock IS NOT NULL AND i.quantity <= p.safety_stock THEN 1 ELSE 0 END), 0) AS lowStockCount
  FROM warehouse_shelves s
  LEFT JOIN inventory i ON i.shelf = s.shelf_no AND COALESCE(i.active, 1) = 1
  LEFT JOIN parts p ON p.id = i.part_id AND COALESCE(p.active, 1) = 1
`;

async function selectShelves(whereSql = '', params = [], connection = pool) {
  const [rows] = await connection.query(
    `${SHELF_SELECT} ${whereSql}
     GROUP BY s.id, s.layout_key, s.shelf_no, s.display_name, s.workshop_group,
              s.warehouse_code, s.is_vendor, s.position_x, s.position_z,
              s.rotation_y, s.width, s.depth, s.height, s.default_levels, s.sort_order
     ORDER BY s.sort_order ASC, s.id ASC`,
    params
  );
  return rows.map(toShelf);
}

router.get('/warehouse-layout', asyncHandler(async (_req, res) => {
  const shelves = await selectShelves('WHERE s.active = 1');
  res.json({
    success: true,
    data: {
      room: { name: '原粮车间备件库', width: 18, depth: 22, height: 4.2, eastDirection: '+z' },
      locationCode: {
        shelf: '前2位为货架号',
        side: '第3位：1东侧、2西侧',
        layer: '第4位：从上到下',
        slot: '后2位：从南到北'
      },
      shelves
    }
  });
}));

router.put('/warehouse-layout/shelves/:id', requireRole('admin'), asyncHandler(async (req, res) => {
  const shelfId = Number(req.params.id);
  if (!Number.isInteger(shelfId) || shelfId < 1) throw new ApiError(400, '货架ID无效');
  const hasName = Object.prototype.hasOwnProperty.call(req.body || {}, 'displayName');
  const hasShelfNo = Object.prototype.hasOwnProperty.call(req.body || {}, 'shelfNo');
  if (!hasName && !hasShelfNo) throw new ApiError(400, '没有可更新的货架信息');

  const displayName = hasName ? normalizeShelfName(req.body.displayName) : undefined;
  const requestedShelfNo = hasShelfNo ? parseShelfNo(req.body.shelfNo) : undefined;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `SELECT id, shelf_no AS shelfNo, display_name AS displayName
       FROM warehouse_shelves WHERE id = ? AND active = 1 FOR UPDATE`,
      [shelfId]
    );
    if (!rows.length) throw new ApiError(404, '货架不存在');
    const current = rows[0];
    const nextShelfNo = hasShelfNo ? requestedShelfNo : (current.shelfNo === null ? null : Number(current.shelfNo));
    const nextDisplayName = hasName ? displayName : current.displayName;
    const shelfNoChanged = nextShelfNo !== (current.shelfNo === null ? null : Number(current.shelfNo));
    let affectedInventory = 0;

    if (shelfNoChanged && nextShelfNo !== null) {
      const [duplicates] = await connection.query(
        'SELECT id FROM warehouse_shelves WHERE shelf_no = ? AND id <> ? AND active = 1 LIMIT 1 FOR UPDATE',
        [nextShelfNo, shelfId]
      );
      if (duplicates.length) throw new ApiError(409, `${nextShelfNo}号货架已经存在`);
    }

    if (shelfNoChanged && current.shelfNo !== null) {
      const [inventoryRows] = await connection.query(
        'SELECT id, location FROM inventory WHERE shelf = ? AND COALESCE(active, 1) = 1 FOR UPDATE',
        [current.shelfNo]
      );
      affectedInventory = inventoryRows.length;
      if (affectedInventory && nextShelfNo === null) {
        throw new ApiError(409, '该货架已有备件，不能清空货架号');
      }
      if (affectedInventory && req.body?.confirmRenumber !== true) {
        throw new ApiError(409, `改号将同步更新${affectedInventory}条备件库位，请确认后重试`);
      }
      for (const inventoryRow of inventoryRows) {
        await connection.query(
          'UPDATE inventory SET shelf = ?, location = ? WHERE id = ?',
          [nextShelfNo, renumberLocationCode(inventoryRow.location, nextShelfNo), inventoryRow.id]
        );
      }
    }

    await connection.query(
      `UPDATE warehouse_shelves
       SET shelf_no = ?, display_name = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [nextShelfNo, nextDisplayName, req.user.id, shelfId]
    );
    await connection.query(
      `INSERT INTO warehouse_shelf_audit
       (shelf_id, before_data, after_data, inventory_rows_affected, operator_user_id, operator_name)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [shelfId, JSON.stringify(current), JSON.stringify({ shelfNo: nextShelfNo, displayName: nextDisplayName }),
        affectedInventory, req.user.id, req.user.displayName]
    );
    await connection.commit();

    const updated = await selectShelves('WHERE s.id = ?', [shelfId]);
    res.json({ success: true, msg: '货架信息已更新', data: updated[0] });
  } catch (error) {
    await connection.rollback();
    if (error?.code === 'ER_DUP_ENTRY') throw new ApiError(409, '货架号与现有库位冲突，未执行修改');
    throw error;
  } finally {
    connection.release();
  }
}));

module.exports = router;
