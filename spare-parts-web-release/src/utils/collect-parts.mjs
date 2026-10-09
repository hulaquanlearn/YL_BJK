// These selectors need a complete scope: silently stopping at the API's 200-row cap loses choices.
export async function collectParts(fetchPage, params, isCurrent = () => true) {
  const rows = [], seen = new Set()
  for (let page = 1; page <= 50; page++) {
    if (!isCurrent()) return null
    const result = await fetchPage({ ...params, page, pageSize: 200 })
    if (!isCurrent()) return null
    const items = result.data || []
    if (!Array.isArray(items)) throw new Error('备件列表格式异常，请刷新重试')
    let added = 0
    for (const item of items) {
      const key = String(item._id ?? item.id)
      if (!seen.has(key)) { seen.add(key); rows.push(item); added++ }
    }
    const total = Number(result.total)
    if ((Number.isFinite(total) && rows.length >= total) || (!Number.isFinite(total) && items.length < 200)) return rows
    if (!items.length || !added) throw new Error('备件列表未完整加载，请刷新重试')
  }
  throw new Error('备件数量过多，请缩小车间、货区或货架范围后重试')
}
