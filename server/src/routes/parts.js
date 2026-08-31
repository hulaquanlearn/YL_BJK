const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const readXlsxFile = require('read-excel-file/node');
const config = require('../config');
const { pool } = require('../db');
const { requireRole } = require('../auth');
const { ApiError, asyncHandler, positiveInt, toPart } = require('../utils');
const {
  parseInventoryId,
  parseNonNegativeQuantity,
  findPendingInventoryOrder
} = require('../inventory-guards');
const {
  requireAnyWorkshopEditor,
  assertWorkshopWrite,
  normalizeWorkshopCode,
  workshopForRole,
  WORKSHOPS
} = require('../workshop-scope');
const { formatUnitTotals, buildAreaStats } = require('../stats-summary');
const { toMovement, toMovementDetail } = require('../stock-movements');
const { parseMovementMetadata, assertMovementAssociations } = require('../movement-metadata');
const { buildReplenishmentItem } = require('../replenishment');
const { buildMovementTrend } = require('../dashboard-stats');
const { workshopImportSchema, makePartsTemplate, makePartsErrorWorkbook, sendXlsx } = require('../import-workbook');
const { duplicateLocationErrors } = require('../part-import-validation');

const router = express.Router();

const PENDING_INVENTORY_SQL = `EXISTS (
  SELECT 1
  FROM inventory_order_items pending_item
  INNER JOIN inventory_orders pending_order ON pending_order.id = pending_item.order_id
  WHERE pending_item.inventory_id = i.id
    AND pending_order.approveStatus = '待审批'
)`;

const UNIT_SQL = "COALESCE(NULLIF(TRIM(i.unit_override), ''), NULLIF(TRIM(p.unit), ''), '未标单位')";
const SAFETY_STOCK_SQL = 'COALESCE(i.safety_stock_override, p.safety_stock)';
const MAX_STOCK_SQL = 'COALESCE(i.max_stock_override, p.max_stock)';
const PRICE_SQL = 'COALESCE(i.price_override, p.price)';

const PART_SELECT = `
  SELECT i.id, p.id AS partId,
         p.code AS materialCode,
         p.name AS materialDesc,
         p.name AS partName, p.spec,
         ${UNIT_SQL} AS unit, p.category_id AS categoryId, c.name AS categoryName,
         p.brand, ${SAFETY_STOCK_SQL} AS safetyStock, ${SAFETY_STOCK_SQL} AS reorderPoint,
         ${MAX_STOCK_SQL} AS maxStock, p.part_type AS partType,
         p.usage_description AS usageDescription, ${PRICE_SQL} AS price, p.remark,
         p.image_url AS imageUrl, p.model_url AS modelUrl, COALESCE(p.model_scale,1) AS modelScale,
         p.category_model_id AS categoryModelId, cm.name AS categoryModelName,
         cm.model_url AS categoryModelUrl, COALESCE(cm.model_scale,1) AS categoryModelScale,
         i.quantity AS totalStock,
         i.shelf, i.direction AS position, i.layer, i.slot AS location,
         i.location AS locationCode, i.warehouse AS warehouseArea,
         i.location_type AS locationType, i.location_note AS locationNote,
         COALESCE(w.name, i.warehouse) AS warehouseAreaName,
         COALESCE(i.workshop_code, w.workshop_code, 'raw_grain') AS workshopCode,
         COALESCE(ws.name, '原粮车间') AS workshopName,
         CASE
           WHEN ${PENDING_INVENTORY_SQL} THEN '待审批'
           WHEN i.last_inventory_date = CURDATE() THEN '已完成'
           ELSE '未盘点'
         END AS inventoryStatus,
         i.last_inventory_no AS lastInventoryNo,
         i.last_inventory_time AS lastInventoryTime,
         i.last_inventory_date AS lastInventoryDate,
         p.created_at AS createTime, i.updated_at AS updateTime
  FROM inventory i
  INNER JOIN parts p ON p.id = i.part_id
  LEFT JOIN categories c ON c.id = p.category_id
  LEFT JOIN part_category_models cm ON cm.id = p.category_model_id AND cm.active = 1
  LEFT JOIN warehouses w ON w.code = i.warehouse OR w.name = i.warehouse
  LEFT JOIN workshops ws ON ws.code = COALESCE(i.workshop_code, w.workshop_code, 'raw_grain')
`;

const SORT_SQL = {
  name: 'p.name ASC, i.id ASC',
  stockAsc: 'i.quantity ASC, i.id ASC',
  stockDesc: 'i.quantity DESC, i.id ASC',
  codeAsc: 'p.code ASC, i.id ASC',
  codeDesc: 'p.code DESC, i.id ASC'
};

function buildPartWhere(query) {
  const conditions = ['COALESCE(p.active, 1) = 1', 'COALESCE(i.active, 1) = 1'];
  const params = [];

  if (query.workshopCode) {
    conditions.push("COALESCE(i.workshop_code, w.workshop_code, 'raw_grain') = ?");
    params.push(normalizeWorkshopCode(query.workshopCode));
  }

  if (query.warehouseAreaName) {
    conditions.push('(w.name = ? OR i.warehouse = ?)');
    params.push(query.warehouseAreaName, query.warehouseAreaName);
  }
  if (query.partType) {
    conditions.push('COALESCE(NULLIF(TRIM(p.part_type), \'\'), \'未填写\') = ?');
    params.push(String(query.partType).trim());
  }
  if (query.warehouseAreaLike) {
    conditions.push('(w.name LIKE ? OR i.warehouse LIKE ?)');
    const area = `%${String(query.warehouseAreaLike).trim()}%`;
    params.push(area, area);
  }
  if (query.shelf === '__EMPTY__') {
    conditions.push('i.shelf IS NULL');
  } else if (query.shelf !== undefined && query.shelf !== '') {
    conditions.push('i.shelf = ?');
    params.push(query.shelf);
  }
  if (query.layer === '__EMPTY__') {
    conditions.push('i.layer IS NULL');
  } else if (query.layer !== undefined && query.layer !== '') {
    conditions.push('i.layer = ?');
    params.push(query.layer);
  }
  if (query.searchKeyword) {
    conditions.push(`(p.name LIKE ? OR p.code LIKE ? OR p.spec LIKE ? OR p.brand LIKE ?
      OR p.part_type LIKE ? OR p.usage_description LIKE ? OR i.location LIKE ? OR i.location_note LIKE ?
      OR i.warehouse LIKE ? OR w.name LIKE ?
      OR CAST(i.shelf AS CHAR) LIKE ? OR CAST(i.layer AS CHAR) LIKE ?
      OR CAST(i.direction AS CHAR) LIKE ? OR CAST(i.slot AS CHAR) LIKE ?)`);
    const keyword = `%${String(query.searchKeyword).trim()}%`;
    params.push(keyword, keyword, keyword, keyword, keyword, keyword, keyword, keyword,
      keyword, keyword, keyword, keyword, keyword, keyword);
  }
  if (query.excludeIds) {
    const ids = String(query.excludeIds).split(',').map(Number).filter(Number.isFinite);
    if (ids.length) {
      conditions.push(`i.id NOT IN (${ids.map(() => '?').join(',')})`);
      params.push(...ids);
    }
  }
  if (query.lowStock === '1' || query.lowStock === 'true') {
    conditions.push(`${SAFETY_STOCK_SQL} IS NOT NULL AND i.quantity <= ${SAFETY_STOCK_SQL}`);
  }
  if (query.stockStatus === 'zero') {
    conditions.push('i.quantity <= 0');
  } else if (query.stockStatus === 'low') {
    conditions.push(`i.quantity > 0 AND ${SAFETY_STOCK_SQL} IS NOT NULL AND i.quantity <= ${SAFETY_STOCK_SQL}`);
  } else if (query.stockStatus === 'normal') {
    conditions.push(`i.quantity > 0 AND ${SAFETY_STOCK_SQL} IS NOT NULL AND i.quantity > ${SAFETY_STOCK_SQL}`);
  } else if (query.stockStatus === 'unconfigured') {
    conditions.push(`i.quantity > 0 AND ${SAFETY_STOCK_SQL} IS NULL`);
  }
  if (query.inventoryStatus === 'completed') {
    conditions.push('i.last_inventory_date = CURDATE()');
  } else if (query.inventoryStatus === 'uncompleted') {
    conditions.push(`((i.last_inventory_date IS NULL OR i.last_inventory_date <> CURDATE()) AND NOT ${PENDING_INVENTORY_SQL})`);
  }

  return {
    sql: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    params
  };
}

function optionalValue(value) {
  if (value === undefined || value === null || value === '') return null;
  return value;
}

function ledgerText(value) {
  return String(value ?? '').trim();
}

function ledgerNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(number) ? number : null;
}

function firstLedgerValue(row, names) {
  for (const name of names) {
    if (row[name] !== undefined && row[name] !== null && ledgerText(row[name])) return row[name];
  }
  return '';
}

