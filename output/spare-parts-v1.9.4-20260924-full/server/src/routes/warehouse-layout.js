const express = require('express');
const { pool } = require('../db');
const { ApiError, asyncHandler } = require('../utils');
const { WORKSHOPS, normalizeWorkshopCode, assertWorkshopWrite, requireAnyWorkshopEditor } = require('../workshop-scope');
const { parseShelfNo, normalizeShelfName, renumberLocationCode, toShelf } = require('../warehouse-layout');

const router = express.Router();

const DEFAULT_ROOMS = {
  raw_grain: { width: 18, depth: 32, height: 4.2, eastDirection: '+z', entranceWall: 'east', entranceOffset: 11.8, entranceWidth: 2.4 },
  qu_making: { width: 20, depth: 28, height: 4.2, eastDirection: '+z', entranceWall: 'west', entranceOffset: 0, entranceWidth: 2.6 },
  brewing: { width: 20, depth: 28, height: 4.2, eastDirection: '+z', entranceWall: 'west', entranceOffset: 0, entranceWidth: 2.6 }
};

function toRoom(row, workshopCode, workshopName) {
  const fallback = DEFAULT_ROOMS[workshopCode] || DEFAULT_ROOMS.raw_grain;
  return {
    workshopCode,
    name: row?.roomName || `${workshopName || workshopCode}备件库`,
    width: Number(row?.width) || fallback.width,
    depth: Number(row?.depth) || fallback.depth,
    height: Number(row?.height) || fallback.height,
    eastDirection: row?.eastDirection || fallback.eastDirection,
    entranceWall: row?.entranceWall || fallback.entranceWall,
    entranceOffset: Number.isFinite(Number(row?.entranceOffset)) ? Number(row.entranceOffset) : fallback.entranceOffset,
    entranceWidth: Number(row?.entranceWidth) || fallback.entranceWidth
  };
}

async function selectRoom(workshopCode, workshopName, connection = pool) {
  const [rows] = await connection.query(
    `SELECT room_name AS roomName,width,depth,height,east_axis AS eastDirection,
            entrance_wall AS entranceWall,entrance_offset AS entranceOffset,
            entrance_width AS entranceWidth
     FROM warehouse_rooms WHERE workshop_code=? LIMIT 1`,
    [workshopCode]
  );
  return toRoom(rows[0], workshopCode, workshopName);
}

const SHELF_SELECT = `
  SELECT s.id, s.layout_key AS layoutKey, s.workshop_code AS workshopCode, s.shelf_no AS shelfNo,
         s.display_name AS customName, s.workshop_group AS workshopGroup,
         s.warehouse_code AS warehouseCode, s.is_vendor AS isVendor,
         s.position_x AS positionX, s.position_z AS positionZ,
         s.rotation_y AS rotationY, s.position_overridden AS positionOverridden,
         s.width, s.depth, s.height,
         s.default_levels AS defaultLevels, s.sort_order AS sortOrder,
         COUNT(i.id) AS partsCount,
         COALESCE(MAX(i.layer), 0) AS maxLayer,
         COALESCE(MAX(i.slot), 0) AS maxSlot,
         COALESCE(MAX(CASE WHEN i.direction = '1' AND i.layer = 1 THEN i.slot ELSE 0 END), 0) AS side1Layer1Slots,
         COALESCE(MAX(CASE WHEN i.direction = '1' AND i.layer = 2 THEN i.slot ELSE 0 END), 0) AS side1Layer2Slots,
         COALESCE(MAX(CASE WHEN i.direction = '1' AND i.layer = 3 THEN i.slot ELSE 0 END), 0) AS side1Layer3Slots,
         COALESCE(MAX(CASE WHEN i.direction = '1' AND i.layer = 4 THEN i.slot ELSE 0 END), 0) AS side1Layer4Slots,
         COALESCE(MAX(CASE WHEN i.direction = '2' AND i.layer = 1 THEN i.slot ELSE 0 END), 0) AS side2Layer1Slots,
         COALESCE(MAX(CASE WHEN i.direction = '2' AND i.layer = 2 THEN i.slot ELSE 0 END), 0) AS side2Layer2Slots,
         COALESCE(MAX(CASE WHEN i.direction = '2' AND i.layer = 3 THEN i.slot ELSE 0 END), 0) AS side2Layer3Slots,
         COALESCE(MAX(CASE WHEN i.direction = '2' AND i.layer = 4 THEN i.slot ELSE 0 END), 0) AS side2Layer4Slots,
         COALESCE(SUM(CASE
           WHEN COALESCE(i.safety_stock_override, p.safety_stock) IS NOT NULL
            AND i.quantity <= COALESCE(i.safety_stock_override, p.safety_stock)
           THEN 1 ELSE 0 END), 0) AS lowStockCount
  FROM warehouse_shelves s
  LEFT JOIN inventory i ON i.shelf = s.shelf_no
    AND COALESCE(i.workshop_code, 'raw_grain') = s.workshop_code
    AND COALESCE(i.active, 1) = 1
  LEFT JOIN parts p ON p.id = i.part_id AND COALESCE(p.active, 1) = 1
`;

async function selectShelves(whereSql = '', params = [], connection = pool) {
  const [rows] = await connection.query(
    `${SHELF_SELECT} ${whereSql}
     GROUP BY s.id, s.layout_key, s.workshop_code, s.shelf_no, s.display_name, s.workshop_group,
              s.warehouse_code, s.is_vendor, s.position_x, s.position_z,
              s.rotation_y, s.position_overridden, s.width, s.depth, s.height, s.default_levels, s.sort_order
     ORDER BY s.sort_order ASC, s.id ASC`,
    params
  );
  return rows.map(toShelf);
}

