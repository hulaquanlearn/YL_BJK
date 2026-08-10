const express = require('express');
const { pool } = require('../db');
const { ApiError, asyncHandler, positiveInt, toPart } = require('../utils');
const { requireRole } = require('../auth');
const { parseInventoryId, findPendingInventoryOrder } = require('../inventory-guards');
const { summarizeDataQuality, ISSUE_DEFINITIONS } = require('../data-quality');
const { parseMovementMetadata, movementReasonOptions, assertMovementAssociations } = require('../movement-metadata');

const router = express.Router();

const QUALITY_SELECT = `SELECT i.id, p.id AS partId, p.code AS materialCode, p.name AS materialDesc,
  p.spec, p.unit, p.safety_stock AS reorderPoint, p.max_stock AS maxStock, p.price,
  i.quantity AS totalStock, i.in_transit AS inTransit, i.warehouse AS warehouseArea,
  COALESCE(w.name, i.warehouse) AS warehouseAreaName, i.location AS locationCode,
  i.location_type AS locationType, i.location_note AS locationNote,
  i.shelf, i.direction AS position, i.layer, i.slot AS location,
  i.last_inventory_date AS lastInventoryDate, COALESCE(dup.duplicateCount, 1) AS duplicateCount
  FROM inventory i
  INNER JOIN parts p ON p.id = i.part_id
  LEFT JOIN warehouses w ON w.code = i.warehouse OR w.name = i.warehouse
  LEFT JOIN (
    SELECT code, COUNT(*) AS duplicateCount FROM parts WHERE COALESCE(active, 1) = 1 GROUP BY code HAVING COUNT(*) > 1
  ) dup ON dup.code = p.code
  WHERE COALESCE(i.active, 1) = 1 AND COALESCE(p.active, 1) = 1`;