function parseLedgerLocation(row) {
  const rawCode = ledgerText(firstLedgerValue(row, ['六位库位码', '货位编码', '库位码'])).replace(/\D/g, '');
  if (/^\d{1,6}$/.test(rawCode) && Number(rawCode) > 0) {
    const code = rawCode.padStart(6, '0');
    return {
      locationCode: code,
      shelf: Number(code.slice(0, 2)),
      position: Number(code.slice(2, 3)),
      layer: Number(code.slice(3, 4)),
      location: Number(code.slice(4, 6))
    };
  }
  const shelf = ledgerNumber(firstLedgerValue(row, ['货架', '货架号']));
  const position = ledgerNumber(firstLedgerValue(row, ['方位', '方向', '东/西侧']));
  const layer = ledgerNumber(firstLedgerValue(row, ['层数', '层位', '层']));
  const location = ledgerNumber(firstLedgerValue(row, ['货位', '货位号']));
  const complete = shelf > 0 && [1, 2].includes(position) && layer > 0 && location > 0;
  return {
    locationCode: complete
      ? `${String(Math.trunc(shelf)).padStart(2, '0')}${position}${layer}${String(Math.trunc(location)).padStart(2, '0')}`
      : null,
    shelf: shelf == null ? null : Math.trunc(shelf),
    position: position == null ? null : Math.trunc(position),
    layer: layer == null ? null : Math.trunc(layer),
    location: location == null ? null : Math.trunc(location)
  };
}

async function parsePartLedger(buffer) {
  const sheetRows = await readXlsxFile(buffer);
  const requiredGroups = [
    ['物料编码', '编码'],
    ['物料描述', '物料名称', '备件名称', '名称']
  ];
  let headerIndex = -1;
  for (let index = 0; index < Math.min(sheetRows.length, 30); index += 1) {
    const headers = sheetRows[index].map(ledgerText);
    if (requiredGroups.every(group => group.some(header => headers.includes(header)))) {
      headerIndex = index;
      break;
    }
  }
  if (headerIndex < 0) throw new ApiError(400, '台账表头不符合要求', {
    errors: [{ row: 1, field: '表头', reason: '缺少“物料编码”和“物料名称/物料描述”列', suggestion: '请下载当前车间的导入模板后填写' }]
  });
  const headers = sheetRows[headerIndex].map(ledgerText);
  const records = [];
  const errors = [];
  for (let index = headerIndex + 1; index < sheetRows.length; index += 1) {
    const source = sheetRows[index];
    const row = {};
    headers.forEach((header, columnIndex) => { if (header) row[header] = source[columnIndex] ?? ''; });
    const materialCode = ledgerText(firstLedgerValue(row, ['物料编码', '编码'])).replace(/\.0$/, '');
    const materialDesc = ledgerText(firstLedgerValue(row, ['物料描述', '物料名称', '备件名称', '名称']));
    if (!materialCode && !materialDesc) continue;
    if (!materialCode) errors.push({ row: index + 1, field: '物料编码', reason: '关键字段为空', suggestion: '填写唯一的物料编码' });
    if (!materialDesc) errors.push({ row: index + 1, field: '物料名称', reason: '关键字段为空', suggestion: '填写完整物料名称' });
    const stockRaw = firstLedgerValue(row, ['实际库存量', '库存量', '当前库存', '数量']);
    const stockValue = ledgerNumber(stockRaw);
    if (ledgerText(stockRaw) && stockValue === null) errors.push({ row: index + 1, field: '库存量', reason: `“${ledgerText(stockRaw)}”不是有效数字`, suggestion: '填写大于或等于0的数字' });
    if (stockValue !== null && stockValue < 0) errors.push({ row: index + 1, field: '库存量', reason: '库存量不能小于0', suggestion: '改为0或正数' });
    const location = parseLedgerLocation(row);
    const rawLocationCode = ledgerText(firstLedgerValue(row, ['六位库位码', '货位编码', '库位码']));
    if (rawLocationCode && !/^\d{6}$/.test(rawLocationCode.replace(/\.0$/, ''))) {
      errors.push({ row: index + 1, field: '六位库位码', reason: '库位码必须是6位数字', suggestion: '例如011101；无固定库位时留空' });
    }
    if (!materialCode || !materialDesc) continue;
    const totalStock = Math.max(0, stockValue || 0);
    records.push({
      materialCode,
      materialDesc,
      unit: ledgerText(firstLedgerValue(row, ['单位'])) || '个',
      spec: ledgerText(firstLedgerValue(row, ['规格型号', '规格'])) || null,
      partType: ledgerText(firstLedgerValue(row, ['备件类型', '易损件/质保件', '类型'])) || null,
      usageDescription: ledgerText(firstLedgerValue(row, ['用途', '使用位置'])) || null,
      reorderPoint: ledgerNumber(firstLedgerValue(row, ['订购点', '安全库存'])),
      maxStock: ledgerNumber(firstLedgerValue(row, ['最高储备', '最高库存'])),
      price: ledgerNumber(firstLedgerValue(row, ['不含税单价', '单价'])),
      remark: ledgerText(firstLedgerValue(row, ['备注'])) || null,
      totalStock,
      warehouseAreaName: ledgerText(firstLedgerValue(row, ['货区', '库区', '仓库', '存放区域'])) || '',
      locationNote: ledgerText(firstLedgerValue(row, ['存放位置', '位置说明'])) || null,
      sourceRow: index + 1,
      ...location
    });
  }
  if (!records.length && !errors.length) throw new ApiError(400, '台账中没有可导入的备件记录', {
    errors: [{ row: headerIndex + 2, field: '数据', reason: '表头下方没有有效记录', suggestion: '至少保留一行备件数据' }]
  });
  if (records.length > 5000) throw new ApiError(400, '单次最多导入 5000 条备件');
  return { records, errors, headers };
}

async function validatePartLedgerLocations(records, workshopCode) {
  const locationCodes = [...new Set(records.map(record => record.locationCode).filter(Boolean))];
  if (!locationCodes.length) return duplicateLocationErrors(records);
  const placeholders = locationCodes.map(() => '?').join(',');
  const [rows] = await pool.query(
    `SELECT i.location AS locationCode, p.code AS materialCode
     FROM inventory i
     INNER JOIN parts p ON p.id = i.part_id
     WHERE COALESCE(i.workshop_code, 'raw_grain') = ?
       AND COALESCE(i.active, 1) = 1
       AND i.location IN (${placeholders})`,
    [workshopCode, ...locationCodes]
  );
  return duplicateLocationErrors(records, rows);
}

const partLedgerUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    const ok = path.extname(file.originalname).toLowerCase() === '.xlsx';
    callback(ok ? null : new Error('仅支持 .xlsx 台账文件'), ok);
  }
}).single('file');

async function assertPartAssetWrite(user, partId) {
  if (user?.role === 'admin') return;
  const workshopCode = workshopForRole(user?.role);
  if (!workshopCode) throw new ApiError(403, '当前账号没有备件资源修改权限');
  const [[row]] = await pool.query(
    `SELECT 1 AS allowed
     FROM inventory
     WHERE part_id = ?
       AND COALESCE(active, 1) = 1
       AND COALESCE(workshop_code, 'raw_grain') = ?
     LIMIT 1`,
    [partId, workshopCode]
  );
  if (!row) throw new ApiError(403, '当前账号只能修改所属车间的备件资源');
}

function buildMovementWhere(query) {
  const conditions = [];
  const params = [];
  const allowedTypes = new Set(['in', 'out', 'inventory_adjustment', 'initial']);

  if (allowedTypes.has(String(query.type || ''))) {
    conditions.push('sm.movement_type = ?');
    params.push(String(query.type));
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(query.dateFrom || ''))) {
    conditions.push('sm.created_at >= ?');
    params.push(`${query.dateFrom} 00:00:00`);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(query.dateTo || ''))) {
    conditions.push('sm.created_at < DATE_ADD(?, INTERVAL 1 DAY)');
    params.push(String(query.dateTo));
  }
  if (query.searchKeyword) {
    const keyword = `%${String(query.searchKeyword).trim()}%`;
    conditions.push(`(p.code LIKE ? OR p.name LIKE ? OR p.spec LIKE ? OR sm.reason LIKE ?
      OR sm.operator_name LIKE ? OR sm.related_order_no LIKE ? OR i.location LIKE ?
      OR sm.department LIKE ? OR sm.recipient LIKE ? OR sm.batch_no LIKE ?)`);
    params.push(keyword, keyword, keyword, keyword, keyword, keyword, keyword, keyword, keyword, keyword);
  }
  if (query.reasonCode) { conditions.push('sm.reason_code = ?'); params.push(String(query.reasonCode)); }
  if (query.department) { conditions.push('sm.department = ?'); params.push(String(query.department)); }
  if (query.workshopCode) {
    conditions.push("COALESCE(i.workshop_code, 'raw_grain') = ?");
    params.push(normalizeWorkshopCode(query.workshopCode));
  }

  return {
    sql: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    params
  };
}

