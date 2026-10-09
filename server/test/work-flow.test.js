const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const F=require('../src/work-flow'),W=require('../src/work-assessment'),D=require('../src/work-duties');
test('one rest date among Monday-Saturday produces five working days, never Sunday',()=>{
 const c=F.schedule('2026-09-28','2026-09-30');assert.equal(c.workDates.length,5);assert.ok(!c.workDates.includes('2026-09-30'));assert.ok(!c.workDates.includes('2026-10-04'));assert.equal(c.confirmed,true);
 assert.throws(()=>F.schedule('2026-09-28','2026-10-04'),/周一至周六/);assert.throws(()=>F.schedule('2026-09-28','2026-09-27'),/周一至周六/);
 assert.equal(F.schedule('2026-09-28').confirmed,false);
});
test('rest and Sunday evidence does not inflate formula scores',()=>{
 const c=F.schedule('2026-09-28','2026-09-30'),rules=W.rules([{title:'五日',kind:'duties',max:100,standard:'每缺一天扣20',target:5,deduction:20}]);
 const rows=['2026-09-28','2026-09-30','2026-10-04'].map((day,i)=>({id:i,record_date:day,status:'submitted',kind:'duties',payload:{mode:'daily'}}));
 assert.equal(W.evaluate(rules,rows,{},c).total,20);assert.equal(F.scoringRecords(rows,c).length,1);
 const weekly={id:99,kind:'duties',record_date:'2026-09-30',payload:{mode:'weekly'}};assert.equal(F.scoringRecords([weekly],c).length,1,'weekly work remains completed when rest date changes');
});
test('new weekly workbook contains R, simple specials and formatted production details',async()=>{
 const c=F.schedule('2026-09-28','2026-09-30'),report={startTime:'08:10',endTime:'16:10',agvCount:'7',vehicleNo:'35',repairProgress:'测试中',issues:[{category:'曲块',description:'粘曲架',delay:'60分钟'}],measures:['复核水分']};
 const records=[{id:1,kind:'duties',status:'submitted',record_date:'2026-09-29',week_start:c.weekStart,payload:{mode:'daily',checks:[{dutyId:'production_progress',status:'异常',productionReport:report}]}},{id:2,kind:'process',status:'submitted',record_date:'2026-09-29',payload:{format:'simple',result:'正常'}}];
 const wb=require('../src/work-export').createWorkbook(records,[],null,'甲',c,D),bytes=await wb.xlsx.writeBuffer(),restored=new(require('exceljs').Workbook)();await restored.xlsx.load(bytes);
 assert.equal(restored.getWorksheet('每周工作记录').getCell('I3').value,'R 休息');assert.equal(restored.getWorksheet('每周工作记录').getCell('G3').value,'异常');
 assert.equal(restored.getWorksheet('生产异常-1').getCell('B7').value,'粘曲架');assert.equal(restored.getWorksheet('专项记录').getCell('C2').value,'正常');assert.equal(restored.getWorksheet('曲块厚度记录表'),undefined);
});
test('weekly statistics excludes R missing counts and respects floor catalog',()=>{
 const c=F.schedule('2026-09-28','2026-09-30'),catalog=F.catalogApi([{...D.entries[0],floors:[1]},{...D.entries[1],floors:[2]}]);
 const result=require('../src/work-statistics').buildWeeklyStatistics([{user_id:1,floor:1}],[],'2026-09-28','2026-10-04',[c],catalog);
 assert.equal(result.people[0].totals.missing,5);assert.equal(result.people[0].days[2].rest,true);assert.equal(result.people[0].days[2].missing,0);assert.equal(result.people[0].dailyDutyCount,1);
});
test('catalog validates IDs, options and floors and keeps inactive items out of reporting',()=>{
 const list=F.validateCatalog([{...D.entries[0],active:false},{...D.entries[1],floors:[2]}]);assert.equal(F.activeCatalog(F.catalogApi(list),1).entries.length,0);
 assert.throws(()=>F.validateCatalog([D.entries[0],D.entries[0]]),/编号/);assert.throws(()=>F.validateCatalog([{...D.entries[0],floors:[6]}]),/楼层/);
 const custom={...D.entries[0],id:'custom_duty',title:'新增检查',formType:'simple'};
 const r=W.record({kind:'duties',floor:1,mode:'daily',checks:[{dutyId:custom.id,status:'正常',dutySnapshot:{title:'伪造'}}]},true,F.catalogApi([custom]));assert.equal(r.checks[0].dutySnapshot.title,'新增检查');
});
test('simple specials accept normal and require abnormal explanation without legacy measurements',()=>{
 for(const kind of ['process','inspection','block']){assert.equal(W.record({kind,format:'simple',floor:1,result:'正常'},true).result,'正常');assert.throws(()=>W.record({kind,format:'simple',floor:1,result:'异常'},true),/说明/)}
 for(const url of ['javascript:alert(1)','https://user:pass@example.com','file:///c:/a'])assert.throws(()=>F.validLink(url),/链接/);assert.equal(F.validLink('https://example.com/doc'),'https://example.com/doc');
});
function setup(query,{schedule=F.schedule('2026-09-28','2026-09-30')}={}){
 const handlers=new Map(),router={};for(const verb of ['get','post','delete'])router[verb]=(url,...fns)=>handlers.set(verb+' '+url,fns.at(-1));
 const multer=()=>({single:()=>()=>{}});multer.memoryStorage=()=>({});const exported={exports:{}};
 const utils=require('../src/utils');vm.runInNewContext(fs.readFileSync(require.resolve('../src/work-flow-routes'),'utf8'),{require:n=>n==='multer'?multer:n==='./utils'?{...utils,asyncHandler:fn=>fn}:n==='./work-assessment'?W:n==='./work-flow'?F:n==='./work-task-record'?require('../src/work-task-record'):undefined,module:exported,Buffer,Date});
 let committed=false;const db={query:(sql,...args)=>sql.includes('FROM work_document_bindings')?Promise.resolve([[]]):query(sql,...args)};exported.exports(router,{pool:db,ok:(res,data)=>res.json(data),id:v=>{if(!Number.isSafeInteger(Number(v))||Number(v)<1)throw new utils.ApiError(400,'id');return Number(v)},member:async(db,id)=>({user_id:Number(id),floor:1,workshop_code:'qu_making'}),allow:async(user,m)=>{if(user.role!=='admin'&&![10,11].includes(m.user_id))throw new utils.ApiError(403,'不属于本班组')},review:async user=>{if(!['admin','qu_making'].includes(user.role)&&user.staffPosition!=='shift_leader')throw new utils.ApiError(403,'无权复核')},transaction:async fn=>{const result=await fn(db);committed=true;return result},lockReport:async()=>({id:1,status:'draft'}),audit:async()=>{}});
 return {handlers,get committed(){return committed}};
}
const manager={id:20,role:'viewer',staffPosition:'shift_leader',staffWorkshopCode:'qu_making'},owner={id:10,role:'viewer',staffPosition:'group_leader',staffWorkshopCode:'qu_making'};
test('task pagination and counts preserve team scope and distinguish pending from accepted',async()=>{
 const calls=[];const h=setup(async(sql,params)=>{calls.push([sql,params]);if(sql.includes('GROUP BY'))return [[{status:'pending',count:55},{status:'accepted',count:4}]];if(sql.startsWith('SELECT a.*'))return [[{id:7,status:'pending',due_date:'2026-09-28'}]];return [[]]}).handlers.get('get /tasks');
 let result;await h({user:manager,query:{page:2,status:'open'}},{json:d=>result=d});assert.equal(result.total,55);assert.equal(result.counts.accepted,4);assert.equal(result.page,2);assert.match(calls[0][0],/team.shift_leader_id=\?/);assert.equal(calls[0][1][0],20);assert.equal(calls[1][1].at(-1),50);assert.match(calls[1][0],/a.status IN/);
});
test('catalog cannot rewrite current week and commits before sending success',async()=>{
 const next=F.addDays(W.week(new Date(Date.now()+8*3600000).toISOString().slice(0,10)),7);
 const setupResult=setup(async sql=>sql.includes('FROM work_catalog_versions')?[[]]:sql.startsWith('INSERT INTO work_catalog_versions')?[{insertId:5}]:[[]]);const h=setupResult.handlers.get('post /catalog');
 await assert.rejects(()=>h({user:{id:1,role:'admin'},body:{effectiveWeek:'2026-09-21',entries:D.entries,version:0}},{}),/下周/);
 let saved;await h({user:{id:1,role:'admin'},body:{effectiveWeek:next,entries:D.entries,version:0}},{json:r=>{assert.equal(setupResult.committed,true);saved=r}});assert.equal(saved.id,5);
});
test('catalog denies non-admin before reading or writing',async()=>{
 const {handlers}=setup(()=>assert.fail('no database'));for(const method of ['get','post'])await assert.rejects(()=>handlers.get(method+' /catalog')({user:manager,body:{},query:{}},{}),{status:403});
});
test('task dispatch rejects a member outside the current team and never inserts task',async()=>{
 const h=setup(async sql=>{if(sql.includes('work_catalog_versions'))return [[]];assert.fail(sql)}).handlers.get('post /tasks');
 const today=new Date(Date.now()+8*3600000).toISOString().slice(0,10);await assert.rejects(()=>h({user:manager,body:{title:'设备检查',instructions:'上传状态照片',dueDate:today,userIds:[99]}},{}),{status:403});
});
test('task response enforces own assignment, state, revision, evidence and abnormal note',async()=>{
 let a={id:7,user_id:10,status:'pending',revision:2,evidence_mode:'either'};let writes=0;
 const h=setup(async sql=>sql.startsWith('SELECT a.*')?[[a]]:sql.startsWith('SELECT id FROM work_task_files')||sql.includes('FROM work_catalog_versions')||sql.startsWith('SELECT * FROM work_records')?[[]]:(writes++,[{insertId:81}])).handlers.get('post /tasks/:id/respond');
 const req={user:owner,params:{id:7},body:{revision:2,result:'正常'}};
 await assert.rejects(()=>h(req,{}),/验证截图/);await assert.rejects(()=>h({...req,body:{...req.body,result:'异常',reference:'https://example.com'}},{}),/说明/);
 await assert.rejects(()=>h({...req,body:{...req.body,revision:1}},{}),{status:409});
 a={...a,user_id:11};await assert.rejects(()=>h(req,{}),{status:403});a={...a,user_id:10,status:'submitted'};await assert.rejects(()=>h(req,{}),{status:409});assert.equal(writes,0);
 a={...a,status:'pending'};await h({...req,body:{...req.body,reference:'https://example.com/doc'}},{json(){}});assert.equal(writes,3);
});
test('task review only accepts submitted state, requires return reason, and cannot extend accepted',async()=>{
 let a={id:7,user_id:10,status:'submitted',revision:2};let writes=0;
 const h=setup(async sql=>sql.startsWith('SELECT a.*')?[[a]]:(writes++,[{}])).handlers.get('post /tasks/:id/review');
 const req={user:manager,params:{id:7},body:{revision:2,action:'return'}};
 await assert.rejects(()=>h(req,{}),/说明/);a.status='accepted';await assert.rejects(()=>h({...req,body:{revision:2,action:'extend'}},{}),{status:409});assert.equal(writes,0);
 a.status='submitted';await h({...req,body:{...req.body,action:'accept'}},{json(){}});assert.equal(writes,2);
});
test('referenced task photo cannot be removed after return, preserving weekly evidence',async()=>{
 const h=setup(async sql=>sql.startsWith('SELECT assignment_id')?[[{assignment_id:7}]]:sql.startsWith('SELECT a.*')?[[{id:7,user_id:10,status:'returned'}]]:sql.startsWith('SELECT record_id')?[[{record_id:8}]]:assert.fail(sql)).handlers.get('delete /task-files/:id');
 await assert.rejects(()=>h({user:owner,params:{id:4}},{}),/历史凭证/);
});
test('task material permission is checked before loading bytes',async()=>{
 let bytes=false;const h=setup(async sql=>{if(sql.startsWith('SELECT id,assignment_id'))return [[{id:4,assignment_id:7}]];if(sql.startsWith('SELECT a.*'))return [[{id:7,user_id:99}]];bytes=true;return [[]]}).handlers.get('get /task-files/:id');
 await assert.rejects(()=>h({user:owner,params:{id:4}},{}),{status:403});assert.equal(bytes,false);
});
test('rest selection refuses existing records without confirmation and rejects stale revisions',async()=>{
 let writes=0;const h=setup(async sql=>sql.startsWith('SELECT rest_date')?[[{rest_date:null,revision:2}]]:sql.startsWith('SELECT id FROM work_records')?[[{id:3}]]:(writes++,[{}])).handlers.get('post /schedule');
 const req={user:owner,body:{week:'2026-09-28',restDate:'2026-09-29',revision:2}};
 await assert.rejects(()=>h(req,{}),/确认/);await assert.rejects(()=>h({...req,body:{...req.body,revision:1}},{}),{status:409});assert.equal(writes,0);
 await h({...req,body:{...req.body,confirmExisting:true}},{json(){}});assert.equal(writes,2);
});

