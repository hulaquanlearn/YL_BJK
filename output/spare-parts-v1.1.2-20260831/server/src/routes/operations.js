const express = require('express');
const path = require('path');
const multer = require('multer');
const readXlsxFile = require('read-excel-file/node');
const { pool } = require('../db');
const { ApiError, asyncHandler, positiveInt, toPart } = require('../utils');
const { normalizeWorkshopCode, assertWorkshopWrite, requireAnyWorkshopEditor } = require('../workshop-scope');
const { parseInventoryId, findPendingInventoryOrder } = require('../inventory-guards');
const { summarizeDataQuality, ISSUE_DEFINITIONS } = require('../data-quality');
const { parseMovementMetadata, movementReasonOptions, assertMovementAssociations } = require('../movement-metadata');
const { makeEquipmentTemplate, sendXlsx } = require('../import-workbook');

const router = express.Router();

const equipmentImportUpload = multer({
  storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    const ok = path.extname(file.originalname).toLowerCase() === '.xlsx';
    callback(ok ? null : new Error('仅支持 .xlsx 文件'), ok);
  }
}).single('file');

function cellText(value) { return String(value ?? '').trim().replace(/\.0$/, ''); }

async function parseEquipmentWorkbook(buffer, kind) {
  const rows = await readXlsxFile(buffer);
  const required = kind === 'relations' ? ['设备编码', '物料编码'] : ['设备编码', '设备名称'];
  const headerIndex = rows.slice(0, 20).findIndex(row => required.every(name => row.map(cellText).includes(name)));
  if (headerIndex < 0) return { records: [], errors: [{ row: 1, field: '表头', reason: `缺少${required.join('、')}列`, suggestion: '下载对应模板后重新填写' }] };
  const headers = rows[headerIndex].map(cellText);
  const records = [];
  const errors = [];
  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    const source = rows[index];
    const row = Object.fromEntries(headers.map((header, column) => [header, source[column] ?? '']));
    const equipmentCode = cellText(row['设备编码']);
    const second = cellText(row[kind === 'relations' ? '物料编码' : '设备名称']);
    if (!equipmentCode && !second) continue;
    if (!equipmentCode) errors.push({ row: index + 1, field: '设备编码', reason: '关键字段为空', suggestion: '填写所属车间内唯一设备编码' });
    if (!second) errors.push({ row: index + 1, field: kind === 'relations' ? '物料编码' : '设备名称', reason: '关键字段为空', suggestion: '补充关键字段' });
    const quantity = row['单台用量'] === '' ? null : Number(row['单台用量']);
    if (kind === 'relations' && row['单台用量'] !== '' && (!Number.isFinite(quantity) || quantity < 0)) {
      errors.push({ row: index + 1, field: '单台用量', reason: '不是大于或等于0的数字', suggestion: '填写有效数字或留空' });
    }
    if (equipmentCode && second) records.push(kind === 'relations'
      ? { sourceRow: index + 1, equipmentCode, materialCode: second, quantityPerEquipment: quantity, notes: cellText(row['备注']) || null }
      : { sourceRow: index + 1, equipmentCode, equipmentName: second, workshopGroup: cellText(row['所属工段']) || null, location: cellText(row['设备位置']) || null, notes: cellText(row['备注']) || null });
  }
  if (!records.length && !errors.length) errors.push({ row: headerIndex + 2, field: '数据', reason: '没有有效数据行', suggestion: '至少填写一行记录' });
  if (records.length > 5000) errors.push({ row: '-', field: '文件', reason: '超过单次5000行上限', suggestion: '拆分为多个文件' });
  return { records, errors };
}

