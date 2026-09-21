export async function collectFilteredParts(fetchPage, filters, selectable, isCurrent = () => true) {
  const rows = new Map();
  let expected = null;
  for (let page = 1; ; page++) {
    const result = await fetchPage({ ...filters, page, pageSize: 200 });
    if (!isCurrent()) return null;
    const total = Number(result.total);
    if (!Number.isSafeInteger(total) || total < 0 || (expected !== null && expected !== total)) throw new Error('筛选结果已变化，请刷新后重新全选');
    expected = total;
    const items = result.data || [];
    const before = rows.size;
    for (const row of items) rows.set(String(row._id), row);
    if (rows.size >= total) return [...rows.values()].filter(selectable);
    if (!items.length || rows.size === before) throw new Error('列表加载不完整，请刷新后重新全选');
  }
}
