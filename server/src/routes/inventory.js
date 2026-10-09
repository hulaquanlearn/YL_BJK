const express = require('express');
const { pool } = require('../db');
const { ApiError, asyncHandler, parseJson, positiveInt, toInventoryOrder } = require('../utils');
const {
  parseInventoryId,
  normalizeInventoryOrderLists,
  assertInventorySnapshots,
  lockInventoryRows,
  findPendingInventoryOrder
} = require('../inventory-guards');
const { requireRole } = require('../auth');
const {
  normalizeWorkshopCode,
  assertWorkshopWrite,
  inventoryOrderScope,
  assertInventoryOrderSubmit
} = require('../workshop-scope');

const router = express.Router();

function requireDate(value) {
  const date = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ApiError(400, '盘点日期格式无效');
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new ApiError(400, '盘点日期格式无效');
  }
  return date;
}

function requireBoundedText(value, label, maxLength, { allowEmpty = false } = {}) {
  const text = String(value ?? '').trim();
  if (!allowEmpty && !text) throw new ApiError(400, `${label}不能为空`);
  if (text.length > maxLength) throw new ApiError(400, `${label}不能超过${maxLength}个字符`);
  return text;
}

function idsFromLegacyOrder(order) {
  const items = parseJson(order.inventoryAllList, []);
  if (!Array.isArray(items)) return [];
  const ids = new Set();
  for (const item of items) {
    try {
      ids.add(parseInventoryId(item?.inventoryId ?? item?.partId));
    } catch (_) {
      // 历史数据可能不完整；忽略无法识别的单条，不得用它更新库存。
    }
  }
  return [...ids].sort((a, b) => a - b);
}

router.get('/inventory-orders', asyncHandler(async (req, res) => {
  const conditions = [];
  const params = [];
  const workshopCode = inventoryOrderScope(req.user, req.query.workshopCode);
  if (workshopCode) {
    conditions.push('workshop_code = ?');
    params.push(workshopCode);
  }
  if (req.query.date) {
    conditions.push('inventoryDate = ?');
    params.push(req.query.date);
  }
  const scopeSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const [[counts]] = await pool.query(`SELECT COUNT(*) AS total,
    SUM(approveStatus='待审批') AS pending,SUM(approveStatus='已通过') AS approved,
    SUM(approveStatus='已驳回') AS rejected FROM inventory_orders ${scopeSql}`, params);
  if (req.query.status) { conditions.push('approveStatus = ?'); params.push(req.query.status); }
  const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const pageSize = positiveInt(req.query.pageSize ?? req.query.limit, 100, 200);
  const page = positiveInt(req.query.page, 1, 1000000);
  const [[totalRows], [rows]] = await Promise.all([
    pool.query(`SELECT COUNT(*) AS total FROM inventory_orders ${whereSql}`, params),
    pool.query(`SELECT * FROM inventory_orders ${whereSql} ORDER BY createTime DESC,id DESC LIMIT ? OFFSET ?`, [...params, pageSize, (page - 1) * pageSize])
  ]);
  const summary = Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, Number(value) || 0]));
  res.json({ success: true, data: rows.map(toInventoryOrder), total: Number(totalRows[0].total), page, pageSize, summary });
}));

router.get('/inventory-orders/:id', asyncHandler(async (req, res) => {
  const orderId = parseInventoryId(req.params.id, '盘点单ID');
  const [rows] = await pool.query('SELECT * FROM inventory_orders WHERE id = ? LIMIT 1', [orderId]);
  if (!rows.length) throw new ApiError(404, '盘点单不存在');
  inventoryOrderScope(req.user, rows[0].workshop_code || 'raw_grain');
  res.json({ success: true, data: toInventoryOrder(rows[0]) });
}));

