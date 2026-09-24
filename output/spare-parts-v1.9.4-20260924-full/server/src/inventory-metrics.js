'use strict';
// One definition for overview cards and statistics. Never add different units.
function summarizeInventory(rows = []) {
  const make = () => ({ ids: new Set(), units: new Map(), inventoryRecords: 0, totalValue: 0, missingPrice: 0, lowStock: 0, zeroStock: 0, lowPositiveStock: 0, healthyStock: 0, unconfiguredStock: 0, missingReorderPoint: 0 });
  const all = make(), types = new Map();
  function add(target, row) {
    target.ids.add(String(row.partId)); target.inventoryRecords++;
    const quantity = Number(row.quantity) || 0, unit = String(row.unit || '').trim() || '未标单位';
    target.units.set(unit, (target.units.get(unit) || 0) + quantity);
    if (row.price == null || row.price === '' || !Number.isFinite(Number(row.price))) target.missingPrice++;
    else target.totalValue += quantity * Number(row.price);
    if (row.safetyStock != null && quantity <= Number(row.safetyStock)) target.lowStock++;
    if (row.safetyStock == null) target.missingReorderPoint++;
    if (quantity <= 0) target.zeroStock++;
    else if (row.safetyStock == null) target.unconfiguredStock++;
    else if (quantity <= Number(row.safetyStock)) target.lowPositiveStock++;
    else target.healthyStock++;
  }
  for (const row of rows) {
    const type = String(row.partType || '').trim() || '未填写';
    if (!types.has(type)) types.set(type, make());
    add(all, row); add(types.get(type), row);
  }
  const finish = ({ ids, units, ...rest }) => ({ ...rest, totalValue: Math.round((rest.totalValue + Number.EPSILON) * 100) / 100, partTypes: ids.size, materialCategoryCount: ids.size, unitTotals: [...units].map(([unit,total]) => ({unit,total})).sort((a,b)=>a.unit.localeCompare(b.unit,'zh-CN')) });
  return { ...finish(all), typeSummaries: [...types].map(([partType, value]) => ({ partType, ...finish(value) })).sort((a,b)=>b.partTypes-a.partTypes || a.partType.localeCompare(b.partType,'zh-CN')) };
}

function summarizeInventoryScopes(rows = [], workshopNames = {}) {
  const groups = new Map();
  for (const row of rows) {
    const workshopCode = String(row.workshopCode || 'raw_grain');
    const warehouseAreaName = String(row.warehouseAreaName || '未指定货区');
    const key = `${workshopCode}\u0000${warehouseAreaName}`;
    if (!groups.has(key)) groups.set(key, { workshopCode, warehouseAreaName, rows: [] });
    groups.get(key).rows.push(row);
  }
  return [...groups.values()].map(group => ({
    workshopCode: group.workshopCode,
    workshopName: workshopNames[group.workshopCode] || group.workshopCode,
    warehouseAreaName: group.warehouseAreaName,
    ...summarizeInventory(group.rows)
  })).sort((a, b) => a.workshopName.localeCompare(b.workshopName, 'zh-CN') || a.warehouseAreaName.localeCompare(b.warehouseAreaName, 'zh-CN'));
}

module.exports = { summarizeInventory, summarizeInventoryScopes };
