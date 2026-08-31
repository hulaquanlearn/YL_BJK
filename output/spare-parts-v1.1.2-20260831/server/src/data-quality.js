const ISSUE_DEFINITIONS = Object.freeze({
  duplicate_material_code: { label: '物料编码重复', severity: 'critical', field: 'materialCode' },
  missing_reorder_point: { label: '订购点未配置', severity: 'high', field: 'reorderPoint' },
  missing_max_stock: { label: '最高储备未配置', severity: 'high', field: 'maxStock' },
  missing_location: { label: '完整库位缺失', severity: 'high', field: 'location' },
  missing_unit: { label: '计量单位缺失', severity: 'high', field: 'unit' },
  missing_price: { label: '单价未配置', severity: 'medium', field: 'price' },
  invalid_location_code: { label: '库位码格式异常', severity: 'medium', field: 'locationCode' },
  stale_inventory: { label: '超过180天未盘点', severity: 'medium', field: 'lastInventoryDate' }
});

function empty(value) {
  return value === null || value === undefined || String(value).trim() === '';
}

function daysSince(value, now = new Date()) {
  if (empty(value)) return Infinity;
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return Infinity;
  return Math.floor((now.getTime() - date.getTime()) / 86400000);
}

function inventoryIssues(row, now = new Date()) {
  const issues = [];
  if (Number(row.duplicateCount) > 1) issues.push('duplicate_material_code');
  if (empty(row.reorderPoint)) issues.push('missing_reorder_point');
  if (empty(row.maxStock)) issues.push('missing_max_stock');
  if (empty(row.unit)) issues.push('missing_unit');
  if (empty(row.price)) issues.push('missing_price');

  const shelfLocationMissing = row.locationType !== 'free_text' &&
    [row.shelf, row.position, row.layer, row.location].some(empty);
  const freeLocationMissing = row.locationType === 'free_text' && empty(row.locationNote);
  if (shelfLocationMissing || freeLocationMissing) issues.push('missing_location');

  if (!empty(row.locationCode) && !/^\d{6}$/.test(String(row.locationCode).trim())) {
    issues.push('invalid_location_code');
  }
  if (daysSince(row.lastInventoryDate, now) > 180) issues.push('stale_inventory');
  return issues;
}

function summarizeDataQuality(rows, now = new Date()) {
  const counts = Object.fromEntries(Object.keys(ISSUE_DEFINITIONS).map(key => [key, 0]));
  let affected = 0;
  const records = rows.map(row => {
    const issues = inventoryIssues(row, now);
    if (issues.length) affected += 1;
    issues.forEach(issue => { counts[issue] += 1; });
    return { ...row, issues };
  });
  const total = rows.length;
  const issueGroups = Object.entries(ISSUE_DEFINITIONS).map(([key, definition]) => ({
    key,
    ...definition,
    count: counts[key],
    rate: total ? Number(((counts[key] / total) * 100).toFixed(1)) : 0
  }));
  return {
    total,
    affected,
    healthy: Math.max(total - affected, 0),
    qualityRate: total ? Number((((total - affected) / total) * 100).toFixed(1)) : 100,
    issueGroups,
    records
  };
}

module.exports = { ISSUE_DEFINITIONS, inventoryIssues, summarizeDataQuality };