router.post('/inventory-orders', asyncHandler(async (req, res) => {
  inventoryOrderScope(req.user);
  const data = req.body || {};
  const inventoryNo = requireBoundedText(data.inventoryNo || `INV-${Date.now()}`, '盘点单号', 100);
  const inventoryDate = requireDate(data.inventoryDate);
  const inventoryUser = requireBoundedText(req.user?.displayName || req.user?.username, '盘点人', 100);
  const inventoryRemark = requireBoundedText(data.inventoryRemark, '盘点说明', 60000, { allowEmpty: true });
  const approveRemark = requireBoundedText(data.approveRemark, '审批说明', 60000, { allowEmpty: true });
  const filterParams = data.filterParams && typeof data.filterParams === 'object' && !Array.isArray(data.filterParams)
    ? data.filterParams
    : {};
  const normalized = normalizeInventoryOrderLists(data.inventoryAllList, data.abnormalList || []);

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const inventoryRows = await lockInventoryRows(connection, normalized.inventoryIds);
    if (inventoryRows.length !== normalized.inventoryIds.length) {
      throw new ApiError(400, '部分盘点备件已不存在，请刷新后重试');
    }
    assertInventorySnapshots(normalized, inventoryRows);
    const workshopCodes = [...new Set(inventoryRows.map(row => normalizeWorkshopCode(row.workshop_code, 'raw_grain')))];
    if (workshopCodes.length !== 1) {
      throw new ApiError(400, '一次盘点只能选择同一车间的备件');
    }
    const workshopCode = workshopCodes[0];
    assertInventoryOrderSubmit(req.user, workshopCode);

    const pendingOrder = await findPendingInventoryOrder(connection, normalized.inventoryIds);
    if (pendingOrder) {
      throw new ApiError(409, `盘点范围与待审批盘点单${pendingOrder.inventoryNo || pendingOrder.id}重复`);
    }

    const [result] = await connection.query(
      `INSERT INTO inventory_orders
       (inventoryNo, workshop_code, inventoryDate, filterParams, inventoryAllList, abnormalList,
        inventoryUser, inventoryRemark, approveStatus, approveRemark)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, '待审批', ?)`,
      [
        inventoryNo,
        workshopCode,
        inventoryDate,
        JSON.stringify(filterParams),
        JSON.stringify(normalized.normalizedAllList),
        JSON.stringify(normalized.normalizedAbnormalList),
        inventoryUser,
        inventoryRemark,
        approveRemark
      ]
    );

    const inventoryRowById = new Map(inventoryRows.map(row => [Number(row.id), row]));
    const itemSql = normalized.inventoryIds.map(() => '(?, ?, ?, ?, ?)').join(',');
    const itemParams = [];
    for (const inventoryId of normalized.inventoryIds) {
      const isAbnormal = normalized.abnormalIdSet.has(inventoryId);
      itemParams.push(
        result.insertId,
        inventoryId,
        Number(inventoryRowById.get(inventoryId).quantity),
        isAbnormal ? normalized.actualQuantityById.get(inventoryId) : null,
        isAbnormal ? 1 : 0
      );
    }
    await connection.query(
      `INSERT INTO inventory_order_items
       (order_id, inventory_id, snapshot_quantity, actual_quantity, is_abnormal)
       VALUES ${itemSql}`,
      itemParams
    );

    await connection.commit();
    res.status(201).json({
      success: true,
      msg: '盘点单已提交，等待审批',
      data: { _id: String(result.insertId), inventoryNo, approveStatus: '待审批' }
    });
  } catch (error) {
    await connection.rollback();
    if (error?.code === 'ER_DUP_ENTRY') throw new ApiError(409, '盘点单号已存在，请刷新后重试');
    throw error;
  } finally {
    connection.release();
  }
}));