function makeNo(prefix) {
  const now = new Date();
  const digits = now.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  return `${prefix}-${digits}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function optionalText(value, maxLength = 500) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (text.length > maxLength) throw new ApiError(400, `文本不能超过${maxLength}个字符`);
  return text;
}

function optionalNumber(value, field, { min = 0, max = Number.POSITIVE_INFINITY } = {}) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) throw new ApiError(400, `${field}必须是${min}至${max === Number.POSITIVE_INFINITY ? '有效上限' : max}之间的数字`);
  return number;
}

function optionalDate(value, field) {
  const text = optionalText(value, 10);
  if (text === null) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(new Date(`${text}T00:00:00`).getTime())) {
    throw new ApiError(400, `${field}格式无效`);
  }
  return text;
}

async function getSupplierColumns() {
  const [rows] = await pool.query(
    `SELECT COLUMN_NAME AS columnName
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'suppliers'`
  );
  return new Set(rows.map(row => row.columnName));
}

router.get('/movement-reasons', (_req, res) => {
  res.json({ success: true, data: movementReasonOptions() });
});

router.get('/data-quality', asyncHandler(async (req, res) => {
  const page = positiveInt(req.query.page, 1, 100000);
  const pageSize = positiveInt(req.query.pageSize, 30, 200);
  const [rows] = await pool.query(QUALITY_SELECT);
  const profile = summarizeDataQuality(rows);
  const issueType = Object.prototype.hasOwnProperty.call(ISSUE_DEFINITIONS, req.query.issueType)
    ? req.query.issueType : '';
  const keyword = String(req.query.searchKeyword || '').trim().toLowerCase();
  const filtered = profile.records.filter(row => {
    if (issueType && !row.issues.includes(issueType)) return false;
    if (!keyword) return true;
    return [row.materialCode, row.materialDesc, row.spec, row.locationCode, row.warehouseAreaName]
      .some(value => String(value || '').toLowerCase().includes(keyword));
  });
  const offset = (page - 1) * pageSize;
  res.json({
    success: true,
    data: filtered.slice(offset, offset + pageSize).map(row => ({ ...toPart(row), issueDetails: row.issues.map(key => ({ key, ...ISSUE_DEFINITIONS[key] })) })),
    total: filtered.length,
    page,
    pageSize,
    summary: {
      total: profile.total,
      affected: profile.affected,
      healthy: profile.healthy,
      qualityRate: profile.qualityRate,
      issueGroups: profile.issueGroups,
      generatedAt: new Date().toISOString()
    }
  });
}));

router.patch('/parts/:id/config', requireRole('admin'), asyncHandler(async (req, res) => {
  const inventoryId = parseInventoryId(req.params.id);
  const data = req.body || {};
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query('SELECT part_id FROM inventory WHERE id = ? FOR UPDATE', [inventoryId]);
    if (!rows.length) throw new ApiError(404, '库存记录不存在');
    const reorderPoint = optionalNumber(data.reorderPoint, '订购点');
    const maxStock = optionalNumber(data.maxStock, '最高储备');
    if (reorderPoint !== null && maxStock !== null && maxStock < reorderPoint) throw new ApiError(400, '最高储备不能低于订购点');
    await connection.query(
      `UPDATE parts SET unit = ?, safety_stock = ?, max_stock = ?, price = ? WHERE id = ?`,
      [optionalText(data.unit, 30), reorderPoint, maxStock, optionalNumber(data.price, '单价'), rows[0].part_id]
    );
    await connection.query(
      `UPDATE inventory SET location_type = ?, location_note = ?, location = ?, shelf = ?, direction = ?, layer = ?, slot = ? WHERE id = ?`,
      [data.locationType === 'free_text' ? 'free_text' : 'shelf', optionalText(data.locationNote, 300), optionalText(data.locationCode, 100),
        optionalNumber(data.shelf, '货架号', { min: 1, max: 99 }), optionalNumber(data.position, '方位', { min: 1, max: 2 }), optionalNumber(data.layer, '层数', { min: 1, max: 4 }), optionalNumber(data.location, '货位', { min: 1, max: 99 }), inventoryId]
    );
    await connection.commit();
    res.json({ success: true, msg: '质量问题配置已保存' });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
}));

router.get('/suppliers', asyncHandler(async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT id, supplier_code AS supplierCode, supplier_name AS supplierName, contact_name AS contactName,
            contact_phone AS contactPhone, default_lead_time_days AS leadTimeDays,
            default_min_order_qty AS minOrderQty, enabled, created_at AS createdAt
     FROM suppliers WHERE enabled = 1 ORDER BY supplier_name ASC`
  );
  res.json({ success: true, data: rows.map(row => ({ ...row, id: String(row.id), enabled: Boolean(row.enabled) })) });
}));

router.post('/suppliers', requireRole('admin'), asyncHandler(async (req, res) => {
  const supplierCode = optionalText(req.body?.supplierCode, 50);
  const supplierName = optionalText(req.body?.supplierName, 150);
  if (!supplierCode || !supplierName) throw new ApiError(400, '供应商编码和名称不能为空');
  try {
    const contactName = optionalText(req.body?.contactName, 50);
    const contactPhone = optionalText(req.body?.contactPhone, 50);
    const columns = [
      'supplier_code', 'supplier_name', 'contact_name', 'contact_phone',
      'default_lead_time_days', 'default_min_order_qty'
    ];
    const values = [
      supplierCode, supplierName, contactName, contactPhone,
      optionalNumber(req.body?.leadTimeDays, '交货周期', { max: 3650 }),
      optionalNumber(req.body?.minOrderQty, '最小起订量')
    ];
    const existingColumns = await getSupplierColumns();
    const legacyValues = {
      name: supplierName,
      contact: contactName || '',
      phone: contactPhone || '',
      address: optionalText(req.body?.address, 300) || '',
      remark: optionalText(req.body?.remark, 500) || ''
    };
    for (const [column, value] of Object.entries(legacyValues)) {
      if (existingColumns.has(column)) {
        columns.push(column);
        values.push(value);
      }
    }
    const columnSql = columns.map(column => `\`${column}\``).join(', ');
    const placeholderSql = columns.map(() => '?').join(', ');
    const [result] = await pool.query(`INSERT INTO suppliers (${columnSql}) VALUES (${placeholderSql})`, values);
    res.status(201).json({ success: true, msg: '供应商已创建', data: { id: String(result.insertId) } });
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') throw new ApiError(409, '供应商编码已存在');
    throw error;
  }
}));