const QUALITY_SELECT = `SELECT i.id, p.id AS partId, p.code AS materialCode, p.name AS materialDesc,
  p.spec, COALESCE(NULLIF(TRIM(i.unit_override), ''), NULLIF(TRIM(p.unit), ''), '未标单位') AS unit,
  COALESCE(i.safety_stock_override, p.safety_stock) AS reorderPoint,
  COALESCE(i.max_stock_override, p.max_stock) AS maxStock,
  COALESCE(i.price_override, p.price) AS price,
  i.quantity AS totalStock, i.warehouse AS warehouseArea,
  i.workshop_code AS workshopCode,
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

router.get('/movement-reasons', (_req, res) => {
  res.json({ success: true, data: movementReasonOptions() });
});

router.get('/data-quality', asyncHandler(async (req, res) => {
  const page = positiveInt(req.query.page, 1, 100000);
  const pageSize = positiveInt(req.query.pageSize, 30, 200);
  const workshopCode = normalizeWorkshopCode(req.query.workshopCode, '');
  const [rows] = await pool.query(`${QUALITY_SELECT}${workshopCode ? ' AND i.workshop_code = ?' : ''}`, workshopCode ? [workshopCode] : []);
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

router.patch('/parts/:id/config', requireAnyWorkshopEditor, asyncHandler(async (req, res) => {
  const inventoryId = parseInventoryId(req.params.id);
  const data = req.body || {};
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query('SELECT part_id, workshop_code AS workshopCode FROM inventory WHERE id = ? FOR UPDATE', [inventoryId]);
    if (!rows.length) throw new ApiError(404, '库存记录不存在');
    assertWorkshopWrite(req.user, rows[0].workshopCode);
    const reorderPoint = optionalNumber(data.reorderPoint, '订购点');
    const maxStock = optionalNumber(data.maxStock, '最高储备');
    if (reorderPoint !== null && maxStock !== null && maxStock < reorderPoint) throw new ApiError(400, '最高储备不能低于订购点');
    await connection.query(
      `UPDATE inventory
       SET unit_override = ?, safety_stock_override = ?, max_stock_override = ?, price_override = ?,
           location_type = ?, location_note = ?, location = ?, shelf = ?, direction = ?, layer = ?, slot = ?
       WHERE id = ?`,
      [optionalText(data.unit, 30), reorderPoint, maxStock, optionalNumber(data.price, '单价'),
        data.locationType === 'free_text' ? 'free_text' : 'shelf', optionalText(data.locationNote, 300), optionalText(data.locationCode, 100),
        optionalNumber(data.shelf, '货架号', { min: 1, max: 99 }), optionalNumber(data.position, '方位', { min: 1, max: 2 }), optionalNumber(data.layer, '层数', { min: 1, max: 4 }), optionalNumber(data.location, '货位', { min: 1, max: 99 }), inventoryId]
    );
    await connection.commit();
    res.json({ success: true, msg: '质量问题配置已保存' });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
}));

// 采购与供应商模块已按业务要求下线。保留明确的 410 响应，避免旧书签或旧前端
// 在数据库表清理后退化成不明确的 500 错误。
router.use(['/suppliers', '/suppliers/*', '/procurement-orders', '/procurement-orders/*'], (_req, res) => {
  res.status(410).json({ success: false, msg: '采购与供应商功能已停用' });
});

// 采购与供应商模块已按业务要求下线。旧地址由上方 410 兼容拦截统一处理。
router.get('/equipment/import-template', requireAnyWorkshopEditor, asyncHandler(async (req, res) => {
  const kind = req.query.kind === 'relations' ? 'relations' : 'equipment';
  const buffer = await makeEquipmentTemplate(kind);
  sendXlsx(res, kind === 'relations' ? '设备备件关系导入模板.xlsx' : '设备台账导入模板.xlsx', buffer);
}));

router.post('/equipment/import-preview', requireAnyWorkshopEditor, equipmentImportUpload, asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, '请选择要校验的 .xlsx 文件');
  const workshopCode = normalizeWorkshopCode(req.body?.workshopCode, 'raw_grain');
  const kind = req.body?.kind === 'relations' ? 'relations' : 'equipment';
  assertWorkshopWrite(req.user, workshopCode);
  const { records, errors } = await parseEquipmentWorkbook(req.file.buffer, kind);
  if (kind === 'relations' && records.length) {
    const equipmentCodes = [...new Set(records.map(item => item.equipmentCode))];
    const materialCodes = [...new Set(records.map(item => item.materialCode))];
    const [[equipmentRows], [partRows]] = await Promise.all([
      pool.query(`SELECT equipment_code AS code FROM workshop_equipment WHERE workshop_code=? AND equipment_code IN (${equipmentCodes.map(() => '?').join(',')})`, [workshopCode, ...equipmentCodes]),
      pool.query(`SELECT DISTINCT p.code FROM parts p INNER JOIN inventory i ON i.part_id=p.id WHERE COALESCE(i.workshop_code,'raw_grain')=? AND p.code IN (${materialCodes.map(() => '?').join(',')})`, [workshopCode, ...materialCodes])
    ]);
    const knownEquipment = new Set(equipmentRows.map(row => row.code));
    const knownParts = new Set(partRows.map(row => row.code));
    records.forEach(item => {
      if (!knownEquipment.has(item.equipmentCode)) errors.push({ row: item.sourceRow, field: '设备编码', reason: `所选车间不存在设备“${item.equipmentCode}”`, suggestion: '先导入设备台账或修正编码' });
      if (!knownParts.has(item.materialCode)) errors.push({ row: item.sourceRow, field: '物料编码', reason: `所选车间不存在备件“${item.materialCode}”`, suggestion: '先导入备件台账或修正编码' });
    });
  }
  res.json({ success: errors.length === 0, msg: errors.length ? `发现 ${errors.length} 个问题，尚未写入数据` : `校验通过，共 ${records.length} 条`, data: { kind, workshopCode, total: records.length, errorCount: errors.length, errors, sample: records.slice(0, 8) } });
}));

router.post('/equipment/import', requireAnyWorkshopEditor, equipmentImportUpload, asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, '请选择要导入的 .xlsx 文件');
  const workshopCode = normalizeWorkshopCode(req.body?.workshopCode, 'raw_grain');
  const kind = req.body?.kind === 'relations' ? 'relations' : 'equipment';
  assertWorkshopWrite(req.user, workshopCode);
  const { records, errors } = await parseEquipmentWorkbook(req.file.buffer, kind);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    if (kind === 'equipment') {
      if (errors.length) throw new ApiError(422, `导入校验失败，共 ${errors.length} 个问题；未写入任何数据`, { errors });
      for (const item of records) {
        await connection.query(
          `INSERT INTO workshop_equipment (workshop_code,equipment_code,equipment_name,workshop_group,location,notes)
           VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE equipment_name=VALUES(equipment_name),workshop_group=VALUES(workshop_group),location=VALUES(location),notes=VALUES(notes)`,
          [workshopCode, item.equipmentCode, item.equipmentName, item.workshopGroup, item.location, item.notes]
        );
      }
    } else {
      for (const item of records) {
        const [[equipment], [partRows]] = await Promise.all([
          connection.query('SELECT id FROM workshop_equipment WHERE workshop_code=? AND equipment_code=? LIMIT 1', [workshopCode, item.equipmentCode]),
          connection.query("SELECT p.id FROM parts p INNER JOIN inventory i ON i.part_id=p.id WHERE COALESCE(i.workshop_code,'raw_grain')=? AND p.code=? AND COALESCE(i.active,1)=1 LIMIT 1", [workshopCode, item.materialCode])
        ]);
        if (!equipment.length) errors.push({ row: item.sourceRow, field: '设备编码', reason: `所选车间不存在设备“${item.equipmentCode}”`, suggestion: '先导入设备台账' });
        if (!partRows.length) errors.push({ row: item.sourceRow, field: '物料编码', reason: `所选车间不存在备件“${item.materialCode}”`, suggestion: '先导入备件台账' });
        if (equipment.length && partRows.length) item.resolved = { equipmentId: equipment[0].id, partId: partRows[0].id };
      }
      if (errors.length) throw new ApiError(422, `导入校验失败，共 ${errors.length} 个问题；未写入任何数据`, { errors });
      for (const item of records) {
        await connection.query(
          `INSERT INTO equipment_parts (equipment_id,part_id,quantity_per_equipment,notes) VALUES (?,?,?,?)
           ON DUPLICATE KEY UPDATE quantity_per_equipment=VALUES(quantity_per_equipment),notes=VALUES(notes)`,
          [item.resolved.equipmentId, item.resolved.partId, item.quantityPerEquipment, item.notes]
        );
      }
    }
    await connection.commit();
    res.json({ success: true, msg: `已导入 ${records.length} 条${kind === 'relations' ? '设备备件关系' : '设备记录'}`, data: { kind, total: records.length, workshopCode } });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
}));

router.get('/equipment', asyncHandler(async (req, res) => {
  const workshopCode = req.query.workshopCode ? normalizeWorkshopCode(req.query.workshopCode) : '';
  const search = optionalText(req.query.searchKeyword, 100);
  const conditions = [];
  const params = [];
  if (workshopCode) { conditions.push("COALESCE(e.workshop_code, 'raw_grain')=?"); params.push(workshopCode); }
  if (search) {
    conditions.push('(e.equipment_code LIKE ? OR e.equipment_name LIKE ? OR e.workshop_group LIKE ? OR e.location LIKE ?)');
    const keyword = `%${search}%`;
    params.push(keyword, keyword, keyword, keyword);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const [rows] = await pool.query(
    `SELECT e.id, COALESCE(e.workshop_code, 'raw_grain') AS workshopCode,
            e.equipment_code AS equipmentCode, e.equipment_name AS equipmentName,
            e.workshop_group AS workshopGroup, e.location, e.status, e.notes,
            COUNT(DISTINCT ep.id) AS partCount,
            COUNT(DISTINCT CASE WHEN wo.status IN ('open','in_progress') THEN wo.id END) AS openWorkOrders
     FROM workshop_equipment e
     LEFT JOIN equipment_parts ep ON ep.equipment_id=e.id
     LEFT JOIN maintenance_work_orders wo ON wo.equipment_id=e.id
     ${where}
     GROUP BY e.id, e.workshop_code, e.equipment_code, e.equipment_name, e.workshop_group, e.location, e.status, e.notes
     ORDER BY e.workshop_code, e.workshop_group, e.equipment_name`,
    params
  );
  res.json({ success: true, data: rows.map(row => ({ ...row, id: String(row.id) })) });
}));

router.post('/equipment', requireAnyWorkshopEditor, asyncHandler(async (req, res) => {
  const workshopCode = normalizeWorkshopCode(req.body?.workshopCode, 'raw_grain');
  assertWorkshopWrite(req.user, workshopCode);
  const code = optionalText(req.body?.equipmentCode, 50);
  const name = optionalText(req.body?.equipmentName, 150);
  if (!code || !name) throw new ApiError(400, '设备编码和名称不能为空');
  try {
    const [result] = await pool.query(
      `INSERT INTO workshop_equipment (workshop_code, equipment_code, equipment_name, workshop_group, location, notes) VALUES (?, ?, ?, ?, ?, ?)`,
      [workshopCode, code, name, optionalText(req.body?.workshopGroup, 100), optionalText(req.body?.location, 200), optionalText(req.body?.notes)]
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
    pool.query(`SELECT id, COALESCE(workshop_code, 'raw_grain') AS workshopCode, equipment_code AS equipmentCode, equipment_name AS equipmentName, workshop_group AS workshopGroup, location, status, notes FROM workshop_equipment WHERE id=?`, [equipmentId]),
    pool.query(
      `SELECT ep.id, ep.quantity_per_equipment AS quantityPerEquipment, ep.notes,
              p.id AS partId, p.code AS materialCode, p.name AS materialDesc, p.spec, p.unit,
              COALESCE(SUM(i.quantity),0) AS totalStock
       FROM equipment_parts ep INNER JOIN parts p ON p.id=ep.part_id
       INNER JOIN workshop_equipment scope_equipment ON scope_equipment.id=ep.equipment_id
       LEFT JOIN inventory i ON i.part_id=p.id AND COALESCE(i.active,1)=1
         AND COALESCE(i.workshop_code,'raw_grain')=COALESCE(scope_equipment.workshop_code,'raw_grain')
       WHERE ep.equipment_id=? GROUP BY ep.id, ep.quantity_per_equipment, ep.notes, p.id, p.code, p.name, p.spec, p.unit`, [equipmentId]
    ),
    pool.query(`SELECT id, order_no AS orderNo, title, status, notes, opened_at AS openedAt, completed_at AS completedAt FROM maintenance_work_orders WHERE equipment_id=? ORDER BY opened_at DESC`, [equipmentId])
  ]);
  if (!equipmentRows.length) throw new ApiError(404, '设备不存在');
  res.json({ success: true, data: { ...equipmentRows[0], id: String(equipmentRows[0].id), parts, workOrders: orders } });
}));

router.post('/equipment/:id/parts', requireAnyWorkshopEditor, asyncHandler(async (req, res) => {
  const equipmentId = parseInventoryId(req.params.id);
  const inventoryId = parseInventoryId(req.body?.inventoryId);
  const [[equipment], [inventoryRows]] = await Promise.all([
    pool.query("SELECT id, COALESCE(workshop_code, 'raw_grain') AS workshopCode FROM workshop_equipment WHERE id=? LIMIT 1", [equipmentId]),
    pool.query("SELECT part_id, COALESCE(workshop_code, 'raw_grain') AS workshopCode FROM inventory WHERE id=? LIMIT 1", [inventoryId])
  ]);
  if (!equipment.length) throw new ApiError(404, '设备不存在');
  const inventory = inventoryRows[0];
  if (!inventory) throw new ApiError(404, '库存记录不存在');
  assertWorkshopWrite(req.user, equipment[0].workshopCode);
  if (equipment[0].workshopCode !== inventory.workshopCode) throw new ApiError(400, '设备只能关联同一车间的备件');
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

router.post('/equipment/:id/work-orders', requireAnyWorkshopEditor, asyncHandler(async (req, res) => {
  const equipmentId = parseInventoryId(req.params.id);
  const title = optionalText(req.body?.title, 200);
  if (!title) throw new ApiError(400, '工单标题不能为空');
  const [equipmentRows] = await pool.query("SELECT id, COALESCE(workshop_code, 'raw_grain') AS workshopCode FROM workshop_equipment WHERE id=? LIMIT 1", [equipmentId]);
  if (!equipmentRows.length) throw new ApiError(404, '设备不存在');
  assertWorkshopWrite(req.user, equipmentRows[0].workshopCode);
  const orderNo = makeNo('WX');
  const [result] = await pool.query(
    `INSERT INTO maintenance_work_orders (order_no, equipment_id, title, status, notes, created_by, created_by_name)
     VALUES (?, ?, ?, 'open', ?, ?, ?)`,
    [orderNo, equipmentId, title, optionalText(req.body?.notes), req.user.id, req.user.displayName]
  );
  res.status(201).json({ success: true, msg: '维修工单已创建', data: { id: String(result.insertId), orderNo } });
}));

router.patch('/work-orders/:id/status', requireAnyWorkshopEditor, asyncHandler(async (req, res) => {
  const workOrderId = parseInventoryId(req.params.id);
  const status = String(req.body?.status || '');
  if (!['open', 'in_progress', 'completed'].includes(status)) throw new ApiError(400, '工单状态无效');
  const [[order]] = await pool.query(
    `SELECT COALESCE(e.workshop_code, 'raw_grain') AS workshopCode
     FROM maintenance_work_orders wo INNER JOIN workshop_equipment e ON e.id=wo.equipment_id
     WHERE wo.id=? LIMIT 1`,
    [workOrderId]
  );
  if (!order) throw new ApiError(404, '维修工单不存在');
  assertWorkshopWrite(req.user, order.workshopCode);
  const [result] = await pool.query(
    `UPDATE maintenance_work_orders SET status=?, completed_at=${status === 'completed' ? 'NOW()' : 'NULL'} WHERE id=?`,
    [status, workOrderId]
  );
  if (!result.affectedRows) throw new ApiError(404, '维修工单不存在');
  res.json({ success: true, msg: status === 'completed' ? '维修工单已完成' : '工单状态已更新' });
}));

router.post('/stock-movements/batch', requireAnyWorkshopEditor, asyncHandler(async (req, res) => {
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
      `SELECT i.id, i.quantity, i.workshop_code AS workshopCode
       FROM inventory i
       INNER JOIN parts p ON p.id = i.part_id
       WHERE i.id IN (${ids.map(() => '?').join(',')})
         AND COALESCE(i.active,1)=1 AND COALESCE(p.active,1)=1
       FOR UPDATE`,
      ids
    );
    if (rows.length !== ids.length) throw new ApiError(404, '部分库存记录不存在或已停用');
    rows.forEach(row => assertWorkshopWrite(req.user, row.workshopCode));
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
