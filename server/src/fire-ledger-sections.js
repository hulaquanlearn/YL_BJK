const {parseJson}=require('./utils');
const {isDeepStrictEqual}=require('node:util');
// Match source identity, not business code alone: duplicate numbers are allowed
// in different source rows. Classification never changes IDs or permission areas.
function planFireSections(parsed,points,assets){
 const pointMap=new Map(points.map(p=>[Number(p.id),p])),byRow=new Map(),updates=[],errors=[],seen=new Set();
 for(const a of assets){const s=parseJson(a.source_json,{}),key=`${s.sheet}\0${s.row}\0${a.type}`;if(!byRow.has(key))byRow.set(key,[]);byRow.get(key).push(a)}
 for(const r of parsed.rows){
  const candidates=(byRow.get(`${r.sheet}\0${r.row}\0${r.type}`)||[]).filter(a=>String(a.code).trim()===r.code);
  if(candidates.length!==1){errors.push({sheet:r.sheet,row:r.row,code:r.code,message:'无法唯一匹配现有来源行'});continue}
  const a=candidates[0],p=pointMap.get(Number(a.point_id));
  if(!p||seen.has(Number(a.id))){errors.push({sheet:r.sheet,row:r.row,message:'重复器材或点位不存在'});continue}seen.add(Number(a.id));
  if(!r.sectionName){errors.push({sheet:r.sheet,row:r.row,message:'工段为空'});continue}
  const source=parseJson(a.source_json,{}),aliases=[...new Set([...(Array.isArray(source.reconciledSourceKeys)?source.reconciledSourceKeys:[]),r.sourceKey])];
  const nextSource={...source,reconciledSourceKeys:aliases,latestClassification:{fileHash:parsed.fileHash,sheet:r.sheet,row:r.row,sectionName:r.sectionName,department:r.area}};
  updates.push({pointId:Number(p.id),assetId:Number(a.id),sectionName:r.sectionName,location:r.location,name:p.name===p.location?r.location:p.name,source:nextSource,pointChanged:(p.section_name||'')!==r.sectionName||p.location!==r.location,sourceChanged:!isDeepStrictEqual(source,nextSource),departmentDifference:p.area_name!==r.area});
 }
 if(seen.size!==assets.length)errors.push({message:'新版台账未覆盖全部在用器材，不执行部分覆盖',matched:seen.size,existing:assets.length});
 const pointGroups=new Map();for(const row of updates){const value=JSON.stringify([row.sectionName,row.location]);if(pointGroups.has(row.pointId)&&pointGroups.get(row.pointId)!==value)errors.push({pointId:row.pointId,message:'同一点位存在不同工段或位置'});pointGroups.set(row.pointId,value)}
 const sections={};for(const r of updates)sections[r.sectionName]=(sections[r.sectionName]||0)+1;
 return {fileHash:parsed.fileHash,updates,errors,sections,matched:updates.length,pointsChanged:new Set(updates.filter(r=>r.pointChanged).map(r=>r.pointId)).size,assetsChanged:updates.filter(r=>r.sourceChanged).length,departmentDifferences:updates.filter(r=>r.departmentDifference).length};
}
module.exports={planFireSections};
