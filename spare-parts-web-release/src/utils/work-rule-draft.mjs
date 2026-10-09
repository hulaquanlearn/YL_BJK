// Build the whole scoring form from the effective catalog, preserving saved criteria.
export function catalogRuleDraft(duties, saved = [], defaults = []) {
  if (saved.length) return saved.map((r,i) => ({...r, id:String(i+1), title:duties.find(d=>d.id===r.dutyId)?.title || r.title}))
  return duties.filter(d => d.active !== false).map((d, i) => {
    const previous = saved.find(r => r.dutyId === d.id || (!r.dutyId && r.title === d.title))
    const suggested = defaults.find(r => r.dutyId === d.id)
    return {
      id: String(i + 1), dutyId: d.id, title: d.title, kind: 'manual',
      max: saved.length ? 0 : '', bonusPerClosure: 0, target: 5, deduction: 1,
      standard: suggested?.standard || `依据“${d.title}”的工作结果及${d.evidence || '验证材料'}复核；漏报、异常或未完成一次即扣完本项基础分，最低0分；休息 R 和未到期限不扣漏报分，闭环加分由班长另行确认。`,
      ...previous, dutyId: d.id, title: d.title,
    }
  })
}

export function ruleDraftProblems(draft, duties) {
  const problems = []
  if (!draft.length) problems.push('请新增工作事项与评分标准')
  const selected = draft.filter(r => Number(r.max) > 0)
  const missingPoints = []
  for (const [i, r] of draft.entries()) {
    if (r.max === '' || r.max == null || !Number.isFinite(Number(r.max)) || Number(r.max) < 0 || Number(r.max) > 25) {
      missingPoints.push(i + 1); continue
    }
    if (Number(r.max) === 0) continue
    const d = duties.find(d => d.id === r.dutyId && d.active !== false)
    if (!d && !r.custom) problems.push(`第 ${i + 1} 项不在工作目录中`)
    if (r.custom && (!r.title?.trim() || !/^[a-zA-Z0-9_-]{1,80}$/.test(r.customId||'') || r.kind!=='manual' || r.bonusPerClosure)) problems.push(`第 ${i+1} 项请填写工作事项，新增事项采用人工复核`)
    if (!r.standard?.trim()) problems.push(`第 ${i + 1} 项请填写评判标准`)
    if (r.kind !== 'manual' && !(r.kind === 'duties' && d?.frequency === '每日')) problems.push(`第 ${i + 1} 项请核对计分方式，自动计分仅用于每日事项`)
    if (Number(r.max) < 0.1) problems.push(`第 ${i + 1} 项计分分值不能低于 0.1`)
  }
  if (missingPoints.length) problems.push(`还有 ${missingPoints.length} 项分值未填写或无效（第 ${missingPoints.join('、')} 项），请填写 0 至 25 分`)
  const total = Math.round(selected.reduce((s, r) => s + Number(r.max), 0) * 100) / 100
  if (total !== 25) problems.push(`各项合计须为 25 分，当前 ${total} 分`)
  if (selected.filter(r=>r.custom).length>20) problems.push('新增工作事项最多 20 项')
  if (new Set(selected.map(r => r.custom?r.customId:r.dutyId)).size !== selected.length) problems.push('同一工作事项不能重复计分')
  return problems
}

export function groupRuleDraft(draft, duties) {
  const categories = [...new Set(duties.map(d=>d.category).filter(Boolean))]
  const groups = new Map(categories.map(category=>[category,{category,items:[],total:0,unfilled:0}]))
  draft.forEach((rule,index)=>{
    const category = rule.custom ? rule.category?.trim() || '其他事项' : duties.find(d=>d.id===rule.dutyId)?.category || '其他事项'
    if (!groups.has(category)) groups.set(category,{category,items:[],total:0,unfilled:0})
    const group=groups.get(category)
    group.items.push({rule,index})
    if(rule.max==='' || rule.max==null || !Number.isFinite(Number(rule.max))) group.unfilled++
    else group.total+=Number(rule.max)
  })
  return [...groups.values()].filter(g=>g.items.length).map(g=>({...g,total:Math.round(g.total*100)/100}))
}
