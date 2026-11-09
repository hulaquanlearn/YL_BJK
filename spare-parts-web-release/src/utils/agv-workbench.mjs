// Muted, sufficiently dark accents for small legends on the light workbench.
export const SYSTEM_COLORS=Object.freeze({
 body:'#64748b',
 lift:'#9a732c',
 drive:'#326f9b',
 power:'#397f69',
 control:'#79639d',
 safety:'#ae5655',
 rotation:'#a16483',
 other:'#6f7782'
})

export function matrixGroups(partInfo,groups){
 const byId=new Map()
 for(const part of partInfo||[]){
  if(part&&typeof part.id==='string'&&part.id&&!byId.has(part.id))byId.set(part.id,part)
 }
 const assigned=new Set(),result=[]
 for(const group of groups||[]){
  const parts=[]
  for(const id of group.parts||[]){
   if(typeof id!=='string'||!byId.has(id)||assigned.has(id))continue
   assigned.add(id)
   parts.push(byId.get(id))
  }
  if(parts.length)result.push({...group,color:SYSTEM_COLORS[group.id]||SYSTEM_COLORS.other,parts})
 }
 const remaining=[...byId.values()].filter(part=>!assigned.has(part.id))
 if(remaining.length)result.push({id:'other',label:'其他部件',color:SYSTEM_COLORS.other,parts:remaining})
 return result
}

function finiteNumber(value){
 if(typeof value!=='number'&&(typeof value!=='string'||!value.trim()))return NaN
 const number=Number(value)
 return Number.isFinite(number)?number:NaN
}

export function clampUnit(value,fallback=0){
 const number=finiteNumber(value),backup=finiteNumber(fallback)
 return Math.max(0,Math.min(1,Number.isFinite(number)?number:Number.isFinite(backup)?backup:0))
}

export function advanceExplosion(current,target,delta){
 const from=clampUnit(current),to=clampUnit(target)
 if(!Number.isFinite(delta)||delta<=0)return from
 const step=Math.min(delta,.05)/(to>from?.9:.65)
 return to>from?Math.min(to,from+step):Math.max(to,from-step)
}

