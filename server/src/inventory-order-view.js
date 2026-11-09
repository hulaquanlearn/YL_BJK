const { toInventoryOrder } = require('./utils');

const quantity = value => (typeof value === 'number' || typeof value === 'string') && String(value).trim() !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
const itemId = item => String(item?.inventoryId ?? item?.partId ?? '').trim();
const different = (snapshot, actual) => Math.abs(snapshot - actual) > 1e-9;

// A read-only projection of the original count. Never consult current inventory:
// approval may already have changed it to the physical count.
function inventoryOrderView(row, frozenItems = []) {
  const order = toInventoryOrder(row);
  if (!order) return null;
  const recorded = Array.isArray(order.abnormalList) ? order.abnormalList : [];
  const all = Array.isArray(order.inventoryAllList) && order.inventoryAllList.length ? order.inventoryAllList : recorded;
  const markedById = new Map(recorded.map(item => [itemId(item), item]));
  const frozenById = new Map(frozenItems.map(item => [String(item.inventory_id), item]));
  const inventoryAllList = all.map(item => {
    const marked = markedById.get(itemId(item)), frozen = frozenById.get(itemId(item));
    const snapshot = quantity(frozen ? frozen.snapshot_quantity : item.snapshotStock ?? item.sysStockNum);
    let actual;
    if (frozen) actual = frozen.actual_quantity == null && Number(frozen.is_abnormal) === 0 ? snapshot : quantity(frozen.actual_quantity);
    else if (marked) actual = quantity(marked.actualStock);
    else actual = item.actualStock === undefined ? snapshot : quantity(item.actualStock);
    const quantityStatus = snapshot === null || actual === null ? 'unverified' : different(snapshot, actual) ? 'difference' : 'normal';
    return { ...item, snapshotStock: snapshot, sysStockNum: snapshot, actualStock: actual, quantityStatus, quantitySource: frozen ? 'frozen_items' : 'stored_snapshot' };
  });
  const abnormalList = inventoryAllList.filter(item => item.quantityStatus === 'difference').map(item => ({ ...markedById.get(itemId(item)), ...item }));
  return { ...order, inventoryAllList, abnormalList, recordedAbnormalList: recorded, differenceCount: abnormalList.length, unverifiedCount: inventoryAllList.filter(item => item.quantityStatus === 'unverified').length };
}

async function inventoryOrderViews(pool, rows) {
  if (!rows.length) return [];
  const [items] = await pool.query(`SELECT order_id,inventory_id,snapshot_quantity,actual_quantity,is_abnormal FROM inventory_order_items WHERE order_id IN (${rows.map(() => '?').join(',')}) ORDER BY order_id,inventory_id`, rows.map(row => row.id));
  const byOrder = new Map();
  for (const item of items) { const id = String(item.order_id); if (!byOrder.has(id)) byOrder.set(id, []); byOrder.get(id).push(item); }
  return rows.map(row => inventoryOrderView(row, byOrder.get(String(row.id)) || []));
}

module.exports = { quantity, different, inventoryOrderView, inventoryOrderViews };
