const express = require('express');
const crypto = require('crypto');
const { createWarehouseArea, listWarehouseAreas } = require('../warehouse-areas');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const ExcelJS = require('exceljs');
const { readSheet: readXlsxFile } = require('read-excel-file/node');
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
const { workshopImportSchema, makePartsTemplate, makePartsErrorWorkbook, makeModelBindingsTemplate, sendXlsx } = require('../import-workbook');
const { duplicateLocationErrors } = require('../part-import-validation');
const { changedSharedDescriptors } = require('../part-import-identity');
const { deleteParts } = require('../part-deletion');
const { modelId, assertModelWrite, resolveModel, bindPartModel, validateLedgerModels } = require('../model-bindings');
const { readModelLedger, planModelLedger } = require('../model-ledger-import');
const { assertAssetScope, withPartAssetWrite } = require('../part-asset-permissions');
const { summarizeInventory, summarizeInventoryScopes } = require('../inventory-metrics');
const { warehouseJoin } = require('../warehouse-join');
const WAREHOUSE_JOIN = warehouseJoin();

async function inventoryMetrics(query) {
  const where = buildPartWhere(query);
  const [rows] = await pool.query(`SELECT p.id AS partId,p.part_type AS partType,i.quantity,
    ${UNIT_SQL} AS unit,${PRICE_SQL} AS price,${SAFETY_STOCK_SQL} AS safetyStock,
    COALESCE(i.workshop_code,w.workshop_code,'raw_grain') AS workshopCode,
    COALESCE(w.name,i.warehouse,'未指定货区') AS warehouseAreaName
    FROM inventory i INNER JOIN parts p ON p.id=i.part_id
    ${WAREHOUSE_JOIN} ${where.sql}`, where.params);
  const metrics = summarizeInventory(rows);
  const workshopNames = Object.fromEntries(WORKSHOPS.map(item => [item.code, item.name]));
  return { ...metrics, scopeBreakdown: summarizeInventoryScopes(rows, workshopNames) };
}

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
            (SELECT GROUP_CONCAT(DISTINCT COALESCE(owner.workshop_code,'raw_grain')) FROM inventory owner WHERE owner.part_id=p.id AND COALESCE(owner.active,1)=1) AS assetWorkshopCodes,
         p.brand, ${SAFETY_STOCK_SQL} AS safetyStock, ${SAFETY_STOCK_SQL} AS reorderPoint,
         ${MAX_STOCK_SQL} AS maxStock, p.part_type AS partType,
         p.usage_description AS usageDescription, ${PRICE_SQL} AS price, p.remark,
         p.image_url AS partImageUrl, COALESCE(NULLIF(p.image_url,''),cm.image_url) AS imageUrl,
         CASE WHEN NULLIF(p.image_url,'') IS NOT NULL THEN 'part' WHEN cm.image_url IS NOT NULL THEN 'category' ELSE 'none' END AS imageSource,
         NULL AS modelUrl, 1 AS modelScale,
         p.bound_model_id AS categoryModelId, cm.name AS categoryModelName, cm.quality AS modelQuality,
         cm.model_url AS categoryModelUrl, cm.image_url AS categoryImageUrl, COALESCE(cm.model_scale,1) AS categoryModelScale,
         COALESCE(cm.front_rotation_y,0) AS categoryFrontRotationY,
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
  LEFT JOIN part_models cm ON cm.id = p.bound_model_id AND cm.active = 1
  ${WAREHOUSE_JOIN}
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
    for (const [field, aliases] of [['订购点', ['订购点','安全库存']], ['最高储备', ['最高储备','最高库存']], ['不含税单价', ['不含税单价','单价']]]) {
      const raw = firstLedgerValue(row, aliases);
      const number = ledgerNumber(raw);
      if (ledgerText(raw) && (number === null || number < 0)) errors.push({ row: index + 1, field, reason: '必须是大于或等于0的有效数字', suggestion: '填写0或正数；未知时留空表示未配置' });
    }
    const totalStock = Math.max(0, stockValue || 0);
    records.push({
      materialCode,
      materialDesc,
      unit: ledgerText(firstLedgerValue(row, ['单位'])) || '个',
      spec: ledgerText(firstLedgerValue(row, ['规格型号', '规格'])) || null,
      modelName: ledgerText(firstLedgerValue(row, ['模型名称'])) || null,
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
  const [rows] = await pool.query("SELECT COALESCE(workshop_code,'raw_grain') AS workshopCode FROM inventory WHERE part_id=? AND COALESCE(active,1)=1", [partId]);
  assertAssetScope(user, rows.map(row => row.workshopCode));
}

router.get('/parts/model-bindings/template', requireAnyWorkshopEditor, asyncHandler(async (req, res) => {
  const [models] = await pool.query('SELECT id,name FROM part_models WHERE active=1 ORDER BY id');
  sendXlsx(res, '模型名称绑定导入模板.xlsx', await makeModelBindingsTemplate(models));
}));

router.post('/parts/model-bindings/preview', requireAnyWorkshopEditor, partLedgerUpload, asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, '请选择含模型名称的资料表');
  const plan = await planModelLedger(pool, req.user, await readModelLedger(req.file.buffer));
  res.json({ success: !plan.errors.length, msg: plan.errors.length ? '发现错误，尚未写入' : `校验通过，将修改${plan.changed}个绑定，库存不变`, data: plan });
}));
router.post('/parts/model-bindings/import', requireAnyWorkshopEditor, partLedgerUpload, asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, '请选择含模型名称的资料表');
  const records = await readModelLedger(req.file.buffer);
  const plan = await planModelLedger(pool, req.user, records);
  if (plan.errors.length) throw new ApiError(422, '模型绑定校验失败，未写入任何数据', plan);
  const updates = plan.items.filter(item => !item.preserve);
  if (updates.length) await withPartAssetWrite(pool, req.user, updates.map(item => item.partId), async connection => {
    // Recheck codes/names under the part locks: a preview is not authorization
    // to overwrite a different master after a concurrent code/name edit.
    for (const item of updates) {
      const [[part]] = await connection.query('SELECT code FROM parts WHERE id=?', [item.partId]);
      if (part.code !== item.code) throw new ApiError(409, '物料编码已变化，请重新校验');
      await bindPartModel(connection, req.user, item.partId, { name: item.modelName });
    }
  });
  res.json({ success: true, msg: `已导入${updates.length}个模型绑定；未修改库存、价格、库位和备件主信息`, data: { affected: updates.length, preserved: plan.preserved } });
}));

