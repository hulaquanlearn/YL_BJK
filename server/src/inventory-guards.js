const { ApiError, parseJson } = require('./utils');

const MAX_INVENTORY_ITEMS = 2000;

function parseInventoryId(value, label = '库存记录ID') {
  const text = typeof value === 'string' ? value.trim() : String(value ?? '');
  if (!/^\d+$/.test(text)) throw new ApiError(400, `${label}无效`);

  const id = Number(text);
  if (!Number.isSafeInteger(id) || id < 1) throw new ApiError(400, `${label}无效`);
  return id;
}

function tryParseInventoryId(value) {
  try {
    return parseInventoryId(value);
  } catch (_) {
    return null;
  }
}

function parseNonNegativeQuantity(value, label = '实盘库存') {
  if (value === '' || value === null || value === undefined || typeof value === 'boolean') {
    throw new ApiError(400, `${label}无效`);
  }
  const quantity = Number(value);
  if (!Number.isFinite(quantity) || quantity < 0) throw new ApiError(400, `${label}无效`);
  return quantity;
}

function normalizeInventoryOrderLists(allList, abnormalList) {
  if (!Array.isArray(allList) || !allList.length) throw new ApiError(400, '盘点备件不能为空');
  if (allList.length > MAX_INVENTORY_ITEMS) {
    throw new ApiError(400, `单次盘点不能超过${MAX_INVENTORY_ITEMS}条库存记录`);
  }
  if (!Array.isArray(abnormalList)) throw new ApiError(400, '异常备件列表无效');

  const inventoryIds = [];
  const allIdSet = new Set();
  const normalizedAllList = allList.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new ApiError(400, `第${index + 1}条盘点备件无效`);
    }
    const id = parseInventoryId(item.inventoryId ?? item.partId, `第${index + 1}条库存记录ID`);
    if (allIdSet.has(id)) throw new ApiError(400, `库存记录${id}重复`);
    allIdSet.add(id);
    inventoryIds.push(id);
    return { ...item, partId: String(id) };
  });

  const abnormalIdSet = new Set();
  const actualQuantityById = new Map();
  const normalizedAbnormalList = abnormalList.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new ApiError(400, `第${index + 1}条异常备件无效`);
    }
    const id = parseInventoryId(item.inventoryId ?? item.partId, `第${index + 1}条异常库存记录ID`);
    if (!allIdSet.has(id)) throw new ApiError(400, `异常库存记录${id}不在本次盘点范围内`);
    if (abnormalIdSet.has(id)) throw new ApiError(400, `异常库存记录${id}重复`);

    const actualQuantity = parseNonNegativeQuantity(item.actualStock, `库存记录${id}的实盘库存`);
    abnormalIdSet.add(id);
    actualQuantityById.set(id, actualQuantity);
    return { ...item, partId: String(id), actualStock: actualQuantity };
  });

  return {
    inventoryIds: [...inventoryIds].sort((a, b) => a - b),
    abnormalIdSet,
    actualQuantityById,
    normalizedAllList,
    normalizedAbnormalList
  };
}

async function lockInventoryRows(connection, inventoryIds) {
  if (!inventoryIds.length) return [];
  const placeholders = inventoryIds.map(() => '?').join(',');
  const [rows] = await connection.query(
    `SELECT id, part_id, quantity, workshop_code
     FROM inventory
     WHERE id IN (${placeholders})
     ORDER BY id
     FOR UPDATE`,
    inventoryIds
  );
  return rows;
}

async function findPendingInventoryOrder(connection, inventoryIds, excludeOrderId = null) {
  if (!inventoryIds.length) return null;

  const placeholders = inventoryIds.map(() => '?').join(',');
  const excludeSql = excludeOrderId === null ? '' : 'AND io.id <> ?';
  const detailParams = excludeOrderId === null
    ? inventoryIds
    : [...inventoryIds, excludeOrderId];
  const [detailRows] = await connection.query(
    `SELECT io.id, io.inventoryNo
     FROM inventory_order_items item
     INNER JOIN inventory_orders io ON io.id = item.order_id
     WHERE item.inventory_id IN (${placeholders})
       AND io.approveStatus = '待审批'
       ${excludeSql}
     ORDER BY io.id
     LIMIT 1
     FOR UPDATE`,
    detailParams
  );
  if (detailRows.length) return detailRows[0];

  const legacyParams = excludeOrderId === null ? [] : [excludeOrderId];
  const [legacyRows] = await connection.query(
    `SELECT io.id, io.inventoryNo, io.inventoryAllList
     FROM inventory_orders io
     WHERE io.approveStatus = '待审批'
       ${excludeSql}
       AND NOT EXISTS (
         SELECT 1 FROM inventory_order_items item WHERE item.order_id = io.id
       )
     ORDER BY io.id
     FOR UPDATE`,
    legacyParams
  );
  const wantedIds = new Set(inventoryIds);
  for (const order of legacyRows) {
    const items = parseJson(order.inventoryAllList, []);
    const overlaps = Array.isArray(items) && items.some(item => {
      const id = tryParseInventoryId(item?.inventoryId ?? item?.partId);
      return id !== null && wantedIds.has(id);
    });
    if (overlaps) return order;
  }
  return null;
}

module.exports = {
  MAX_INVENTORY_ITEMS,
  parseInventoryId,
  parseNonNegativeQuantity,
  normalizeInventoryOrderLists,
  lockInventoryRows,
  findPendingInventoryOrder
};
