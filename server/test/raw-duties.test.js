const test=require('node:test'),assert=require('node:assert/strict'),ExcelJS=require('exceljs');
const D=require('../src/raw-duties'),{createFixture}=require('./fixtures/raw-duty-preview.cjs');
async function http(t){const f=await createFixture({seed:false,newReportVersion:1});const server=f.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>server.close());const root=`http://127.0.0.1:${server.address().port}/api/raw-duties`;
 const call=async(method,url,body,role='worker')=>{const multi=body instanceof FormData;const response=await fetch(root+url,{method,headers:{Authorization:'Bearer raw-preview-'+role,...body&&!multi?{'Content-Type':'application/json'}:{}},body:body?multi?body:JSON.stringify(body):undefined});const binary=response.ok&&['application/zip','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','image/jpeg'].some(v=>response.headers.get('content-type')?.startsWith(v));return {status:response.status,body:binary?Buffer.from(await response.arrayBuffer()):await response.json()}};return {...f,call};}
const filled=r=>r.template.entries.map(e=>({dutyId:e.id,result:'已完成',note:'测试：已核对本周工作情况',photoIds:[]}));
test('管理员能查看每位工段长草稿的履职汇总及正文，指定负责人仍须等待提交',async t=>{
 const {call}=await http(t);let r=(await call('POST','/reports',{week:D.today()})).body.data;
 await call('PUT',`/reports/${r.id}`,{revision:r.revision,checks:[{dutyId:'raw-1',result:'未完成',note:'等待设备维修',photoIds:[]},{dutyId:'raw-2',result:'已完成',photoIds:[]}],summary:''});
 for(const role of ['admin','raw_grain','worker']){
  const rows=(await call('GET','/reports',null,role)).body.data.items,row=rows.find(x=>x.reportId===r.id);
  assert.equal(row.progress.incomplete,1);assert.equal(row.progress.done,1);assert.equal(row.progress.evidence,0);
  assert.equal(row.progress.missing,17);assert.equal(row.progress.ready,2);
  assert.equal(row.checks,undefined);assert.equal(row.summary,undefined);
  assert.equal((await call('GET',`/reports/${r.id}`,null,role)).status,200);
  if(role!=='worker')assert.equal((await call('PUT',`/reports/${r.id}`,{revision:1,checks:[],summary:'越权修改'},role)).status,403);
 }
});
test('仅系统管理员可查看人员配置和分配负责人，车间管理员保留业务查看权限',async t=>{
 const {call,store}=await http(t);
 const admin=(await call('GET','/context',null,'admin')).body.data;
 assert.equal(admin.canManageMembers,true);assert.ok(admin.users.length);assert.ok(admin.members[0].revision);
 const before=store.state().members;
 for(const role of ['raw_grain','reviewer','worker']){
  const context=(await call('GET','/context',null,role)).body.data;
  assert.equal(context.canManageMembers,false);assert.deepEqual(context.users,[]);
  assert.ok(context.members.every(m=>m.revision===undefined&&m.template_id===undefined&&m.position_name===undefined));
  assert.equal((await call('PUT','/members/11',{reviewerId:22,position:'工段长',team:'越权调整',templateId:0,active:true,revision:1},role)).status,403);
 }
 assert.deepEqual(store.state().members,before);
 const rawContext=(await call('GET','/context',null,'raw_grain')).body.data;
 assert.equal(rawContext.canConfigure,true);assert.equal(rawContext.isReviewer,true);
 assert.equal((await call('GET','/reports',null,'raw_grain')).body.data.items.length,3);
});
test('周范围、职责频次、材料归属与提交校验',()=>{
 assert.equal(D.defaultTemplate.entries.length,19);assert.deepEqual(D.period('2026-10-18'),{start:'2026-10-12',end:'2026-10-18'});
 assert.throws(()=>D.checks([],D.defaultTemplate,[],true),/逐项/);
 const c={dutyId:'raw-1',result:'已完成',note:'已检查',photoIds:[9]};assert.throws(()=>D.checks([c],D.defaultTemplate,[]),/不属于/);
 assert.throws(()=>D.template({title:'test',entries:[{id:'a',title:'a',category:'a',frequency:'每天'}]}),/频次/);
 assert.throws(()=>D.period('2026-02-30'),/日期/);
});
test('真实HTTP：草稿隔离、提交、复核、退回、重新打开和并发版本',async t=>{
 const {call}=await http(t);assert.equal((await call('GET','/context',null,'other')).status,403);
 let r=(await call('POST','/reports',{week:D.today()})).body.data;
 assert.equal((await call('GET',`/reports/${r.id}`,null,'reviewer')).status,403);
 assert.equal((await call('GET',`/reports/${r.id}`,null,'admin')).status,200);
 assert.equal((await call('GET','/members/12/report?week='+r.week_start,null,'raw_grain')).body.data.status,'empty');
 assert.equal((await call('GET','/members/12/report?week='+r.week_start,null,'worker')).status,403);
 let list=(await call('GET','/reports',null,'reviewer')).body.data.items;assert.equal(list.length,2);assert.equal(list.find(x=>x.reportId===r.id).canRead,false);
 assert.equal((await call('GET',`/reports/${r.id}`,null,'reviewer2')).status,403);
 assert.equal((await call('PUT',`/reports/${r.id}`,{revision:r.revision,checks:[],submit:true})).status,400);
 r=(await call('PUT',`/reports/${r.id}`,{revision:r.revision,checks:filled(r),summary:'本周总结',submit:true})).body.data;
 assert.equal(r.status,'submitted');assert.equal((await call('GET',`/reports/${r.id}`,null,'reviewer')).status,200);
 assert.equal((await call('PUT',`/reports/${r.id}`,{revision:r.revision,checks:filled(r)})).status,409);
 assert.equal((await call('POST',`/reports/${r.id}/action`,{revision:r.revision,action:'confirm'})).status,403);
 assert.equal((await call('POST',`/reports/${r.id}/action`,{revision:r.revision,action:'return'},'reviewer')).status,400);
 r=(await call('POST',`/reports/${r.id}/action`,{revision:r.revision,action:'return',feedback:'请补充现场说明'},'reviewer')).body.data;
 assert.equal(r.status,'returned');r=(await call('PUT',`/reports/${r.id}`,{revision:r.revision,checks:filled(r),submit:true})).body.data;
 const v=r.revision;
 r=(await call('POST',`/reports/${r.id}/action`,{revision:v,action:'confirm',feedback:'材料已查看'},'reviewer')).body.data;assert.equal(r.status,'confirmed');
 assert.equal((await call('POST',`/reports/${r.id}/action`,{revision:v,action:'withdraw'})).status,409);
 assert.equal((await call('POST',`/reports/${r.id}/action`,{revision:r.revision,action:'withdraw'})).status,403);
 r=(await call('POST',`/reports/${r.id}/action`,{revision:r.revision,action:'reopen',feedback:'补充更正说明'},'reviewer')).body.data;
 const concurrent=await Promise.all([call('PUT',`/reports/${r.id}`,{revision:r.revision,checks:filled(r)}),call('PUT',`/reports/${r.id}`,{revision:r.revision,checks:filled(r)})]);assert.deepEqual(concurrent.map(x=>x.status).sort(),[200,409]);
 assert.ok((await call('GET',`/reports/${r.id}`)).body.data.events.some(e=>e.action==='confirm'));
});
test('HTTP图片归属、删除保护、Excel嵌图与正式周包',async t=>{
 const {call}=await http(t);let r=(await call('POST','/reports',{week:D.today()})).body.data;
 const image=await require('sharp')({create:{width:100,height:80,channels:3,background:'red'}}).png().toBuffer();const form=new FormData();form.append('file',new Blob([image]),'现场截图.png');form.append('revision',r.revision);
 r=(await call('POST',`/reports/${r.id}/photos`,form)).body.data;const photoId=r.photos[0].id;
 assert.equal((await call('GET',`/photos/${photoId}`,null,'reviewer')).status,403);
 const c=filled(r);c[0].photoIds=[photoId];c[1].photoIds=[photoId];r=(await call('PUT',`/reports/${r.id}`,{revision:r.revision,checks:c})).body.data;
 assert.equal((await call('DELETE',`/reports/${r.id}/photos/${photoId}`,{revision:r.revision})).status,409);
 let exported=await call('GET',`/reports/${r.id}/export`);assert.equal(exported.status,200);const w=new ExcelJS.Workbook();await w.xlsx.load(exported.body);assert.equal(w.getWorksheet('验证材料').getImages().length,1);assert.match(w.getWorksheet('周履职材料').getCell('A3').value,/草稿/);assert.equal(w.getWorksheet('周履职材料').rowCount,25);
 assert.equal((await call('POST','/export',{reportIds:[r.id]},'reviewer')).status,403);
 r=(await call('PUT',`/reports/${r.id}`,{revision:r.revision,checks:c,submit:true})).body.data;
 assert.equal((await call('GET',`/photos/${photoId}`,null,'reviewer')).status,200);
 const archive=await call('POST','/export',{reportIds:[r.id]},'reviewer');assert.equal(archive.status,200);assert.equal(archive.body.subarray(0,2).toString(),'PK');
 assert.equal((await call('POST','/export',{reportIds:[r.id]},'reviewer2')).status,403);
 r=(await call('POST',`/reports/${r.id}/action`,{revision:r.revision,action:'return',feedback:'补充现场说明'},'reviewer')).body.data;
 const unlinked=filled(r);r=(await call('PUT',`/reports/${r.id}`,{revision:r.revision,checks:unlinked})).body.data;
 assert.equal((await call('DELETE',`/reports/${r.id}/photos/${photoId}`,{revision:r.revision})).status,409);
 assert.equal((await call('GET',`/photos/${photoId}`)).status,200);
 const json=await call('GET',`/reports/${r.id}`,null,'worker2');assert.equal(json.status,403);
});
test('人员分配、模板快照、车间限制与停用写保护',async t=>{
 const {call}=await http(t);const context=(await call('GET','/context',null,'admin')).body.data;
 assert.equal((await call('POST','/templates',{title:'越权',entries:D.defaultTemplate.entries},'worker')).status,403);
 let r=(await call('POST','/reports',{week:D.today()})).body.data;
 const tmpl=(await call('POST','/templates',{title:'原粮新模板',entries:D.defaultTemplate.entries.slice(0,3)},'admin')).body.data;
 const member=context.members.find(m=>m.user_id===11);
 assert.equal((await call('PUT','/members/11',{revision:member.revision,position:'工段长',reviewerId:11,templateId:0},'admin')).status,400);
 assert.equal((await call('PUT','/members/11',{revision:member.revision,position:'工段长',reviewerId:31,templateId:0},'admin')).status,400);
 assert.equal((await call('PUT','/members/11',{revision:member.revision,position:'工段长',reviewerId:21,templateId:tmpl.id,active:false},'admin')).status,200);
 assert.equal((await call('PUT',`/reports/${r.id}`,{revision:r.revision,checks:filled(r)})).status,403);
 assert.equal((await call('GET',`/reports/${r.id}`)).body.data.template.entries.length,19);
 assert.equal((await call('PUT','/members/11',{revision:member.revision,position:'工段长',reviewerId:21,templateId:0},'admin')).status,409);
});

