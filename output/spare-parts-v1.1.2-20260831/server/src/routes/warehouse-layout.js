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

router.put('/warehouse-layout/room', requireAnyWorkshopEditor, asyncHandler(async (req, res) => {
  const workshopCode = normalizeWorkshopCode(req.body?.workshopCode, 'raw_grain');
  assertWorkshopWrite(req.user, workshopCode);
  const workshop = WORKSHOPS.find(item => item.code === workshopCode);
  const roomName = normalizeShelfName(req.body?.name) || `${workshop?.name || workshopCode}备件库`;
  const width = Math.min(Math.max(Number(req.body?.width) || 19, 8), 80);
  const depth = Math.min(Math.max(Number(req.body?.depth) || 34, 8), 100);
  const height = Math.min(Math.max(Number(req.body?.height) || 4.2, 2.4), 15);
  const eastDirection = ['+z', '-z', '+x', '-x'].includes(req.body?.eastDirection) ? req.body.eastDirection : '+z';
  const entranceWall = ['west', 'east', 'north', 'south'].includes(req.body?.entranceWall) ? req.body.entranceWall : 'west';
  const wallSpan = ['west', 'east'].includes(entranceWall) ? depth : width;
  const entranceWidth = Math.min(Math.max(Number(req.body?.entranceWidth) || 2.6, 0.8), Math.max(wallSpan - 0.5, 0.8));
  const maxOffset = Math.max(wallSpan / 2 - entranceWidth / 2, 0);
  const entranceOffset = Math.max(-maxOffset, Math.min(maxOffset, Number(req.body?.entranceOffset) || 0));
  await pool.query(
    `INSERT INTO warehouse_rooms
      (workshop_code,room_name,width,depth,height,east_axis,entrance_wall,entrance_offset,entrance_width,updated_by)
     VALUES (?,?,?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE room_name=VALUES(room_name),width=VALUES(width),depth=VALUES(depth),height=VALUES(height),
       east_axis=VALUES(east_axis),entrance_wall=VALUES(entrance_wall),entrance_offset=VALUES(entrance_offset),
       entrance_width=VALUES(entrance_width),updated_by=VALUES(updated_by)`,
    [workshopCode, roomName, width, depth, height, eastDirection, entranceWall, entranceOffset, entranceWidth, req.user.id]
  );
  res.json({ success: true, msg: '库房布局配置已保存', data: await selectRoom(workshopCode, workshop?.name) });
}));

router.post('/warehouse-layout/shelves', requireAnyWorkshopEditor, asyncHandler(async (req, res) => {
  const workshopCode = normalizeWorkshopCode(req.body?.workshopCode, 'raw_grain');
  assertWorkshopWrite(req.user, workshopCode);
  const shelfNo = parseShelfNo(req.body?.shelfNo);
  if (shelfNo === null) throw new ApiError(400, '请填写货架号');
  const displayName = normalizeShelfName(req.body?.displayName);
  const workshopGroup = normalizeShelfName(req.body?.workshopGroup) || WORKSHOPS.find(item => item.code === workshopCode)?.name || '未分组';
  const [[countRow]] = await pool.query('SELECT COUNT(*) AS total FROM warehouse_shelves WHERE workshop_code=?', [workshopCode]);
  const index = Number(countRow?.total) || 0;
  const row = Math.floor(index / 2);
  const column = index % 2;
  try {
    const [result] = await pool.query(
      `INSERT INTO warehouse_shelves
       (layout_key,workshop_code,shelf_no,display_name,workshop_group,warehouse_code,is_vendor,
        position_x,position_z,rotation_y,width,depth,height,default_levels,sort_order,active,updated_by)
       VALUES (?,?,?,?,?,?,?, ?,?,?, ?,?,?,4,?,1,?)`,
      [`${workshopCode}-${String(index + 1).padStart(2, '0')}`, workshopCode, shelfNo, displayName,
        workshopGroup, req.body?.warehouseCode || null, req.body?.isVendor ? 1 : 0,
        column === 0 ? -2.3 : 2.3, -7.2 + row * 2.4, 0,
        4.2, 0.9, 3.2, index + 1, req.user.id]
    );
    const created = await selectShelves('WHERE s.id=?', [result.insertId]);
    res.status(201).json({ success: true, msg: '货架已新增', data: created[0] });
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') throw new ApiError(409, '该车间的货架号已经存在');
    throw error;
  }
}));

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

