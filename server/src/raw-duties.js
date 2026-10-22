const {ApiError}=require('./utils');
const {week,date}=require('./calendar-date');
const statuses={draft:'填写中',submitted:'已提交',returned:'需补充',confirmed:'已确认'};
const results=['已完成','异常'];
// Historical values remain readable and saveable without rewriting old records.
const acceptedResults=[...results,'进行中','未完成','本周未发生','本期不适用'];
const source=[
 ['班前管理','核实当班人员，如实填写考勤信息，异常情况及时登记并报备。','每班','考勤记录表'],
 ['班前管理','总结上个班的问题通报、设备故障，安排当班设备和安全注意事项。','每班','班前会记录'],
 ['班前管理','根据原粮排班、工艺变更及生产调配，做好本工段工作布置。','每班','班前会记录'],
 ['员工管理','抽查员工手机使用情况，检查是否运行与工作无关的软件。','持续开展','现场检查照片'],
 ['员工管理','通过系统及时填报考核事项。','持续开展','车间绩效系统记录'],
 ['员工管理','检查员工是否按规定佩戴劳保用品。','每周','周通报'],
 ['安全管理','按车间计划开展安全检查，及时跟进发现问题的整改。','每周','周通报'],
 ['安全管理','利用中控系统等检查安全联锁装置运行有效性，跟进异常整改。','每周','周通报'],
 ['安全管理','检查各岗位员工安全操作规程执行情况。','每班','周通报'],
 ['生产管理','关注当班生产进度，协调处理异常，保障生产连续稳定运行。','持续开展','生产进度异常记录'],
 ['生产管理','及时反馈原辅料质量问题，协同相关部门逐项分析处理。','持续开展','现场处理记录或图片'],
 ['设备管理','监控抽查MES工单执行情况，对保养工单进行抽查验证。','每周','周通报'],
 ['设备管理','通过工业物联网等检查设备运行情况，跟进处理异常。','每班','现场照片或检查记录'],
 ['班后管理','检查班会秩序、有无夹带公司财物及排队通行、手机使用情况。','每班','现场照片'],
 ['班后管理','检查员工头盔、反光马甲穿戴是否规范。','每周','现场照片'],
 ['工具管理','检查工具摆放、标签对应和工具架卫生。','每班','周通报'],
 ['工具管理','检查工具架实物与张贴台账是否一致。','每周','周通报'],
 ['思想动态','按需开展谈心谈话，发现异常及时反馈并跟进处理。','每月','谈心谈话情况记录'],
 ['其他','检查下属工作履职情况。','每周','周通报']
];
const defaultTemplate={id:0,title:'原粮工段长履职参考模板',entries:source.map((s,i)=>({id:`raw-${i+1}`,category:s[0],title:s[1],frequency:s[2],evidence:s[3]}))};
const fail=(code,msg)=>{throw new ApiError(code,msg)};
function text(v,max=4000){if(typeof v!=='string')return '';if(v.length>max)fail(400,`内容不能超过${max}字`);return v.trim()}
function id(v){const n=Number(v);if(!Number.isSafeInteger(n)||n<1)fail(400,'编号无效');return n}
function revision(v){if(!Number.isSafeInteger(v)||v<0)fail(400,'版本无效，请重新加载');return v}
const today=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,10);
function period(v=today()){const start=week(v);return {start,end:new Date(Date.parse(start+'T00:00:00Z')+6*86400000).toISOString().slice(0,10)}}
const manager=u=>['admin','raw_grain'].includes(u?.role);
const rawUser=u=>u?.role==='raw_grain'||(u?.role==='viewer'&&u.staffWorkshopCode==='raw_grain'&&u.staffPosition==='shift_leader');
function access(u){if(!manager(u)&&!rawUser(u))fail(403,'原粮周履职仅供原粮授权人员使用')}
function template(input){
 const title=text(input.title,100),entries=input.entries;
 if(!title||!Array.isArray(entries)||!entries.length||entries.length>60)fail(400,'请填写模板名称及1至60项职责');
 const seen=new Set();
 return {title,entries:entries.map(e=>{
  const key=text(e.id,60);if(!/^[\w-]+$/.test(key)||seen.has(key))fail(400,'职责编号无效或重复');seen.add(key);
  const out={id:key,category:text(e.category,50),title:text(e.title,600),frequency:text(e.frequency,20),evidence:text(e.evidence,150)};
  if(!out.category||!out.title||!['每班','每周','每月','持续开展'].includes(out.frequency))fail(400,'请补全工作分类、内容和频次');return out;
 })};
}
function checks(input,tmpl,photos,submit=false){
 if(!Array.isArray(input)||input.length>60)fail(400,'履职记录格式无效');
 const seen=new Set(),allowed=new Set(tmpl.entries.map(e=>e.id)),pids=new Set(photos.map(p=>Number(p.id)));
 const out=input.map(c=>{
  if(!allowed.has(c.dutyId)||seen.has(c.dutyId))fail(400,'职责无效或重复');seen.add(c.dutyId);
  const result=text(c.result,20),note=text(c.note),action=text(c.action),photoIds=c.photoIds||[];
  if(result&&!acceptedResults.includes(result))fail(400,'履职结果无效');
  if(result==='异常'&&!note)fail(400,'请填写异常原因');
  if(!Array.isArray(photoIds)||photoIds.length>20||photoIds.some(p=>!pids.has(Number(p))))fail(400,'验证材料不属于本周记录');
  const recordDate=c.recordDate?date(c.recordDate):'';
  return {dutyId:c.dutyId,result,note,action,recordDate,photoIds:[...new Set(photoIds.map(Number))]};
 });
 if(submit){
  if(tmpl.entries.some(e=>!out.some(c=>c.dutyId===e.id&&c.result)))fail(400,'请逐项填写已完成或异常');
  if(out.some(c=>c.result!=='已完成'&&!c.note&&!c.photoIds.length))fail(400,'每项请至少填写情况说明或关联验证图片');
  if(out.some(c=>['进行中','未完成','本周未发生','本期不适用'].includes(c.result)&&!c.note))fail(400,'进行中、未完成、未发生或不适用的事项请填写说明');
 }
 return out;
}
function decode(r){if(!r)return null;const json=v=>typeof v==='string'?JSON.parse(v):v;return {...r,id:Number(r.id),user_id:Number(r.user_id),revision:Number(r.revision),identity:json(r.identity_json),template:json(r.template_json),checks:json(r.checks_json),cadence:r.cadence_json?json(r.cadence_json):null}}
function mutable(r){if(!['draft','returned'].includes(r.status))fail(409,'已提交或确认的材料不能直接修改，请先撤回或由负责人重新打开')}
module.exports={statuses,results,defaultTemplate,text,id,revision,today,period,manager,rawUser,access,template,checks,decode,mutable,fail};