router.get('/procurement-orders', asyncHandler(async (req, res) => {
  const page = positiveInt(req.query.page, 1, 100000);
  const pageSize = positiveInt(req.query.pageSize, 30, 200);
  const status = String(req.query.status || '').trim();
  const where = status ? 'WHERE ro.status = ?' : '';
  const params = status ? [status] : [];
  const [[[countRow]], [rows]] = await Promise.all([
    pool.query(`SELECT COUNT(*) AS total FROM replenishment_orders ro ${where}`, params),
    pool.query(
      `SELECT ro.id, ro.order_no AS orderNo, ro.status, ro.expected_date AS expectedDate, ro.notes,
              ro.created_by_name AS createdByName, ro.created_at AS createdAt, ro.updated_at AS updatedAt,
              s.supplier_name AS supplierName, COUNT(roi.id) AS itemCount,
              SUM(CASE WHEN roi.received_quantity >= roi.ordered_quantity THEN 1 ELSE 0 END) AS receivedItemCount,
              COALESCE(ROUND(AVG(CASE WHEN roi.ordered_quantity > 0 THEN LEAST(roi.received_quantity / roi.ordered_quantity, 1) ELSE 1 END) * 100, 0), 0) AS receiptProgress,
              COALESCE(SUM(roi.ordered_quantity), 0) AS orderedQuantity,
              COALESCE(SUM(roi.received_quantity), 0) AS receivedQuantity,
              COALESCE(SUM(roi.ordered_quantity * COALESCE(roi.unit_price, 0)), 0) AS estimatedAmount
       FROM replenishment_orders ro
       LEFT JOIN suppliers s ON s.id = ro.supplier_id
       LEFT JOIN replenishment_order_items roi ON roi.order_id = ro.id
       ${where}
       GROUP BY ro.id, ro.order_no, ro.status, ro.expected_date, ro.notes, ro.created_by_name,
                ro.created_at, ro.updated_at, s.supplier_name
       ORDER BY ro.created_at DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize]
    )
  ]);
  res.json({ success: true, data: rows.map(row => ({ ...row, id: String(row.id) })), total: Number(countRow.total) || 0, page, pageSize });
}));

router.get('/procurement-orders/:id', asyncHandler(async (req, res) => {
  const orderId = parseInventoryId(req.params.id);
  const [[orders], [items]] = await Promise.all([
    pool.query(
      `SELECT ro.*, s.supplier_name AS supplierName FROM replenishment_orders ro LEFT JOIN suppliers s ON s.id=ro.supplier_id WHERE ro.id=? LIMIT 1`, [orderId]
    ),
    pool.query(
      `SELECT roi.id, roi.inventory_id AS inventoryId, roi.requested_quantity AS requestedQuantity,
              roi.ordered_quantity AS orderedQuantity, roi.received_quantity AS receivedQuantity,
              roi.unit, roi.unit_price AS unitPrice, p.code AS materialCode, p.name AS materialDesc, p.spec
       FROM replenishment_order_items roi INNER JOIN inventory i ON i.id=roi.inventory_id
       INNER JOIN parts p ON p.id=i.part_id WHERE roi.order_id=? ORDER BY roi.id`, [orderId]
    )
  ]);
  if (!orders.length) throw new ApiError(404, '采购单不存在');
  res.json({ success: true, data: { ...orders[0], id: String(orders[0].id), items: items.map(row => ({ ...row, id: String(row.id), inventoryId: String(row.inventoryId) })) } });
}));

router.post('/procurement-orders', requireRole('admin'), asyncHandler(async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!items.length || items.length > 200) throw new ApiError(400, '请选择1至200条补货记录');
  const normalized = items.map(item => ({
    inventoryId: parseInventoryId(item.inventoryId),
    quantity: optionalNumber(item.quantity, '订购数量', { min: 0.0001 }),
    unit: optionalText(item.unit, 30),
    unitPrice: optionalNumber(item.unitPrice, '单价')
  }));
  const uniqueIds = new Set(normalized.map(item => item.inventoryId));
  if (uniqueIds.size !== normalized.length) throw new ApiError(400, '采购明细不能包含重复备件');
  const orderNo = makeNo('CG');
  const supplierId = optionalNumber(req.body?.supplierId, '供应商', { min: 1 });
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    if (supplierId) {
      const [supplierRows] = await connection.query('SELECT id FROM suppliers WHERE id=? AND enabled=1 LIMIT 1', [supplierId]);
      if (!supplierRows.length) throw new ApiError(400, '供应商不存在或已停用');
    }
    const ids = normalized.map(item => item.inventoryId).sort((a, b) => a - b);
    const [inventoryRows] = await connection.query(
      `SELECT id FROM inventory WHERE id IN (${ids.map(() => '?').join(',')}) AND COALESCE(active,1)=1 FOR UPDATE`, ids
    );
    if (inventoryRows.length !== ids.length) throw new ApiError(404, '部分库存记录不存在或已停用');
    const [orderResult] = await connection.query(
      `INSERT INTO replenishment_orders (order_no, supplier_id, status, expected_date, notes, created_by, created_by_name)
       VALUES (?, ?, 'purchasing', ?, ?, ?, ?)`,
      [orderNo, supplierId, optionalDate(req.body?.expectedDate, '预计到货日'), optionalText(req.body?.notes), req.user.id, req.user.displayName]
    );
    for (const item of normalized) {
      await connection.query(
        `INSERT INTO replenishment_order_items (order_id, inventory_id, requested_quantity, ordered_quantity, unit, unit_price)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [orderResult.insertId, item.inventoryId, item.quantity, item.quantity, item.unit, item.unitPrice]
      );
      await connection.query('UPDATE inventory SET in_transit = COALESCE(in_transit,0) + ? WHERE id = ?', [item.quantity, item.inventoryId]);
    }
    await connection.commit();
    res.status(201).json({ success: true, msg: '采购补货单已创建，在途库存已更新', data: { id: String(orderResult.insertId), orderNo } });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
}));

router.post('/procurement-orders/:id/receive', requireRole('admin'), asyncHandler(async (req, res) => {
  const orderId = parseInventoryId(req.params.id);
  const entries = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!entries.length) throw new ApiError(400, '请填写本次到货数量');
  const quantities = new Map(entries.map(item => [parseInventoryId(item.itemId), optionalNumber(item.quantity, '到货数量', { min: 0.0001 })]));
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [orders] = await connection.query('SELECT order_no, status FROM replenishment_orders WHERE id=? FOR UPDATE', [orderId]);
    if (!orders.length) throw new ApiError(404, '采购单不存在');
    if (!['purchasing', 'partial_received'].includes(orders[0].status)) throw new ApiError(409, '当前采购单不能收货');
    const [items] = await connection.query('SELECT * FROM replenishment_order_items WHERE order_id=? ORDER BY inventory_id FOR UPDATE', [orderId]);
    let receivedAny = false;
    for (const item of items) {
      if (!quantities.has(Number(item.id))) continue;
      const quantity = quantities.get(Number(item.id));
      const remaining = Number(item.ordered_quantity) - Number(item.received_quantity);
      if (quantity > remaining) throw new ApiError(400, '到货数量不能超过未收数量');
      const [[inventory]] = await connection.query(
        `SELECT i.quantity, i.in_transit
         FROM inventory i
         INNER JOIN parts p ON p.id = i.part_id
         WHERE i.id=? AND COALESCE(i.active,1)=1 AND COALESCE(p.active,1)=1
         FOR UPDATE`,
        [item.inventory_id]
      );
      if (!inventory) throw new ApiError(409, '采购明细对应库存已停用，不能收货；请先处理该采购单');
      const before = Number(inventory.quantity) || 0;
      const after = before + quantity;
      await connection.query('UPDATE inventory SET quantity=?, in_transit=GREATEST(COALESCE(in_transit,0)-?,0) WHERE id=?', [after, quantity, item.inventory_id]);
      await connection.query('UPDATE replenishment_order_items SET received_quantity=received_quantity+? WHERE id=?', [quantity, item.id]);
      await connection.query(
        `INSERT INTO stock_movements
         (inventory_id, movement_type, quantity, before_quantity, after_quantity, reason, reason_code,
          batch_no, operator_user_id, operator_name, related_order_no)
         VALUES (?, 'in', ?, ?, ?, '采购到货', 'procurement_receipt', ?, ?, ?, ?)`,
        [item.inventory_id, quantity, before, after, optionalText(req.body?.batchNo, 100), req.user.id, req.user.displayName, orders[0].order_no]
      );
      receivedAny = true;
    }
    if (!receivedAny) throw new ApiError(400, '没有可收货的明细');
    const [[remainingRow]] = await connection.query(
      'SELECT SUM(GREATEST(ordered_quantity-received_quantity,0)) AS remaining FROM replenishment_order_items WHERE order_id=?', [orderId]
    );
    const completed = Number(remainingRow.remaining) <= 0;
    await connection.query(
      `UPDATE replenishment_orders SET status=?, completed_at=${completed ? 'NOW()' : 'NULL'} WHERE id=?`,
      [completed ? 'completed' : 'partial_received', orderId]
    );
    await connection.commit();
    res.json({ success: true, msg: completed ? '采购单已全部收货' : '本次收货已登记', data: { status: completed ? 'completed' : 'partial_received' } });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
}));