router.put('/warehouse-layout/shelves/:id/position', requireAnyWorkshopEditor, asyncHandler(async (req, res) => {
  const shelfId = Number(req.params.id);
  if (!Number.isInteger(shelfId) || shelfId < 1) throw new ApiError(400, '货架ID无效');
  const positionX = Number(req.body?.positionX);
  const positionZ = Number(req.body?.positionZ);
  const rotationY = Number(req.body?.rotationY || 0);
  if (!Number.isFinite(positionX) || !Number.isFinite(positionZ)) throw new ApiError(400, '坐标数据无效');
  const [rows] = await pool.query('SELECT workshop_code AS workshopCode FROM warehouse_shelves WHERE id=? AND active=1 LIMIT 1', [shelfId]);
  if (!rows.length) throw new ApiError(404, '货架不存在');
  assertWorkshopWrite(req.user, rows[0].workshopCode);
  const room = await selectRoom(rows[0].workshopCode, '');
  const clampedX = Math.max(-room.width / 2 + 0.25, Math.min(room.width / 2 - 0.25, positionX));
  const clampedZ = Math.max(-room.depth / 2 + 0.25, Math.min(room.depth / 2 - 0.25, positionZ));
  await pool.query(
    'UPDATE warehouse_shelves SET position_x=?, position_z=?, rotation_y=?, position_overridden=1, updated_by=?, updated_at=CURRENT_TIMESTAMP WHERE id=?',
    [clampedX, clampedZ, rotationY, req.user.id, shelfId]
  );
  const updated = await selectShelves('WHERE s.id=?', [shelfId]);
  res.json({ success: true, msg: '货架位置已更新', data: updated[0] });
}));

router.put('/warehouse-layout/shelves/:id/reset-position', requireAnyWorkshopEditor, asyncHandler(async (req, res) => {
  const shelfId = Number(req.params.id);
  if (!Number.isInteger(shelfId) || shelfId < 1) throw new ApiError(400, '货架ID无效');
  const [rows] = await pool.query('SELECT workshop_code AS workshopCode FROM warehouse_shelves WHERE id=? AND active=1', [shelfId]);
  if (!rows.length) throw new ApiError(404, '货架不存在');
  assertWorkshopWrite(req.user, rows[0].workshopCode);
  await pool.query('UPDATE warehouse_shelves SET position_overridden=0, updated_by=?, updated_at=CURRENT_TIMESTAMP WHERE id=?', [req.user.id, shelfId]);
  const updated = await selectShelves('WHERE s.id=?', [shelfId]);
  res.json({ success: true, msg: '货架位置已恢复默认', data: updated[0] });
}));

router.patch('/warehouse-layout/shelves/:id/dimensions', requireAnyWorkshopEditor, asyncHandler(async (req, res) => {
  const shelfId = Number(req.params.id);
  if (!Number.isInteger(shelfId) || shelfId < 1) throw new ApiError(400, '货架ID无效');
  const [rows] = await pool.query('SELECT workshop_code AS workshopCode FROM warehouse_shelves WHERE id=? AND active=1', [shelfId]);
  if (!rows.length) throw new ApiError(404, '货架不存在');
  assertWorkshopWrite(req.user, rows[0].workshopCode);
  const width = Math.min(Math.max(Number(req.body?.width) || 4.2, 0.5), 10);
  const depth = Math.min(Math.max(Number(req.body?.depth) || 0.9, 0.3), 3);
  const height = Math.min(Math.max(Number(req.body?.height) || 3.2, 1), 6);
  const defaultLevels = 4;
  await pool.query(
    'UPDATE warehouse_shelves SET width=?, depth=?, height=?, default_levels=?, updated_by=?, updated_at=CURRENT_TIMESTAMP WHERE id=?',
    [width, depth, height, defaultLevels, req.user.id, shelfId]
  );
  const updated = await selectShelves('WHERE s.id=?', [shelfId]);
  res.json({ success: true, msg: '货架尺寸已更新', data: updated[0] });
}));

