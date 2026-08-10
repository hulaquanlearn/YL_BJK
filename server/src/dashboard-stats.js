function toDateKey(value) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function normalizeAnchorDate(value) {
  if (value instanceof Date) {
    return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
  }
  const key = toDateKey(value);
  const parsed = new Date(`${key}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function formatUtcDate(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function buildMovementTrend(rows = [], days = 30, anchorDate = new Date()) {
  const safeDays = Math.max(1, Math.min(Number(days) || 30, 180));
  const rowMap = new Map();
  rows.forEach(row => {
    const date = toDateKey(row.movementDate || row.date);
    if (!date) return;
    if (!rowMap.has(date)) rowMap.set(date, { in: 0, out: 0, adjustment: 0, total: 0 });
    const target = rowMap.get(date);
    const count = Number(row.movementCount ?? row.count) || 0;
    if (row.movementType === 'in') target.in += count;
    else if (row.movementType === 'out') target.out += count;
    else target.adjustment += count;
    target.total += count;
  });

  const anchor = normalizeAnchorDate(anchorDate);
  const result = [];
  for (let offset = safeDays - 1; offset >= 0; offset -= 1) {
    const date = new Date(anchor);
    date.setUTCDate(anchor.getUTCDate() - offset);
    const key = formatUtcDate(date);
    result.push({ date: key, in: 0, out: 0, adjustment: 0, total: 0, ...(rowMap.get(key) || {}) });
  }
  return result;
}

module.exports = { buildMovementTrend };