test('worksheet evidence rows do not require a result selection',()=>{
 for(const dutyId of ['standard_operation','process_adjustment','safety_activity','traffic_safety','six_s']){
  const d=D.get(dutyId),record=W.record({kind:'duties',floor:1,mode:D.cadence[d.frequency],checks:[{dutyId,status:'正常'}]},true);
  assert.equal(record.checks[0].status,'已提交材料');assert.deepEqual(d.abnormalOptions,[]);
 }
 assert.equal(D.get('traffic_safety').reportMode,'photo');
 for(const id of ['production_progress','mes_maintenance','directive_tasks'])assert.equal(D.get(id).reportMode,'result');
});
test('evidence requirements accept photos or documents but never a link for photo-only rows',()=>{
 const document=D.get('standard_operation'),photo=D.get('traffic_safety');
 assert.equal(D.hasMaterial(document,{status:'已提交材料'},false),false);
 assert.equal(D.hasMaterial(document,{reference:'https://example.com/doc'},false),false,'fixed documents require a work screenshot');
 assert.equal(D.hasMaterial(document,{},true),true);
 assert.equal(D.hasMaterial(photo,{reference:'https://example.com/doc'},false),false);
 assert.equal(D.hasMaterial(photo,{taskEvidence:[{files:[{id:1}]}]},false),true);
 assert.equal(D.hasMaterial(D.get('contractor_safety'),{status:'正常'},false),true);
 assert.equal(D.hasMaterial(D.get('contractor_safety'),{status:'异常'},false),false);
});
test('catalog persists material modes and preserves explicit custom choices',()=>{
 const d={...D.get('standard_operation'),options:[],abnormalOptions:[]};
 assert.equal(F.validateCatalog([d])[0].reportMode,'document');
 const legacy={...d};delete legacy.reportMode;
 assert.equal(F.catalogApi([legacy]).get(d.id).reportMode,'document');
 assert.equal(F.catalogApi([{...d,reportMode:'result',options:['已核查']}]).get(d.id).reportMode,'result');
 assert.throws(()=>F.validateCatalog([{...d,reportMode:'bad'}]),/填报方式/);
});