test('模板支持编辑、重命名和删除，保留旧周快照并保护分配与并发修改',async t=>{
 const {call}=await http(t);let template=(await call('POST','/templates',{title:'待编辑',entries:D.defaultTemplate.entries.slice(0,2)},'admin')).body.data;
 assert.equal(template.etag.length,64);
 const context=(await call('GET','/context',null,'admin')).body.data,m=context.members.find(m=>m.user_id===11);
 await call('PUT','/members/11',{revision:m.revision,position:'工段长',reviewerId:21,templateId:template.id},'admin');
 const report=(await call('POST','/reports',{week:D.today()})).body.data;
 const previous=template;let result=await call('PUT',`/templates/${template.id}`,{...template,title:'已重命名',entries:template.entries.slice(0,1),ifMatch:template.etag},'raw_grain');assert.equal(result.status,200);template=result.body.data;
 assert.equal(template.title,'已重命名');assert.equal((await call('GET',`/reports/${report.id}`)).body.data.template.entries.length,2);
 assert.equal((await call('PUT',`/templates/${template.id}`,{...previous,ifMatch:previous.etag},'admin')).status,409);
 assert.equal((await call('DELETE',`/templates/${template.id}`,{ifMatch:template.etag},'worker')).status,403);
 assert.equal((await call('DELETE',`/templates/${template.id}`,{ifMatch:template.etag},'admin')).status,409);
 await call('PUT','/members/11',{revision:m.revision+1,position:'工段长',reviewerId:21,templateId:0},'admin');
 assert.equal((await call('DELETE',`/templates/${template.id}`,{ifMatch:template.etag},'admin')).status,200);
 assert.equal((await call('GET',`/reports/${report.id}`)).body.data.template.title,'待编辑');
 assert.equal((await call('DELETE','/templates/0',{ifMatch:''},'admin')).status,400);
});