async function resolveWarehouse(connection, data) {
  const workshopCode = normalizeWorkshopCode(data.workshopCode, 'raw_grain');
  const areaName = String(data.warehouseAreaName || '').trim();
  const areaCode = String(data.warehouseArea || '').trim();
  if (!areaName && !areaCode) {
    const defaults = {
      raw_grain: { code: 'RAW_GRAIN_MAIN', name: '原粮车间备件库' },
      qu_making: { code: 'QU_MAKING_MAIN', name: '制曲车间备件库' },
      brewing: { code: 'BREWING_MAIN', name: '酿酒车间备件库' }
    };
    const fallback = defaults[workshopCode];
    if (!fallback) throw new ApiError(400, '请选择或填写货区');
    await connection.query(
      `INSERT INTO warehouses (code, name, workshop_code) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE name=VALUES(name), workshop_code=VALUES(workshop_code)`,
      [fallback.code, fallback.name, workshopCode]
    );
    return fallback;
  }

  if (areaName) {
    const [nameRows] = await connection.query(
      `SELECT code, name
       FROM warehouses
       WHERE name = ? AND workshop_code = ?
       ORDER BY code ASC
       LIMIT 1`,
      [areaName, workshopCode]
    );
    if (nameRows.length) return { code: nameRows[0].code, name: nameRows[0].name };

    // 前端现有版本会用货区名前两个字猜测代码。名称未命中字典时，
    // 必须优先保留完整名称，不能再用猜测代码去命中其他货区。
    return { code: areaName, name: areaName };
  }

  if (areaCode) {
    const [codeRows] = await connection.query(
      'SELECT code, name FROM warehouses WHERE code = ? AND workshop_code = ? LIMIT 1',
      [areaCode, workshopCode]
    );
    if (codeRows.length) return { code: codeRows[0].code, name: codeRows[0].name || codeRows[0].code };
  }

  return { code: areaCode, name: areaCode, workshopCode };
}

router.get('/parts', asyncHandler(async (req, res) => {
  const page = positiveInt(req.query.page, 1, 100000);
  const pageSize = positiveInt(req.query.pageSize, 20, 200);
  const where = buildPartWhere(req.query);
  const orderSql = SORT_SQL[req.query.sort] || SORT_SQL.name;
  const [[[countRow]], [rows]] = await Promise.all([
    pool.query(
      `SELECT COUNT(*) AS total FROM inventory i
       INNER JOIN parts p ON p.id = i.part_id
       LEFT JOIN warehouses w ON w.code = i.warehouse ${where.sql}`,
      where.params
    ),
    pool.query(
      `${PART_SELECT} ${where.sql} ORDER BY ${orderSql} LIMIT ? OFFSET ?`,
      [...where.params, pageSize, (page - 1) * pageSize]
    )
  ]);

  res.json({
    success: true,
    data: rows.map(toPart),
    total: Number(countRow.total) || 0,
    page,
    pageSize
  });
}));

router.get('/stats', asyncHandler(async (req, res) => {
  const days = positiveInt(req.query.days, 30, 180);
  const periodStartSql = `DATE_SUB(CURDATE(), INTERVAL ${days - 1} DAY)`;
  const workshopCode = req.query.workshopCode ? normalizeWorkshopCode(req.query.workshopCode) : '';
  const workshopSql = workshopCode ? " AND COALESCE(i.workshop_code, 'raw_grain') = ?" : '';
  const workshopParams = workshopCode ? [workshopCode] : [];
  const [
    [summaryRows],
    [unitRows],
    [distributionRows],
    [lowRows],
    [areaRows],
    [movementRows],
    [movementSummaryRows],
    [topMovingRows]
  ] = await Promise.all([
    pool.query(
      `SELECT COUNT(DISTINCT p.id) AS materialCategoryCount,
              COUNT(i.id) AS inventoryRecords,
              SUM(CASE WHEN ${SAFETY_STOCK_SQL} IS NOT NULL AND i.quantity <= ${SAFETY_STOCK_SQL} THEN 1 ELSE 0 END) AS lowStock,
              SUM(CASE WHEN i.quantity <= 0 THEN 1 ELSE 0 END) AS zeroStock,
              SUM(CASE WHEN i.quantity > 0 AND ${SAFETY_STOCK_SQL} IS NOT NULL AND i.quantity <= ${SAFETY_STOCK_SQL} THEN 1 ELSE 0 END) AS lowPositiveStock,
              SUM(CASE WHEN i.quantity > 0 AND ${SAFETY_STOCK_SQL} IS NOT NULL AND i.quantity > ${SAFETY_STOCK_SQL} THEN 1 ELSE 0 END) AS healthyStock,
              SUM(CASE WHEN i.quantity > 0 AND ${SAFETY_STOCK_SQL} IS NULL THEN 1 ELSE 0 END) AS unconfiguredStock
       FROM inventory i
       INNER JOIN parts p ON p.id = i.part_id
       WHERE COALESCE(i.active, 1) = 1 AND COALESCE(p.active, 1) = 1${workshopSql}`,
      workshopParams
    ),
    pool.query(
      `SELECT ${UNIT_SQL} AS unit,
              COALESCE(SUM(i.quantity), 0) AS totalStock
       FROM inventory i
       INNER JOIN parts p ON p.id = i.part_id
       WHERE COALESCE(i.active, 1) = 1 AND COALESCE(p.active, 1) = 1${workshopSql}
       GROUP BY ${UNIT_SQL}`,
      workshopParams
    ),
    pool.query(
      `SELECT COALESCE(w.name, i.warehouse, '未分区') AS area,
              i.shelf, i.layer,
              ${UNIT_SQL} AS unit,
              COUNT(i.id) AS inventoryCount,
              COALESCE(SUM(i.quantity), 0) AS totalStock
       FROM inventory i
       INNER JOIN parts p ON p.id = i.part_id
       LEFT JOIN warehouses w ON w.code = i.warehouse OR w.name = i.warehouse
       WHERE COALESCE(i.active, 1) = 1 AND COALESCE(p.active, 1) = 1${workshopSql}
       GROUP BY COALESCE(w.name, i.warehouse, '未分区'), i.shelf, i.layer,
                ${UNIT_SQL}`,
      workshopParams
    ),
    pool.query(
      `${PART_SELECT}
       WHERE COALESCE(i.active, 1) = 1 AND COALESCE(p.active, 1) = 1
         AND ${SAFETY_STOCK_SQL} IS NOT NULL AND i.quantity <= ${SAFETY_STOCK_SQL}${workshopSql}
       ORDER BY i.quantity ASC, i.id ASC LIMIT 15`,
      workshopParams
    ),
    pool.query(
      `SELECT COALESCE(w.name, i.warehouse, '未分区') AS area,
              COUNT(i.id) AS inventoryRecords,
              COUNT(DISTINCT p.id) AS partTypes,
              SUM(CASE WHEN ${SAFETY_STOCK_SQL} IS NOT NULL AND i.quantity <= ${SAFETY_STOCK_SQL} THEN 1 ELSE 0 END) AS lowStock
       FROM inventory i
       INNER JOIN parts p ON p.id = i.part_id
       LEFT JOIN warehouses w ON w.code = i.warehouse OR w.name = i.warehouse
       WHERE COALESCE(i.active, 1) = 1 AND COALESCE(p.active, 1) = 1${workshopSql}
       GROUP BY COALESCE(w.name, i.warehouse, '未分区')
       ORDER BY inventoryRecords DESC, area ASC`,
      workshopParams
    ),
    pool.query(
      `SELECT DATE(sm.created_at) AS movementDate,
              sm.movement_type AS movementType,
              COUNT(*) AS movementCount
       FROM stock_movements sm
       INNER JOIN inventory i ON i.id = sm.inventory_id
       WHERE sm.created_at >= ${periodStartSql}${workshopSql}
       GROUP BY DATE(sm.created_at), sm.movement_type
       ORDER BY movementDate ASC`,
      workshopParams
    ),
    pool.query(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN movement_type = 'in' THEN 1 ELSE 0 END) AS inbound,
              SUM(CASE WHEN movement_type = 'out' THEN 1 ELSE 0 END) AS outbound,
              SUM(CASE WHEN movement_type NOT IN ('in', 'out') THEN 1 ELSE 0 END) AS adjustment
       FROM stock_movements sm
       INNER JOIN inventory i ON i.id = sm.inventory_id
       WHERE sm.created_at >= ${periodStartSql}${workshopSql}`,
      workshopParams
    ),
    pool.query(
      `SELECT i.id AS inventoryId, p.code AS materialCode, p.name AS materialDesc,
              COALESCE(i.workshop_code, 'raw_grain') AS workshopCode,
              ${UNIT_SQL} AS unit, COUNT(sm.id) AS movementCount,
              SUM(CASE WHEN sm.movement_type = 'out' THEN sm.quantity ELSE 0 END) AS outboundQuantity,
              MAX(sm.created_at) AS lastMovementAt
       FROM stock_movements sm
       INNER JOIN inventory i ON i.id = sm.inventory_id
       INNER JOIN parts p ON p.id = i.part_id
       WHERE sm.created_at >= ${periodStartSql}
         AND COALESCE(i.active, 1) = 1 AND COALESCE(p.active, 1) = 1${workshopSql}
       GROUP BY i.id, p.code, p.name, COALESCE(i.workshop_code, 'raw_grain'), ${UNIT_SQL}
       ORDER BY movementCount DESC, lastMovementAt DESC
       LIMIT 8`,
      workshopParams
    )
  ]);
  const summary = summaryRows[0] || {};
  const movementSummary = movementSummaryRows[0] || {};
  res.json({
    success: true,
    data: {
      summary: {
        materialCategoryCount: Number(summary.materialCategoryCount) || 0,
        inventoryRecords: Number(summary.inventoryRecords) || 0,
        lowStock: Number(summary.lowStock) || 0,
        zeroStock: Number(summary.zeroStock) || 0,
        lowPositiveStock: Number(summary.lowPositiveStock) || 0,
        healthyStock: Number(summary.healthyStock) || 0,
        unconfiguredStock: Number(summary.unconfiguredStock) || 0
      },
      unitTotals: formatUnitTotals(unitRows),
      areaStats: buildAreaStats(distributionRows),
      areaOverview: areaRows.map(row => ({
        area: row.area,
        inventoryRecords: Number(row.inventoryRecords) || 0,
        partTypes: Number(row.partTypes) || 0,
        lowStock: Number(row.lowStock) || 0
      })),
      lowStockParts: lowRows.map(toPart),
      movementPeriodDays: days,
      movementSummary: {
        total: Number(movementSummary.total) || 0,
        inbound: Number(movementSummary.inbound) || 0,
        outbound: Number(movementSummary.outbound) || 0,
        adjustment: Number(movementSummary.adjustment) || 0
      },
      movementTrend: buildMovementTrend(movementRows, days),
      topMovingParts: topMovingRows.map(row => ({
        inventoryId: String(row.inventoryId),
        workshopCode: row.workshopCode,
        materialCode: row.materialCode,
        materialDesc: row.materialDesc,
        unit: row.unit || '',
        movementCount: Number(row.movementCount) || 0,
        outboundQuantity: Number(row.outboundQuantity) || 0,
        lastMovementAt: row.lastMovementAt
      })),
      generatedAt: new Date().toISOString()
    }
  });
}));

router.get('/stock-movements', asyncHandler(async (req, res) => {
  const page = positiveInt(req.query.page, 1, 100000);
  const pageSize = positiveInt(req.query.pageSize, 20, 200);
  const where = buildMovementWhere(req.query);
  const baseFrom = `FROM stock_movements sm
    INNER JOIN inventory i ON i.id = sm.inventory_id
    INNER JOIN parts p ON p.id = i.part_id
    LEFT JOIN warehouses w ON w.code = i.warehouse OR w.name = i.warehouse
    LEFT JOIN app_users u ON u.id = sm.operator_user_id
    LEFT JOIN workshop_equipment equipment ON equipment.id = sm.equipment_id
    LEFT JOIN maintenance_work_orders maintenance_order ON maintenance_order.id = sm.maintenance_order_id`;

  const [[[summary]], [rows]] = await Promise.all([
    pool.query(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN sm.movement_type = 'in' THEN 1 ELSE 0 END) AS inbound,
              SUM(CASE WHEN sm.movement_type = 'out' THEN 1 ELSE 0 END) AS outbound,
              SUM(CASE WHEN sm.movement_type NOT IN ('in', 'out') THEN 1 ELSE 0 END) AS adjustment
       ${baseFrom} ${where.sql}`,
      where.params
    ),
    pool.query(
      `SELECT sm.*, p.code AS material_code, p.name AS material_desc, p.spec, p.unit,
              i.warehouse, COALESCE(w.name, i.warehouse) AS warehouse_area_name,
              i.location AS location_code, i.shelf, i.direction, i.layer, i.slot,
              equipment.equipment_name, maintenance_order.order_no AS maintenance_order_no,
              COALESCE(sm.operator_name, u.display_name, u.username, '系统') AS operator_name
       ${baseFrom} ${where.sql}
       ORDER BY sm.created_at DESC, sm.id DESC
       LIMIT ? OFFSET ?`,
      [...where.params, pageSize, (page - 1) * pageSize]
    )
  ]);

  res.json({
    success: true,
    data: rows.map(toMovementDetail),
    total: Number(summary.total) || 0,
    page,
    pageSize,
    summary: {
      total: Number(summary.total) || 0,
      inbound: Number(summary.inbound) || 0,
      outbound: Number(summary.outbound) || 0,
      adjustment: Number(summary.adjustment) || 0
    }
  });
}));

