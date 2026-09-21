const collator = new Intl.Collator('zh-CN', { numeric: true });
// Compare unit names first, then quantities within the same unit. Never sum
// incompatible units merely to give the table a numeric sorting key.
export function compareUnitTotals(a, b) {
  const normalize = rows => [...(rows || [])].sort((x,y)=>collator.compare(x.unit,y.unit));
  const left = normalize(a.unitTotals), right = normalize(b.unitTotals);
  for (let index = 0; index < Math.min(left.length,right.length); index++) {
    const unit = collator.compare(left[index].unit,right[index].unit);
    if (unit) return unit;
    const quantity = Number(left[index].total) - Number(right[index].total);
    if (quantity) return quantity;
  }
  return left.length - right.length;
}
