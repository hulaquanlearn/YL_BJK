const { ApiError } = require('./utils');

const MOVEMENT_REASONS = Object.freeze({
  in: Object.freeze({
    return_to_stock: '维修退库',
    transfer_in: '调拨入库',
    inventory_correction: '库存纠正',
    other_in: '其他入库'
  }),
  out: Object.freeze({
    maintenance_use: '维修领用',
    emergency_repair: '抢修领用',
    preventive_maintenance: '保养领用',
    transfer_out: '调拨出库',
    scrap: '报废出库',
    other_out: '其他出库'
  })
});

function optionalText(value, field, maxLength) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (text.length > maxLength) throw new ApiError(400, `${field}不能超过${maxLength}个字符`);
  return text;
}

function optionalId(value, field) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) throw new ApiError(400, `${field}无效`);
  return parsed;
}

function parseMovementMetadata(type, data = {}) {
  const catalog = MOVEMENT_REASONS[type];
  if (!catalog) throw new ApiError(400, '出入库类型无效');
  const reasonCode = String(data.reasonCode || '').trim();
  if (!Object.prototype.hasOwnProperty.call(catalog, reasonCode)) {
    throw new ApiError(400, '请选择有效的出入库原因');
  }
  const detail = optionalText(data.reasonDetail ?? data.reason, '原因说明', 200);
  return {
    reasonCode,
    reason: detail ? `${catalog[reasonCode]}：${detail}` : catalog[reasonCode],
    department: optionalText(data.department, '领用部门', 100),
    recipient: optionalText(data.recipient, '领用人', 50),
    equipmentId: optionalId(data.equipmentId, '设备'),
    maintenanceOrderId: optionalId(data.maintenanceOrderId, '工单'),
    batchNo: optionalText(data.batchNo, '批次号', 100)
  };
}

function movementReasonOptions() {
  return Object.fromEntries(Object.entries(MOVEMENT_REASONS).map(([type, values]) => [
    type,
    Object.entries(values).map(([value, label]) => ({ value, label }))
  ]));
}

async function assertMovementAssociations(connection, metadata) {
  if (metadata.equipmentId) {
    const [rows] = await connection.query('SELECT id FROM workshop_equipment WHERE id = ? LIMIT 1', [metadata.equipmentId]);
    if (!rows.length) throw new ApiError(400, '关联设备不存在');
  }
  if (metadata.maintenanceOrderId) {
    const [rows] = await connection.query('SELECT equipment_id FROM maintenance_work_orders WHERE id = ? LIMIT 1', [metadata.maintenanceOrderId]);
    if (!rows.length) throw new ApiError(400, '关联维修工单不存在');
    if (metadata.equipmentId && Number(rows[0].equipment_id) !== Number(metadata.equipmentId)) {
      throw new ApiError(400, '维修工单与所选设备不一致');
    }
  }
}

module.exports = { MOVEMENT_REASONS, parseMovementMetadata, movementReasonOptions, assertMovementAssociations };
