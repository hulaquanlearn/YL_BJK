const test = require('node:test');
const assert = require('node:assert/strict');
const W = require('../src/work-assessment');
const { createWorkbook } = require('../src/work-export');
const config = [{ title:'记录完成',kind:'process',max:40,target:5,deduction:8,standard:'每周5天完整记录' },{ title:'履职复核',kind:'manual',max:60,standard:'依据异常处理、整改闭环情况复核' }];
test('work weeks use Monday including Sunday and year boundary', () => {
  assert.equal(W.week('2026-09-27'), '2026-09-21'); assert.equal(W.week('2027-01-01'), '2026-12-28');
  for(const d of ['2026-02-30','2026-99-99','no','2026-9-1']) assert.throws(()=>W.date(d),{status:400});
});
test('rules require explicit standards, valid totals and integer daily targets', () => {
  const r=W.rules(config); assert.equal(r.length,2);
  assert.throws(()=>W.rules([]),{status:400});
  assert.throws(()=>W.rules([{...config[0],max:100,standard:''}]),{status:400});
  assert.throws(()=>W.rules([{...config[0],max:100,target:5.5}]),{status:400});
  assert.throws(()=>W.rules([{...config[0],max:99}]),{status:400});
});
test('catalog scoring accepts fractional points and still enforces the 25 point total',()=>{
  const config=[{dutyId:'production_progress',kind:'manual',max:24.5,standard:'依据生产材料复核'},{dutyId:'team_feedback',kind:'manual',max:0.5,standard:'依据反馈材料复核'}]
  assert.equal(W.rules(config,{requireDuty:true})[1].max,0.5)
  assert.throws(()=>W.rules([{...config[0],max:24},{...config[1]}],{requireDuty:true}),/25 分/)
  assert.throws(()=>W.rules([{...config[0],max:25},{...config[1],max:0}],{requireDuty:true}),{status:400})
})
test('new scoring rules must select distinct existing duties and count only that duty',()=>{
  const standard='依据本项工作记录和验证材料复核';
  const strict={requireDuty:true};
  const rule=W.rules([{dutyId:'production_progress',title:'随意填写的名称',kind:'duties',max:25,target:5,deduction:5,standard}],strict)[0];
  assert.equal(rule.title,W.duties.get('production_progress').title);
  assert.equal(rule.dutyId,'production_progress');
  assert.throws(()=>W.rules([{title:'自由填写',kind:'manual',max:100,standard}],strict),/已建工作事项/);
  assert.throws(()=>W.rules([{dutyId:'energy_usage',kind:'duties',max:100,target:1,deduction:20,standard}],strict),/只有每日事项/);
  assert.throws(()=>W.rules([{dutyId:'production_progress',kind:'manual',max:50,standard},{dutyId:'production_progress',kind:'manual',max:50,standard}],strict),/不能重复/);
  const records=[
    {id:1,kind:'duties',status:'submitted',record_date:'2026-09-21',payload:{mode:'daily',checks:[{dutyId:'team_feedback'}]}},
    {id:2,kind:'duties',status:'submitted',record_date:'2026-09-22',payload:{mode:'daily',checks:[{dutyId:'production_progress',status:'正常'}]}}
  ];
  assert.equal(W.evaluate([rule],records).items[0].count,1);
  assert.equal(rule.deduction,25);
  assert.equal(W.evaluate([rule],records).items[0].score,0);
});
test('drafts and multiple same-day entries cannot inflate completion score', () => {
  const r=W.rules(config), records=[{id:1,kind:'process',status:'submitted',record_date:'2026-09-21'},{id:2,kind:'process',status:'submitted',record_date:'2026-09-21'},{id:3,kind:'process',status:'draft',record_date:'2026-09-22'}];
  const result=W.evaluate(r,records); assert.equal(result.items[0].count,1);assert.equal(result.items[0].score,8);assert.equal(result.total,null);
  assert.equal(W.evaluate(r,records,{'2':{score:55,reason:'问题及时上报、已复查记录1'}}).total,63);
  assert.throws(()=>W.evaluate(r,records,{'2':{score:61,reason:'x'}}),{status:400});
  assert.throws(()=>W.evaluate(r,records,{'2':{score:50,reason:''}}),{status:400});
});
test('measurements preserve zero and reject missing, invalid and partial submitted groups', () => {
  const d={kind:'process',floor:1,thickness:Array(10).fill(0),lines:[]};assert.equal(W.record(d,true).thickness[0],0);
  assert.throws(()=>W.record({...d,thickness:[6.8]},true),{status:400});
  assert.throws(()=>W.record({...d,thickness:Array(10).fill(-1)},true),{status:400});
  assert.throws(()=>W.record({kind:'inspection',floor:1,theme:'安全'},true),{status:400});
  assert.equal(W.record({kind:'inspection',floor:1,theme:'安全',noIssue:true},true).noIssue,true);
});
test('daily, weekly and continuous work contents follow the source cadence and allow item-by-item reporting',()=>{
  const all=W.duties.entries,daily=all.filter(x=>x.frequency==='每日'),weekly=all.filter(x=>x.frequency==='每周'),continuous=all.filter(x=>x.frequency==='持续');
  assert.equal(all.length,17);assert.equal(daily.length,12);assert.equal(weekly.length,2);assert.equal(continuous.length,3);
  assert.equal(all.find(x=>x.id==='six_s').photoRequired,true);
  const dailyRecord={kind:'duties',floor:2,mode:'daily',checks:daily.map(d=>({dutyId:d.id,status:d.options[0]}))};
  assert.equal(W.record(dailyRecord,true).checks.length,daily.length);
  assert.equal(W.record({...dailyRecord,checks:[{dutyId:daily[0].id,status:daily[0].options[0]}]},true).checks.length,1);
  assert.throws(()=>W.record({...dailyRecord,checks:[{dutyId:daily[0].id,status:''}]},true),err=>err.status===400&&/请选择/.test(err.message));
  assert.equal(W.record({...dailyRecord,checks:[{dutyId:daily[0].id,status:''}]},false).checks[0].status,'');
  assert.throws(()=>W.record({...dailyRecord,checks:dailyRecord.checks.map((c,i)=>i?c:{...c,status:'伪造状态'})},true),{status:400});
  const abnormal=daily.find(x=>x.id==='team_feedback');
  assert.throws(()=>W.record({...dailyRecord,checks:dailyRecord.checks.map(c=>c.dutyId===abnormal.id?{...c,status:'异常'}:c)},true),{status:400});
  assert.equal(W.record({...dailyRecord,checks:dailyRecord.checks.map(c=>c.dutyId===abnormal.id?{...c,status:'异常',note:'发现员工异常'}:c)},true).checks.length,daily.length);
  assert.equal(W.record({kind:'duties',floor:2,mode:'continuous',checks:[{dutyId:continuous[0].id,status:continuous[0].options[0]}]},true).checks.length,1);
  assert.throws(()=>W.record({kind:'duties',floor:2,mode:'weekly',checks:[{dutyId:daily[0].id,status:daily[0].options[0]}]},true),{status:400});
});
test('production abnormal reports require an analysis and measures and retain the DOCX fields',()=>{
  const daily=W.duties.list('daily'),checks=daily.map(d=>({dutyId:d.id,status:d.options[0]}));
  const progress=checks.find(c=>c.dutyId==='production_progress');progress.status='异常';progress.note='设备异常停线';
  assert.throws(()=>W.record({kind:'duties',floor:1,mode:'daily',checks},true),err=>err.status===400&&/改进措施/.test(err.message));
  progress.productionReport={startTime:'08:00',endTime:'09:00',agvCount:'2',vehicleNo:'35',repairProgress:'检修中',issues:[{category:'设备',description:'总线故障',delay:'60分钟'}],measures:['下线维修后复测']};
  const saved=W.record({kind:'duties',floor:1,mode:'daily',checks},true).checks.find(c=>c.dutyId==='production_progress');
  assert.equal(saved.productionReport.issues[0].description,'总线故障');assert.deepEqual(saved.productionReport.measures,['下线维修后复测']);
});
test('automatic daily-duty scoring counts distinct submitted daily dates only',()=>{
  const rules=W.rules([{title:'日常履职填报',kind:'duties',max:100,target:5,deduction:20,standard:'按每日履职记录提交天数计分'}]);
  const records=[{kind:'duties',status:'submitted',record_date:'2026-09-21',payload:{mode:'daily'}},{kind:'duties',status:'submitted',record_date:'2026-09-21',payload:{mode:'daily'}},{kind:'duties',status:'submitted',record_date:'2026-09-23',payload:{mode:'weekly'}}];
  assert.equal(W.evaluate(rules,records).items[0].count,1);assert.equal(W.evaluate(rules,records).items[0].score,20);
  const reviewed=W.evaluate(rules,records,{'1':{score:35,reason:'班长复核照片及异常处理后调整'}});
  assert.equal(reviewed.total,35);assert.equal(reviewed.items[0].autoScore,20);assert.equal(reviewed.items[0].overridden,true);
  assert.throws(()=>W.evaluate(rules,records,{'1':{score:35,reason:''}}),{status:400});
});
test('scope: ordinary staff own only, workshop managers scoped, admin all', () => {
  const m={user_id:10,workshop_code:'qu_making'};
  assert.equal(W.readable({id:'10',role:'viewer'},m),true);
  assert.equal(W.readable({id:'11',role:'viewer'},m),false);
  assert.equal(W.readable({id:'11',role:'raw_grain'},m),false);
  assert.equal(W.readable({id:'11',role:'qu_making'},m),true);
  assert.equal(W.readable({id:'11',role:'admin'},m),true);
  assert.throws(()=>W.mutable({status:'published'}),{status:409});
  for(const status of ['draft','returned','submitted'])W.mutable({status});
});
test('export keeps all observations, comments, photographs and score evidence', async()=>{
  const records=[{id:1,kind:'process',record_date:'2026-09-21',week_start:'2026-09-21',payload:{floor:1,thickness:Array(10).fill(6.8),lines:[]}},
    {id:2,kind:'block',record_date:'2026-09-21',payload:{floor:1,note:'观察一',action:'复查'}},{id:3,kind:'block',record_date:'2026-09-21',payload:{floor:1,note:'观察二'}},
    {id:4,kind:'inspection',record_date:'2026-09-21',payload:{floor:1,theme:'安全',noIssue:true}}];
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aE5sAAAAASUVORK5CYII=','base64');
  const wb=createWorkbook(records,[{record_id:2,image:png,mime:'image/png'}],null,'测试组长');
  const bytes=await wb.xlsx.writeBuffer();const restored=new (require('exceljs').Workbook)();await restored.xlsx.load(bytes);
  assert.equal(restored.getWorksheet('曲块厚度记录表').getCell('C3').value,6.8);
  assert.equal(restored.getWorksheet('曲坯分析记录').getCell('B3').value,'观察一\n处理：复查');
  assert.equal(restored.getWorksheet('曲坯分析记录').getCell('B5').value,'观察二');
  assert.equal(restored.getWorksheet('曲坯分析记录').getImages().length,1);
  assert.equal(restored.getWorksheet('专项检查-一楼').getCell('C4').value,'已检查，未发现问题');
  assert.equal(restored.getWorksheet('周履职考评').getCell('D2').value,'待复核');
});
test('weekly workbook export includes per-duty status and maps photos to that duty',async()=>{
  const duties=W.duties.entries,task=duties.find(x=>x.photoRequired);
  const records=[{id:9,kind:'duties',status:'submitted',record_date:'2026-09-21',payload:{floor:1,mode:'daily',checks:[{dutyId:task.id,status:'正常',note:'现场已检查'}]}}];
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aE5sAAAAASUVORK5CYII=','base64');
  const wb=createWorkbook(records,[{record_id:9,task_key:task.id,image:png,mime:'image/png'}],null,'测试组长');
  const bytes=await wb.xlsx.writeBuffer(),restored=new (require('exceljs').Workbook)();await restored.xlsx.load(bytes);
  const sheet=restored.getWorksheet('日常履职记录');assert.equal(sheet.getCell('D2').value,'正常');assert.equal(sheet.getCell('E2').value,'现场已检查');assert.equal(sheet.getImages().length,1);
});
test('production abnormal report exports a Word document with the source form fields',async()=>{
  const {createProductionReport}=require('../src/production-report-export');
  const bytes=await createProductionReport({record:{id:7,record_date:'2026-09-23'},leader:'组长甲',workshop:'制曲车间',floor:4,check:{productionReport:{startTime:'08:00',endTime:'09:00',agvCount:'2',vehicleNo:'35号车',repairProgress:'维修完成',issues:[{category:'设备',description:'总线故障',delay:'60分钟'}],measures:['下线维修后复测']}}});
  assert.equal(bytes.subarray(0,2).toString(),'PK');assert.ok(bytes.length>1000);
});