router.patch('/procurement-orders/:id/status', requireRole('admin'), asyncHandler(async (req, res) => {
  const orderId = parseInventoryId(req.params.id);
  if (req.body?.status !== 'cancelled') throw new ApiError(400, '仅支持取消未完成采购单');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [orders] = await connection.query('SELECT status FROM replenishment_orders WHERE id=? FOR UPDATE', [orderId]);
    if (!orders.length) throw new ApiError(404, '采购单不存在');
    if (!['purchasing', 'partial_received'].includes(orders[0].status)) throw new ApiError(409, '当前采购单不能取消');
    const [items] = await connection.query('SELECT inventory_id, ordered_quantity, received_quantity FROM replenishment_order_items WHERE order_id=? FOR UPDATE', [orderId]);
    for (const item of items) {
      const remaining = Math.max(Number(item.ordered_quantity) - Number(item.received_quantity), 0);
      if (remaining) await connection.query('UPDATE inventory SET in_transit=GREATEST(COALESCE(in_transit,0)-?,0) WHERE id=?', [remaining, item.inventory_id]);
    }
    await connection.query("UPDATE replenishment_orders SET status='cancelled' WHERE id=?", [orderId]);
    await connection.commit();
    res.json({ success: true, msg: '采购单已取消，未收数量已从在途中释放' });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
}));