test('special checks belong to existing duties, normal needs no evidence and abnormal requires it',()=>{
 for(const id of ['quality_issue']){
  const d=D.get(id);assert.equal(d.reportMode,'result');assert.deepEqual(d.options,['正常','异常']);
  assert.equal(D.hasMaterial(d,{status:'正常'},false),true);
  assert.equal(D.hasMaterial(d,{status:'异常'},false),false);
  assert.equal(D.hasMaterial(d,{status:'异常',reference:'https://example.com/doc'},false),true);
  assert.equal(D.hasMaterial(d,{status:'异常'},true),true);
  assert.equal(F.validateCatalog([d])[0].abnormalEvidence,true);
 }
});

test('direct task detail is authorized before reading evidence',async()=>{
 let filesRead=false;const h=setup(async sql=>{if(sql.startsWith('SELECT a.*'))return [[{id:7,user_id:99}]];filesRead=true;return [[]]}).handlers.get('get /tasks/:id');
 await assert.rejects(()=>h({user:owner,params:{id:7}},{}),{status:403});assert.equal(filesRead,false);
});
test('own task detail supplies the selected task and its evidence',async()=>{
 const h=setup(async sql=>sql.startsWith('SELECT a.*')?[[{id:7,user_id:10,title:'指定任务',status:'pending',due_date:'2020-01-01'}]]:[[{id:4,assignment_id:7}]]).handlers.get('get /tasks/:id');
 let result;await h({user:owner,params:{id:7}},{json:r=>result=r});assert.equal(result.title,'指定任务');assert.equal(result.files[0].id,4);assert.equal(result.overdue,true);
});

