function normalizeUnit(value) {
  const unit = String(value || '').trim();
  return unit || '未标单位';
}

function formatUnitTotals(rows = []) {
  return rows
    .map(row => ({
      unit: normalizeUnit(row.unit),
      total: Number(row.totalStock) || 0
    }))
    .filter(item => item.total !== 0)
    .sort((a, b) => b.total - a.total || a.unit.localeCompare(b.unit, 'zh-CN'));
}

function unitSummary(unitTotals = []) {
  if (!unitTotals.length) return '暂无数量';
  return unitTotals.map(item => `${item.total}${item.unit}`).join('、');
}

function mergeUnits(target, unit, quantity) {
  const key = normalizeUnit(unit);
  target.set(key, (target.get(key) || 0) + (Number(quantity) || 0));
}

function mapUnitTotals(unitMap) {
  return formatUnitTotals([...unitMap.entries()].map(([unit, totalStock]) => ({ unit, totalStock })));
}

function buildAreaStats(rows = []) {
  const areaMap = new Map();
  rows.forEach(row => {
    const areaName = String(row.area || '未分区');
    const shelfName = row.shelf === null || row.shelf === undefined || row.shelf === '' ? '未指定' : String(row.shelf);
    const layerName = row.layer === null || row.layer === undefined || row.layer === '' ? '未指定' : String(row.layer);
    const recordCount = Number(row.inventoryCount) || 0;
    const quantity = Number(row.totalStock) || 0;

    if (!areaMap.has(areaName)) areaMap.set(areaName, { area: areaName, count: 0, units: new Map(), shelves: new Map() });
    const area = areaMap.get(areaName);
    area.count += recordCount;
    mergeUnits(area.units, row.unit, quantity);

    if (!area.shelves.has(shelfName)) area.shelves.set(shelfName, { shelfNo: shelfName, count: 0, units: new Map(), layers: new Map() });
    const shelf = area.shelves.get(shelfName);
    shelf.count += recordCount;
    mergeUnits(shelf.units, row.unit, quantity);

    if (!shelf.layers.has(layerName)) shelf.layers.set(layerName, { layer: layerName, count: 0, units: new Map() });
    const layer = shelf.layers.get(layerName);
    layer.count += recordCount;
    mergeUnits(layer.units, row.unit, quantity);
  });

  return [...areaMap.values()].map(area => {
    const shelves = [...area.shelves.values()].map(shelf => {
      const layers = [...shelf.layers.values()].map(layer => {
        const unitTotals = mapUnitTotals(layer.units);
        return { layer: layer.layer, count: layer.count, unitTotals, unitSummary: unitSummary(unitTotals) };
      }).sort((a, b) => String(a.layer).localeCompare(String(b.layer), 'zh-CN', { numeric: true }));
      const unitTotals = mapUnitTotals(shelf.units);
      return { shelfNo: shelf.shelfNo, count: shelf.count, unitTotals, unitSummary: unitSummary(unitTotals), layers };
    }).sort((a, b) => String(a.shelfNo).localeCompare(String(b.shelfNo), 'zh-CN', { numeric: true }));
    const unitTotals = mapUnitTotals(area.units);
    return { area: area.area, count: area.count, unitTotals, unitSummary: unitSummary(unitTotals), shelves };
  }).sort((a, b) => b.count - a.count || a.area.localeCompare(b.area, 'zh-CN'));
}

module.exports = { normalizeUnit, formatUnitTotals, unitSummary, buildAreaStats };