function buildMovementWhere(query) {
  const conditions = [];
  const params = [];
  const allowedTypes = new Set(['in', 'out', 'inventory_adjustment', 'initial']);
  const activeOnly = String(query.activeOnly) === '1';
  if (activeOnly) {
    const scope = buildPartWhere(query);
    conditions.push(`i.id IN (SELECT i.id FROM inventory i INNER JOIN parts p ON p.id=i.part_id ${WAREHOUSE_JOIN} ${scope.sql})`);
    params.push(...scope.params);
  }

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
  if (query.searchKeyword && !activeOnly) {
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
  if (query.warehouseAreaName) {
    conditions.push('(w.name = ? OR i.warehouse = ?)');
    params.push(String(query.warehouseAreaName), String(query.warehouseAreaName));
  }
  if (query.partType) {
    conditions.push("COALESCE(NULLIF(TRIM(p.part_type),''),'未填写') = ?");
    params.push(String(query.partType));
  }
  if (['1', 'true'].includes(String(query.lowStock))) conditions.push(`${SAFETY_STOCK_SQL} IS NOT NULL AND i.quantity <= ${SAFETY_STOCK_SQL}`);
  if (query.stockStatus === 'zero') conditions.push('i.quantity <= 0');
  if (query.stockStatus === 'low') conditions.push(`i.quantity > 0 AND ${SAFETY_STOCK_SQL} IS NOT NULL AND i.quantity <= ${SAFETY_STOCK_SQL}`);
  if (query.stockStatus === 'normal') conditions.push(`i.quantity > 0 AND ${SAFETY_STOCK_SQL} IS NOT NULL AND i.quantity > ${SAFETY_STOCK_SQL}`);
  if (query.stockStatus === 'unconfigured') conditions.push(`i.quantity > 0 AND ${SAFETY_STOCK_SQL} IS NULL`);

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
       ${WAREHOUSE_JOIN} ${where.sql}`,
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

router.get('/parts/export', requireAnyWorkshopEditor, asyncHandler(async (req, res) => {
  const where = buildPartWhere(req.query);
  const orderSql = SORT_SQL[req.query.sort] || SORT_SQL.name;
  const [rows] = await pool.query(`${PART_SELECT} ${where.sql} ORDER BY ${orderSql}`, where.params);
  const columns = ['物料编码','物料名称','单位','规格型号','库存量','订购点','最高储备','不含税单价','备件类型','货区','六位库位码','存放位置','用途','备注','模型名称'];
  const workbook = new ExcelJS.Workbook();
  workbook.creator = '备件管理中心';
  const sheet = workbook.addWorksheet('备件台账', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = columns.map((header, index) => ({ header, key: `c${index}`, width: Math.max(14, Math.min(36, header.length * 3 + 5)) }));
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB91C2B' } };
  sheet.autoFilter = { from: 'A1', to: `${sheet.getColumn(columns.length).letter}1` };
  for (const row of rows) {
    const part = toPart(row);
    sheet.addRow([part.materialCode, part.materialDesc, part.unit, part.spec, part.totalStock, part.reorderPoint ?? '', part.maxStock ?? '', part.price ?? '', part.partType, part.warehouseAreaName, part.locationType === 'shelf' ? part.locationCode : '', part.locationType === 'free_text' ? (part.locationNote || '') : '', part.usageDescription, part.remark, part.categoryModelName || '']);
  }
  const filename = `备件台账-${new Date().toISOString().slice(0, 10)}.xlsx`;
  res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`, 'Cache-Control': 'no-store' });
  res.send(await workbook.xlsx.writeBuffer());
}));