router.get('/replenishment', asyncHandler(async (req, res) => {
  const page = positiveInt(req.query.page, 1, 100000);
  const pageSize = positiveInt(req.query.pageSize, 100, 200);
  const where = buildPartWhere({ ...req.query, lowStock: '1' });
  const baseFrom = `FROM inventory i
    INNER JOIN parts p ON p.id = i.part_id
    LEFT JOIN warehouses w ON w.code = i.warehouse OR w.name = i.warehouse`;

  const [[[summary]], [suggestedUnitRows], [rows]] = await Promise.all([
    pool.query(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN i.quantity <= 0 THEN 1 ELSE 0 END) AS zeroStock,
              SUM(CASE WHEN ${MAX_STOCK_SQL} IS NULL THEN 1 ELSE 0 END) AS missingTarget,
              COALESCE(SUM(CASE WHEN ${MAX_STOCK_SQL} IS NOT NULL AND ${PRICE_SQL} IS NOT NULL
                THEN GREATEST(${MAX_STOCK_SQL} - i.quantity, 0) * ${PRICE_SQL}
                ELSE 0 END), 0) AS estimatedAmount
       ${baseFrom} ${where.sql}`,
      where.params
    ),
    pool.query(
      `SELECT ${UNIT_SQL} AS unit,
              COALESCE(SUM(GREATEST(${MAX_STOCK_SQL} - i.quantity, 0)), 0) AS totalStock
       ${baseFrom} ${where.sql} AND ${MAX_STOCK_SQL} IS NOT NULL
       GROUP BY ${UNIT_SQL}`,
      where.params
    ),
    pool.query(
      `${PART_SELECT} ${where.sql}
       ORDER BY CASE WHEN i.quantity <= 0 THEN 0
                     WHEN ${SAFETY_STOCK_SQL} > 0 AND i.quantity <= ${SAFETY_STOCK_SQL} * 0.5 THEN 1
                     ELSE 2 END,
                i.quantity ASC, p.name ASC
       LIMIT ? OFFSET ?`,
      [...where.params, pageSize, (page - 1) * pageSize]
    )
  ]);

  res.json({
    success: true,
    data: rows.map(row => buildReplenishmentItem(toPart(row))),
    total: Number(summary.total) || 0,
    page,
    pageSize,
    summary: {
      total: Number(summary.total) || 0,
      zeroStock: Number(summary.zeroStock) || 0,
      missingTarget: Number(summary.missingTarget) || 0,
      estimatedAmount: Number(summary.estimatedAmount) || 0,
      suggestedUnitTotals: formatUnitTotals(suggestedUnitRows)
    }
  });
}));

router.get('/parts/:id/movements', asyncHandler(async (req, res) => {
  const inventoryId = parseInventoryId(req.params.id);
  const pageSize = positiveInt(req.query.pageSize, 20, 100);
  const [rows] = await pool.query(
    `SELECT sm.*, equipment.equipment_name, maintenance_order.order_no AS maintenance_order_no,
            COALESCE(sm.operator_name, u.display_name, u.username, '系统') AS operator_name
     FROM stock_movements sm
     LEFT JOIN app_users u ON u.id = sm.operator_user_id
     LEFT JOIN workshop_equipment equipment ON equipment.id = sm.equipment_id
     LEFT JOIN maintenance_work_orders maintenance_order ON maintenance_order.id = sm.maintenance_order_id
     WHERE sm.inventory_id = ?
     ORDER BY sm.created_at DESC, sm.id DESC
     LIMIT ?`,
    [inventoryId, pageSize]
  );
  res.json({ success: true, data: rows.map(toMovement) });
}));

router.get('/parts/:id', asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `${PART_SELECT} WHERE i.id = ? AND COALESCE(i.active, 1) = 1 AND COALESCE(p.active, 1) = 1 LIMIT 1`,
    [req.params.id]
  );
  if (!rows.length) throw new ApiError(404, '备件库存记录不存在');
  res.json({ success: true, data: toPart(rows[0]) });
}));

router.post('/parts', requireAnyWorkshopEditor, asyncHandler(async (req, res) => {
  const data = req.body || {};
  const workshopCode = normalizeWorkshopCode(data.workshopCode, 'raw_grain');
  assertWorkshopWrite(req.user, workshopCode);
  const code = String(data.materialCode || '').trim();
  const name = String(data.materialDesc || '').trim();
  if (!code) throw new ApiError(400, '物料编码不能为空');
  if (!name) throw new ApiError(400, '物料描述不能为空');
  const totalStock = parseNonNegativeQuantity(data.totalStock ?? 0, '初始库存');

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [existingParts] = await connection.query(
      'SELECT id FROM parts WHERE code = ? LIMIT 1 FOR UPDATE',
      [code]
    );
    const existingPart = existingParts.length > 0;
    let partId;
    if (existingPart) {
      partId = existingParts[0].id;
      await connection.query(
        `UPDATE parts SET active=1, name=?, spec=COALESCE(?, spec), unit=COALESCE(?, unit),
          part_type=COALESCE(?, part_type), usage_description=COALESCE(?, usage_description)
         WHERE id=?`,
        [name, optionalValue(data.spec), optionalValue(data.unit), optionalValue(data.partType), optionalValue(data.usageDescription), partId]
      );
    } else {
      const brand = name.includes(',') ? name.split(',')[0].trim() : null;
      const [partResult] = await connection.query(
        `INSERT INTO parts
         (code, name, spec, unit, brand, safety_stock, max_stock, part_type, usage_description, price, remark, active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [code, name, optionalValue(data.spec), data.unit || '个', brand, optionalValue(data.reorderPoint ?? data.safetyStock),
          optionalValue(data.maxStock), optionalValue(data.partType), optionalValue(data.usageDescription),
          optionalValue(data.price), data.remark || null]
      );
      partId = partResult.insertId;
    }

    const warehouse = await resolveWarehouse(connection, data);
    const locationCode = optionalValue(data.locationCode);
    const locationType = data.locationType === 'free_text' ? 'free_text' : 'shelf';
    const locationNote = optionalValue(data.locationNote);
    const shelf = optionalValue(data.shelf);
    const position = optionalValue(data.position);
    const layer = optionalValue(data.layer);
    const location = optionalValue(data.location);
    const [duplicateLocations] = await connection.query(
      `SELECT id
       FROM inventory i
       LEFT JOIN warehouses existing_warehouse ON existing_warehouse.code = i.warehouse
       WHERE i.part_id = ?
         AND COALESCE(i.active, 1) = 1
         AND COALESCE(i.workshop_code, 'raw_grain') = ?
         AND (i.warehouse = ? OR COALESCE(existing_warehouse.name, i.warehouse) = ?)
         AND NULLIF(i.location, '') <=> ?
         AND i.shelf <=> ? AND i.direction <=> ? AND i.layer <=> ? AND i.slot <=> ?
       LIMIT 1
       FOR UPDATE`,
      [partId, workshopCode, warehouse.code, warehouse.name, locationCode, shelf, position, layer, location]
    );
    if (duplicateLocations.length) throw new ApiError(409, '该物料的完整库位已存在');

    const [inventoryResult] = await connection.query(
      `INSERT INTO inventory
       (part_id, warehouse, workshop_code, location, shelf, direction, layer, slot, location_type, location_note,
        quantity, unit_override, safety_stock_override, max_stock_override, price_override, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [partId, warehouse.code, workshopCode, locationCode, shelf, position, layer, location, locationType, locationNote,
        totalStock, optionalValue(data.unit), optionalValue(data.reorderPoint ?? data.safetyStock),
        optionalValue(data.maxStock), optionalValue(data.price)]
    );
    if (totalStock > 0) {
      await connection.query(
        `INSERT INTO stock_movements
         (inventory_id, movement_type, quantity, before_quantity, after_quantity, reason,
          operator_user_id, operator_name)
         VALUES (?, 'initial', ?, 0, ?, '新增备件初始库存', ?, ?)`,
        [inventoryResult.insertId, totalStock, totalStock, req.user.id, req.user.displayName]
      );
    }
    const [rows] = await connection.query(`${PART_SELECT} WHERE i.id = ?`, [inventoryResult.insertId]);
    if (!rows.length) throw new Error('新增库存记录后未能读回数据');
    await connection.commit();
    res.status(201).json({
      success: true,
      msg: existingPart ? '新增备件库位成功' : '新增备件成功',
      data: toPart(rows[0])
    });
  } catch (error) {
    await connection.rollback();
    if (error?.code === 'ER_DUP_ENTRY') {
      throw new ApiError(409, '该物料的库位记录已存在');
    }
    throw error;
  } finally {
    connection.release();
  }
}));

router.get('/parts/import-template', requireAnyWorkshopEditor, asyncHandler(async (req, res) => {
  const workshopCode = normalizeWorkshopCode(req.query?.workshopCode, 'raw_grain');
  assertWorkshopWrite(req.user, workshopCode);
  const schema = workshopImportSchema(workshopCode);
  const buffer = await makePartsTemplate(workshopCode);
  sendXlsx(res, `${schema.name}备件导入模板.xlsx`, buffer);
}));

router.post('/parts/import-preview', requireAnyWorkshopEditor, partLedgerUpload, asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, '请选择要校验的 .xlsx 台账文件');
  const workshopCode = normalizeWorkshopCode(req.body?.workshopCode, 'raw_grain');
  assertWorkshopWrite(req.user, workshopCode);
  const { records, errors: parseErrors } = await parsePartLedger(req.file.buffer);
  const errors = [...parseErrors, ...await validatePartLedgerLocations(records, workshopCode)];
  res.json({
    success: errors.length === 0,
    msg: errors.length ? `发现 ${errors.length} 个问题，尚未写入数据` : `校验通过，共 ${records.length} 条，尚未写入数据`,
    data: { workshopCode, total: records.length, errorCount: errors.length, errors, sample: records.slice(0, 8) }
  });
}));

router.post('/parts/import-error-report', requireAnyWorkshopEditor, partLedgerUpload, asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, '请选择要生成错误修正表的 .xlsx 台账文件');
  const workshopCode = normalizeWorkshopCode(req.body?.workshopCode, 'raw_grain');
  assertWorkshopWrite(req.user, workshopCode);
  const { records, errors: parseErrors } = await parsePartLedger(req.file.buffer);
  const errors = [...parseErrors, ...await validatePartLedgerLocations(records, workshopCode)];
  if (!errors.length) throw new ApiError(400, '当前台账校验通过，无需生成错误修正表');
  const schema = workshopImportSchema(workshopCode);
  const buffer = await makePartsErrorWorkbook(req.file.buffer, errors);
  sendXlsx(res, `${schema.name}备件导入错误修正表.xlsx`, buffer);
}));

router.post('/parts/import', requireAnyWorkshopEditor, partLedgerUpload, asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, '请选择要导入的 .xlsx 台账文件');
  const workshopCode = normalizeWorkshopCode(req.body?.workshopCode, 'raw_grain');
  assertWorkshopWrite(req.user, workshopCode);
  const { records, errors: parseErrors } = await parsePartLedger(req.file.buffer);
  const errors = [...parseErrors, ...await validatePartLedgerLocations(records, workshopCode)];
  if (errors.length) throw new ApiError(422, `导入校验失败，共 ${errors.length} 个问题；未写入任何数据`, { errors });
  const defaultWarehouse = {
    raw_grain: { code: 'RAW_GRAIN_MAIN', name: '原粮车间备件库' },
    qu_making: { code: 'QU_MAKING_MAIN', name: '制曲车间备件库' },
    brewing: { code: 'BREWING_MAIN', name: '酿酒车间备件库' }
  }[workshopCode];
  const connection = await pool.getConnection();
  let inserted = 0;
  let updated = 0;
  try {
    await connection.beginTransaction();
    await connection.query(
      `INSERT INTO warehouses (code, name, workshop_code) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE name=VALUES(name), workshop_code=VALUES(workshop_code)`,
      [defaultWarehouse.code, defaultWarehouse.name, workshopCode]
    );
    for (const record of records) {
      await connection.query(
        `INSERT INTO parts
         (code, name, spec, unit, safety_stock, max_stock, part_type, usage_description, price, remark, active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE name=VALUES(name), spec=COALESCE(VALUES(spec), spec),
           unit=VALUES(unit), safety_stock=COALESCE(VALUES(safety_stock), safety_stock),
           max_stock=COALESCE(VALUES(max_stock), max_stock), part_type=COALESCE(VALUES(part_type), part_type),
           usage_description=COALESCE(VALUES(usage_description), usage_description),
           price=COALESCE(VALUES(price), price), remark=COALESCE(VALUES(remark), remark), active=1`,
        [record.materialCode, record.materialDesc, record.spec, record.unit, record.reorderPoint,
          record.maxStock, record.partType, record.usageDescription, record.price, record.remark]
      );
      const [[part]] = await connection.query('SELECT id FROM parts WHERE code=? LIMIT 1 FOR UPDATE', [record.materialCode]);
      const warehouseName = record.warehouseAreaName || defaultWarehouse.name;
      let warehouseCode = defaultWarehouse.code;
      if (record.warehouseAreaName) {
        const [[warehouse]] = await connection.query(
          'SELECT code FROM warehouses WHERE workshop_code=? AND name=? LIMIT 1',
          [workshopCode, record.warehouseAreaName]
        );
        if (warehouse) warehouseCode = warehouse.code;
        else {
          warehouseCode = `${workshopCode.toUpperCase()}_${crypto.createHash('sha1').update(record.warehouseAreaName).digest('hex').slice(0, 10).toUpperCase()}`;
          await connection.query(
            `INSERT INTO warehouses (code, name, workshop_code) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE name=VALUES(name), workshop_code=VALUES(workshop_code)`,
            [warehouseCode, record.warehouseAreaName, workshopCode]
          );
        }
      }
      const [existingRows] = await connection.query(
        `SELECT id, quantity FROM inventory
         WHERE part_id=? AND COALESCE(workshop_code, 'raw_grain')=? AND COALESCE(active,1)=1
         ORDER BY CASE WHEN NULLIF(location,'') <=> ? THEN 0 ELSE 1 END, id ASC LIMIT 1 FOR UPDATE`,
        [part.id, workshopCode, record.locationCode]
      );
      const locationType = record.locationCode ? 'shelf' : 'free_text';
      const locationNote = record.locationCode ? null : (record.locationNote || `${warehouseName}（未提供固定库位码）`);
      let inventoryId;
      let beforeQuantity = 0;
      if (existingRows.length) {
        inventoryId = existingRows[0].id;
        beforeQuantity = Number(existingRows[0].quantity) || 0;
        await connection.query(
          `UPDATE inventory SET warehouse=?, workshop_code=?, location=?, shelf=?, direction=?, layer=?, slot=?,
             location_type=?, location_note=?, quantity=?, unit_override=?, safety_stock_override=?,
             max_stock_override=?, price_override=?, active=1 WHERE id=?`,
          [warehouseCode, workshopCode, record.locationCode, record.shelf, record.position, record.layer,
            record.location, locationType, locationNote, record.totalStock, record.unit, record.reorderPoint,
            record.maxStock, record.price, inventoryId]
        );
        updated += 1;
      } else {
        const [inventoryResult] = await connection.query(
          `INSERT INTO inventory
           (part_id, warehouse, workshop_code, location, shelf, direction, layer, slot, location_type,
            location_note, quantity, unit_override, safety_stock_override, max_stock_override, price_override, active)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
          [part.id, warehouseCode, workshopCode, record.locationCode, record.shelf, record.position,
            record.layer, record.location, locationType, locationNote, record.totalStock, record.unit,
            record.reorderPoint, record.maxStock, record.price]
        );
        inventoryId = inventoryResult.insertId;
        inserted += 1;
      }
      if (beforeQuantity !== record.totalStock) {
        await connection.query(
          `INSERT INTO stock_movements
           (inventory_id, movement_type, quantity, before_quantity, after_quantity, reason,
            operator_user_id, operator_name)
           VALUES (?, 'inventory_adjustment', ?, ?, ?, '备件台账导入', ?, ?)`,
          [inventoryId, Math.abs(record.totalStock - beforeQuantity), beforeQuantity, record.totalStock,
            req.user.id, req.user.displayName]
        );
      }
    }
    await connection.commit();
    res.json({
      success: true,
      msg: `导入完成：新增 ${inserted} 条，更新 ${updated} 条`,
      data: { total: records.length, inserted, updated, workshopCode }
    });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

router.delete('/parts/:id', requireAnyWorkshopEditor, asyncHandler(async (req, res) => {
  const inventoryId = parseInventoryId(req.params.id);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      "SELECT part_id, quantity, COALESCE(workshop_code, 'raw_grain') AS workshop_code FROM inventory WHERE id = ? AND COALESCE(active, 1) = 1 FOR UPDATE",
      [inventoryId]
    );
    if (!rows.length) throw new ApiError(404, '备件库存记录不存在');
    assertWorkshopWrite(req.user, rows[0].workshop_code);
    if (Number(rows[0].quantity) !== 0) throw new ApiError(409, '库存不为0，不能删除');
    const pendingOrder = await findPendingInventoryOrder(connection, [inventoryId]);
    if (pendingOrder) {
      throw new ApiError(409, `该库存正在盘点单${pendingOrder.inventoryNo || pendingOrder.id}中等待审批，不能删除`);
    }
    const partId = rows[0].part_id;
    await connection.query('UPDATE inventory SET active = 0 WHERE id = ?', [inventoryId]);
    const [[countRow]] = await connection.query(
      'SELECT COUNT(*) AS total FROM inventory WHERE part_id = ? AND COALESCE(active, 1) = 1',
      [partId]
    );
    if (!Number(countRow.total)) await connection.query('UPDATE parts SET active = 0 WHERE id = ?', [partId]);
    await connection.commit();
    res.json({ success: true, msg: '备件记录已停用' });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

router.post('/parts/:id/stock', requireAnyWorkshopEditor, asyncHandler(async (req, res) => {
  const inventoryId = parseInventoryId(req.params.id);
  const type = req.body?.type;
  const quantity = Number(req.body?.quantity);
  if (!['in', 'out'].includes(type)) throw new ApiError(400, '出入库类型无效');
  if (!Number.isFinite(quantity) || quantity <= 0) throw new ApiError(400, '数量必须大于0');
  const metadata = parseMovementMetadata(type, {
    ...(req.body || {}),
    reasonCode: req.body?.reasonCode || (type === 'in' ? 'other_in' : 'other_out'),
    reasonDetail: req.body?.reasonDetail ?? req.body?.reason
  });

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await assertMovementAssociations(connection, metadata);
    const [rows] = await connection.query(
      `SELECT i.quantity, COALESCE(i.workshop_code, 'raw_grain') AS workshop_code
       FROM inventory i
       INNER JOIN parts p ON p.id = i.part_id
       WHERE i.id = ? AND COALESCE(i.active, 1) = 1 AND COALESCE(p.active, 1) = 1
       FOR UPDATE`,
      [inventoryId]
    );
    if (!rows.length) throw new ApiError(404, '备件库存记录不存在或已停用');
    assertWorkshopWrite(req.user, rows[0].workshop_code);
    const pendingOrder = await findPendingInventoryOrder(connection, [inventoryId]);
    if (pendingOrder) {
      throw new ApiError(409, `该库存正在盘点单${pendingOrder.inventoryNo || pendingOrder.id}中等待审批，暂停出入库`);
    }
    const currentStock = Number(rows[0].quantity) || 0;
    const newStock = type === 'in' ? currentStock + quantity : currentStock - quantity;
    if (newStock < 0) throw new ApiError(400, '库存不足');
    await connection.query('UPDATE inventory SET quantity = ? WHERE id = ?', [newStock, inventoryId]);
    await connection.query(
      `INSERT INTO stock_movements
       (inventory_id, movement_type, quantity, before_quantity, after_quantity, reason,
        reason_code, department, recipient, equipment_id, maintenance_order_id, batch_no,
        operator_user_id, operator_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [inventoryId, type, quantity, currentStock, newStock, metadata.reason, metadata.reasonCode,
        metadata.department, metadata.recipient, metadata.equipmentId, metadata.maintenanceOrderId,
        metadata.batchNo, req.user.id, req.user.displayName]
    );
    const [updatedRows] = await connection.query(`${PART_SELECT} WHERE i.id = ?`, [inventoryId]);
    if (!updatedRows.length) throw new Error('库存更新后未能读回数据');
    await connection.commit();
    res.json({ success: true, msg: '操作成功', data: toPart(updatedRows[0]) });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

router.get('/filters', asyncHandler(async (req, res) => {
  const workshopCode = req.query.workshopCode ? normalizeWorkshopCode(req.query.workshopCode) : '';
  const workshopSql = workshopCode ? " AND COALESCE(i.workshop_code, 'raw_grain') = ?" : '';
  const workshopParams = workshopCode ? [workshopCode] : [];
  const [[rows], [partTypeRows]] = await Promise.all([
    pool.query(
    `SELECT DISTINCT i.warehouse, COALESCE(w.name, i.warehouse) AS warehouseAreaName,
            COALESCE(i.workshop_code, w.workshop_code, 'raw_grain') AS workshopCode,
            i.shelf, i.layer
     FROM inventory i
     LEFT JOIN warehouses w ON w.code = i.warehouse
     INNER JOIN parts p ON p.id = i.part_id
     WHERE COALESCE(i.active, 1) = 1 AND COALESCE(p.active, 1) = 1${workshopSql}
     ORDER BY warehouseAreaName ASC, i.shelf ASC, i.layer ASC`,
      workshopParams
    ),
    pool.query(`SELECT DISTINCT COALESCE(NULLIF(TRIM(p.part_type), ''), '未填写') AS partType
                FROM parts p INNER JOIN inventory i ON i.part_id=p.id
                WHERE COALESCE(p.active,1)=1 AND COALESCE(i.active,1)=1${workshopSql}
                ORDER BY partType ASC`, workshopParams)
  ]);
  const areas = [];
  const shelfMap = {};
  const layerMap = {};
  rows.forEach(row => {
    const area = row.warehouseAreaName || row.warehouse || '未指定';
    const shelfDisplay = row.shelf === null ? '未指定' : `${row.shelf}号`;
    const layerDisplay = row.layer === null ? '未指定' : `${row.layer}层`;
    if (!areas.includes(area)) areas.push(area);
    if (!shelfMap[area]) shelfMap[area] = [];
    if (!shelfMap[area].includes(shelfDisplay)) shelfMap[area].push(shelfDisplay);
    if (!layerMap[area]) layerMap[area] = {};
    if (!layerMap[area][shelfDisplay]) layerMap[area][shelfDisplay] = [];
    if (!layerMap[area][shelfDisplay].includes(layerDisplay)) layerMap[area][shelfDisplay].push(layerDisplay);
  });
  res.json({ success: true, data: {
    areas, shelfMap, layerMap, workshops: WORKSHOPS,
    partTypes: partTypeRows.map(row => row.partType).filter(Boolean)
  } });
}));

router.get('/dashboard', asyncHandler(async (req, res) => {
  const workshopCode = req.query.workshopCode ? normalizeWorkshopCode(req.query.workshopCode) : '';
  const workshopSql = workshopCode ? " AND COALESCE(i.workshop_code, 'raw_grain') = ?" : '';
  const workshopParams = workshopCode ? [workshopCode] : [];
  const [[[summary]], [unitRows], [lowRows], [[pendingRow]]] = await Promise.all([
    pool.query(
      `SELECT COUNT(DISTINCT p.id) AS partTypes,
              COUNT(i.id) AS inventoryRecords,
              COALESCE(SUM(i.quantity), 0) AS totalStock,
              COALESCE(SUM(i.quantity * COALESCE(${PRICE_SQL}, 0)), 0) AS totalValue,
              SUM(CASE WHEN ${SAFETY_STOCK_SQL} IS NOT NULL AND i.quantity <= ${SAFETY_STOCK_SQL} THEN 1 ELSE 0 END) AS lowStock,
              SUM(CASE WHEN i.quantity > 0 AND ${SAFETY_STOCK_SQL} IS NULL THEN 1 ELSE 0 END) AS unconfiguredStock
       FROM inventory i INNER JOIN parts p ON p.id = i.part_id
       WHERE COALESCE(i.active, 1) = 1 AND COALESCE(p.active, 1) = 1${workshopSql}`,
      workshopParams
    ),
    pool.query(
      `SELECT ${UNIT_SQL} AS unit,
              COALESCE(SUM(i.quantity), 0) AS totalStock
       FROM inventory i INNER JOIN parts p ON p.id = i.part_id
       WHERE COALESCE(i.active, 1) = 1 AND COALESCE(p.active, 1) = 1${workshopSql}
       GROUP BY ${UNIT_SQL}`,
      workshopParams
    ),
    pool.query(
      `${PART_SELECT}
       WHERE COALESCE(i.active, 1) = 1 AND COALESCE(p.active, 1) = 1
         AND ${SAFETY_STOCK_SQL} IS NOT NULL AND i.quantity <= ${SAFETY_STOCK_SQL}${workshopSql}
       ORDER BY i.quantity ASC, i.id ASC LIMIT 3`,
      workshopParams
    ),
    workshopCode
      ? pool.query("SELECT COUNT(*) AS total FROM inventory_orders WHERE approveStatus = '待审批' AND workshop_code = ?", [workshopCode])
      : pool.query("SELECT COUNT(*) AS total FROM inventory_orders WHERE approveStatus = '待审批'")
  ]);
  res.json({
    success: true,
    data: {
      dashboard: {
        partTypes: Number(summary.partTypes) || 0,
        inventoryRecords: Number(summary.inventoryRecords) || 0,
        totalStock: Number(summary.totalStock) || 0,
        totalValue: Number(summary.totalValue) || 0,
        lowStock: Number(summary.lowStock) || 0,
        unconfiguredStock: Number(summary.unconfiguredStock) || 0,
        pendingApproval: Number(pendingRow.total) || 0,
        unitTotals: formatUnitTotals(unitRows)
      },
      lowStockParts: lowRows.map(toPart)
    }
  });
}));

const partImageDir = config.parts.uploadDir;
const categoryModelDir = config.parts.modelDir;
fs.mkdirSync(partImageDir, { recursive: true });
fs.mkdirSync(categoryModelDir, { recursive: true });

const partImageStorage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, partImageDir),
  filename: (_req, file, callback) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!/^\\.(jpe?g|png|webp|gif|bmp|svg)$/.test(ext)) return callback(new Error('仅支持图片文件'));
    callback(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
  }
});

const partImageUpload = multer({
  storage: partImageStorage,
  limits: { fileSize: config.parts.maxFileSize, files: 1 },
  fileFilter: (_req, file, callback) => {
    const ext = path.extname(file.originalname).toLowerCase();
    callback(/^\\.(jpe?g|png|webp|gif|bmp|svg)$/.test(ext) ? null : new Error('仅支持图片文件'), /^\\.(jpe?g|png|webp|gif|bmp|svg)$/.test(ext));
  }
}).single('image');

router.post('/parts/:partId/image', requireAnyWorkshopEditor, asyncHandler(async (req, res) => {
  const partId = positiveInt(req.params.partId, 1, Number.MAX_SAFE_INTEGER);
  if (!partId) throw new ApiError(400, '备件ID无效');
  await assertPartAssetWrite(req.user, partId);
  partImageUpload(req, res, error => {
    if (error) return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ success: false, msg: error.message || '图片上传失败' });
    if (!req.file) return res.status(400).json({ success: false, msg: '请选择图片文件' });
    const imageUrl = `/uploads/part-images/${req.file.filename}`;
    pool.query('UPDATE parts SET image_url=? WHERE id=?', [imageUrl, partId])
      .then(([result]) => {
        if (!result.affectedRows) {
          fs.promises.unlink(req.file.path).catch(() => {});
          return res.status(404).json({ success: false, msg: '备件不存在' });
        }
        res.json({ success: true, msg: '图片已上传', data: { imageUrl } });
      })
      .catch(err => {
        fs.promises.unlink(req.file.path).catch(() => {});
        res.status(500).json({ success: false, msg: '保存失败' });
      });
  });
}));

router.delete('/parts/:partId/image', requireAnyWorkshopEditor, asyncHandler(async (req, res) => {
  const partId = positiveInt(req.params.partId, 1, Number.MAX_SAFE_INTEGER);
  if (!partId) throw new ApiError(400, '备件ID无效');
  await assertPartAssetWrite(req.user, partId);
  const [[part]] = await pool.query('SELECT image_url FROM parts WHERE id=?', [partId]);
  if (!part) throw new ApiError(404, '备件不存在');
  if (part.image_url) {
    const filename = path.basename(part.image_url);
    fs.promises.unlink(path.join(partImageDir, filename)).catch(() => {});
  }
  await pool.query('UPDATE parts SET image_url=NULL WHERE id=?', [partId]);
  res.json({ success: true, msg: '图片已删除' });
}));

const glbStorage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    const dir = path.join(partImageDir, 'glb');
    fs.mkdirSync(dir, { recursive: true });
    callback(null, dir);
  },
  filename: (_req, file, callback) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.glb' && ext !== '.gltf') return callback(new Error('仅支持 GLB/GLTF 文件'));
    callback(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
  }
});

const glbUpload = multer({
  storage: glbStorage,
  limits: { fileSize: 50 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const ok = ext === '.glb' || ext === '.gltf';
    callback(ok ? null : new Error('仅支持 GLB/GLTF 文件'), ok);
  }
}).single('model');

router.post('/parts/:partId/model', requireAnyWorkshopEditor, asyncHandler(async (req, res) => {
  const partId = positiveInt(req.params.partId, 1, Number.MAX_SAFE_INTEGER);
  if (!partId) throw new ApiError(400, '备件ID无效');
  await assertPartAssetWrite(req.user, partId);
  glbUpload(req, res, error => {
    if (error) return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ success: false, msg: error.message || '模型上传失败' });
    if (!req.file) return res.status(400).json({ success: false, msg: '请选择GLB/GLTF文件' });
    const modelUrl = `/uploads/part-images/glb/${req.file.filename}`;
    const modelScale = Number(req.body?.modelScale) || 1;
    pool.query('UPDATE parts SET model_url=?, model_scale=? WHERE id=?', [modelUrl, modelScale, partId])
      .then(([result]) => {
        if (!result.affectedRows) {
          fs.promises.unlink(req.file.path).catch(() => {});
          return res.status(404).json({ success: false, msg: '备件不存在' });
        }
        res.json({ success: true, msg: '3D模型已上传', data: { modelUrl, modelScale } });
      })
      .catch(() => {
        fs.promises.unlink(req.file.path).catch(() => {});
        res.status(500).json({ success: false, msg: '保存失败' });
      });
  });
}));

router.delete('/parts/:partId/model', requireAnyWorkshopEditor, asyncHandler(async (req, res) => {
  const partId = positiveInt(req.params.partId, 1, Number.MAX_SAFE_INTEGER);
  if (!partId) throw new ApiError(400, '备件ID无效');
  await assertPartAssetWrite(req.user, partId);
  const [[part]] = await pool.query('SELECT model_url FROM parts WHERE id=?', [partId]);
  if (!part) throw new ApiError(404, '备件不存在');
  if (part.model_url) {
    const [[usage]] = await pool.query('SELECT COUNT(*) AS total FROM parts WHERE model_url=? AND id<>?', [part.model_url, partId]);
    if (!Number(usage.total)) {
      const filename = path.basename(part.model_url);
      fs.promises.unlink(path.join(partImageDir, 'glb', filename)).catch(() => {});
    }
  }
  await pool.query('UPDATE parts SET model_url=NULL, model_scale=1 WHERE id=?', [partId]);
  res.json({ success: true, msg: '3D模型已删除' });
}));

router.patch('/parts/:partId/model-scale', requireAnyWorkshopEditor, asyncHandler(async (req, res) => {
  const partId = positiveInt(req.params.partId, 1, Number.MAX_SAFE_INTEGER);
  if (!partId) throw new ApiError(400, '备件ID无效');
  await assertPartAssetWrite(req.user, partId);
  const scale = Math.min(Math.max(Number(req.body?.modelScale) || 1, 0.1), 10);
  const [result] = await pool.query('UPDATE parts SET model_scale=? WHERE id=?', [scale, partId]);
  if (!result.affectedRows) throw new ApiError(404, '备件不存在');
  res.json({ success: true, msg: '缩放比例已更新', data: { modelScale: scale } });
}));

router.get('/part-model-library', asyncHandler(async (req, res) => {
  const workshopCode = normalizeWorkshopCode(req.query.workshopCode, '');
  const search = String(req.query.search || '').trim();
  const where = ['COALESCE(p.active, 1) = 1'];
  const params = [];
  if (workshopCode) {
    where.push("COALESCE(i.workshop_code, 'raw_grain') = ?");
    params.push(workshopCode);
  }
  if (search) {
    where.push('(p.code LIKE ? OR p.name LIKE ? OR p.spec LIKE ? OR c.name LIKE ? OR cm.name LIKE ?)');
    const keyword = `%${search}%`;
    params.push(keyword, keyword, keyword, keyword, keyword);
  }
  const [rows] = await pool.query(
    `SELECT p.id, p.code, p.name, p.spec, p.brand, p.unit, p.image_url AS imageUrl,
            p.model_url AS modelUrl, p.model_scale AS modelScale,
            p.category_model_id AS categoryModelId, cm.name AS categoryModelName,
            cm.model_url AS categoryModelUrl, cm.model_scale AS categoryModelScale,
            p.category_id AS categoryId, c.name AS categoryName,
            COALESCE(i.workshop_code, 'raw_grain') AS workshopCode,
            i.quantity AS stock, i.shelf, i.location AS locationCode
     FROM parts p
     LEFT JOIN inventory i ON i.part_id = p.id AND COALESCE(i.active, 1) = 1
     LEFT JOIN categories c ON c.id = p.category_id
     LEFT JOIN part_category_models cm ON cm.id = p.category_model_id AND cm.active=1
     WHERE ${where.join(' AND ')}
     ORDER BY p.code ASC`,
    params
  );
  res.json({ success: true, data: rows });
}));

function parsePartIds(value) {
  let source = value;
  if (typeof value === 'string') {
    try { source = JSON.parse(value); } catch { source = value.split(','); }
  }
  const ids = [...new Set((Array.isArray(source) ? source : []).map(Number).filter(id => Number.isInteger(id) && id > 0))];
  if (!ids.length) throw new ApiError(400, '请至少选择一个备件');
  if (ids.length > 500) throw new ApiError(400, '单次最多处理500个备件');
  return ids;
}

router.post('/parts/batch-model', requireAnyWorkshopEditor, (req, res, next) => {
  glbUpload(req, res, async error => {
    if (error) return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ success: false, msg: error.message || '模型上传失败' });
    if (!req.file) return res.status(400).json({ success: false, msg: '请选择GLB/GLTF文件' });
    try {
      const partIds = parsePartIds(req.body?.partIds);
      for (const partId of partIds) await assertPartAssetWrite(req.user, partId);
      const modelUrl = `/uploads/part-images/glb/${req.file.filename}`;
      const modelScale = Math.min(Math.max(Number(req.body?.modelScale) || 1, 0.1), 10);
      const placeholders = partIds.map(() => '?').join(',');
      const [result] = await pool.query(
        `UPDATE parts SET model_url=?,model_scale=? WHERE active=1 AND id IN (${placeholders})`,
        [modelUrl, modelScale, ...partIds]
      );
      res.json({ success: true, msg: `已为${result.affectedRows}个备件关联专用模型`, data: { affected: result.affectedRows, modelUrl, modelScale } });
    } catch (err) {
      fs.promises.unlink(req.file.path).catch(() => {});
      next(err);
    }
  });
});

router.post('/parts/batch-category-model', requireAnyWorkshopEditor, asyncHandler(async (req, res) => {
  const partIds = parsePartIds(req.body?.partIds);
  const categoryModelId = req.body?.categoryModelId == null || req.body.categoryModelId === ''
    ? null
    : positiveInt(req.body.categoryModelId, 1, Number.MAX_SAFE_INTEGER);
  if (req.body?.categoryModelId != null && req.body.categoryModelId !== '' && !categoryModelId) throw new ApiError(400, '类别模型无效');
  if (categoryModelId) {
    const [[model]] = await pool.query('SELECT id FROM part_category_models WHERE id=? AND active=1', [categoryModelId]);
    if (!model) throw new ApiError(404, '类别模型不存在或已删除');
  }
  for (const partId of partIds) await assertPartAssetWrite(req.user, partId);
  const placeholders = partIds.map(() => '?').join(',');
  const [result] = await pool.query(
    `UPDATE parts SET category_model_id=? WHERE active=1 AND id IN (${placeholders})`,
    [categoryModelId, ...partIds]
  );
  res.json({ success: true, msg: categoryModelId ? `已关联${result.affectedRows}个备件` : `已清除${result.affectedRows}个类别关联`, data: { affected: result.affectedRows } });
}));

const categoryModelStorage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, categoryModelDir),
  filename: (_req, file, callback) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!['.glb', '.gltf'].includes(ext)) return callback(new Error('仅支持 GLB/GLTF 文件'));
    callback(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
  }
});
const categoryModelUpload = multer({
  storage: categoryModelStorage,
  limits: { fileSize: 50 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    const ok = ['.glb', '.gltf'].includes(path.extname(file.originalname).toLowerCase());
    callback(ok ? null : new Error('仅支持 GLB/GLTF 文件'), ok);
  }
}).single('model');

function categoryModelPayload(body, requireName = true) {
  const name = String(body?.name || '').trim().slice(0, 80);
  if (requireName && !name) throw new ApiError(400, '请填写类别模型名称');
  return {
    name,
    keywords: String(body?.keywords || '').trim().slice(0, 500) || null,
    description: String(body?.description || '').trim().slice(0, 500) || null,
    modelScale: Math.min(Math.max(Number(body?.modelScale) || 1, 0.1), 10)
  };
}

router.get('/part-category-models', asyncHandler(async (req, res) => {
  const search = String(req.query?.search || '').trim();
  const params = [];
  const where = ['pcm.active=1'];
  if (search) {
    where.push('(pcm.name LIKE ? OR pcm.keywords LIKE ? OR pcm.description LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  const [rows] = await pool.query(
    `SELECT pcm.id,pcm.name,pcm.keywords,pcm.description,pcm.model_url AS modelUrl,pcm.model_scale AS modelScale,
            pcm.built_in AS builtIn,pcm.created_at AS createdAt,pcm.updated_at AS updatedAt,
            (SELECT COUNT(*) FROM parts p WHERE p.category_model_id=pcm.id AND COALESCE(p.active,1)=1) AS associatedParts
     FROM part_category_models pcm WHERE ${where.join(' AND ')}
     ORDER BY pcm.built_in DESC,pcm.name ASC`,
    params
  );
  res.json({ success: true, data: rows });
}));

router.post('/part-category-models', requireRole('admin'), (req, res, next) => {
  categoryModelUpload(req, res, async error => {
    if (error) return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ success: false, msg: error.message || '模型上传失败' });
    try {
      if (!req.file) throw new ApiError(400, '请选择GLB/GLTF模型文件');
      const data = categoryModelPayload(req.body);
      const modelUrl = `/uploads/part-models/${req.file.filename}`;
      const [result] = await pool.query(
        `INSERT INTO part_category_models (name,keywords,description,model_url,model_scale,built_in,active,created_by)
         VALUES (?,?,?,?,?,0,1,?)`,
        [data.name, data.keywords, data.description, modelUrl, data.modelScale, req.user.id]
      );
      res.status(201).json({ success: true, msg: '类别模型已新增', data: { id: result.insertId, ...data, modelUrl } });
    } catch (err) {
      if (req.file) fs.promises.unlink(req.file.path).catch(() => {});
      next(err);
    }
  });
});

router.put('/part-category-models/:id', requireRole('admin'), (req, res, next) => {
  categoryModelUpload(req, res, async error => {
    if (error) return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ success: false, msg: error.message || '模型上传失败' });
    try {
      const id = positiveInt(req.params.id, 1, Number.MAX_SAFE_INTEGER);
      if (!id) throw new ApiError(400, '类别模型ID无效');
      const [[current]] = await pool.query('SELECT * FROM part_category_models WHERE id=? AND active=1', [id]);
      if (!current) throw new ApiError(404, '类别模型不存在');
      const data = categoryModelPayload(req.body);
      const modelUrl = req.file ? `/uploads/part-models/${req.file.filename}` : current.model_url;
      await pool.query(
        `UPDATE part_category_models SET name=?,keywords=?,description=?,model_url=?,model_scale=? WHERE id=?`,
        [data.name, data.keywords, data.description, modelUrl, data.modelScale, id]
      );
      if (req.file && String(current.model_url || '').startsWith('/uploads/part-models/')) {
        fs.promises.unlink(path.join(categoryModelDir, path.basename(current.model_url))).catch(() => {});
      }
      res.json({ success: true, msg: '类别模型已更新', data: { id, ...data, modelUrl } });
    } catch (err) {
      if (req.file) fs.promises.unlink(req.file.path).catch(() => {});
      next(err);
    }
  });
});

router.delete('/part-category-models/:id', requireRole('admin'), asyncHandler(async (req, res) => {
  const id = positiveInt(req.params.id, 1, Number.MAX_SAFE_INTEGER);
  if (!id) throw new ApiError(400, '类别模型ID无效');
  const connection = await pool.getConnection();
  let current;
  try {
    await connection.beginTransaction();
    [[current]] = await connection.query('SELECT model_url AS modelUrl FROM part_category_models WHERE id=? AND active=1 FOR UPDATE', [id]);
    if (!current) throw new ApiError(404, '类别模型不存在');
    await connection.query('UPDATE parts SET category_model_id=NULL WHERE category_model_id=?', [id]);
    await connection.query('UPDATE part_category_models SET active=0 WHERE id=?', [id]);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
  if (String(current.modelUrl || '').startsWith('/uploads/part-models/')) {
    fs.promises.unlink(path.join(categoryModelDir, path.basename(current.modelUrl))).catch(() => {});
  }
  res.json({ success: true, msg: '类别模型已删除，原关联备件已恢复为通用模型' });
}));

router.post('/parts/batch-images', requireAnyWorkshopEditor, asyncHandler(async (req, res) => {
  const updates = Array.isArray(req.body?.updates) ? req.body.updates : [];
  if (!updates.length) throw new ApiError(400, '没有需要更新的数据');
  let affected = 0;
  for (const item of updates) {
    const partId = Number(item.partId);
    const imageUrl = item.imageUrl === null ? null : String(item.imageUrl || '').slice(0, 500);
    if (!Number.isInteger(partId) || partId < 1) continue;
    await assertPartAssetWrite(req.user, partId);
    const [result] = await pool.query('UPDATE parts SET image_url=? WHERE id=? AND active=1', [imageUrl, partId]);
    if (result.affectedRows) affected++;
  }
  res.json({ success: true, msg: `已更新 ${affected} 个备件图片`, data: { affected } });
}));

module.exports = router;
