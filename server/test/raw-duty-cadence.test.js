const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../src/raw-duty-cadence'),{cadenceSummary,weekDays}=require('../src/raw-duty-cadence-summary');
const {createFixture}=require('./fixtures/raw-duty-preview.cjs');
const entries=[{id:'d',title:'每日检查',category:'安全',frequency:'每班',evidence:'记录'},{id:'w',title:'每周抽查',category:'安全',frequency:'每周',evidence:'记录'},{id:'m',title:'月度谈话',category:'人员',frequency:'每月',evidence:'记录'}];
const check=(dutyId,date,extra={})=>({dutyId,result:'已完成',note:'已按实际执行',photoIds:[],recordDate:date,...extra});

test('personnel summary counts each duty once and does not conceal a missed working day',async()=>{
 const start='2026-10-12',today='2026-10-15',calendar=Object.fromEntries(weekDays(start).map(d=>[d,d<=today?'work':'rest']));
 const checks=[{dutyId:'d',dailyRecords:weekDays(start).filter(d=>d<=today).map(d=>({...check('d',d),date:d}))},check('w',start),{dutyId:'m',monthlyRecords:[{...check('m','2026-10-02'),month:'2026-10',shared:true}]}];
 const stats=cadenceSummary(entries,checks,{version:2,calendar},start,today);
 assert.equal(stats.itemOverview.total,3);assert.equal(stats.itemOverview.done,3);assert.ok(stats.progress.total>3);
 checks[0].dailyRecords.splice(1,1);
 const missed=cadenceSummary(entries,checks,{version:2,calendar},start,today);
 assert.equal(missed.itemOverview.done,2);assert.equal(missed.itemOverview.incomplete,1);
 calendar['2026-10-13']='rest';assert.equal(cadenceSummary(entries,checks,{version:2,calendar},start,today).itemOverview.done,3);
 delete calendar['2026-10-13'];assert.equal(cadenceSummary(entries,checks,{version:2,calendar},start,today).itemOverview.missing,1);
 for(const m of [await import('../../spare-parts-web-release/src/utils/raw-duty-cadence-summary.mjs'),require('../../miniprogram/packages/work/services/raw-duty-cadence-summary')])assert.deepEqual(m.cadenceSummary(entries,checks,{version:2,calendar},start,today),cadenceSummary(entries,checks,{version:2,calendar},start,today));
});

test('context offers only saved templates; legacy assigned snapshots remain readable',async t=>{
 const f=await createFixture(),template=await f.store.addTemplate({title:'可编辑职责',entries});
 const server=f.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>server.close());
 const base=`http://127.0.0.1:${server.address().port}/api/raw-duties`,headers={Authorization:'Bearer raw-preview-admin'};
 const context=await (await fetch(base+'/context',{headers})).json();assert.deepEqual(context.data.templates.map(t=>t.id),[template.id]);
 const list=await (await fetch(base+'/reports',{headers})).json();const row=list.data.items.find(r=>r.reportId);
 const report=await (await fetch(base+'/reports/'+row.reportId,{headers})).json();assert.ok(report.data.template.entries.length);
});

