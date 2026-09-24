const limits={segment:100,location:160,equipment:120,problem:2000,category:100,rectification:2000,remarks:1000,rawText:2000,pairingReason:1000,missingInfo:500,duplicateHint:300}
const shortFields=['segment','location','equipment','category']
const longFields=['problem','rectification','remarks','rawText','pairingReason','missingInfo','duplicateHint']

export function mergeIssues(issues,indexes){
  if(indexes.length<2)throw new Error('至少选择两条问题')
  const selected=indexes.map(index=>issues[index])
  if(selected.some(issue=>!issue))throw new Error('待合并的问题不存在')
  if(selected.reduce((sum,issue)=>sum+issue.photos.length,0)>8)throw new Error('单条问题最多保留 8 张照片，请先调整配图')
  const combined=JSON.parse(JSON.stringify(selected[0]))
  for(const field of shortFields){
    const values=[...new Set(selected.map(issue=>String(issue[field]||'').trim()).filter(Boolean))]
    combined[field]=values.join(' / ')
  }
  for(const field of longFields){
    const values=[...new Set(selected.map(issue=>String(issue[field]||'').trim()).filter(Boolean))]
    combined[field]=values.join('\n\n')
  }
  combined.photos=selected.flatMap(issue=>JSON.parse(JSON.stringify(issue.photos)))
  combined.sourceIds=[...new Set(selected.flatMap(issue=>issue.sourceIds))]
  for(const [field,max] of Object.entries(limits))if(combined[field].length>max)throw new Error(`合并后的${field}超过${max}字；请先人工精简，原条目未改变`)
  combined.reviewStatus='pending'
  delete combined.confirmToken
  const picked=new Set(indexes)
  return issues.flatMap((issue,index)=>index===indexes[0]?[combined]:picked.has(index)?[]:[issue])
}
