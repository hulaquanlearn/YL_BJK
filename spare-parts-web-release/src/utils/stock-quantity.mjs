export function stockQuantityStep(unit = '') {
  return /^(?:米|m|M|千克|公斤|kg|KG|克|g|吨|t|升|L|l|毫升|ml|平方米|立方米|m²|m³)$/.test(String(unit).trim()) ? 0.1 : 1
}

export function parseStockQuantity(raw, { available, max = 999999 } = {}) {
  if (raw == null || typeof raw === 'boolean' || String(raw).trim() === '') throw new Error('请填写本次数量')
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) throw new Error('数量必须大于0')
  if (value > max) throw new Error(`数量不能超过${max}`)
  const normalized = Number(value.toFixed(4))
  if (Math.abs(value - normalized) > Number.EPSILON * Math.max(1, Math.abs(value)) * 4 || normalized <= 0) throw new Error('数量最多支持4位小数')
  if (available != null && normalized > Number(available)) throw new Error('出库数量不能超过当前库存')
  return normalized
}