test('production analysis retains more than twenty issues and requires a named custom factor',()=>{
 const issues=Array.from({length:25},(_,i)=>({factorType:'其他',category:'原料'+i,description:'原因'+i,delay:'10分钟'}));
 const productionReport={startTime:'08:00',endTime:'16:00',agvCount:'7',vehicleNo:'35',repairProgress:'检修中',issues,measures:['复查']};
 const payload={kind:'duties',floor:1,mode:'daily',checks:[{dutyId:'production_progress',status:'异常',productionReport}]};
 const saved=W.record(payload,true).checks[0].productionReport;
 assert.equal(saved.issues.length,25);assert.equal(saved.issues[24].category,'原料24');
 const wb=createWorkbook([{id:42,kind:'duties',record_date:'2026-09-29',payload:{...payload,checks:[{dutyId:'production_progress',status:'异常',productionReport:saved}]}}],[],null,'测试');
 const sheet=wb.getWorksheet('生产异常-42');assert.equal(sheet.getCell('A6').value,'问题分析(设备/人员/其他)');assert.equal(sheet.getCell('A6').alignment.horizontal,'center');assert.ok(sheet.getColumn(1).values.includes('原料24'));
 issues[0].category='';assert.throws(()=>W.record(payload,true),{status:400});
 issues[0].category='其他';assert.throws(()=>W.record(payload,true),{status:400});
});

test('custom manual criteria persist title and standard and reject formula spoofing',()=>{
 const item={custom:true,customId:'custom_1',title:'新增检查事项',kind:'manual',max:25,standard:'完成检查且提交材料满分',bonusPerClosure:0};const saved=W.rules([item],{requireDuty:true});assert.equal(saved[0].customId,item.customId);assert.equal(saved[0].standard,item.standard);for(const bad of [{...item,title:''},{...item,kind:'duties'},{...item,dutyId:'unknown'},{...item,bonusPerClosure:0.5}])assert.throws(()=>W.rules([bad],{requireDuty:true}),{status:400});assert.throws(()=>W.rules([{...item,max:12.5},{...item,max:12.5}],{requireDuty:true}),{status:400})
})
