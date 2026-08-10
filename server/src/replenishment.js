function nullableNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildReplenishmentItem(part = {}) {
  const currentStock = Number(part.totalStock) || 0;
  const inTransit = Number(part.inTransit) || 0;
  const reorderPoint = nullableNumber(part.reorderPoint ?? part.safetyStock);
  const maxStock = nullableNumber(part.maxStock);
  const price = nullableNumber(part.price);
  const availableStock = currentStock + inTransit;
  const suggestedQuantity = maxStock === null
    ? null
    : Math.max(maxStock - availableStock, 0);

  let riskLevel = 'warning';
  if (currentStock <= 0) riskLevel = 'critical';
  else if (reorderPoint !== null && reorderPoint > 0 && currentStock <= reorderPoint * 0.5) riskLevel = 'high';

  return {
    ...part,
    currentStock,
    inTransit,
    availableStock,
    reorderPoint,
    maxStock,
    targetStock: maxStock,
    suggestedQuantity,
    estimatedAmount: suggestedQuantity === null || price === null
      ? null
      : Number((suggestedQuantity * price).toFixed(2)),
    needsTargetConfig: maxStock === null,
    riskLevel
  };
}

function buildSuggestedUnitTotals(items = []) {
  const totals = new Map();
  items.forEach(item => {
    if (item.suggestedQuantity === null || item.suggestedQuantity <= 0) return;
    const unit = String(item.unit || '').trim() || '未标单位';
    totals.set(unit, (totals.get(unit) || 0) + item.suggestedQuantity);
  });
  return [...totals.entries()]
    .map(([unit, total]) => ({ unit, total }))
    .sort((a, b) => b.total - a.total || a.unit.localeCompare(b.unit, 'zh-CN'));
}

module.exports = { buildReplenishmentItem, buildSuggestedUnitTotals };
