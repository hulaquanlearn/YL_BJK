const express = require('express');
const { pool } = require('../db');
const { ApiError, asyncHandler, positiveInt, toPart } = require('../utils');
const {
  parseInventoryId,
  parseNonNegativeQuantity,
  findPendingInventoryOrder
} = require('../inventory-guards');
const { requireRole } = require('../auth');
const { formatUnitTotals, buildAreaStats } = require('../stats-summary');
const { toMovement, toMovementDetail } = require('../stock-movements');
const { parseMovementMetadata, assertMovementAssociations } = require('../movement-metadata');
const { buildReplenishmentItem } = require('../replenishment');
const { buildMovementTrend } = require('../dashboard-stats');

const router = express.Router();

const PENDING_INVENTORY_SQL = `EXISTS (
  SELECT 1
  FROM inventory_order_items pending_item
  INNER JOIN inventory_orders pending_order ON pending_order.id = pending_item.order_id
  WHERE pending_item.inventory_id = i.id
    AND pending_order.approveStatus = '待审批'
)`;

const PART_SELECT = `
  SELECT i.id, p.id AS partId,
         p.code AS materialCode,
         p.name AS materialDesc,
         p.name AS partName, p.spec,
         p.unit, p.category_id AS categoryId, c.name AS categoryName,
         p.brand, p.safety_stock AS safetyStock, p.safety_stock AS reorderPoint,
         p.max_stock AS maxStock, p.part_type AS partType,
         p.usage_description AS usageDescription, p.price, p.remark,
         i.quantity AS totalStock, i.in_transit AS inTransit,
         i.shelf, i.direction AS position, i.layer, i.slot AS location,
         i.location AS locationCode, i.warehouse AS warehouseArea,
         i.location_type AS locationType, i.location_note AS locationNote,
         COALESCE(w.name, i.warehouse) AS warehouseAreaName,
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
  LEFT JOIN warehouses w ON w.code = i.warehouse OR w.name = i.warehouse
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

  if (query.warehouseAreaName) {
    conditions.push('(w.name = ? OR i.warehouse = ?)');
    params.push(query.warehouseAreaName, query.warehouseAreaName);
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
    conditions.push('p.safety_stock IS NOT NULL AND i.quantity <= p.safety_stock');
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

  return {
    sql: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    params
  };
}

async function resolveWarehouse(connection, data) {
  const areaName = String(data.warehouseAreaName || '').trim();
  const areaCode = String(data.warehouseArea || '').trim();
  if (!areaName && !areaCode) throw new ApiError(400, '请选择或填写货区');

  if (areaName) {
    const [nameRows] = await connection.query(
      `SELECT code, name
       FROM warehouses
       WHERE name = ?
       ORDER BY code ASC
       LIMIT 1`,
      [areaName]
    );
    if (nameRows.length) return { code: nameRows[0].code, name: nameRows[0].name };

    // 前端现有版本会用货区名前两个字猜测代码。名称未命中字典时，
    // 必须优先保留完整名称，不能再用猜测代码去命中其他货区。
    return { code: areaName, name: areaName };
  }

  if (areaCode) {
    const [codeRows] = await connection.query(
      'SELECT code, name FROM warehouses WHERE code = ? LIMIT 1',
      [areaCode]
    );
    if (codeRows.length) return { code: codeRows[0].code, name: codeRows[0].name || codeRows[0].code };
  }

  return { code: areaCode, name: areaCode };
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
              SUM(CASE WHEN p.safety_stock IS NOT NULL AND i.quantity <= p.safety_stock THEN 1 ELSE 0 END) AS lowStock,
              SUM(CASE WHEN i.quantity <= 0 THEN 1 ELSE 0 END) AS zeroStock,
              SUM(CASE WHEN i.quantity > 0 AND p.safety_stock IS NOT NULL AND i.quantity <= p.safety_stock THEN 1 ELSE 0 END) AS lowPositiveStock,
              SUM(CASE WHEN i.quantity > 0 AND p.safety_stock IS NOT NULL AND i.quantity > p.safety_stock THEN 1 ELSE 0 END) AS healthyStock,
              SUM(CASE WHEN i.quantity > 0 AND p.safety_stock IS NULL THEN 1 ELSE 0 END) AS unconfiguredStock
       FROM inventory i
       INNER JOIN parts p ON p.id = i.part_id
       WHERE COALESCE(i.active, 1) = 1 AND COALESCE(p.active, 1) = 1`
    ),
    pool.query(
      `SELECT COALESCE(NULLIF(TRIM(p.unit), ''), '未标单位') AS unit,
              COALESCE(SUM(i.quantity), 0) AS totalStock
       FROM inventory i
       INNER JOIN parts p ON p.id = i.part_id
       WHERE COALESCE(i.active, 1) = 1 AND COALESCE(p.active, 1) = 1
       GROUP BY COALESCE(NULLIF(TRIM(p.unit), ''), '未标单位')`
    ),
    pool.query(
      `SELECT COALESCE(w.name, i.warehouse, '未分区') AS area,
              i.shelf, i.layer,
              COALESCE(NULLIF(TRIM(p.unit), ''), '未标单位') AS unit,
              COUNT(i.id) AS inventoryCount,
              COALESCE(SUM(i.quantity), 0) AS totalStock
       FROM inventory i
       INNER JOIN parts p ON p.id = i.part_id
       LEFT JOIN warehouses w ON w.code = i.warehouse OR w.name = i.warehouse
       WHERE COALESCE(i.active, 1) = 1 AND COALESCE(p.active, 1) = 1
       GROUP BY COALESCE(w.name, i.warehouse, '未分区'), i.shelf, i.layer,
                COALESCE(NULLIF(TRIM(p.unit), ''), '未标单位')`
    ),
    pool.query(
      `${PART_SELECT}
       WHERE COALESCE(i.active, 1) = 1 AND COALESCE(p.active, 1) = 1
         AND p.safety_stock IS NOT NULL AND i.quantity <= p.safety_stock
       ORDER BY i.quantity ASC, i.id ASC LIMIT 15`
    ),
    pool.query(
      `SELECT COALESCE(w.name, i.warehouse, '未分区') AS area,
              COUNT(i.id) AS inventoryRecords,
              COUNT(DISTINCT p.id) AS partTypes,
              SUM(CASE WHEN p.safety_stock IS NOT NULL AND i.quantity <= p.safety_stock THEN 1 ELSE 0 END) AS lowStock
       FROM inventory i
       INNER JOIN parts p ON p.id = i.part_id
       LEFT JOIN warehouses w ON w.code = i.warehouse OR w.name = i.warehouse
       WHERE COALESCE(i.active, 1) = 1 AND COALESCE(p.active, 1) = 1
       GROUP BY COALESCE(w.name, i.warehouse, '未分区')
       ORDER BY inventoryRecords DESC, area ASC`
    ),
    pool.query(
      `SELECT DATE(sm.created_at) AS movementDate,
              sm.movement_type AS movementType,
              COUNT(*) AS movementCount
       FROM stock_movements sm
       WHERE sm.created_at >= ${periodStartSql}
       GROUP BY DATE(sm.created_at), sm.movement_type
       ORDER BY movementDate ASC`
    ),
    pool.query(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN movement_type = 'in' THEN 1 ELSE 0 END) AS inbound,
              SUM(CASE WHEN movement_type = 'out' THEN 1 ELSE 0 END) AS outbound,
              SUM(CASE WHEN movement_type NOT IN ('in', 'out') THEN 1 ELSE 0 END) AS adjustment
       FROM stock_movements
       WHERE created_at >= ${periodStartSql}`
    ),
    pool.query(
      `SELECT i.id AS inventoryId, p.code AS materialCode, p.name AS materialDesc,
              p.unit, COUNT(sm.id) AS movementCount,
              SUM(CASE WHEN sm.movement_type = 'out' THEN sm.quantity ELSE 0 END) AS outboundQuantity,
              MAX(sm.created_at) AS lastMovementAt
       FROM stock_movements sm
       INNER JOIN inventory i ON i.id = sm.inventory_id
       INNER JOIN parts p ON p.id = i.part_id
       WHERE sm.created_at >= ${periodStartSql}
         AND COALESCE(i.active, 1) = 1 AND COALESCE(p.active, 1) = 1
       GROUP BY i.id, p.code, p.name, p.unit
       ORDER BY movementCount DESC, lastMovementAt DESC
       LIMIT 8`
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
              SUM(CASE WHEN p.max_stock IS NULL THEN 1 ELSE 0 END) AS missingTarget,
              COALESCE(SUM(CASE WHEN p.max_stock IS NOT NULL AND p.price IS NOT NULL
                THEN GREATEST(p.max_stock - i.quantity - COALESCE(i.in_transit, 0), 0) * p.price
                ELSE 0 END), 0) AS estimatedAmount
       ${baseFrom} ${where.sql}`,
      where.params
    ),
    pool.query(
      `SELECT COALESCE(NULLIF(TRIM(p.unit), ''), '未标单位') AS unit,
              COALESCE(SUM(GREATEST(p.max_stock - i.quantity - COALESCE(i.in_transit, 0), 0)), 0) AS totalStock
       ${baseFrom} ${where.sql} AND p.max_stock IS NOT NULL
       GROUP BY COALESCE(NULLIF(TRIM(p.unit), ''), '未标单位')`,
      where.params
    ),
    pool.query(
      `${PART_SELECT} ${where.sql}
       ORDER BY CASE WHEN i.quantity <= 0 THEN 0
                     WHEN p.safety_stock > 0 AND i.quantity <= p.safety_stock * 0.5 THEN 1
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

router.post('/parts', requireRole('admin'), asyncHandler(async (req, res) => {
  const data = req.body || {};
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
      await connection.query('UPDATE parts SET active = 1 WHERE id = ?', [partId]);
    } else {
      const brand = name.includes(',') ? name.split(',')[0].trim() : null;
      const [partResult] = await connection.query(
        `INSERT INTO parts
         (code, name, unit, brand, safety_stock, max_stock, part_type, usage_description, price, remark, active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [code, name, data.unit || '个', brand, optionalValue(data.reorderPoint ?? data.safetyStock),
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
         AND (i.warehouse = ? OR COALESCE(existing_warehouse.name, i.warehouse) = ?)
         AND NULLIF(i.location, '') <=> ?
         AND i.shelf <=> ? AND i.direction <=> ? AND i.layer <=> ? AND i.slot <=> ?
       LIMIT 1
       FOR UPDATE`,
      [partId, warehouse.code, warehouse.name, locationCode, shelf, position, layer, location]
    );
    if (duplicateLocations.length) throw new ApiError(409, '该物料的完整库位已存在');

    const [inventoryResult] = await connection.query(
      `INSERT INTO inventory
       (part_id, warehouse, location, shelf, direction, layer, slot, location_type, location_note, quantity, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [partId, warehouse.code, locationCode, shelf, position, layer, location, locationType, locationNote, totalStock]
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

router.delete('/parts/:id', requireRole('admin'), asyncHandler(async (req, res) => {
  const inventoryId = parseInventoryId(req.params.id);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      'SELECT part_id, quantity, in_transit FROM inventory WHERE id = ? AND COALESCE(active, 1) = 1 FOR UPDATE',
      [inventoryId]
    );
    if (!rows.length) throw new ApiError(404, '备件库存记录不存在');
    if (Number(rows[0].quantity) !== 0) throw new ApiError(409, '库存不为0，不能删除');
    if (Number(rows[0].in_transit) > 0) throw new ApiError(409, '仍有在途库存，不能停用');
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

router.post('/parts/:id/stock', requireRole('admin'), asyncHandler(async (req, res) => {
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
      `SELECT i.quantity
       FROM inventory i
       INNER JOIN parts p ON p.id = i.part_id
       WHERE i.id = ? AND COALESCE(i.active, 1) = 1 AND COALESCE(p.active, 1) = 1
       FOR UPDATE`,
      [inventoryId]
    );
    if (!rows.length) throw new ApiError(404, '备件库存记录不存在或已停用');
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

router.get('/filters', asyncHandler(async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT DISTINCT i.warehouse, COALESCE(w.name, i.warehouse) AS warehouseAreaName,
            i.shelf, i.layer
     FROM inventory i
     LEFT JOIN warehouses w ON w.code = i.warehouse
     INNER JOIN parts p ON p.id = i.part_id
     WHERE COALESCE(i.active, 1) = 1 AND COALESCE(p.active, 1) = 1
     ORDER BY warehouseAreaName ASC, i.shelf ASC, i.layer ASC`
  );
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
  res.json({ success: true, data: { areas, shelfMap, layerMap } });
}));

router.get('/dashboard', asyncHandler(async (_req, res) => {
  const [[[summary]], [unitRows], [lowRows], [[pendingRow]]] = await Promise.all([
    pool.query(
      `SELECT COUNT(DISTINCT p.id) AS partTypes,
              COUNT(i.id) AS inventoryRecords,
              COALESCE(SUM(i.quantity), 0) AS totalStock,
              SUM(CASE WHEN p.safety_stock IS NOT NULL AND i.quantity <= p.safety_stock THEN 1 ELSE 0 END) AS lowStock,
              SUM(CASE WHEN i.quantity > 0 AND p.safety_stock IS NULL THEN 1 ELSE 0 END) AS unconfiguredStock
       FROM inventory i INNER JOIN parts p ON p.id = i.part_id
       WHERE COALESCE(i.active, 1) = 1 AND COALESCE(p.active, 1) = 1`
    ),
    pool.query(
      `SELECT COALESCE(NULLIF(TRIM(p.unit), ''), '未标单位') AS unit,
              COALESCE(SUM(i.quantity), 0) AS totalStock
       FROM inventory i INNER JOIN parts p ON p.id = i.part_id
       WHERE COALESCE(i.active, 1) = 1 AND COALESCE(p.active, 1) = 1
       GROUP BY COALESCE(NULLIF(TRIM(p.unit), ''), '未标单位')`
    ),
    pool.query(
      `${PART_SELECT}
       WHERE COALESCE(i.active, 1) = 1 AND COALESCE(p.active, 1) = 1
         AND p.safety_stock IS NOT NULL AND i.quantity <= p.safety_stock
       ORDER BY i.quantity ASC, i.id ASC LIMIT 3`
    ),
    pool.query("SELECT COUNT(*) AS total FROM inventory_orders WHERE approveStatus = '待审批'")
  ]);
  res.json({
    success: true,
    data: {
      dashboard: {
        partTypes: Number(summary.partTypes) || 0,
        inventoryRecords: Number(summary.inventoryRecords) || 0,
        totalStock: Number(summary.totalStock) || 0,
        lowStock: Number(summary.lowStock) || 0,
        unconfiguredStock: Number(summary.unconfiguredStock) || 0,
        pendingApproval: Number(pendingRow.total) || 0,
        unitTotals: formatUnitTotals(unitRows)
      },
      lowStockParts: lowRows.map(toPart)
    }
  });
}));

module.exports = router;
