// Public product descriptors only. Never embed a customer's material ledger here.
export const evidenceModels = [{
  id:'meanwell-ndr-240-24', brands:['明纬','mean well','meanwell'], model:'NDR-240-24',
  quality:'尺寸参考', dimensionsMm:{width:63,height:125.2,depth:113.5},
  note:'外廓按厂家尺寸图；端子、散热孔和安装扣细节为近似，不用于加工或安装校核。',
  sourceUrl:'https://www.meanwell.com/Upload/PDF/NDR-240/NDR-240-SPEC.PDF', sourcePage:4,
  lowUrl:'/models/evidence/meanwell-ndr-240-24-low.glb',
  detailUrl:'/models/evidence/meanwell-ndr-240-24-detail.glb'
},{
  id:'meanwell-ndr-480-24', brands:['明纬','mean well','meanwell'], model:'NDR-480-24',
  quality:'尺寸参考', dimensionsMm:{width:85.5,height:125.2,depth:128.5},
  note:'外廓按厂家尺寸图；端子、散热孔和安装扣细节为近似，不用于加工或安装校核。',
  sourceUrl:'https://www.meanwell.com/Upload/PDF/NDR-480/NDR-480-SPEC.PDF', sourcePage:4,
  lowUrl:'/models/evidence/meanwell-ndr-480-24-low.glb',
  detailUrl:'/models/evidence/meanwell-ndr-480-24-detail.glb'
},{
  id:'skf-6006-2z', brands:['SKF'], model:'6006-2Z',
  quality:'尺寸参考', dimensionsMm:{width:55,height:55,depth:13}, boreMm:30,
  note:'内径、外径和宽度按厂家目录；倒角及防尘盖细节近似，不用于加工或安装校核。',
  sourceUrl:'https://cdn.skfmediahub.skf.com/api/public/0901d196802809de/pdf_preview_medium/0901d196802809de_pdf_preview_medium.pdf', sourcePage:276,
  lowUrl:'/models/evidence/skf-6006-2z-low.glb', detailUrl:'/models/evidence/skf-6006-2z-detail.glb'
},...[
  {id:'skf-6003-2rsh',model:'6003-2RSH',boreMm:17,outer:35,depth:10,sourcePage:270,seal:'rubber'},
  {id:'skf-61802',model:'61802',boreMm:15,outer:24,depth:5,sourcePage:268,seal:'open'}
].map(item=>({
  ...item,brands:['SKF'],quality:'尺寸参考',dimensionsMm:{width:item.outer,height:item.outer,depth:item.depth},
  note:'内径、外径和宽度按厂家目录；滚道、滚珠数量及密封细节近似，不用于加工或安装校核。',
  sourceUrl:'https://cdn.skfmediahub.skf.com/api/public/0901d196802809de/pdf_preview_medium/0901d196802809de_pdf_preview_medium.pdf',
  lowUrl:`/models/evidence/${item.id}-low.glb`,detailUrl:`/models/evidence/${item.id}-detail.glb`
}))]

const normalize = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[‐‑–—]/g,'-')
function token(text, value) {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?=$|[^a-z0-9/-])`,'i').test(text)
}
export function resolveEvidenceModel(part, catalog = evidenceModels) {
  if (!part) return null
  const text = normalize(`${part.materialDesc || part.name || ''} ${part.spec || ''}`)
  if (/禁止使用|停用|替代|兼容|附件|外壳|安装扣|维修包/.test(text)) return null
  if (/\bw\s+\d{4,5}|\b(?:6006-2z|6003-2rsh|61802)\s+(?:c[2345]|va\d+)/i.test(text)) return null
  const brand = normalize(part.brand)
  const matches = catalog.filter(item => token(text,normalize(item.model)) && item.brands.some(b=>
    brand ? brand === normalize(b) : (/[\u3400-\u9fff]/.test(b) ? text.includes(b) : token(text,normalize(b)))))
  // Multiple exact descriptors are ambiguous; never choose the first arbitrarily.
  return matches.length === 1 ? matches[0] : null
}

export function unsafeCategory(part) {
  const text = normalize(`${part?.materialDesc || part?.name || ''} ${part?.spec || ''}`)
  const category = normalize(`${part?.categoryModelName || part?.categoryName || ''} ${part?.categoryModelUrl || ''}`)
  const protector = /电机保护|马达断路器|\bgv[23][- ]?(?:me|pm|p)\d/.test(text)
  if (protector && /电机|motor|reducer/.test(category)) return true
  if ((protector || /\b[124]\s*p\b/.test(text)) && /3p|三极|circuit-breaker/.test(category)) return true
  return false
}

// Explicit ledger binding is authoritative; no descriptor-based fallback.
export function warehouseModelUrl(part) {
  return String(part?.categoryModelUrl || '').trim()
}
