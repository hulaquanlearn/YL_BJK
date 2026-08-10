class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function parseJson(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
}

function toPart(row) {
  if (!row) return null;
  return {
    ...row,
    _id: String(row.id),
    totalStock: Number(row.totalStock) || 0
  };
}

function toInventoryOrder(row) {
  if (!row) return null;
  return {
    ...row,
    _id: String(row.id),
    filterParams: parseJson(row.filterParams, {}),
    inventoryAllList: parseJson(row.inventoryAllList, []),
    abnormalList: parseJson(row.abnormalList, [])
  };
}

function positiveInt(value, fallback, max = 200) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

module.exports = {
  ApiError,
  asyncHandler,
  parseJson,
  toPart,
  toInventoryOrder,
  positiveInt
};