test('legacy reports retain a seven-day calendar without inventing seven completions',async()=>{
 const start='2026-10-12',today='2026-10-15',checks=[check('d',''),check('w',''),check('m','')];
 const snapshot=JSON.stringify(checks),summary=cadenceSummary(entries,checks,null,start,today);
 assert.equal(summary.dailyOverview.length,7);assert.equal(summary.dailyOverview[0].dayName,'周一');assert.equal(summary.dailyOverview[0].label,'未按日记录');assert.equal(summary.dailyOverview[4].label,'未到日期');assert.equal(summary.dailyOverview.reduce((sum,d)=>sum+d.done,0),0);
 const table=require('../src/raw-duty-week-table').weekTable(entries,checks,{},start,today,true);
 assert.equal(table.rows[0].cells.length,7);assert.equal(table.rows[0].legacySummary,'原周记录：已完成');assert.equal(table.rows[0].cells[0].text,'未按日记录');assert.equal(table.rows[1].cells[0].span,7);assert.match(table.rows[1].cells[0].text,/待补日期/);assert.equal(table.rows[2].cells[0].recordDate,'');assert.equal(JSON.stringify(checks),snapshot);
 const dated=[check('d','2026-10-13')],datedSummary=cadenceSummary(entries,dated,null,start,today),datedTable=require('../src/raw-duty-week-table').weekTable(entries,dated,{},start,today,true);
 assert.equal(datedSummary.dailyOverview[1].done,1);assert.equal(datedSummary.dailyOverview[0].done,0);assert.equal(datedTable.rows[0].cells[1].result,'已完成');assert.equal(datedTable.rows[0].cells[0].result,'');
 for(const module of [await import('../../spare-parts-web-release/src/utils/raw-duty-week-table.mjs'),require('../../miniprogram/packages/work/services/raw-duty-week-table')])assert.deepEqual(module.weekTable(entries,checks,{},start,today,true),table);
 for(const module of [await import('../../spare-parts-web-release/src/utils/raw-duty-cadence-summary.mjs'),require('../../miniprogram/packages/work/services/raw-duty-cadence-summary')])assert.deepEqual(module.cadenceSummary(entries,checks,null,start,today),summary);
});
test('daily work and rest are distinct; weekly and monthly dates use their own periods',async()=>{
 const start='2026-09-28',template={entries},calendar=Object.fromEntries(weekDays(start).map(d=>[d,d===start?'work':'rest']));
 const input=[{dutyId:'d',dailyRecords:[{...check('d',start),date:start}]},check('w',start),{dutyId:'m',monthlyRecords:[{...check('m','2026-09-01'),month:'2026-09'},{...check('m','2026-10-01'),month:'2026-10'}]}];
 const saved=C.validate(input,template,[],calendar,start,true),summary=cadenceSummary(entries,saved.checks,saved.cadence,start,'2026-10-15');
 assert.equal(summary.progress.total,4);assert.equal(summary.progress.ready,4);assert.equal(summary.dailyOverview[0].filled,1);assert.equal(summary.dailyOverview[1].label,'休息');
 assert.equal(summary.monthly.total,2);assert.equal(summary.calendarPending,0);assert.equal(summary.dailyOverview[1].missing,0);assert.equal(summary.dailyOverview[1].total,0);
 assert.throws(()=>C.validate(input,template,[],{...calendar,[start]:'rest'},start),/标记为上班/);
 assert.throws(()=>C.validate(input,template,[],{},start,true),/上班/);
 const missingDate=structuredClone(input);missingDate[1].recordDate='';assert.throws(()=>C.validate(missingDate,template,[],calendar,start,true),/执行日期/);
 const wrongMonth=structuredClone(input);wrongMonth[2].monthlyRecords[0].recordDate='2026-08-31';assert.throws(()=>C.validate(wrongMonth,template,[],calendar,start),/对应月份/);
 const unconfirmed=cadenceSummary(entries,[],{version:2,calendar:{}},start,'2026-10-15');assert.equal(unconfirmed.dailyOverview[0].label,'待确认');assert.equal(unconfirmed.calendarPending,7);
 for(const module of [await import('../../spare-parts-web-release/src/utils/raw-duty-cadence-summary.mjs'),require('../../miniprogram/packages/work/services/raw-duty-cadence-summary')])assert.deepEqual(module.cadenceSummary(entries,saved.checks,saved.cadence,start,'2026-10-15'),summary);
});
test('real HTTP: daily details survive save, admins can inspect them, monthly images carry once across weeks',async t=>{
 const f=await createFixture({seed:false}),template=await f.store.addTemplate({title:'频次测试',entries});
 await f.store.setMember({user_id:11,reviewer_id:21,position_name:'工段长',team_name:'原粮一工段',template_id:template.id,active:true},1);
 const server=f.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>server.close());
 async function call(method,path,body,role='worker'){
  const multi=body instanceof FormData,res=await fetch(`http://127.0.0.1:${server.address().port}/api/raw-duties${path}`,{method,headers:{Authorization:'Bearer raw-preview-'+role,...body&&!multi?{'content-type':'application/json'}:{}},body:body?multi?body:JSON.stringify(body):undefined});return {status:res.status,body:await res.json()};
 }
 let r=(await call('POST','/reports',{week:'2026-10-05'})).body.data;assert.equal(r.cadence.version,2);
 const image=await require('sharp')({create:{width:120,height:120,channels:3,background:'white'}}).jpeg().toBuffer();
 const upload=new FormData();upload.append('file',new Blob([image],{type:'image/jpeg'}),'month.jpg');upload.append('revision',String(r.revision));
 r=(await call('POST',`/reports/${r.id}/photos`,upload)).body.data;const photoId=r.photos[0].id;
 const calendar=Object.fromEntries(weekDays(r.week_start).map(d=>[d,d===r.week_start?'work':'rest']));
 const checks=[{dutyId:'d',dailyRecords:[{...check('d',r.week_start),date:r.week_start}]},check('w',r.week_start),{dutyId:'m',monthlyRecords:[{...check('m','2026-10-06',{photoIds:[photoId]}),month:'2026-10'}]}];
 let result=await call('PUT',`/reports/${r.id}`,{revision:r.revision,checks,calendar,submit:false,summary:''});assert.equal(result.status,200);r=result.body.data;
 const admin=(await call('GET',`/reports/${r.id}`,null,'admin')).body.data;assert.equal(admin.checks[0].dailyRecords[0].date,'2026-10-05');
 const row=(await call('GET','/reports?week=2026-10-05',null,'raw_grain')).body.data.items.find(i=>i.userId===11);assert.equal(row.dailyOverview[0].done,1);assert.equal(row.dailyOverview[1].label,'休息');
 assert.equal((await call('DELETE',`/reports/${r.id}/photos/${photoId}`,{revision:r.revision})).status,409);
 assert.equal((await call('PUT',`/reports/${r.id}`,{revision:r.revision,checks,calendar,submit:true,summary:''})).status,200);
 const next=(await call('POST','/reports',{week:'2026-10-12'})).body.data,month=next.checks.find(c=>c.dutyId==='m').monthlyRecords[0];
 assert.equal(month.recordDate,'2026-10-06');assert.equal(month.originWeek,'2026-10-05');assert.equal(next.photos.length,1);assert.notEqual(month.photoIds[0],photoId);
 assert.equal((await call('POST','/reports',{week:'2026-10-12'})).body.data.photos.length,1);
 const exported=await fetch(`http://127.0.0.1:${server.address().port}/api/raw-duties/reports/${next.id}/export`,{headers:{Authorization:'Bearer raw-preview-worker'}});
 assert.equal(exported.status,200);const book=new (require('exceljs').Workbook)();await book.xlsx.load(Buffer.from(await exported.arrayBuffer()));
 assert.ok(book.getWorksheet('日履职概况'));assert.ok(book.getWorksheet('验证材料').getImages().length);
 assert.match(book.getWorksheet('周履职材料').getColumn(7).values.join(' '),/2026-10-06/);
});

