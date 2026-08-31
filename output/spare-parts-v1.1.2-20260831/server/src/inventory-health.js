const HEALTH_STATUS = Object.freeze({
  ZERO: 'zero',
  LOW: 'low',
  HEALTHY: 'healthy',
  UNCONFIGURED: 'unconfigured'
});

function classifyInventoryHealth(quantity, reorderPoint) {
  const stock = Number(quantity) || 0;
  if (stock <= 0) return HEALTH_STATUS.ZERO;
  if (reorderPoint === null || reorderPoint === undefined || reorderPoint === '') {
    return HEALTH_STATUS.UNCONFIGURED;
  }
  return stock <= Number(reorderPoint) ? HEALTH_STATUS.LOW : HEALTH_STATUS.HEALTHY;
}

function summarizeInventoryHealth(rows = []) {
  const summary = { total: 0, zeroStock: 0, lowPositiveStock: 0, healthyStock: 0, unconfiguredStock: 0 };
  rows.forEach(row => {
    summary.total += 1;
    const status = classifyInventoryHealth(row.quantity, row.reorderPoint);
    if (status === HEALTH_STATUS.ZERO) summary.zeroStock += 1;
    else if (status === HEALTH_STATUS.LOW) summary.lowPositiveStock += 1;
    else if (status === HEALTH_STATUS.HEALTHY) summary.healthyStock += 1;
    else summary.unconfiguredStock += 1;
  });
  return summary;
}

module.exports = { HEALTH_STATUS, classifyInventoryHealth, summarizeInventoryHealth };