test('fixed document defaults fill existing catalogs without replacing explicit admin links',async()=>{
 const expected={standard_operation:['2026年曲坯分析记录','https://www.kdocs.cn/l/cuvwtXifQI5l'],process_adjustment:['四部制曲工艺分析表','https://www.kdocs.cn/l/cu8JE709DJFw'],safety_activity:['专项检查表','https://www.kdocs.cn/l/cpTIwcP5eUkN']};
 for(const [id,[title,url]] of Object.entries(expected)){
  const legacy={...D.get(id)};delete legacy.documentUrl;delete legacy.documentTitle;
  const fromDb=await F.getCatalog({query:async sql=>sql.includes('FROM work_document_bindings')?[[]]:[[{id:6,entries_json:JSON.stringify([legacy])}]]},'2026-09-28');
  assert.equal(fromDb.get(id).documentUrl,url);assert.equal(fromDb.get(id).documentTitle,title);
  const record=W.record({kind:'duties',floor:1,mode:D.cadence[legacy.frequency],checks:[{dutyId:id,status:'正常'}]},true,fromDb);
  assert.equal(record.checks[0].reference,url);assert.equal(record.checks[0].dutySnapshot.documentUrl,url);
  assert.equal(D.hasMaterial(fromDb.get(id),record.checks[0],false),false);
  assert.equal(D.hasMaterial(fromDb.get(id),record.checks[0],true),true);
  const explicit=F.catalogApi([{...legacy,documentTitle:'自行配置',documentUrl:'https://example.com/own-document'}]);assert.equal(explicit.get(id).documentTitle,'自行配置');assert.equal(explicit.get(id).documentUrl,'https://example.com/own-document');
 }
})
test('result rows retain abnormal explanation and photo-only requirements remain strict',()=>{
 for(const id of ['team_feedback','quality_issue','mes_maintenance','iot_equipment','energy_usage','preproduction_environment','onsite_patrol','contractor_safety','safety_violation','staff_condition']){
  const d=D.get(id);assert.deepEqual(d.options,['正常','异常']);
  assert.throws(()=>W.record({kind:'duties',floor:1,mode:D.cadence[d.frequency],checks:[{dutyId:id,status:'异常'}]},true),{status:400});
  const check=W.record({kind:'duties',floor:1,mode:D.cadence[d.frequency],checks:[{dutyId:id,status:'异常',note:'问题描述',action:'已处理待核验'}]},true).checks[0];
  assert.equal(check.note,'问题描述');assert.equal(check.action,'已处理待核验');
  assert.equal(D.hasMaterial(d,{status:'正常'},false),true);
 }
 for(const id of ['mes_maintenance','iot_equipment','contractor_safety','safety_violation']){
  assert.equal(D.hasMaterial(D.get(id),{status:'异常',reference:'https://example.com/doc'},false),false);
  assert.equal(D.hasMaterial(D.get(id),{status:'异常'},true),true);
 }
 assert.equal(D.hasMaterial(D.get('six_s'),{reference:'https://www.kdocs.cn/l/cuvwtXifQI5l'},false),false)
})

