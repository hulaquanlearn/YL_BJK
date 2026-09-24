const crypto = require('crypto');
const { ApiError } = require('./utils');
const {mapTilePhoto}=require('./inspection-vision');

const HEADERS = ['序号','工段','问题图片','类别','问题描述','整改意见','整改图片','备注'];
const LIMITS = { perUpload:8, sources:40, fileBytes:6*1024*1024, reportBytes:120*1024*1024, issues:200, photosPerIssue:8, exportPhotos:240, issueJsonBytes:3*1024*1024 };
const text = (value, max=1000) => String(value ?? '').trim().slice(0,max);
const integer = value => { const n=Number(value); if(!Number.isSafeInteger(n)||n<1)throw new ApiError(400,'编号无效'); return n; };
function header(input={}) {
  return {
    title:text(input.title,160)||'检查通报',
    checkTime:text(input.checkTime,100),checkScope:text(input.checkScope,200),
    inspectors:text(input.inspectors,200),checkItems:text(input.checkItems,200)
  };
}
function rect(value) {
  const result={x:Number(value?.x),y:Number(value?.y),w:Number(value?.w),h:Number(value?.h)};
  if(Object.values(result).some(n=>!Number.isFinite(n))||result.x<0||result.y<0||result.w<.01||result.h<.01||result.x+result.w>1.001||result.y+result.h>1.001)throw new ApiError(400,'照片裁切范围无效');
  return Object.fromEntries(Object.entries(result).map(([key,n])=>[key,Math.max(0,Math.min(1,n))]));
}
function issue(input,allowedSources) {
  const id=String(input?.id||crypto.randomUUID());
  if(!/^[a-zA-Z0-9-]{1,80}$/.test(id))throw new ApiError(400,'问题编号无效');
  const sourceIds=[...new Set((Array.isArray(input?.sourceIds)?input.sourceIds:[]).map(integer))];
  const photos=(Array.isArray(input?.photos)?input.photos:[]).map(photo=>({sourceId:integer(photo.sourceId),rect:rect(photo.rect)}));
  if(photos.length>LIMITS.photosPerIssue)throw new ApiError(400,'单条问题照片过多');
  if([...sourceIds,...photos.map(photo=>photo.sourceId)].some(sourceId=>!allowedSources.has(sourceId)))throw new ApiError(400,'引用了不属于本通报的截图');
  const reviewStatus=input?.reviewStatus==='confirmed'?'confirmed':'pending';
  const normalized={id,origin:input?.origin==='ai'?'ai':'manual',segment:text(input?.segment,100),location:text(input?.location,160),equipment:text(input?.equipment,120),problem:text(input?.problem,2000),category:text(input?.category,100),rectification:text(input?.rectification,2000),remarks:text(input?.remarks,1000),rawText:text(input?.rawText,2000),pairingReason:text(input?.pairingReason,1000),missingInfo:text(input?.missingInfo,500),duplicateHint:text(input?.duplicateHint,300),reviewStatus,sourceIds,photos};
  if(reviewStatus==='confirmed') normalized.confirmToken=/^[a-zA-Z0-9-]{1,80}$/.test(String(input?.confirmToken||''))?String(input.confirmToken):'';
  if(reviewStatus==='confirmed'&&!normalized.problem)throw new ApiError(400,'确认问题前请填写问题描述');
  return normalized;
}
function reviewContent(row){return JSON.stringify(['segment','location','equipment','problem','category','rectification','remarks','rawText','pairingReason','missingInfo','duplicateHint','sourceIds','photos'].map(key=>row[key]));}
function issues(input,allowedSources,previous=[]) {
  if(!Array.isArray(input)||input.length>LIMITS.issues)throw new ApiError(400,'问题条数超出上限');
  const previousById=new Map(previous.map(row=>[row.id,row]));
  const rows=input.map(item=>{
    const row=issue(item,allowedSources),old=previousById.get(row.id);
    if(row.reviewStatus==='confirmed'&&old?.reviewStatus==='confirmed'&&reviewContent(row)!==reviewContent(old)&&row.confirmToken===(old.confirmToken||'')){
      row.reviewStatus='pending';delete row.confirmToken;
    }
    return row;
  });
  if(rows.reduce((count,row)=>count+row.photos.length,0)>LIMITS.exportPhotos)throw new ApiError(400,'单份通报最多关联240张问题图片');
  if(new Set(rows.map(row=>row.id)).size!==rows.length)throw new ApiError(400,'问题编号重复');
  if(Buffer.byteLength(JSON.stringify(rows))>LIMITS.issueJsonBytes)throw new ApiError(400,'问题内容超过3MB上限，请拆分通报');
  return rows;
}
function similarity(a,b){
  const clean=value=>text(value,2000).toLowerCase().replace(/[\s，。；：、,.!！?？]/g,'');
  const x=clean(a),y=clean(b);if(x.length<8||y.length<8)return 0;
  const grams=s=>new Set(Array.from({length:s.length-1},(_,i)=>s.slice(i,i+2)));
  const A=grams(x),B=grams(y),hits=[...A].filter(g=>B.has(g)).length;
  return hits/(A.size+B.size-hits);
}
function withDuplicateHints(existing,newRows){
  return newRows.map(row=>{
    const same=[...existing,...newRows.filter(other=>other.id!==row.id)].find(other=>similarity(`${row.equipment}${row.problem}`,`${other.equipment}${other.problem}`)>.78);
    return same&&!row.duplicateHint?{...row,duplicateHint:`与问题 ${same.id} 表述相近，请核对是否为重叠截图或补充材料；未自动删除。`}:row;
  });
}
function parseAi(content,sourceIds,existing,sourceIdSet,freshIds=sourceIds,tiles=[]){
  let parsed;try{const value=Array.isArray(content)?content.map(part=>part.text||'').join('\n'):String(content||'');parsed=JSON.parse(value.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));}catch{throw new ApiError(502,'识图结果格式无法核对，请仅重试失败的截图');}
  if(!Array.isArray(parsed.issues)||parsed.issues.length>60)throw new ApiError(502,'识图结果缺少可核对的问题列表');
  const tileCounts=new Map();for(const tile of tiles)tileCounts.set(tile.sourceId,(tileCounts.get(tile.sourceId)||0)+1);
  const selected=new Set(sourceIds),rows=parsed.issues.map(item=>{
    const photos=(Array.isArray(item.photos)?item.photos:[]).filter(photo=>photo.tileId||!tiles.length||tileCounts.get(Number(photo.sourceId))===1).map(photo=>mapTilePhoto(photo,tiles));
    const skipped=(Array.isArray(item.photos)?item.photos.length:0)-photos.length;
    return issue({
    id:crypto.randomUUID(),origin:'ai',reviewStatus:'pending',segment:item.segment,location:item.location,
    equipment:item.equipment,problem:item.problem,rawText:item.rawText,
    category:item.categorySuggestion||item.category,rectification:item.rectificationSuggestion||item.rectification,
    pairingReason:item.pairingReason,missingInfo:[item.missingInfo,skipped?'分段照片缺少编号，未自动裁切；请从原图人工配图':''].filter(Boolean).join('；'),duplicateHint:item.duplicateHint,
    sourceIds:item.sourceIds||[],photos,remarks:''
  },sourceIdSet)});
  if(rows.some(row=>!row.sourceIds.length&&!row.photos.length))throw new ApiError(502,'识图结果缺少原截图引用，请仅重试失败截图');
  if(rows.some(row=>[...row.sourceIds,...row.photos.map(photo=>photo.sourceId)].some(sourceId=>!selected.has(sourceId))))throw new ApiError(502,'识图结果引用了本次以外的截图');
  const fresh=new Set(freshIds);
  return withDuplicateHints(existing,rows.filter(row=>[...row.sourceIds,...row.photos.map(photo=>photo.sourceId)].some(id=>fresh.has(id))));
}
module.exports={HEADERS,LIMITS,text,integer,header,rect,issue,issues,reviewContent,similarity,withDuplicateHints,parseAi};