router.post('/inventory-orders/:id/approve', requireRole('admin', 'raw_grain', 'qu_making', 'brewing'), asyncHandler(async (req, res) => {
  const orderId = parseInventoryId(req.params.id, '盘点单ID');
  const status = req.body?.status;
  if (!['已通过', '已驳回'].includes(status)) throw new ApiError(400, '审批状态无效');
  const approveRemark = requireBoundedText(req.body?.approveRemark, '审批说明', 60000, { allowEmpty: true });

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [initialRows] = await connection.query(
      'SELECT * FROM inventory_orders WHERE id = ? LIMIT 1',
      [orderId]
    );
    if (!initialRows.length) throw new ApiError(404, '盘点单不存在');
    assertWorkshopWrite(req.user, normalizeWorkshopCode(initialRows[0].workshop_code, 'raw_grain'));
    if (initialRows[0].approveStatus !== '待审批') throw new ApiError(409, '该盘点单已经处理');

    const [initialItems] = await connection.query(
      `SELECT inventory_id, snapshot_quantity, actual_quantity, is_abnormal
       FROM inventory_order_items
       WHERE order_id = ?
       ORDER BY inventory_id`,
      [orderId]
    );
    const inventoryIds = initialItems.length
      ? initialItems.map(item => parseInventoryId(item.inventory_id))
      : idsFromLegacyOrder(initialRows[0]);

    if (inventoryIds.length) {
      const inventoryRows = await lockInventoryRows(connection, inventoryIds);
      if (inventoryRows.length !== inventoryIds.length) {
        throw new ApiError(409, '盘点单中的部分库存记录已不存在');
      }
    }

    const [orderRows] = await connection.query(
      'SELECT * FROM inventory_orders WHERE id = ? FOR UPDATE',
      [orderId]
    );
    if (!orderRows.length) throw new ApiError(404, '盘点单不存在');
    assertWorkshopWrite(req.user, normalizeWorkshopCode(orderRows[0].workshop_code, 'raw_grain'));
    if (orderRows[0].approveStatus !== '待审批') throw new ApiError(409, '该盘点单已经处理');

    if (status === '已通过') {
      const [lockedItems] = await connection.query(
        `SELECT inventory_id, snapshot_quantity, actual_quantity, is_abnormal
         FROM inventory_order_items
         WHERE order_id = ?
         ORDER BY inventory_id
         FOR UPDATE`,
        [orderId]
      );
      if (!lockedItems.length || lockedItems.length !== inventoryIds.length) {
        throw new ApiError(409, '该盘点单缺少可验证的库存快照，请驳回后重新盘点');
      }

      const lockedInventoryRows = await lockInventoryRows(connection, inventoryIds);
      const inventoryById = new Map(lockedInventoryRows.map(row => [Number(row.id), row]));
      for (const item of lockedItems) {
        const inventoryId = Number(item.inventory_id);
        const currentQuantity = Number(inventoryById.get(inventoryId)?.quantity);
        const snapshotQuantity = Number(item.snapshot_quantity);
        if (!Number.isFinite(currentQuantity)
          || !Number.isFinite(snapshotQuantity)
          || Math.abs(currentQuantity - snapshotQuantity) > 1e-9) {
          throw new ApiError(409, '库存已在盘点提交后发生变化，请驳回该盘点单后重新盘点');
        }
        if (Number(item.is_abnormal) === 1) {
          const actualQuantity = Number(item.actual_quantity);
          if (!Number.isFinite(actualQuantity) || actualQuantity < 0) {
            throw new ApiError(409, `库存记录${inventoryId}的实盘库存无效`);
          }
          await connection.query('UPDATE inventory SET quantity = ? WHERE id = ?', [actualQuantity, inventoryId]);
          if (Math.abs(actualQuantity - currentQuantity) > 1e-9) {
            await connection.query(
              `INSERT INTO stock_movements
               (inventory_id, movement_type, quantity, before_quantity, after_quantity, reason,
                operator_user_id, operator_name, related_order_no)
               VALUES (?, 'inventory_adjustment', ?, ?, ?, ?, ?, ?, ?)`,
              [inventoryId, Math.abs(actualQuantity - currentQuantity), currentQuantity, actualQuantity,
                `盘点差异调整：${approveRemark || orderRows[0].inventoryNo}`,
                req.user.id, req.user.displayName, orderRows[0].inventoryNo]
            );
          }
        }
      }

      const placeholders = inventoryIds.map(() => '?').join(',');
      await connection.query(
        `UPDATE inventory
         SET last_inventory_no = ?, last_inventory_time = NOW(), last_inventory_date = ?
         WHERE id IN (${placeholders})`,
        [orderRows[0].inventoryNo, orderRows[0].inventoryDate, ...inventoryIds]
      );
    } else if (inventoryIds.length) {
      // 兼容旧版提交即写完成日期的盘点单：只清理本单写入的标记。
      const placeholders = inventoryIds.map(() => '?').join(',');
      await connection.query(
        `UPDATE inventory
         SET last_inventory_no = NULL, last_inventory_time = NULL, last_inventory_date = NULL
         WHERE id IN (${placeholders}) AND last_inventory_no = ?`,
        [...inventoryIds, orderRows[0].inventoryNo]
      );
    }

    await connection.query(
      `UPDATE inventory_orders
       SET approveStatus = ?, approveRemark = ?, approveTime = NOW()
       WHERE id = ?`,
      [status, approveRemark, orderId]
    );
    await connection.commit();
    res.json({
      success: true,
      msg: status === '已通过' ? '审批通过，库存已同步' : '盘点单已驳回，可重新盘点'
    });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

module.exports = router;