test('already-opened and unopened weeks share the actual monthly completion without rewriting weekly history',async()=>{
 const {memoryStore}=require('./fixtures/raw-duty-preview.cjs'),db=memoryStore(),t={entries},identity={name:'示例'};
 let earlier=await db.createReport(11,'2026-10-05',identity,t),later=await db.createReport(11,'2026-10-12',identity,t);
 // Next week already exists and was saved empty before the month was completed.
 later.checks=[{dutyId:'m',monthlyRecords:[{month:'2026-10',result:'',note:'',photoIds:[]}]}];later=await db.updateReport(later,later.revision);
 const id=await db.addPhoto(earlier.id,{image:Buffer.from('image'),mime:'image/jpeg',filename:'month.jpg'});
 earlier.checks=[{dutyId:'m',monthlyRecords:[{...check('m','2026-10-06',{photoIds:[id]}),month:'2026-10',recordedAt:'2026-10-15T08:00:00Z'}]}];earlier=await db.updateReport(earlier,earlier.revision);
 const view=await C.monthlyView(db,later),c=view.checks.find(c=>c.dutyId==='m').monthlyRecords[0];
 assert.equal(c.result,'已完成');assert.equal(c.recordDate,'2026-10-06');assert.equal(c.shared,true);assert.equal(view.photos[0].id,id);
 assert.equal((await db.reportById(later.id)).checks[0].monthlyRecords[0].result,'');assert.equal((await db.reportById(later.id)).revision,later.revision);
 assert.throws(()=>C.sharedInput(later.checks,view),/本月事项已在其他周完成/);assert.equal(C.sharedInput(view.checks,view)[0].monthlyRecords[0].result,'已完成');
 const restored=C.localChecks(structuredClone(view.checks),later.checks,view);assert.equal(restored[0].monthlyRecords[0].result,'');
 const unopened=await C.monthlyView(db,{id:null,user_id:11,week_start:'2026-10-19',template:t,checks:[],cadence:{version:2,calendar:{}}});assert.equal(unopened.checks[0].monthlyRecords[0].recordDate,'2026-10-06');
 const hidden=await C.monthlyView(db,later,r=>r.status!=='draft');assert.equal(hidden.sharedMonths.length,0);
});