router.get('/stats', asyncHandler(async (req, res) => {
  const metrics = await inventoryMetrics(req.query);
  const scopedWhere = buildPartWhere(req.query);
  const days = positiveInt(req.query.days, 30, 180);
  const periodStartSql = `DATE_SUB(CURDATE(), INTERVAL ${days - 1} DAY)`;
  const workshopCode = req.query.workshopCode ? normalizeWorkshopCode(req.query.workshopCode) : '';
  const workshopSql = ` AND i.id IN (SELECT i.id FROM inventory i INNER JOIN parts p ON p.id=i.part_id ${WAREHOUSE_JOIN} ${scopedWhere.sql})`;
  const workshopParams = scopedWhere.params;
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
       ${WAREHOUSE_JOIN}
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
       ${WAREHOUSE_JOIN}
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
        totalValue: metrics.totalValue,
        missingPrice: metrics.missingPrice,
        missingReorderPoint: metrics.missingReorderPoint,
        materialCategoryCount: Number(summary.materialCategoryCount) || 0,
        inventoryRecords: Number(summary.inventoryRecords) || 0,
        lowStock: Number(summary.lowStock) || 0,
        zeroStock: Number(summary.zeroStock) || 0,
        lowPositiveStock: Number(summary.lowPositiveStock) || 0,
        healthyStock: Number(summary.healthyStock) || 0,
        unconfiguredStock: Number(summary.unconfiguredStock) || 0
      },
      unitTotals: metrics.unitTotals,
      typeSummaries: metrics.typeSummaries,
      scopeBreakdown: metrics.scopeBreakdown,
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
    ${WAREHOUSE_JOIN}
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
      `SELECT sm.*, p.code AS material_code, p.name AS material_desc, p.spec, ${UNIT_SQL} AS unit,
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
    ${WAREHOUSE_JOIN}`;

  const [[[summary]], [suggestedUnitRows], [rows]] = await Promise.all([
    pool.query(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN i.quantity <= 0 THEN 1 ELSE 0 END) AS zeroStock,
              SUM(CASE WHEN ${MAX_STOCK_SQL} IS NULL THEN 1 ELSE 0 END) AS missingTarget,
              COALESCE(SUM(CASE WHEN ${MAX_STOCK_SQL} IS NOT NULL AND ${PRICE_SQL} IS NOT NULL
                THEN GREATEST(${MAX_STOCK_SQL} - i.quantity, 0) * ${PRICE_SQL}
                ELSE 0 END), 0) AS estimatedAmount,
              COALESCE(SUM(CASE WHEN ${PRICE_SQL} IS NOT NULL THEN i.quantity * ${PRICE_SQL} ELSE 0 END), 0) AS stockAmount
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
      stockAmount: Number(summary.stockAmount) || 0,
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

router.get('/parts/import-template', requireAnyWorkshopEditor, asyncHandler(async (req, res) => {
  const workshopCode = normalizeWorkshopCode(req.query?.workshopCode, 'raw_grain');
  assertWorkshopWrite(req.user, workshopCode);
  const schema = workshopImportSchema(workshopCode);
  const buffer = await makePartsTemplate(workshopCode);
  sendXlsx(res, `${schema.name}备件导入模板.xlsx`, buffer);
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
  for (const [field, label] of [['reorderPoint','订购点'],['maxStock','最高储备'],['price','不含税单价']]) {
    if (data[field] !== '' && data[field] != null) data[field] = parseNonNegativeQuantity(data[field], label);
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [existingParts] = await connection.query(
      'SELECT id,name,spec,part_type,usage_description,remark FROM parts WHERE code = ? LIMIT 1 FOR UPDATE',
      [code]
    );
    const existingPart = existingParts.length > 0;
    let partId;
    if (existingPart) {
      partId = existingParts[0].id;
      let sharedMaster = false;
      if (req.user.role !== 'admin') {
        const [[otherUse]] = await connection.query(
          `SELECT COUNT(*) AS total FROM inventory WHERE part_id=? AND COALESCE(active,1)=1
           AND COALESCE(workshop_code,'raw_grain')<>?`,
          [partId, workshopCode]
        );
        sharedMaster = Number(otherUse.total) > 0;
        if (sharedMaster && changedSharedDescriptors(existingParts[0], {
          materialDesc: name,
          spec: optionalValue(data.spec),
          partType: optionalValue(data.partType),
          usageDescription: optionalValue(data.usageDescription)
        }).length) {
          throw new ApiError(403, '该物料被其他车间使用，主信息只能由总管理员修改；请保留原主信息后新增本车间库位');
        }
      }
      // A local unit/price/threshold belongs to this new inventory record; do
      // not change shared defaults used by another workshop's inventory.
      if (!sharedMaster) {
        await connection.query(
          `UPDATE parts SET active=1, name=?, spec=COALESCE(?, spec), unit=COALESCE(?, unit),
            part_type=COALESCE(?, part_type), usage_description=COALESCE(?, usage_description)
           WHERE id=?`,
          [name, optionalValue(data.spec), optionalValue(data.unit), optionalValue(data.partType), optionalValue(data.usageDescription), partId]
        );
      }
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

    if (Object.hasOwn(data, 'modelId')) await bindPartModel(connection, req.user, partId, data.modelId, workshopCode);

    const warehouse = await resolveWarehouse(connection, data);
    const locationCode = optionalValue(data.locationCode);
    const locationType = data.locationType === 'free_text' ? 'free_text' : 'shelf';
    const locationNote = optionalValue(data.locationNote);
    const shelf = optionalValue(data.shelf);
    const position = optionalValue(data.position);
    const layer = optionalValue(data.layer);
    const location = optionalValue(data.location);
    const [duplicateLocations] = await connection.query(
      `SELECT i.id
       FROM inventory i
       ${warehouseJoin('i', 'existing_warehouse')}
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

router.post('/parts/import-preview', requireAnyWorkshopEditor, partLedgerUpload, asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, '请选择要校验的 .xlsx 台账文件');
  const workshopCode = normalizeWorkshopCode(req.body?.workshopCode, 'raw_grain');
  assertWorkshopWrite(req.user, workshopCode);
  const { records, errors: parseErrors } = await parsePartLedger(req.file.buffer);
  const errors = [...parseErrors, ...await validatePartLedgerLocations(records, workshopCode), ...await validateLedgerModels(pool, records, workshopCode)];
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
  const errors = [...parseErrors, ...await validatePartLedgerLocations(records, workshopCode), ...await validateLedgerModels(pool, records, workshopCode)];
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
  const errors = [...parseErrors, ...await validatePartLedgerLocations(records, workshopCode), ...await validateLedgerModels(pool, records, workshopCode)];
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
      const [[existingPart]] = await connection.query(
        'SELECT id,name,spec,part_type,usage_description,remark FROM parts WHERE code=? LIMIT 1 FOR UPDATE',
        [record.materialCode]
      );
      let sharedMaster = false;
      if (existingPart && req.user.role !== 'admin') {
        const [[otherUse]] = await connection.query(
          `SELECT COUNT(*) AS total FROM inventory WHERE part_id=? AND COALESCE(active,1)=1
           AND COALESCE(workshop_code,'raw_grain')<>?`, [existingPart.id, workshopCode]
        );
        sharedMaster = Number(otherUse.total) > 0;
        if (sharedMaster && changedSharedDescriptors(existingPart, record).length) {
          throw new ApiError(403, `物料 ${record.materialCode} 被其他车间使用，主信息不一致，请由总管理员核对；本次导入全部回滚`);
        }
      }
      if (!sharedMaster) {
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
      }
      const [[part]] = await connection.query('SELECT id FROM parts WHERE code=? LIMIT 1 FOR UPDATE', [record.materialCode]);
      if (record.modelName) await bindPartModel(connection, req.user, part.id, { name: record.modelName }, workshopCode);
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
      const locationType = record.locationCode ? 'shelf' : 'free_text';
      const defaultLocationNote = `${warehouseName}（未提供固定库位码）`;
      const locationNote = record.locationCode ? null : (String(record.locationNote || '').trim() || defaultLocationNote);
      const [existingRows] = await connection.query(
        `SELECT id, quantity FROM inventory
         WHERE part_id=? AND COALESCE(workshop_code, 'raw_grain')=? AND COALESCE(active,1)=1
           AND NULLIF(location,'') <=> ? AND (warehouse=? OR warehouse=?)
           AND (? IS NOT NULL OR COALESCE(NULLIF(TRIM(location_note),''),?)=?)
         ORDER BY id ASC LIMIT 1 FOR UPDATE`,
        [part.id, workshopCode, record.locationCode, warehouseCode, warehouseName,
          record.locationCode, defaultLocationNote, locationNote]
      );
      if (existingRows.length) {
        const pending = await findPendingInventoryOrder(connection, [existingRows[0].id]);
        if (pending) throw new ApiError(409, `物料 ${record.materialCode} 正在盘点中，导入已全部回滚`);
      }
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

router.patch('/parts/:id', requireAnyWorkshopEditor, asyncHandler(async (req, res) => {
  const inventoryId = parseInventoryId(req.params.id);
  const data = req.body || {};
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `SELECT i.part_id AS partId, COALESCE(i.workshop_code,'raw_grain') AS workshopCode,
              p.code, p.name, p.spec, p.unit, p.brand, p.part_type AS partType,
              p.usage_description AS usageDescription, p.remark
       FROM inventory i INNER JOIN parts p ON p.id=i.part_id
       WHERE i.id=? AND COALESCE(i.active,1)=1 AND COALESCE(p.active,1)=1 FOR UPDATE`,
      [inventoryId]
    );
    if (!rows.length) throw new ApiError(404, '备件库存记录不存在或已停用');
    const current = rows[0];
    assertWorkshopWrite(req.user, current.workshopCode);
    const pendingOrder = await findPendingInventoryOrder(connection, [inventoryId]);
    if (pendingOrder) throw new ApiError(409, `该库存正在盘点单${pendingOrder.inventoryNo || pendingOrder.id}中等待审批，暂不能编辑`);

    const code = String(data.materialCode ?? current.code).trim();
    const name = String(data.materialDesc ?? current.name).trim();
    if (!code) throw new ApiError(400, '物料编码不能为空');
    if (!name) throw new ApiError(400, '物料名称不能为空');
    if (code.length > 60 || name.length > 300) throw new ApiError(400, '物料编码或名称超过长度限制');
    const globalValues = {
      code,
      name,
      spec: optionalValue(data.spec),
      unit: optionalValue(data.unit) || '个',
      brand: optionalValue(data.brand),
      partType: optionalValue(data.partType),
      usageDescription: optionalValue(data.usageDescription),
      remark: optionalValue(data.remark)
    };
    const globalChanged = code !== current.code || name !== current.name
      || ['spec', 'brand', 'partType', 'usageDescription', 'remark']
        .some(key => String(globalValues[key] ?? '') !== String(current[key] ?? ''));
    let sharedAcrossWorkshops = false;
    if (req.user.role !== 'admin') {
      const [[usage]] = await connection.query(
        `SELECT COUNT(DISTINCT COALESCE(workshop_code,'raw_grain')) AS workshopCount
         FROM inventory WHERE part_id=? AND COALESCE(active,1)=1`,
        [current.partId]
      );
      sharedAcrossWorkshops = Number(usage.workshopCount) > 1;
      if (globalChanged && sharedAcrossWorkshops) throw new ApiError(403, '该物料被多个车间共用，物料主信息只能由总管理员修改');
    }
    const [codeRows] = await connection.query('SELECT id FROM parts WHERE code=? AND id<>? LIMIT 1', [code, current.partId]);
    if (codeRows.length) throw new ApiError(409, '该物料编码已被其他备件使用');

    const reorderPoint = data.reorderPoint === '' || data.reorderPoint == null ? null : parseNonNegativeQuantity(data.reorderPoint, '订购点');
    const maxStock = data.maxStock === '' || data.maxStock == null ? null : parseNonNegativeQuantity(data.maxStock, '最高储备');
    const price = data.price === '' || data.price == null ? null : parseNonNegativeQuantity(data.price, '不含税单价');
    if (reorderPoint !== null && maxStock !== null && maxStock < reorderPoint) throw new ApiError(400, '最高储备不能低于订购点');

    const locationType = data.locationType === 'free_text' ? 'free_text' : 'shelf';
    const locationCode = locationType === 'shelf' ? String(data.locationCode || '').trim() : '';
    let shelf = null;
    let position = null;
    let layer = null;
    let slot = null;
    if (locationCode) {
      if (!/^\d{6}$/.test(locationCode)) throw new ApiError(400, '六位库位码必须是6位数字');
      shelf = Number(locationCode.slice(0, 2));
      position = Number(locationCode.slice(2, 3));
      layer = Number(locationCode.slice(3, 4));
      slot = Number(locationCode.slice(4, 6));
      if (shelf < 1 || ![1, 2].includes(position) || layer < 1 || layer > 4 || slot < 1) {
        throw new ApiError(400, '六位库位码中的货架、方位、层数或货位无效');
      }
      const [occupied] = await connection.query(
        `SELECT i.id, p.code FROM inventory i INNER JOIN parts p ON p.id=i.part_id
         WHERE i.id<>? AND COALESCE(i.workshop_code,'raw_grain')=?
           AND COALESCE(i.active,1)=1 AND NULLIF(i.location,'')=? LIMIT 1 FOR UPDATE`,
        [inventoryId, current.workshopCode, locationCode]
      );
      if (occupied.length) throw new ApiError(409, `库位${locationCode}已被物料${occupied[0].code}占用`);
    }
    const warehouse = await resolveWarehouse(connection, { ...data, workshopCode: current.workshopCode });

    await connection.query(
      `UPDATE parts SET code=?,name=?,spec=?,unit=?,brand=?,part_type=?,usage_description=?,remark=? WHERE id=?`,
      [globalValues.code, globalValues.name, globalValues.spec, sharedAcrossWorkshops ? current.unit : globalValues.unit, globalValues.brand,
        globalValues.partType, globalValues.usageDescription, globalValues.remark, current.partId]
    );
    await connection.query(
      `UPDATE inventory SET warehouse=?,location=?,shelf=?,direction=?,layer=?,slot=?,location_type=?,location_note=?,
              unit_override=?,safety_stock_override=?,max_stock_override=?,price_override=? WHERE id=?`,
      [warehouse.code, locationCode || null, shelf, position, layer, slot, locationType,
        locationType === 'free_text' ? optionalValue(data.locationNote) : null,
        globalValues.unit, reorderPoint, maxStock, price, inventoryId]
    );
    if (Object.hasOwn(data, 'modelId')) await bindPartModel(connection, req.user, current.partId, data.modelId, current.workshopCode);
    const [updatedRows] = await connection.query(`${PART_SELECT} WHERE i.id=? LIMIT 1`, [inventoryId]);
    await connection.commit();
    res.json({ success: true, msg: '备件信息已保存', data: toPart(updatedRows[0]) });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

router.post('/parts/batch-delete', requireAnyWorkshopEditor, asyncHandler(async (req, res) => {
  const data = await deleteParts(pool, req.user, req.body?.ids, { dryRun: req.body?.dryRun === true });
  res.json({ success: true, msg: req.body?.dryRun === true ? '删除条件已校验' : `已删除${data.deletedCount}条备件，历史流水已保留`, data });
}));

router.delete('/parts/:id', requireAnyWorkshopEditor, asyncHandler(async (req, res) => {
  const data = await deleteParts(pool, req.user, [req.params.id]);
  res.json({ success: true, msg: '备件记录已停用，历史流水已保留', data });
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

router.get('/warehouse-areas', asyncHandler(async (req, res) => {
  res.json({ success: true, data: await listWarehouseAreas(pool, req.query.workshopCode) });
}));

router.post('/warehouse-areas', requireAnyWorkshopEditor, asyncHandler(async (req, res) => {
  res.json({ success: true, data: await createWarehouseArea(pool, req.user, req.body) });
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
     ${WAREHOUSE_JOIN}
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
  const metrics = await inventoryMetrics(req.query);
  const where = buildPartWhere(req.query);
  const assignedWorkshop = req.user?.role === 'admin' ? ''
    : workshopForRole(req.user?.role) || req.user?.workshopCode || '';
  const requestedWorkshop = req.query.workshopCode ? normalizeWorkshopCode(req.query.workshopCode) : '';
  const pendingWorkshop = assignedWorkshop || requestedWorkshop;
  const canSeePending = req.user?.role === 'admin'
    || (Boolean(assignedWorkshop) && (!requestedWorkshop || requestedWorkshop === assignedWorkshop));
  const [[lowRows], [[pendingRow]]] = await Promise.all([
    pool.query(`${PART_SELECT} ${where.sql} AND ${SAFETY_STOCK_SQL} IS NOT NULL AND i.quantity <= ${SAFETY_STOCK_SQL} ORDER BY i.quantity ASC,i.id ASC LIMIT 3`, where.params),
    canSeePending
      ? pool.query(`SELECT COUNT(*) AS pendingApproval FROM inventory_orders WHERE approveStatus = '待审批'${pendingWorkshop ? ' AND workshop_code = ?' : ''}`,
        pendingWorkshop ? [pendingWorkshop] : [])
      : Promise.resolve([[{ pendingApproval: 0 }]])
  ]);
  res.json({ success:true, data:{ dashboard:{ ...metrics, totalStock: metrics.unitTotals.length === 1 ? metrics.unitTotals[0].total : null, pendingApproval:Number(pendingRow.pendingApproval)||0 }, lowStockParts:lowRows.map(toPart) } });
}));

const partImageDir = config.parts.uploadDir;
const categoryModelDir = config.parts.modelDir;
const categoryImageDir = path.join(partImageDir, 'categories');
fs.mkdirSync(partImageDir, { recursive: true });
fs.mkdirSync(categoryModelDir, { recursive: true });
fs.mkdirSync(categoryImageDir, { recursive: true });

const IMAGE_EXTENSIONS = /^\.(jpe?g|png|webp|gif|bmp)$/i;

function imageExtension(file) {
  return path.extname(file?.originalname || file?.filename || '').toLowerCase();
}

function isSupportedImageFile(file) {
  return IMAGE_EXTENSIONS.test(imageExtension(file));
}

async function assertValidImage(file) {
  const handle = await fs.promises.open(file.path, 'r');
  try {
    const header = Buffer.alloc(12);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    let detected = '';
    if (bytesRead >= 8 && header.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) detected = '.png';
    else if (bytesRead >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) detected = '.jpg';
    else if (bytesRead >= 6 && ['GIF87a', 'GIF89a'].includes(header.toString('ascii', 0, 6))) detected = '.gif';
    else if (bytesRead >= 12 && header.toString('ascii', 0, 4) === 'RIFF' && header.toString('ascii', 8, 12) === 'WEBP') detected = '.webp';
    else if (bytesRead >= 2 && header.toString('ascii', 0, 2) === 'BM') detected = '.bmp';
    if (!detected) throw new ApiError(400, '图片内容无效，仅支持 JPG、PNG、WEBP、GIF 或 BMP；不支持 SVG');
    const declared = imageExtension(file);
    const compatible = detected === declared || (detected === '.jpg' && declared === '.jpeg');
    if (!compatible) throw new ApiError(400, '图片内容与文件扩展名不一致，请使用原始图片文件');
    return detected;
  } finally {
    await handle.close();
  }
}

function uploadedCategoryFiles(req) {
  return {
    model: req.files?.model?.[0] || null,
    image: req.files?.image?.[0] || null
  };
}

async function removeUploadedFiles(files) {
  await Promise.all((Array.isArray(files) ? files : [files]).filter(Boolean).map(file => fs.promises.unlink(file.path).catch(() => {})));
}

function uploadedPartImagePath(url) {
  const prefix = '/uploads/part-images/';
  const value = String(url || '');
  if (!value.startsWith(prefix)) return null;
  const relative = value.slice(prefix.length);
  if (!relative || relative.includes('/') || path.basename(relative) !== relative) return null;
  return path.join(partImageDir, relative);
}

function uploadedCategoryImagePath(url) {
  const prefix = '/uploads/part-images/categories/';
  const value = String(url || '');
  if (!value.startsWith(prefix)) return null;
  const relative = value.slice(prefix.length);
  if (!relative || relative.includes('/') || path.basename(relative) !== relative) return null;
  return path.join(categoryImageDir, relative);
}

function uploadedCategoryModelPath(url) {
  const prefix = '/uploads/part-models/';
  const value = String(url || '');
  if (!value.startsWith(prefix)) return null;
  const relative = value.slice(prefix.length);
  if (!relative || relative.includes('/') || path.basename(relative) !== relative) return null;
  return path.join(categoryModelDir, relative);
}

const partImageStorage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, partImageDir),
  filename: (_req, file, callback) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!IMAGE_EXTENSIONS.test(ext)) return callback(new Error('仅支持 JPG、PNG、WEBP、GIF 或 BMP 图片；不支持 SVG'));
    callback(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
  }
});

const partImageUpload = multer({
  storage: partImageStorage,
  limits: { fileSize: config.parts.maxFileSize, files: 1 },
  fileFilter: (_req, file, callback) => {
    const ok = isSupportedImageFile(file);
    callback(ok ? null : new Error('仅支持 JPG、PNG、WEBP、GIF 或 BMP 图片；不支持 SVG'), ok);
  }
}).single('image');

router.post('/parts/:partId/image', requireAnyWorkshopEditor, asyncHandler(async (req, res) => {
  const partId = positiveInt(req.params.partId, 0, Number.MAX_SAFE_INTEGER);
  if (!partId) throw new ApiError(400, '备件ID无效');
  await assertPartAssetWrite(req.user, partId);
  partImageUpload(req, res, async error => {
    if (error) return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ success: false, msg: error.message || '图片上传失败' });
    if (!req.file) return res.status(400).json({ success: false, msg: '请选择图片文件' });
    try {
      await assertValidImage(req.file);
      let previousImageUrl;
      const imageUrl = `/uploads/part-images/${req.file.filename}`;
      await withPartAssetWrite(pool, req.user, [partId], async connection => {
        const [[part]]=await connection.query('SELECT image_url FROM parts WHERE id=?',[partId]);
        previousImageUrl=part.image_url;
        return connection.query('UPDATE parts SET image_url=? WHERE id=?',[imageUrl,partId]);
      });
      const previousPath = uploadedPartImagePath(previousImageUrl);
      if (previousPath && previousPath !== req.file.path) await fs.promises.unlink(previousPath).catch(() => {});
      res.json({ success: true, msg: '实物图片已上传', data: { imageUrl, imageSource: 'part' } });
    } catch (cause) {
      await removeUploadedFiles(req.file);
      if (cause instanceof ApiError) return res.status(cause.status || 400).json({ success: false, msg: cause.message });
      return res.status(500).json({ success: false, msg: '保存失败' });
    }
  });
}));

router.delete('/parts/:partId/image', requireAnyWorkshopEditor, asyncHandler(async (req, res) => {
  const partId = positiveInt(req.params.partId, 0, Number.MAX_SAFE_INTEGER);
  if (!partId) throw new ApiError(400, '备件ID无效');
  await assertPartAssetWrite(req.user, partId);
  let previousImageUrl;
  await withPartAssetWrite(pool, req.user, [partId], async connection=>{
    const [[part]]=await connection.query('SELECT image_url FROM parts WHERE id=?',[partId]);
    previousImageUrl=part.image_url;
    return connection.query('UPDATE parts SET image_url=NULL WHERE id=?',[partId]);
  });
  const ownedPath = uploadedPartImagePath(previousImageUrl);
  if (ownedPath) await fs.promises.unlink(ownedPath).catch(() => {});
  res.json({ success: true, msg: '实物图片已删除；如已绑定类别模型，将继续显示类别参考图' });
}));

function modelUploadError(error) {
  return error?.code === 'LIMIT_FILE_SIZE' ? {status:413,msg:'模型文件超过50MB，请压缩后重新上传'} : {status:400,msg:error?.message || '模型上传失败'};
}

async function assertValidGlb(file) {
  const handle = await fs.promises.open(file.path, 'r');
  try {
    const header = Buffer.alloc(12);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    if (bytesRead !== 12 || header.toString('ascii', 0, 4) !== 'glTF') {
      throw new ApiError(400, 'GLB文件无效：文件头不正确，可能只是修改了扩展名');
    }
    if (header.readUInt32LE(4) !== 2) throw new ApiError(400, '仅支持GLB 2.0格式');
    if (header.readUInt32LE(8) !== Number(file.size)) throw new ApiError(400, 'GLB文件不完整：声明长度与实际文件大小不一致');
  } finally {
    await handle.close();
  }
}

// Dedicated per-part geometry is retired. Keep legacy data untouched for rollback.
router.all(['/parts/:partId/model', '/parts/:partId/model-scale'], (_req, res) => {
  res.status(410).json({success:false,msg:'专用模型功能已停用，请使用类别模型关联'});
});

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
    `SELECT p.id, p.code, p.name, p.spec, p.brand, p.unit,
            p.image_url AS partImageUrl,
            COALESCE(NULLIF(p.image_url,''),cm.image_url) AS imageUrl,
            CASE WHEN NULLIF(p.image_url,'') IS NOT NULL THEN 'part' WHEN cm.image_url IS NOT NULL THEN 'category' ELSE 'none' END AS imageSource,
            NULL AS modelUrl, 1 AS modelScale,
            p.bound_model_id AS categoryModelId, cm.name AS categoryModelName, cm.quality AS modelQuality,
            cm.model_url AS categoryModelUrl, cm.model_scale AS categoryModelScale,
            cm.image_url AS categoryImageUrl, COALESCE(cm.front_rotation_y,0) AS categoryFrontRotationY,
            p.category_id AS categoryId, c.name AS categoryName,
            (SELECT GROUP_CONCAT(DISTINCT COALESCE(owner.workshop_code,'raw_grain')) FROM inventory owner WHERE owner.part_id=p.id AND COALESCE(owner.active,1)=1) AS assetWorkshopCodes,
            COALESCE(i.workshop_code, 'raw_grain') AS workshopCode,
            i.quantity AS stock, i.shelf, i.location AS locationCode
     FROM parts p
     LEFT JOIN inventory i ON i.part_id = p.id AND COALESCE(i.active, 1) = 1
     LEFT JOIN categories c ON c.id = p.category_id
     LEFT JOIN part_models cm ON cm.id = p.bound_model_id AND cm.active=1
     WHERE ${where.join(' AND ')}
     ORDER BY p.code ASC`,
    params
  );
  const byPart = new Map();
  for (const row of rows) {
    const key = String(row.id);
    const existing = byPart.get(key);
    if (!existing) {
      byPart.set(key, { ...row, workshopCodes: String(row.assetWorkshopCodes || row.workshopCode || '').split(',').filter(Boolean) });
      continue;
    }
    if (row.workshopCode && !existing.workshopCodes.includes(row.workshopCode)) existing.workshopCodes.push(row.workshopCode);
  }
  res.json({ success: true, data: [...byPart.values()] });
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

router.post('/parts/batch-model', requireAnyWorkshopEditor, asyncHandler(async (req, res) => {
  const partIds = parsePartIds(req.body?.partIds);
  if (!Object.hasOwn(req.body || {}, 'modelId')) throw new ApiError(400, '请选择模型或明确解除绑定');
  const id = modelId(req.body.modelId);
  await withPartAssetWrite(pool, req.user, partIds, async connection => {
    for (const partId of partIds) await bindPartModel(connection, req.user, partId, id, workshopForRole(req.user.role));
  });
  res.json({ success: true, msg: id ? `已绑定${partIds.length}个备件` : `已解除${partIds.length}个模型绑定`, data: { affected: partIds.length } });
}));

const categoryModelStorage = multer.diskStorage({
  destination: (_req, file, callback) => {
    if (file.fieldname === 'model') return callback(null, categoryModelDir);
    if (file.fieldname === 'image') return callback(null, categoryImageDir);
    return callback(new Error('上传字段无效'));
  },
  filename: (_req, file, callback) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (file.fieldname === 'model' && ext !== '.glb') return callback(new Error('仅支持自包含GLB文件；请先把GLTF及其BIN、贴图打包导出为GLB'));
    if (file.fieldname === 'image' && !IMAGE_EXTENSIONS.test(ext)) return callback(new Error('类别参考图仅支持 JPG、PNG、WEBP、GIF 或 BMP；不支持 SVG'));
    callback(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
  }
});
const categoryModelUpload = multer({
  storage: categoryModelStorage,
  limits: { fileSize: 50 * 1024 * 1024, files: 2 },
  fileFilter: (_req, file, callback) => {
    if (file.fieldname === 'model') {
      const ok = path.extname(file.originalname).toLowerCase() === '.glb';
      return callback(ok ? null : new Error('仅支持自包含GLB文件；请先把GLTF及其BIN、贴图打包导出为GLB'), ok);
    }
    if (file.fieldname === 'image') {
      const ok = isSupportedImageFile(file);
      return callback(ok ? null : new Error('类别参考图仅支持 JPG、PNG、WEBP、GIF 或 BMP；不支持 SVG'), ok);
    }
    return callback(new Error('上传字段无效'));
  }
}).fields([{ name: 'model', maxCount: 1 }, { name: 'image', maxCount: 1 }]);

function normalizeFrontRotation(value, fallback = 0) {
  const angle = Number(value);
  if (!Number.isFinite(angle)) return Number(fallback) || 0;
  const fullTurn = Math.PI * 2;
  const normalized = ((angle + Math.PI) % fullTurn + fullTurn) % fullTurn - Math.PI;
  return Math.abs(normalized) < 1e-10 ? 0 : normalized;
}

function categoryModelPayload(body, requireName = true, fallback = {}) {
  const name = String(body?.name ?? fallback.name ?? '').trim().slice(0, 80);
  if (requireName && !name) throw new ApiError(400, '请填写类别模型名称');
  const rawScale = body?.modelScale ?? fallback.model_scale ?? 1;
  return {
    name,
    keywords: String(body?.keywords || '').trim().slice(0, 500) || null,
    description: String(body?.description || '').trim().slice(0, 500) || null,
    modelScale: Math.min(Math.max(Number(rawScale) || 1, 0.1), 10),
    frontRotationY: normalizeFrontRotation(body?.frontRotationY, fallback.front_rotation_y)
  };
}

// Retired routes cannot interpret cached legacy numeric IDs as new model IDs.
router.all(['/part-category-models', '/part-category-models/:id', '/parts/batch-category-model', '/part-category-model-matches/preview', '/part-category-model-matches/apply'], requireAnyWorkshopEditor, (_req, res) => {
  res.status(410).json({ success: false, msg: '旧模型匹配已停用，请刷新页面后按模型名称绑定' });
});

router.get('/part-models', asyncHandler(async (req, res) => {
  const search = String(req.query?.search || '').trim();
  const params = [];
  const where = ['pcm.active=1'];
  if (search) {
    where.push('(pcm.name LIKE ? OR pcm.keywords LIKE ? OR pcm.description LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  const [rows] = await pool.query(
    `SELECT pcm.id,pcm.name,pcm.keywords,pcm.description,pcm.model_url AS modelUrl,pcm.image_url AS imageUrl,
            pcm.model_scale AS modelScale,COALESCE(pcm.front_rotation_y,0) AS frontRotationY,
            pcm.workshop_code AS workshopCode,pcm.quality AS quality,pcm.built_in AS builtIn,pcm.created_at AS createdAt,pcm.updated_at AS updatedAt,
            (SELECT COUNT(*) FROM parts p WHERE p.bound_model_id=pcm.id AND COALESCE(p.active,1)=1) AS associatedParts
     FROM part_models pcm WHERE ${where.join(' AND ')}
     ORDER BY pcm.id ASC`,
    params
  );
  res.json({ success: true, data: rows });
}));

router.post('/part-models', requireAnyWorkshopEditor, (req, res, next) => {
  categoryModelUpload(req, res, async error => {
    if (error) {
      await removeUploadedFiles(Object.values(req.files || {}).flat());
      const detail = modelUploadError(error);
      return res.status(detail.status).json({ success: false, msg: detail.msg });
    }
    const files = uploadedCategoryFiles(req);
    try {
      // Names may be registered before geometry is ready.
      if (files.model) await assertValidGlb(files.model);
      if (files.image && files.image.size > config.parts.maxFileSize) throw new ApiError(413, '类别参考图文件过大');
      if (files.image) await assertValidImage(files.image);
      const data = categoryModelPayload(req.body);
      const modelUrl = files.model ? `/uploads/part-models/${files.model.filename}` : null;
      const imageUrl = files.image ? `/uploads/part-images/categories/${files.image.filename}` : null;
      const [result] = await pool.query(
        `INSERT INTO part_models (name,keywords,description,model_url,image_url,model_scale,front_rotation_y,built_in,active,created_by,workshop_code)
         VALUES (?,?,?,?,?,?,?,0,1,?,?)`,
        [data.name, data.keywords, data.description, modelUrl, imageUrl, data.modelScale, data.frontRotationY, req.user.id, req.user.role === 'admin' ? null : workshopForRole(req.user.role)]
      );
      res.status(201).json({ success: true, msg: '类别模型、参考图和正面方向已新增', data: { id: result.insertId, ...data, modelUrl, imageUrl } });
    } catch (err) {
      await removeUploadedFiles([files.model, files.image]);
      next(err);
    }
  });
});

router.put('/part-models/:id', requireAnyWorkshopEditor, (req, res, next) => {
  categoryModelUpload(req, res, async error => {
    if (error) {
      await removeUploadedFiles(Object.values(req.files || {}).flat());
      const detail = modelUploadError(error);
      return res.status(detail.status).json({ success: false, msg: detail.msg });
    }
    const files = uploadedCategoryFiles(req);
    try {
      const id = modelId(req.params.id);
      if (!id) throw new ApiError(400, '类别模型ID无效');
      const [[current]] = await pool.query('SELECT * FROM part_models WHERE id=? AND active=1', [id]);
      if (!current) throw new ApiError(404, '模型不存在');
      assertModelWrite(req.user, current);
      if (files.image && files.image.size > config.parts.maxFileSize) throw new ApiError(413, '类别参考图文件过大');
      if (files.model) await assertValidGlb(files.model);
      if (files.image) await assertValidImage(files.image);
      const data = categoryModelPayload(req.body, true, current);
      const modelUrl = files.model ? `/uploads/part-models/${files.model.filename}` : current.model_url;
      const imageUrl = files.image ? `/uploads/part-images/categories/${files.image.filename}` : current.image_url;
      await pool.query(
        `UPDATE part_models SET name=?,keywords=?,description=?,model_url=?,image_url=?,model_scale=?,front_rotation_y=? WHERE id=?`,
        [data.name, data.keywords, data.description, modelUrl, imageUrl, data.modelScale, data.frontRotationY, id]
      );
      const previousModelPath = files.model && uploadedCategoryModelPath(current.model_url);
      const previousImagePath = files.image && uploadedCategoryImagePath(current.image_url);
      await Promise.all([previousModelPath && fs.promises.unlink(previousModelPath).catch(() => {}), previousImagePath && fs.promises.unlink(previousImagePath).catch(() => {})]);
      res.json({ success: true, msg: '类别模型、参考图和正面方向已更新', data: { id, ...data, modelUrl, imageUrl } });
    } catch (err) {
      await removeUploadedFiles([files.model, files.image]);
      next(err);
    }
  });
});

router.delete('/part-models/:id', requireAnyWorkshopEditor, asyncHandler(async (req, res) => {
  const id = modelId(req.params.id);
  if (!id) throw new ApiError(400, '模型ID无效');
  const connection = await pool.getConnection();
  let current;
  try {
    await connection.beginTransaction();
    [[current]] = await connection.query('SELECT model_url AS modelUrl,image_url AS imageUrl,workshop_code FROM part_models WHERE id=? AND active=1 FOR UPDATE', [id]);
    if (!current) throw new ApiError(404, '模型不存在');
    assertModelWrite(req.user, current);
    await connection.query('UPDATE parts SET bound_model_id=NULL WHERE bound_model_id=?', [id]);
    await connection.query('UPDATE part_models SET active=0 WHERE id=?', [id]);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
  const modelPath = uploadedCategoryModelPath(current.modelUrl);
  const imagePath = uploadedCategoryImagePath(current.imageUrl);
  await Promise.all([modelPath && fs.promises.unlink(modelPath).catch(() => {}), imagePath && fs.promises.unlink(imagePath).catch(() => {})]);
  res.json({ success: true, msg: '模型已停用，原关联备件已解除绑定' });
}));

router.post('/parts/batch-images', requireAnyWorkshopEditor, asyncHandler(async (req, res) => {
  const updates = Array.isArray(req.body?.updates) ? req.body.updates : [];
  if (!updates.length || updates.length > 500) throw new ApiError(400, '请选择1至500条备件');
  const affected = await withPartAssetWrite(pool, req.user, updates.map(item => item.partId), async connection => {
    let count = 0;
    for (const item of updates) {
      const imageUrl = item.imageUrl === null ? null : String(item.imageUrl || '').slice(0,500);
      const [result] = await connection.query('UPDATE parts SET image_url=? WHERE id=? AND active=1',[imageUrl,Number(item.partId)]);
      count += result.affectedRows;
    }
    return count;
  });
  res.json({success:true,msg:`已更新 ${affected} 个备件图片`,data:{affected}});
}));

module.exports = router;
