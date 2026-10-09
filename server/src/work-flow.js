const {ApiError,parseJson}=require('./utils');
const W=require('./work-assessment');
const base=require('./work-duties');
const addDays=(day,n)=>new Date(Date.parse(day+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
function schedule(start,restDate=null){
  if(restDate&&(W.week(restDate)!==start||restDate===addDays(start,6)))throw new ApiError(400,'休息日须为本周周一至周六的一天');
  return {weekStart:start,restDate,workEnd:addDays(start,5),sunday:addDays(start,6),expectedDays:5,
    confirmed:Boolean(restDate),workDates:Array.from({length:6},(_,i)=>addDays(start,i)).filter(d=>d!==restDate)};
}
async function getSchedule(db,userId,start){
  const [rows]=await db.query('SELECT rest_date,revision FROM work_week_schedule WHERE user_id=? AND week_start=?',[userId,start]);
  return {...schedule(start,rows[0]?.rest_date||null),revision:rows[0]?.revision||0};
}
function catalogApi(entries){
  entries=entries.map(base.withWorksheet).map(base.withFixedDocument);
  entries=entries.map(d=>{if(d.reportMode)return d;const reportMode=base.get(d.id)?.reportMode||'result';return {...d,reportMode,...(reportMode!=='result'?{options:['已提交材料'],abnormalOptions:[],photoRequired:reportMode==='photo'}:{})};});
  return {entries,list:mode=>entries.filter(d=>!mode||base.cadence[d.frequency]===mode),get:key=>entries.find(d=>d.id===String(key))};
}
async function getCatalog(db,start){
  const [rows]=await db.query('SELECT id,entries_json FROM work_catalog_versions WHERE effective_week<=? ORDER BY effective_week DESC,id DESC LIMIT 1',[start]);
  const [bindings]=await db.query('SELECT duty_id,document_title,document_url,revision FROM work_document_bindings WHERE workshop_code=?',['qu_making']);
  const entries=catalogApi(rows[0]?parseJson(rows[0].entries_json,[]):base.entries).entries.map(d=>{
    const binding=bindings.find(b=>b.duty_id===d.id);
    return binding?{...d,documentConfigured:true,documentUrl:binding.document_url,documentTitle:binding.document_title,documentRevision:binding.revision}:d;
  });
  return {...catalogApi(entries),version:rows[0]?.id||0};
}
function validateCatalog(input){
  if(!Array.isArray(input)||!input.length||input.length>100)throw new ApiError(400,'工作目录须包含1至100项');
  const ids=new Set();
  return input.map(raw=>{
    if(!raw||typeof raw!=='object')throw new ApiError(400,'目录项目格式无效');
    const id=String(raw.id||'');if(!/^[a-z][a-z0-9_]{0,79}$/.test(id)||ids.has(id))throw new ApiError(400,'内容编号无效或重复');ids.add(id);
    const category=W.text(raw.category,40),title=W.text(raw.title,300),evidence=W.text(raw.evidence,300);
    if(!category||!title||!['每日','每周','持续'].includes(raw.frequency))throw new ApiError(400,'请填写工作事项、内容和频次');
    if(!raw||!Array.isArray(raw.options)||raw.floors&&!Array.isArray(raw.floors)||raw.abnormalOptions&&!Array.isArray(raw.abnormalOptions))throw new ApiError(400,'目录选项格式无效');
    const reportMode=raw.reportMode||base.get(id)?.reportMode||'result';
    if(!['result','photo','document'].includes(reportMode))throw new ApiError(400,'填报方式无效');
    const options=reportMode==='result'?[...new Set(raw.options.map(v=>W.text(v,30)).filter(Boolean))]:['已提交材料'];
    if(!options.length||options.length>10)throw new ApiError(400,'请设置1至10个结果选项');
    const abnormalOptions=reportMode==='result'?(raw.abnormalOptions||[]).filter(v=>options.includes(v)):[];
    const floors=[...new Set((raw.floors||[1,2,3,4,5]).map(Number))];
    if(!floors.length||floors.some(v=>!Number.isInteger(v)||v<1||v>5))throw new ApiError(400,'适用楼层无效');
    const formType=raw.formType==='production'||id==='production_progress'?'production':'simple';
    if(formType==='production'&&(!options.includes('异常')||!abnormalOptions.includes('异常')))throw new ApiError(400,'生产跟踪表须保留“异常”结果与异常说明选项');
    const documentUrl=validLink(raw.documentUrl),documentScreenshotRequired=reportMode==='document'&&Boolean(documentUrl);
    return {id,category,title,evidence,frequency:raw.frequency,options,abnormalOptions,floors,reportMode,worksheetVersion:2,abnormalEvidence:raw.abnormalEvidence===true,
      documentUrl,documentTitle:W.text(raw.documentTitle,100),documentConfigured:raw.documentConfigured===true,documentScreenshotRequired,active:raw.active!==false,photoRequired:documentScreenshotRequired||reportMode==='photo'||(reportMode==='result'&&raw.photoRequired===true),photoWhen:raw.photoWhen==='abnormal'?'abnormal':'always',formType};
  });
}
function activeCatalog(catalog,floor){return catalogApi(catalog.entries.filter(d=>d.active!==false&&(!d.floors||d.floors.includes(Number(floor)))));}
function validLink(value){const text=W.text(value,1000);if(!text)return '';try{const u=new URL(text);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)throw 0;}catch{throw new ApiError(400,'请填写有效的 http/https 在线文档链接');}return text;}
function scoringRecords(records,calendar){return records.filter(r=>(r.kind==='duties'&&['weekly','continuous'].includes(r.payload?.mode))||calendar.workDates.includes(String(r.record_date).slice(0,10)));}
module.exports={addDays,schedule,getSchedule,getCatalog,catalogApi,activeCatalog,validateCatalog,validLink,scoringRecords};
