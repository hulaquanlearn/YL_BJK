const express = require('express');
const crypto = require('crypto');
const path = require('path');
const multer = require('multer');
const readXlsxFile = require('read-excel-file/node');
const { pool } = require('../db');
const { ApiError, asyncHandler, positiveInt, toPart } = require('../utils');
const { normalizeWorkshopCode, assertWorkshopWrite, requireAnyWorkshopEditor } = require('../workshop-scope');
const { parseInventoryId, findPendingInventoryOrder } = require('../inventory-guards');
const { summarizeDataQuality, ISSUE_DEFINITIONS } = require('../data-quality');
const { parseMovementMetadata, movementReasonOptions, assertMovementAssociations } = require('../movement-metadata');
const { makeEquipmentTemplate, makePartsErrorWorkbook, sendXlsx } = require('../import-workbook');
const { warehouseJoin } = require('../warehouse-join');

const router = express.Router();

const equipmentImportUpload = multer({
  storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    const ok = path.extname(file.originalname).toLowerCase() === '.xlsx';
    callback(ok ? null : new Error('仅支持 .xlsx 文件'), ok);
  }
}).single('file');

function cellText(value) { return String(value ?? '').trim().replace(/\.0$/, ''); }

function equipmentModelCode(workshopCode, equipmentName) {
  const digest = crypto.createHash('sha256').update(`${workshopCode}\0${equipmentName}`).digest('hex').slice(0, 16).toUpperCase();
  return `MODEL-${digest}`;
}

async function parseEquipmentWorkbook(buffer) {
  const rows = await readXlsxFile(buffer);
  const required = ['设备型号'];
  const headerIndex = rows.slice(0, 20).findIndex(row => required.every(name => row.map(cellText).includes(name)));
  if (headerIndex < 0) return { records: [], errors: [{ row: 1, field: '表头', reason: `缺少${required.join('、')}列`, suggestion: '下载“设备型号与备件关系”模板后重新填写' }] };
  const headers = rows[headerIndex].map(cellText);
  const records = [];
  const errors = [];
  const seen = new Map();
  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    const source = rows[index];
    const row = Object.fromEntries(headers.map((header, column) => [header, source[column] ?? '']));
    const equipmentName = cellText(row['设备型号']);
    const materialCode = cellText(row['物料编码']);
    if (!equipmentName && !materialCode) continue;
    if (!equipmentName) errors.push({ row: index + 1, field: '设备型号', reason: '关键字段为空', suggestion: '填写需要建立备件关系的设备型号' });
    const rawQuantity = row['单台用量'];
    const hasQuantity = rawQuantity !== '' && rawQuantity !== null && rawQuantity !== undefined;
    const quantity = hasQuantity ? Number(rawQuantity) : null;
    if (hasQuantity && (!Number.isFinite(quantity) || quantity < 0)) {
      errors.push({ row: index + 1, field: '单台用量', reason: '不是大于或等于0的数字', suggestion: '填写有效数字或留空' });
    }
    if (equipmentName) {
      if (materialCode) {
        const duplicateKey = `${equipmentName.toLowerCase()}\0${materialCode.toLowerCase()}`;
        if (seen.has(duplicateKey)) {
          errors.push({ row: index + 1, field: '设备型号/物料编码', reason: `与第${seen.get(duplicateKey)}行重复`, suggestion: '同一型号与同一备件只保留一行' });
        } else seen.set(duplicateKey, index + 1);
      }
      records.push({
        sourceRow: index + 1,
        equipmentName,
        materialCode,
        workshopGroup: cellText(row['所属工段']) || null,
        quantityPerEquipment: quantity,
        notes: cellText(row['备注']) || null
      });
    }
  }
  if (!records.length && !errors.length) errors.push({ row: headerIndex + 2, field: '数据', reason: '没有有效数据行', suggestion: '至少填写一行记录' });
  if (records.length > 5000) errors.push({ row: '-', field: '文件', reason: '超过单次5000行上限', suggestion: '拆分为多个文件' });
  return { records, errors };
}

