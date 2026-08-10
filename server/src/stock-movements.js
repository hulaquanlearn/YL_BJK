const { ApiError } = require('./utils');

function parseMovementReason(value) {
  const reason = String(value || '').trim();
  if (!reason) throw new ApiError(400, '请填写出入库原因');
  if (reason.length > 200) throw new ApiError(400, '出入库原因不能超过200个字符');
  return reason;
}

function toMovement(row) {
  return {
    id: String(row.id),
    type: row.movement_type,
    quantity: Number(row.quantity) || 0,
    beforeQuantity: Number(row.before_quantity) || 0,
    afterQuantity: Number(row.after_quantity) || 0,
    reason: row.reason || '',
    reasonCode: row.reason_code || '',
    department: row.department || '',
    recipient: row.recipient || '',
    equipmentId: row.equipment_id == null ? null : String(row.equipment_id),
    equipmentName: row.equipment_name || '',
    maintenanceOrderId: row.maintenance_order_id == null ? null : String(row.maintenance_order_id),
    maintenanceOrderNo: row.maintenance_order_no || '',
    batchNo: row.batch_no || '',
    operatorName: row.operator_name || '系统',
    relatedOrderNo: row.related_order_no || '',
    createdAt: row.created_at
  };
}

function toMovementDetail(row) {
  return {
    ...toMovement(row),
    inventoryId: String(row.inventory_id),
    materialCode: row.material_code || '',
    materialDesc: row.material_desc || '',
    spec: row.spec || '',
    unit: row.unit || '',
    warehouseAreaName: row.warehouse_area_name || row.warehouse || '',
    locationCode: row.location_code || '',
    shelf: row.shelf,
    position: row.direction,
    layer: row.layer,
    location: row.slot
  };
}

module.exports = { parseMovementReason, toMovement, toMovementDetail };