test('past working-day omissions count as nonperformance; rest, unknown, future and today remain distinct',async()=>{
 const start='2026-10-05',cal={'2026-10-05':'work','2026-10-06':'rest','2026-10-08':'work','2026-10-09':'work'},stats=cadenceSummary(entries,[],{version:2,calendar:cal},start,'2026-10-08');
 assert.equal(stats.dailyOverview[0].notPerformed,1);assert.equal(stats.dailyOverview[1].notPerformed,0);assert.equal(stats.dailyOverview[2].notPerformed,0);assert.equal(stats.dailyOverview[3].notPerformed,0);assert.equal(stats.dailyOverview[4].notPerformed,0);
 const input=[{dutyId:'d',dailyRecords:[{...check('d',start),date:start}]}],one=C.validate(input,{entries},[],cal,start),c=one.checks[0].dailyRecords[0];assert.ok(c.firstRecordedAt);assert.ok(c.recordedAt);
 const unchanged=C.validate(one.checks,{entries},[],cal,start,false,one.checks);assert.equal(unchanged.checks[0].dailyRecords[0].firstRecordedAt,c.firstRecordedAt);assert.equal(unchanged.checks[0].dailyRecords[0].recordedAt,c.recordedAt);
 input[0].dailyRecords[0].result='未完成';input[0].dailyRecords[0].note='';assert.throws(()=>C.validate(input,{entries},[],cal,start),/未履职原因/);
 const table=require('../src/raw-duty-week-table').weekTable(entries,[],cal,start,'2026-10-08');assert.equal(table.rows[0].cells[0].text,'未履职');assert.equal(table.rows[0].cells[0].detail,'未记录');assert.equal(table.rows[0].cells[1].text,'休息');assert.equal(table.rows[2].cells[0].span,7);
 for(const module of [await import('../../spare-parts-web-release/src/utils/raw-duty-week-table.mjs'),require('../../miniprogram/packages/work/services/raw-duty-week-table')])assert.deepEqual(module.weekTable(entries,[],cal,start,'2026-10-08'),table);
});

test('HTTP: an existing later week reads, submits and exports shared month completion and evidence',async t=>{
 const f=await createFixture({seed:false}),template=await f.store.addTemplate({title:'月记录',entries:[entries[2]]});
 await f.store.setMember({user_id:11,reviewer_id:21,position_name:'工段长',template_id:template.id,active:true},1);
 const server=f.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>server.close());
 const base=`http://127.0.0.1:${server.address().port}/api/raw-duties`;
 async function call(method,path,body,user='worker'){const multi=body instanceof FormData,res=await fetch(base+path,{method,headers:{Authorization:'Bearer raw-preview-'+user,...body&&!multi?{'content-type':'application/json'}:{}},body:body?multi?body:JSON.stringify(body):undefined});const data=await res.json();assert.equal(res.status,200,JSON.stringify(data));return data.data}
 const later=await call('POST','/reports',{week:'2026-10-12'});let source=await call('POST','/reports',{week:'2026-10-05'});
 const image=await require('sharp')({create:{width:80,height:80,channels:3,background:'white'}}).jpeg().toBuffer(),form=new FormData();form.append('file',new Blob([image],{type:'image/jpeg'}),'month.jpg');form.append('revision',String(source.revision));source=await call('POST',`/reports/${source.id}/photos`,form);
 source=await call('PUT',`/reports/${source.id}`,{revision:source.revision,checks:[{dutyId:'m',monthlyRecords:[{...check('m','2026-10-06',{photoIds:[source.photos[0].id]}),month:'2026-10'}]}],calendar:{},summary:''});
 const view=await call('GET',`/reports/${later.id}`),month=view.checks[0].monthlyRecords[0];assert.equal(month.shared,true);assert.equal(month.recordDate,'2026-10-06');assert.equal(view.photos[0].report_id,source.id);
 const saved=await call('PUT',`/reports/${later.id}`,{revision:view.revision,checks:view.checks,calendar:Object.fromEntries(weekDays(later.week_start).map(d=>[d,'rest'])),summary:'',submit:true});assert.equal(saved.status,'submitted');assert.equal(saved.checks[0].monthlyRecords[0].recordDate,'2026-10-06');assert.equal((await f.store.photos(later.id)).length,0);
 const row=(await call('GET','/reports?week=2026-10-12',null,'admin')).items.find(r=>r.userId===11);assert.equal(row.monthly.done,1);
 const exported=await fetch(base+`/reports/${later.id}/export`,{headers:{Authorization:'Bearer raw-preview-admin'}});assert.equal(exported.status,200);const book=new (require('exceljs').Workbook)();await book.xlsx.load(Buffer.from(await exported.arrayBuffer()));assert.equal(book.getWorksheet('验证材料').getImages().length,1);
});