test('recognized saved legacy catalog adopts worksheet but preserves identity and custom configuration',async()=>{
 const legacy={...D.get('process_adjustment'),reportMode:'result',options:['正常','异常'],abnormalOptions:['异常'],abnormalEvidence:true,documentUrl:'https://example.com/own',title:'管理员标题',floors:[3],active:false};delete legacy.worksheetVersion;
 const db={query:async()=>[[{id:9,entries_json:JSON.stringify([legacy])}]]};
 const d=(await F.getCatalog(db,'2026-09-28')).get(legacy.id);
 assert.equal(d.reportMode,'document');assert.deepEqual(d.options,['已提交材料']);assert.equal(d.title,legacy.title);assert.equal(d.documentUrl,legacy.documentUrl);assert.deepEqual(d.floors,[3]);assert.equal(d.active,false);
 assert.equal(legacy.reportMode,'result');
 const explicit=F.validateCatalog([{...legacy,reportMode:'result',options:['正常','异常']}])[0];
 assert.equal(F.catalogApi([explicit]).get(legacy.id).reportMode,'result');
 assert.deepEqual(F.catalogApi([{...legacy,options:['已核查','需跟进']}]).get(legacy.id).options,['已核查','需跟进']);
 const photo={...D.get('mes_maintenance'),photoWhen:'always'};delete photo.worksheetVersion;
 assert.equal(F.catalogApi([photo]).get(photo.id).photoWhen,'abnormal');
})
