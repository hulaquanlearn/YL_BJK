export function stockHealth(part) {
  if (Number(part?.totalStock) <= 0) return { key: 'zero', label: '零库存', type: 'danger' }
  if (part?.reorderPoint == null || part.reorderPoint === '') return { key: 'unconfigured', label: '订购点未配置', type: 'info' }
  if (Number(part.totalStock) <= Number(part.reorderPoint)) return { key: 'low', label: '需要补充', type: 'warning' }
  return { key: 'normal', label: '库存正常', type: 'success' }
}