router.get('/equipment', asyncHandler(async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT e.id, e.equipment_code AS equipmentCode, e.equipment_name AS equipmentName,
            e.workshop_group AS workshopGroup, e.location, e.status, e.notes,
            COUNT(DISTINCT ep.id) AS partCount,
            COUNT(DISTINCT CASE WHEN wo.status IN ('open','in_progress') THEN wo.id END) AS openWorkOrders
     FROM workshop_equipment e
     LEFT JOIN equipment_parts ep ON ep.equipment_id=e.id
     LEFT JOIN maintenance_work_orders wo ON wo.equipment_id=e.id
     GROUP BY e.id, e.equipment_code, e.equipment_name, e.workshop_group, e.location, e.status, e.notes
     ORDER BY e.workshop_group, e.equipment_name`
  );
  res.json({ success: true, data: rows.map(row => ({ ...row, id: String(row.id) })) });
}));

router.post('/equipment', requireRole('admin'), asyncHandler(async (req, res) => {
  const code = optionalText(req.body?.equipmentCode, 50);
  const name = optionalText(req.body?.equipmentName, 150);
  if (!code || !name) throw new ApiError(400, '设备编码和名称不能为空');
  try {
    const [result] = await pool.query(
      `INSERT INTO workshop_equipment (equipment_code, equipment_name, workshop_group, location, notes) VALUES (?, ?, ?, ?, ?)`,
      [code, name, optionalText(req.body?.workshopGroup, 100), optionalText(req.body?.location, 200), optionalText(req.body?.notes)]
    );
    res.status(201).json({ success: true, msg: '设备已创建', data: { id: String(result.insertId) } });
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') throw new ApiError(409, '设备编码已存在');
    throw error;
  }
}));

router.get('/equipment/:id', asyncHandler(async (req, res) => {
  const equipmentId = parseInventoryId(req.params.id);
  const [[equipmentRows], [parts], [orders]] = await Promise.all([
    pool.query(`SELECT id, equipment_code AS equipmentCode, equipment_name AS equipmentName, workshop_group AS workshopGroup, location, status, notes FROM workshop_equipment WHERE id=?`, [equipmentId]),
    pool.query(
      `SELECT ep.id, ep.quantity_per_equipment AS quantityPerEquipment, ep.notes,
              p.id AS partId, p.code AS materialCode, p.name AS materialDesc, p.spec, p.unit,
              COALESCE(SUM(i.quantity),0) AS totalStock
       FROM equipment_parts ep INNER JOIN parts p ON p.id=ep.part_id
       LEFT JOIN inventory i ON i.part_id=p.id AND COALESCE(i.active,1)=1
       WHERE ep.equipment_id=? GROUP BY ep.id, ep.quantity_per_equipment, ep.notes, p.id, p.code, p.name, p.spec, p.unit`, [equipmentId]
    ),
    pool.query(`SELECT id, order_no AS orderNo, title, status, notes, opened_at AS openedAt, completed_at AS completedAt FROM maintenance_work_orders WHERE equipment_id=? ORDER BY opened_at DESC`, [equipmentId])
  ]);
  if (!equipmentRows.length) throw new ApiError(404, '设备不存在');
  res.json({ success: true, data: { ...equipmentRows[0], id: String(equipmentRows[0].id), parts, workOrders: orders } });
}));

router.post('/equipment/:id/parts', requireRole('admin'), asyncHandler(async (req, res) => {
  const equipmentId = parseInventoryId(req.params.id);
  const inventoryId = parseInventoryId(req.body?.inventoryId);
  const [[equipment], [inventoryRows]] = await Promise.all([
    pool.query('SELECT id FROM workshop_equipment WHERE id=? LIMIT 1', [equipmentId]),
    pool.query('SELECT part_id FROM inventory WHERE id=? LIMIT 1', [inventoryId])
  ]);
  if (!equipment.length) throw new ApiError(404, '设备不存在');
  const inventory = inventoryRows[0];
  if (!inventory) throw new ApiError(404, '库存记录不存在');
  try {
    await pool.query(
      `INSERT INTO equipment_parts (equipment_id, part_id, quantity_per_equipment, notes) VALUES (?, ?, ?, ?)`,
      [equipmentId, inventory.part_id, optionalNumber(req.body?.quantityPerEquipment, '单台用量'), optionalText(req.body?.notes, 300)]
    );
    res.status(201).json({ success: true, msg: '设备与备件关系已建立' });
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') throw new ApiError(409, '该设备已关联此备件');
    throw error;
  }
}));

router.post('/equipment/:id/work-orders', requireRole('admin'), asyncHandler(async (req, res) => {
  const equipmentId = parseInventoryId(req.params.id);
  const title = optionalText(req.body?.title, 200);
  if (!title) throw new ApiError(400, '工单标题不能为空');
  const [equipmentRows] = await pool.query('SELECT id FROM workshop_equipment WHERE id=? LIMIT 1', [equipmentId]);
  if (!equipmentRows.length) throw new ApiError(404, '设备不存在');
  const orderNo = makeNo('WX');
  const [result] = await pool.query(
    `INSERT INTO maintenance_work_orders (order_no, equipment_id, title, status, notes, created_by, created_by_name)
     VALUES (?, ?, ?, 'open', ?, ?, ?)`,
    [orderNo, equipmentId, title, optionalText(req.body?.notes), req.user.id, req.user.displayName]
  );
  res.status(201).json({ success: true, msg: '维修工单已创建', data: { id: String(result.insertId), orderNo } });
}));

router.patch('/work-orders/:id/status', requireRole('admin'), asyncHandler(async (req, res) => {
  const workOrderId = parseInventoryId(req.params.id);
  const status = String(req.body?.status || '');
  if (!['open', 'in_progress', 'completed'].includes(status)) throw new ApiError(400, '工单状态无效');
  const [result] = await pool.query(
    `UPDATE maintenance_work_orders SET status=?, completed_at=${status === 'completed' ? 'NOW()' : 'NULL'} WHERE id=?`,
    [status, workOrderId]
  );
  if (!result.affectedRows) throw new ApiError(404, '维修工单不存在');
  res.json({ success: true, msg: status === 'completed' ? '维修工单已完成' : '工单状态已更新' });
}));

router.post('/stock-movements/batch', requireRole('admin'), asyncHandler(async (req, res) => {
  const type = req.body?.type;
  const metadata = parseMovementMetadata(type, req.body || {});
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!items.length || items.length > 100) throw new ApiError(400, '请选择1至100条库存记录');
  const normalized = items.map(item => ({ inventoryId: parseInventoryId(item.inventoryId), quantity: optionalNumber(item.quantity, '数量', { min: 0.0001 }) }));
  if (new Set(normalized.map(item => item.inventoryId)).size !== normalized.length) throw new ApiError(400, '批量操作不能包含重复备件');
  const batchNo = metadata.batchNo || makeNo('PL');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await assertMovementAssociations(connection, metadata);
    const ids = normalized.map(item => item.inventoryId).sort((a, b) => a - b);
    const [rows] = await connection.query(
      `SELECT i.id, i.quantity
       FROM inventory i
       INNER JOIN parts p ON p.id = i.part_id
       WHERE i.id IN (${ids.map(() => '?').join(',')})
         AND COALESCE(i.active,1)=1 AND COALESCE(p.active,1)=1
       FOR UPDATE`,
      ids
    );
    if (rows.length !== ids.length) throw new ApiError(404, '部分库存记录不存在或已停用');
    const pendingOrder = await findPendingInventoryOrder(connection, ids);
    if (pendingOrder) throw new ApiError(409, `批量范围中有备件正在盘点单${pendingOrder.inventoryNo || pendingOrder.id}中等待审批`);
    const stocks = new Map(rows.map(row => [Number(row.id), Number(row.quantity) || 0]));
    for (const item of normalized) {
      const before = stocks.get(item.inventoryId);
      const after = type === 'in' ? before + item.quantity : before - item.quantity;
      if (after < 0) throw new ApiError(400, `库存记录${item.inventoryId}库存不足`);
      await connection.query('UPDATE inventory SET quantity=? WHERE id=?', [after, item.inventoryId]);
      await connection.query(
        `INSERT INTO stock_movements
         (inventory_id, movement_type, quantity, before_quantity, after_quantity, reason, reason_code,
          department, recipient, equipment_id, maintenance_order_id, batch_no, operator_user_id, operator_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [item.inventoryId, type, item.quantity, before, after, metadata.reason, metadata.reasonCode,
          metadata.department, metadata.recipient, metadata.equipmentId, metadata.maintenanceOrderId,
          batchNo, req.user.id, req.user.displayName]
      );
    }
    await connection.commit();
    res.json({ success: true, msg: `已完成${normalized.length}条批量${type === 'in' ? '入库' : '出库'}`, data: { batchNo } });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
}));

module.exports = router;
