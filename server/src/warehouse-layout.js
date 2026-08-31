const { ApiError } = require('./utils');

function parseShelfNo(value) {
  if (value === null || value === undefined || value === '') return null;
  const shelfNo = Number(value);
  if (!Number.isInteger(shelfNo) || shelfNo < 1 || shelfNo > 99) {
    throw new ApiError(400, '货架号必须为1至99之间的整数');
  }
  return shelfNo;
}

function normalizeShelfName(value) {
  if (value === null || value === undefined) return null;
  const name = String(value).trim();
  if (!name) return null;
  if (name.length > 60) throw new ApiError(400, '货架名称不能超过60个字符');
  return name;
}

function renumberLocationCode(value, shelfNo) {
  const code = String(value || '').trim();
  if (!/^\d{6}$/.test(code) || shelfNo === null) return value || null;
  return `${String(shelfNo).padStart(2, '0')}${code.slice(2)}`;
}

function toShelf(row) {
  const shelfNo = row.shelfNo === null || row.shelfNo === undefined ? null : Number(row.shelfNo);
  const customName = row.customName || null;
  return {
    id: String(row.id),
    layoutKey: row.layoutKey,
    workshopCode: row.workshopCode || 'raw_grain',
    shelfNo,
    customName,
    displayName: customName || (shelfNo === null ? '未命名' : `${shelfNo}号货架`),
    workshopGroup: row.workshopGroup || '未分组',
    warehouseCode: row.warehouseCode || null,
    isVendor: Boolean(row.isVendor),
    positionOverridden: Boolean(row.positionOverridden),
    position: {
      x: Number(row.positionX) || 0,
      z: Number(row.positionZ) || 0,
      rotationY: Number(row.rotationY) || 0
    },
    size: {
      width: Number(row.width) || 4,
      depth: Number(row.depth) || 0.9,
      height: Number(row.height) || 3.2
    },
    levels: Math.max(Number(row.defaultLevels) || 1, Number(row.maxLayer) || 0),
    maxSlot: Number(row.maxSlot) || 0,
    partsCount: Number(row.partsCount) || 0,
    lowStockCount: Number(row.lowStockCount) || 0,
    sortOrder: Number(row.sortOrder) || 0
  };
}

module.exports = { parseShelfNo, normalizeShelfName, renumberLocationCode, toShelf };