router.get('/warehouse-layout', asyncHandler(async (req, res) => {
  const workshopCode = normalizeWorkshopCode(req.query.workshopCode, 'raw_grain');
  const workshop = WORKSHOPS.find(item => item.code === workshopCode);
  const [shelves, room] = await Promise.all([
    selectShelves('WHERE s.active = 1 AND s.workshop_code = ?', [workshopCode]),
    selectRoom(workshopCode, workshop?.name)
  ]);
  res.json({
    success: true,
    data: {
      workshop: workshop || { code: workshopCode, name: workshopCode },
      workshops: WORKSHOPS,
      room,
      locationCode: {
        shelf: '前2位为货架号',
        side: '第3位：1东侧、2西侧',
        layer: '第4位：从下到上，最下面为1层、最上面为4层',
        slot: '后2位：从南到北'
      },
      shelves
    }
  });
}));

router.put('/warehouse-layout/room', (_req, res) => {
  res.status(410).json({ success: false, msg: '库房空间为系统固定配置，不支持人工修改' });
});

router.post('/warehouse-layout/shelves', requireAnyWorkshopEditor, (_req, res) => {
  res.status(410).json({ success: false, msg: '实体货架采用固定布局，不支持人工新增' });
});

router.put('/warehouse-layout/shelves/:id', requireAnyWorkshopEditor, asyncHandler(async (req, res) => {
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
      `SELECT id, workshop_code AS workshopCode, shelf_no AS shelfNo, display_name AS displayName
       FROM warehouse_shelves WHERE id = ? AND active = 1 FOR UPDATE`,
      [shelfId]
    );
    if (!rows.length) throw new ApiError(404, '货架不存在');
    const current = rows[0];
    assertWorkshopWrite(req.user, current.workshopCode);
    const nextShelfNo = hasShelfNo ? requestedShelfNo : (current.shelfNo === null ? null : Number(current.shelfNo));
    const nextDisplayName = hasName ? displayName : current.displayName;
    const shelfNoChanged = nextShelfNo !== (current.shelfNo === null ? null : Number(current.shelfNo));
    let affectedInventory = 0;

    if (shelfNoChanged && nextShelfNo !== null) {
      const [duplicates] = await connection.query(
        'SELECT id FROM warehouse_shelves WHERE workshop_code=? AND shelf_no = ? AND id <> ? AND active = 1 LIMIT 1 FOR UPDATE',
        [current.workshopCode, nextShelfNo, shelfId]
      );
      if (duplicates.length) throw new ApiError(409, `${nextShelfNo}号货架已经存在`);
    }

    if (shelfNoChanged && current.shelfNo !== null) {
      const [inventoryRows] = await connection.query(
        "SELECT id, location FROM inventory WHERE COALESCE(workshop_code,'raw_grain')=? AND shelf = ? AND COALESCE(active, 1) = 1 FOR UPDATE",
        [current.workshopCode, current.shelfNo]
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

router.put('/warehouse-layout/shelves/:id/position', requireAnyWorkshopEditor, (_req, res) => {
  res.status(410).json({ success: false, msg: '实体货架位置和朝向为固定配置，不支持人工移动' });
});

router.put('/warehouse-layout/shelves/:id/reset-position', requireAnyWorkshopEditor, (_req, res) => {
  res.status(410).json({ success: false, msg: '实体货架位置为固定配置，无需人工重置' });
});

router.patch('/warehouse-layout/shelves/:id/dimensions', requireAnyWorkshopEditor, (_req, res) => {
  res.status(410).json({ success: false, msg: '实体货架尺寸为固定配置，不支持人工修改' });
});

router.delete('/warehouse-layout/shelves/:id', requireAnyWorkshopEditor, (_req, res) => {
  res.status(410).json({ success: false, msg: '实体货架采用固定布局，不支持人工删除' });
});

function toStagingPoint(row) {
  return {
    id: String(row.id),
    workshopCode: row.workshopCode || 'raw_grain',
    name: row.name,
    position: { x: Number(row.positionX) || 0, z: Number(row.positionZ) || 0 },
    description: row.description || '',
    sortOrder: Number(row.sortOrder) || 0
  };
}

router.get('/staging-points', asyncHandler(async (req, res) => {
  const workshopCode = normalizeWorkshopCode(req.query.workshopCode, 'raw_grain');
  const [rows] = await pool.query(
    'SELECT id, workshop_code AS workshopCode, name, position_x AS positionX, position_z AS positionZ, description, sort_order AS sortOrder FROM staging_points WHERE active=1 AND workshop_code=? ORDER BY sort_order ASC, id ASC',
    [workshopCode]
  );
  res.json({ success: true, data: rows.map(toStagingPoint) });
}));

router.post('/staging-points', requireAnyWorkshopEditor, (_req, res) => {
  res.status(410).json({ success: false, msg: '暂存点为历史只读标记，不支持新增' });
});

router.put('/staging-points/:id', requireAnyWorkshopEditor, (_req, res) => {
  res.status(410).json({ success: false, msg: '暂存点为历史只读标记，不支持修改' });
});

router.delete('/staging-points/:id', requireAnyWorkshopEditor, (_req, res) => {
  res.status(410).json({ success: false, msg: '暂存点为历史只读标记，不支持删除' });
});

module.exports = router;
