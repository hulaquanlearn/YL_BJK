export function canReadFire(user) {
  return Boolean(user && (['admin','raw_grain'].includes(user.role) || user.role==='viewer'&&user.staffWorkshopCode==='raw_grain' || user.fireAccess?.canRead === true))
}

export function firePointState(point, cycleId) {
  if (!cycleId) return { label: '未选择周期', tone: 'neutral', checked: false }
  const checked = point?.status === 'checked'
  return { label: checked ? '已点检' : '未点检', tone: checked ? 'checked' : 'pending', checked }
}











export function resolveFireScan(value, origin) {
  const text = String(value || '').trim()
  if (!text || text.length > 2048) throw new Error('二维码内容无效')
  if (/^https?:\/\//i.test(text)) {
    const url = new URL(text)
    if (url.origin !== origin || url.pathname !== '/fire-inspection' || url.hash || url.username || url.password || [...url.searchParams.keys()].some(key => !['point','asset'].includes(key)) || url.searchParams.getAll('point').length !== 1 || url.searchParams.getAll('asset').length > 1) throw new Error('请扫描本系统的消防器材二维码')
    const pointId = url.searchParams.get('point')
    const assetId = url.searchParams.get('asset')
    const validId = value => /^[1-9]\d{0,15}$/.test(value) && Number.isSafeInteger(Number(value))
    if (!validId(pointId) || (url.searchParams.has('asset') && !validId(assetId))) throw new Error('器材二维码无效')
    return { pointId, ...(assetId ? { assetId } : {}) }
  }
  const code = text.startsWith('FIRE:') ? text.slice(5) : text
  if (!/^[\p{L}\p{N}_\- .]{1,100}$/u.test(code)) throw new Error('请扫描消防点位二维码或输入点位编号')
  return { code }
}

export function fireSelectedImportWarnings(preview,keys){const selected=new Set(keys||[]),rows=(preview?.rows||[]).filter(r=>selected.has(r.sourceKey));return (preview?.warnings||[]).filter(w=>!w.sheet||rows.some(r=>r.sheet===w.sheet&&(r.row===w.row||w.code==='location_header')))}

export function fireImportDefaults(preview) {
  const duplicates = new Set((preview?.warnings || []).filter(w => ['duplicate_code','existing_code'].includes(w.code)).map(w => `${w.sheet}\u0000${w.row}`))
  return (preview?.rows || []).filter(row => !row.alreadyImported && !duplicates.has(`${row.sheet}\u0000${row.row}`)).map(row => row.sourceKey)
}

export function firePage(items, page = 1, size = 24) {
  const current = Math.min(Math.max(1, Number(page) || 1), Math.max(1, Math.ceil(items.length / size)))
  return items.slice((current - 1) * size, current * size)
}

// Completion belongs to each physical device, including at partly checked points.
export function fireMobileAssets(points, status = 'pending') {
  const entries = (points || []).flatMap(point => fireMatchedAssets(point).filter(asset => status === 'checked' ? asset.inspectionStatus === 'checked' && !['abnormal','missing'].includes(asset.inspectionResult) : status === 'pending' ? asset.inspectionStatus !== 'checked' : true).map(asset => ({ point, asset })))
  if (status === 'checked') {
    const checkedTime = asset => Date.parse(asset.lastCheckedAt) || -Infinity
    entries.sort((a, b) => checkedTime(b.asset) - checkedTime(a.asset) || (b.asset.lastRecordId || 0) - (a.asset.lastRecordId || 0))
  }
  return entries
}

export function fireMatchedAssets(point) {
  return (point.assets || []).filter(asset => !Array.isArray(point.matchedAssetIds) || point.matchedAssetIds.includes(asset.id))
}

export function fireSearchEntries(points, keyword = '') {
  const normalize = value => String(value ?? '').normalize('NFKC').trim().toLowerCase()
  const q = normalize(keyword), entries = (points || []).flatMap(point => fireMatchedAssets(point).map(asset => ({point,asset})))
  if (!q) return entries
  const exact = entries.filter(({asset}) => normalize(asset.code) === q)
  const codes = entries.filter(({asset}) => normalize(asset.code).includes(q))
  return exact.length ? exact : codes.length ? codes : entries.filter(({point,asset}) => [asset.code,asset.name,asset.spec,point.code,point.name,point.areaName,point.sectionName,point.building,point.floor,point.room,point.location].some(value => normalize(value).includes(q)))
}

export function fireAssetQrLink(origin, pointId, assetId) {
  const url = new URL('/fire-inspection', origin)
  url.searchParams.set('point', String(pointId))
  if (assetId) url.searchParams.set('asset', String(assetId))
  resolveFireScan(url.href, url.origin)
  return url.href
}

export function firePrintableAssets(points, type = '') {
  return (points || []).flatMap(point => fireMatchedAssets(point).filter(asset => (!type || asset.type === type) && Number(asset.quantity) === 1 && !['unconfigured','retired'].includes(asset.status)).map(asset => ({ point, asset })))
}

export function fireLabelHtml(labels) {
  const escape = value => String(value || '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))
  const cards = labels.map(label => {
    if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(label.qr)) throw new Error('二维码图片无效')
    return `<article><img src="${label.qr}" alt="器材二维码"><div><strong>${escape(label.name)}</strong><b>${escape(label.code)}</b><p>${escape(label.location)}</p><small>一物一码 · 扫码打开本期点检工单</small></div></article>`
  }).join('')
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>消防器材二维码标签</title><style>*{box-sizing:border-box}body{font-family:Arial,"Microsoft YaHei",sans-serif;margin:20px;color:#172638}header{display:flex;gap:20px;align-items:center;margin-bottom:20px}button{padding:10px 20px;cursor:pointer}main{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}article{display:flex;align-items:center;gap:10px;border:1px solid #556273;padding:10px;min-height:145px;break-inside:avoid;page-break-inside:avoid}article>img{width:112px;height:112px;flex:none}strong,b{display:block;line-height:1.6;overflow-wrap:anywhere}p{font-size:12px;line-height:1.6;overflow-wrap:anywhere;margin:5px 0}small{font-size:10px;color:#536276}@page{size:A4;margin:10mm}@media print{body{margin:0}header{display:none}main{gap:3mm}article{min-height:38mm}article>img{width:29mm;height:29mm}}@media(max-width:600px){main{grid-template-columns:1fr}}</style></head><body><header><strong>消防器材标签 · ${labels.length} 张</strong><button id="print-labels" type="button">打印标签</button><span>核对器材编号与位置后打印</span></header><main>${cards}</main></body></html>`
}