router.delete('/warehouse-layout/shelves/:id', requireAnyWorkshopEditor, asyncHandler(async (req, res) => {
  const shelfId = Number(req.params.id);
  if (!Number.isInteger(shelfId) || shelfId < 1) throw new ApiError(400, '货架ID无效');
  const [rows] = await pool.query(
    `SELECT s.workshop_code AS workshopCode, s.shelf_no AS shelfNo,
            (SELECT COUNT(*) FROM inventory i WHERE i.shelf = s.shelf_no AND COALESCE(i.workshop_code,'raw_grain') = s.workshop_code AND COALESCE(i.active,1)=1) AS partsCount
     FROM warehouse_shelves s WHERE s.id=? AND s.active=1`,
    [shelfId]
  );
  if (!rows.length) throw new ApiError(404, '货架不存在');
  assertWorkshopWrite(req.user, rows[0].workshopCode);
  if (Number(rows[0].partsCount) > 0) {
    throw new ApiError(409, `该货架仍有 ${rows[0].partsCount} 条备件库存，请先转移或清除后再删除`);
  }
  await pool.query('UPDATE warehouse_shelves SET active=0, updated_by=?, updated_at=CURRENT_TIMESTAMP WHERE id=?', [req.user.id, shelfId]);
  res.json({ success: true, msg: '货架已删除' });
}));

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

router.post('/staging-points', requireAnyWorkshopEditor, asyncHandler(async (req, res) => {
  const workshopCode = normalizeWorkshopCode(req.body?.workshopCode, 'raw_grain');
  assertWorkshopWrite(req.user, workshopCode);
  const name = String(req.body?.name || '').trim().slice(0, 100);
  if (!name) throw new ApiError(400, '请填写暂存点名称');
  const positionX = Number(req.body?.positionX) || 0;
  const positionZ = Number(req.body?.positionZ) || 0;
  const description = String(req.body?.description || '').trim().slice(0, 500);
  const [result] = await pool.query(
    'INSERT INTO staging_points (workshop_code,name,position_x,position_z,description) VALUES (?,?,?,?,?)',
    [workshopCode, name, positionX, positionZ, description]
  );
  const [[row]] = await pool.query('SELECT id, workshop_code AS workshopCode, name, position_x AS positionX, position_z AS positionZ, description, sort_order AS sortOrder FROM staging_points WHERE id=?', [result.insertId]);
  res.status(201).json({ success: true, msg: '暂存点已创建', data: toStagingPoint(row) });
}));

router.put('/staging-points/:id', requireAnyWorkshopEditor, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) throw new ApiError(400, 'ID无效');
  const [rows] = await pool.query('SELECT workshop_code AS workshopCode FROM staging_points WHERE id=? AND active=1', [id]);
  if (!rows.length) throw new ApiError(404, '暂存点不存在');
  assertWorkshopWrite(req.user, rows[0].workshopCode);
  const fields = [];
  const params = [];
  if (req.body?.name !== undefined) { fields.push('name=?'); params.push(String(req.body.name).trim().slice(0, 100)); }
  if (req.body?.positionX !== undefined) { fields.push('position_x=?'); params.push(Number(req.body.positionX) || 0); }
  if (req.body?.positionZ !== undefined) { fields.push('position_z=?'); params.push(Number(req.body.positionZ) || 0); }
  if (req.body?.description !== undefined) { fields.push('description=?'); params.push(String(req.body.description).trim().slice(0, 500)); }
  if (!fields.length) throw new ApiError(400, '没有可更新的字段');
  params.push(id);
  await pool.query(`UPDATE staging_points SET ${fields.join(',')} WHERE id=?`, params);
  const [[row]] = await pool.query('SELECT id, workshop_code AS workshopCode, name, position_x AS positionX, position_z AS positionZ, description, sort_order AS sortOrder FROM staging_points WHERE id=?', [id]);
  res.json({ success: true, msg: '暂存点已更新', data: toStagingPoint(row) });
}));

router.delete('/staging-points/:id', requireAnyWorkshopEditor, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) throw new ApiError(400, 'ID无效');
  const [rows] = await pool.query('SELECT workshop_code AS workshopCode FROM staging_points WHERE id=? AND active=1', [id]);
  if (!rows.length) throw new ApiError(404, '暂存点不存在');
  assertWorkshopWrite(req.user, rows[0].workshopCode);
  await pool.query('UPDATE staging_points SET active=0 WHERE id=?', [id]);
  res.json({ success: true, msg: '暂存点已删除' });
}));

module.exports = router;