async function findEquipmentImportPartErrors(records, workshopCode) {
  const relationRecords = records.filter(item => item.materialCode);
  if (!relationRecords.length) return [];
  const materialCodes = [...new Set(relationRecords.map(item => item.materialCode))];
  const [partRows] = await pool.query(
    `SELECT DISTINCT p.code FROM parts p INNER JOIN inventory i ON i.part_id=p.id
     WHERE COALESCE(i.workshop_code,'raw_grain')=? AND COALESCE(i.active,1)=1 AND COALESCE(p.active,1)=1
       AND p.code IN (${materialCodes.map(() => '?').join(',')})`,
    [workshopCode, ...materialCodes]
  );
  const knownParts = new Set(partRows.map(row => row.code));
  return relationRecords.filter(item => !knownParts.has(item.materialCode)).map(item => ({
    row: item.sourceRow, field: '物料编码', reason: `所选车间不存在备件“${item.materialCode}”`,
    suggestion: '先导入备件台账或修正编码，也可以留空仅创建设备型号'
  }));
}

const QUALITY_SELECT = `SELECT i.id, p.id AS partId, p.code AS materialCode, p.name AS materialDesc,
  p.spec, COALESCE(NULLIF(TRIM(i.unit_override), ''), NULLIF(TRIM(p.unit), '')) AS unit,
  COALESCE(i.safety_stock_override, p.safety_stock) AS reorderPoint,
  COALESCE(i.max_stock_override, p.max_stock) AS maxStock,
  COALESCE(i.price_override, p.price) AS price,
  i.quantity AS totalStock, i.warehouse AS warehouseArea,
  COALESCE(i.workshop_code, w.workshop_code, 'raw_grain') AS workshopCode,
  COALESCE(w.name, i.warehouse) AS warehouseAreaName, i.location AS locationCode,
  i.location_type AS locationType, i.location_note AS locationNote,
  i.shelf, i.direction AS position, i.layer, i.slot AS location,
  i.last_inventory_date AS lastInventoryDate, COALESCE(dup.duplicateCount, 1) AS duplicateCount
  FROM inventory i
  INNER JOIN parts p ON p.id = i.part_id
  ${warehouseJoin()}
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

// Keep the six shared inventory filters before profiling, so KPI drill-downs
// and quality percentages use the same population as inventory/statistics.
function buildQualityScope(query) {
  const conditions = [];
  const params = [];
  const safetyStock = 'COALESCE(i.safety_stock_override, p.safety_stock)';
  if (query.workshopCode) {
    conditions.push("COALESCE(i.workshop_code, w.workshop_code, 'raw_grain') = ?");
    params.push(normalizeWorkshopCode(query.workshopCode));
  }
  if (query.warehouseAreaName) {
    conditions.push('(w.name = ? OR i.warehouse = ?)');
    params.push(query.warehouseAreaName, query.warehouseAreaName);
  }
  if (query.partType) {
    conditions.push("COALESCE(NULLIF(TRIM(p.part_type), ''), '未填写') = ?");
    params.push(String(query.partType).trim());
  }
  if (query.searchKeyword) {
    conditions.push(`(p.name LIKE ? OR p.code LIKE ? OR p.spec LIKE ? OR p.brand LIKE ?
      OR p.part_type LIKE ? OR p.usage_description LIKE ? OR i.location LIKE ? OR i.location_note LIKE ?
      OR i.warehouse LIKE ? OR w.name LIKE ? OR CAST(i.shelf AS CHAR) LIKE ? OR CAST(i.layer AS CHAR) LIKE ?
      OR CAST(i.direction AS CHAR) LIKE ? OR CAST(i.slot AS CHAR) LIKE ?)`);
    params.push(...Array(14).fill(`%${String(query.searchKeyword).trim()}%`));
  }
  if (query.lowStock === '1' || query.lowStock === 'true') {
    conditions.push(`${safetyStock} IS NOT NULL AND i.quantity <= ${safetyStock}`);
  }
  if (query.stockStatus === 'zero') conditions.push('i.quantity <= 0');
  else if (query.stockStatus === 'low') conditions.push(`i.quantity > 0 AND ${safetyStock} IS NOT NULL AND i.quantity <= ${safetyStock}`);
  else if (query.stockStatus === 'normal') conditions.push(`i.quantity > 0 AND ${safetyStock} IS NOT NULL AND i.quantity > ${safetyStock}`);
  else if (query.stockStatus === 'unconfigured') conditions.push(`i.quantity > 0 AND ${safetyStock} IS NULL`);
  return { sql: conditions.length ? ` AND ${conditions.join(' AND ')}` : '', params };
}

router.get('/data-quality', asyncHandler(async (req, res) => {
  const page = positiveInt(req.query.page, 1, 100000);
  const pageSize = positiveInt(req.query.pageSize, 30, 200);
  const scope = buildQualityScope(req.query);
  const [rows] = await pool.query(`${QUALITY_SELECT}${scope.sql}`, scope.params);
  const profile = summarizeDataQuality(rows);
  const issueType = Object.prototype.hasOwnProperty.call(ISSUE_DEFINITIONS, req.query.issueType)
    ? req.query.issueType : '';
  const filtered = profile.records.filter(row => !issueType || row.issues.includes(issueType));
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
  const buffer = await makeEquipmentTemplate();
  sendXlsx(res, '设备型号与备件关系导入模板.xlsx', buffer);
}));

router.post('/equipment/import-preview', requireAnyWorkshopEditor, equipmentImportUpload, asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, '请选择要校验的 .xlsx 文件');
  const workshopCode = normalizeWorkshopCode(req.body?.workshopCode, 'raw_grain');
  assertWorkshopWrite(req.user, workshopCode);
  const { records, errors } = await parseEquipmentWorkbook(req.file.buffer);
  const relationRecords = records.filter(item => item.materialCode);
  errors.push(...await findEquipmentImportPartErrors(records, workshopCode));
  const modelCount = new Set(records.map(item => item.equipmentName.toLowerCase())).size;
  res.json({ success: errors.length === 0, msg: errors.length ? `发现 ${errors.length} 个问题，尚未写入数据` : `校验通过：${modelCount} 个设备型号，${relationRecords.length} 条备件关系`, data: { workshopCode, total: records.length, modelCount, relationCount: relationRecords.length, errorCount: errors.length, errors, sample: records.slice(0, 8) } });
}));

router.post('/equipment/import-error-report', requireAnyWorkshopEditor, equipmentImportUpload, asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, '请选择要生成错误台账的 .xlsx 文件');
  const workshopCode = normalizeWorkshopCode(req.body?.workshopCode, 'raw_grain');
  assertWorkshopWrite(req.user, workshopCode);
  const { records, errors } = await parseEquipmentWorkbook(req.file.buffer);
  errors.push(...await findEquipmentImportPartErrors(records, workshopCode));
  if (!errors.length) throw new ApiError(400, '文件校验通过，不需要生成错误台账');
  const buffer = await makePartsErrorWorkbook(req.file.buffer, errors);
  sendXlsx(res, `设备型号与备件关系-错误修正台账-${Date.now()}.xlsx`, buffer);
}));

router.post('/equipment/import', requireAnyWorkshopEditor, equipmentImportUpload, asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, '请选择要导入的 .xlsx 文件');
  const workshopCode = normalizeWorkshopCode(req.body?.workshopCode, 'raw_grain');
  assertWorkshopWrite(req.user, workshopCode);
  const { records, errors } = await parseEquipmentWorkbook(req.file.buffer);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    for (const item of records.filter(record => record.materialCode)) {
      const [partRows] = await connection.query("SELECT p.id FROM parts p INNER JOIN inventory i ON i.part_id=p.id WHERE COALESCE(i.workshop_code,'raw_grain')=? AND p.code=? AND COALESCE(i.active,1)=1 AND COALESCE(p.active,1)=1 LIMIT 1 FOR UPDATE", [workshopCode, item.materialCode]);
      if (!partRows.length) errors.push({ row: item.sourceRow, field: '物料编码', reason: `所选车间不存在备件“${item.materialCode}”`, suggestion: '先导入备件台账或修正编码' });
      else item.partId = partRows[0].id;
    }
    if (errors.length) throw new ApiError(422, `导入校验失败，共 ${errors.length} 个问题；未写入任何数据`, { errors });
    for (const item of records) {
      const [existing] = await connection.query('SELECT id FROM workshop_equipment WHERE workshop_code=? AND equipment_name=? LIMIT 1', [workshopCode, item.equipmentName]);
      let equipmentId = existing[0]?.id;
      if (!equipmentId) {
        const [created] = await connection.query(
          `INSERT INTO workshop_equipment (workshop_code,equipment_code,equipment_name,workshop_group,location,notes)
           VALUES (?,?,?,?,NULL,?)`,
          [workshopCode, equipmentModelCode(workshopCode, item.equipmentName), item.equipmentName, item.workshopGroup, item.notes]
        );
        equipmentId = created.insertId;
      } else {
        await connection.query('UPDATE workshop_equipment SET workshop_group=COALESCE(?,workshop_group), notes=COALESCE(?,notes) WHERE id=?', [item.workshopGroup, item.notes, equipmentId]);
      }
      if (item.materialCode) {
        await connection.query(
          `INSERT INTO equipment_parts (equipment_id,part_id,quantity_per_equipment,notes) VALUES (?,?,?,?)
           ON DUPLICATE KEY UPDATE quantity_per_equipment=VALUES(quantity_per_equipment),notes=VALUES(notes)`,
          [equipmentId, item.partId, item.quantityPerEquipment, item.notes]
        );
      }
    }
    await connection.commit();
    const modelCount = new Set(records.map(item => item.equipmentName.toLowerCase())).size;
    const relationCount = records.filter(item => item.materialCode).length;
    res.json({ success: true, msg: `已导入 ${modelCount} 个设备型号、${relationCount} 条备件关系`, data: { total: records.length, modelCount, relationCount, workshopCode } });
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
  if (req.query.status !== 'all') { conditions.push('e.status=?'); params.push(req.query.status === 'inactive' ? 'inactive' : 'active'); }
  if (workshopCode) { conditions.push("COALESCE(e.workshop_code, 'raw_grain')=?"); params.push(workshopCode); }
  if (search) {
    conditions.push('(e.equipment_name LIKE ? OR e.workshop_group LIKE ?)');
    const keyword = `%${search}%`;
    params.push(keyword, keyword);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const [rows] = await pool.query(
    `SELECT e.id, COALESCE(e.workshop_code, 'raw_grain') AS workshopCode,
            e.equipment_name AS equipmentName, e.workshop_group AS workshopGroup, e.status, e.notes,
            COUNT(DISTINCT CASE WHEN relation_part.id IS NOT NULL THEN ep.id END) AS partCount
     FROM workshop_equipment e
     LEFT JOIN equipment_parts ep ON ep.equipment_id=e.id
     LEFT JOIN parts relation_part ON relation_part.id=ep.part_id AND COALESCE(relation_part.active,1)=1
     ${where}
     GROUP BY e.id, e.workshop_code, e.equipment_name, e.workshop_group, e.status, e.notes
     ORDER BY e.workshop_code, e.workshop_group, e.equipment_name`,
    params
  );
  res.json({ success: true, data: rows.map(row => ({ ...row, id: String(row.id) })) });
}));

router.post('/equipment', requireAnyWorkshopEditor, asyncHandler(async (req, res) => {
  const workshopCode = normalizeWorkshopCode(req.body?.workshopCode, 'raw_grain');
  assertWorkshopWrite(req.user, workshopCode);
  const name = optionalText(req.body?.equipmentName, 150);
  if (!name) throw new ApiError(400, '设备型号不能为空');
  const [existing] = await pool.query('SELECT id FROM workshop_equipment WHERE workshop_code=? AND equipment_name=? LIMIT 1', [workshopCode, name]);
  if (existing.length) throw new ApiError(409, '该车间已存在同名设备型号');
  try {
    const [result] = await pool.query(
      `INSERT INTO workshop_equipment (workshop_code, equipment_code, equipment_name, workshop_group, location, notes) VALUES (?, ?, ?, ?, ?, ?)`,
      [workshopCode, equipmentModelCode(workshopCode, name), name, optionalText(req.body?.workshopGroup, 100), null, optionalText(req.body?.notes)]
    );
    res.status(201).json({ success: true, msg: '设备型号已创建', data: { id: String(result.insertId) } });
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') throw new ApiError(409, '设备型号已存在');
    throw error;
  }
}));

router.get('/equipment/:id', asyncHandler(async (req, res) => {
  const equipmentId = parseInventoryId(req.params.id);
  const [[equipmentRows], [parts]] = await Promise.all([
    pool.query(`SELECT id, COALESCE(workshop_code, 'raw_grain') AS workshopCode, equipment_name AS equipmentName, workshop_group AS workshopGroup, status, notes FROM workshop_equipment WHERE id=?`, [equipmentId]),
    pool.query(
      `SELECT ep.id, ep.quantity_per_equipment AS quantityPerEquipment, ep.notes,
              p.id AS partId, p.code AS materialCode, p.name AS materialDesc, p.spec, p.unit,
              COALESCE(SUM(i.quantity),0) AS totalStock
       FROM equipment_parts ep INNER JOIN parts p ON p.id=ep.part_id
       INNER JOIN workshop_equipment scope_equipment ON scope_equipment.id=ep.equipment_id
       LEFT JOIN inventory i ON i.part_id=p.id AND COALESCE(i.active,1)=1
         AND COALESCE(i.workshop_code,'raw_grain')=COALESCE(scope_equipment.workshop_code,'raw_grain')
       WHERE ep.equipment_id=? AND COALESCE(p.active,1)=1 GROUP BY ep.id, ep.quantity_per_equipment, ep.notes, p.id, p.code, p.name, p.spec, p.unit`, [equipmentId]
    )
  ]);
  if (!equipmentRows.length) throw new ApiError(404, '设备不存在');
  res.json({ success: true, data: { ...equipmentRows[0], id: String(equipmentRows[0].id), parts } });
}));

router.patch('/equipment/:id', requireAnyWorkshopEditor, asyncHandler(async (req, res) => {
  const id = parseInventoryId(req.params.id);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[current]] = await connection.query("SELECT *,COALESCE(workshop_code,'raw_grain') AS workshopCode FROM workshop_equipment WHERE id=? FOR UPDATE", [id]);
    if (!current) throw new ApiError(404, '设备型号不存在');
    assertWorkshopWrite(req.user, current.workshopCode);
    const body = req.body || {};
    const name = body.equipmentName === undefined ? current.equipment_name : optionalText(body.equipmentName, 150);
    if (!name) throw new ApiError(400, '设备型号不能为空');
    const status = body.status === undefined ? current.status : body.status;
    if (!['active', 'inactive'].includes(status)) throw new ApiError(400, '型号状态无效');
    const [[duplicate]] = await connection.query('SELECT id FROM workshop_equipment WHERE workshop_code=? AND equipment_name=? AND id<>? LIMIT 1', [current.workshopCode, name, id]);
    if (duplicate) throw new ApiError(409, '该车间已存在同名设备型号');
    await connection.query('UPDATE workshop_equipment SET equipment_name=?,workshop_group=?,notes=?,status=? WHERE id=?', [name,
      body.workshopGroup === undefined ? current.workshop_group : optionalText(body.workshopGroup, 100),
      body.notes === undefined ? current.notes : optionalText(body.notes), status, id]);
    await connection.commit();
    res.json({ success: true, msg: '设备型号已更新' });
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
}));

router.patch('/equipment/:id/parts/:relationId', requireAnyWorkshopEditor, asyncHandler(async (req, res) => {
  const equipmentId = parseInventoryId(req.params.id);
  const relationId = parseInventoryId(req.params.relationId);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[row]] = await connection.query("SELECT ep.*,COALESCE(e.workshop_code,'raw_grain') AS workshopCode,e.status FROM equipment_parts ep INNER JOIN workshop_equipment e ON e.id=ep.equipment_id WHERE ep.id=? AND ep.equipment_id=? FOR UPDATE", [relationId, equipmentId]);
    if (!row) throw new ApiError(404, '备件关系不存在');
    assertWorkshopWrite(req.user, row.workshopCode);
    if (row.status !== 'active') throw new ApiError(409, '请先恢复设备型号再维护关系');
    const quantity = req.body?.quantityPerEquipment === undefined ? row.quantity_per_equipment : optionalNumber(req.body.quantityPerEquipment, '单台用量');
    if (quantity !== null && quantity < 0) throw new ApiError(400, '单台用量不能为负数');
    const notes = req.body?.notes === undefined ? row.notes : optionalText(req.body.notes, 300);
    await connection.query('UPDATE equipment_parts SET quantity_per_equipment=?,notes=? WHERE id=? AND equipment_id=?', [quantity, notes, relationId, equipmentId]);
    await connection.commit();
    res.json({ success: true, msg: '备件关系已更新' });
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
}));

router.post('/equipment/:id/parts', requireAnyWorkshopEditor, asyncHandler(async (req, res) => {
  const equipmentId = parseInventoryId(req.params.id);
  const inventoryId = parseInventoryId(req.body?.inventoryId);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [inventoryRows] = await connection.query(
      "SELECT i.part_id, COALESCE(i.workshop_code,'raw_grain') AS workshopCode FROM inventory i INNER JOIN parts p ON p.id=i.part_id WHERE i.id=? AND COALESCE(i.active,1)=1 AND COALESCE(p.active,1)=1 FOR UPDATE", [inventoryId]
    );
    const [equipment] = await connection.query("SELECT id,status, COALESCE(workshop_code,'raw_grain') AS workshopCode FROM workshop_equipment WHERE id=? FOR UPDATE", [equipmentId]);
    if (!equipment.length) throw new ApiError(404, '设备型号不存在');
    if (!inventoryRows.length) throw new ApiError(404, '备件不存在或已经删除');
    assertWorkshopWrite(req.user, equipment[0].workshopCode);
    if (equipment[0].status !== 'active') throw new ApiError(409, '请先恢复设备型号再关联备件');
    if (equipment[0].workshopCode !== inventoryRows[0].workshopCode) throw new ApiError(400, '设备只能关联同一车间的备件');
    await connection.query(
      'INSERT INTO equipment_parts (equipment_id, part_id, quantity_per_equipment, notes) VALUES (?, ?, ?, ?)',
      [equipmentId, inventoryRows[0].part_id, optionalNumber(req.body?.quantityPerEquipment, '单台用量'), optionalText(req.body?.notes, 300)]
    );
    await connection.commit();
    res.status(201).json({ success: true, msg: '设备与备件关系已建立' });
  } catch (error) {
    await connection.rollback();
    if (error?.code === 'ER_DUP_ENTRY') throw new ApiError(409, '该设备已关联此备件');
    throw error;
  } finally { connection.release(); }
}));

router.delete('/equipment/:id/parts/:relationId', requireAnyWorkshopEditor, asyncHandler(async (req, res) => {
  const equipmentId = parseInventoryId(req.params.id);
  const relationId = parseInventoryId(req.params.relationId);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `SELECT ep.id,e.status,COALESCE(e.workshop_code,'raw_grain') AS workshopCode
       FROM equipment_parts ep INNER JOIN workshop_equipment e ON e.id=ep.equipment_id
       WHERE ep.id=? AND ep.equipment_id=? FOR UPDATE`, [relationId, equipmentId]
    );
    if (!rows.length) throw new ApiError(404, '设备型号与备件关系不存在');
    assertWorkshopWrite(req.user, rows[0].workshopCode);
    if (rows[0].status !== 'active') throw new ApiError(409, '请先恢复设备型号再维护关系');
    await connection.query('DELETE FROM equipment_parts WHERE id=? AND equipment_id=?', [relationId, equipmentId]);
    await connection.commit();
    res.json({ success: true, msg: '设备型号与备件关系已解除' });
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
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
