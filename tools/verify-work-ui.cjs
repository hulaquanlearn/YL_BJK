// Synthetic local UI checks only. No production API/database is contacted.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const base=process.env.UI_BASE_URL||'http://127.0.0.1:8518';
const out=path.resolve(__dirname,'../.local/work-qa');
const duties=require('../server/src/work-duties').entries;
(async()=>{
 await fs.mkdir(out,{recursive:true});const browser=await chromium.launch({channel:'msedge',headless:true});
 const errors=[],checks=[];let nextId=2;
 const rules=[{id:'1',title:'工艺记录落实',kind:'process',max:40,target:5,deduction:8,standard:'按要求填报测量数据，每缺一天扣8分。'},{id:'2',title:'异常处理与闭环',kind:'manual',max:60,standard:'结合现场问题上报、处理和复查证据评价。'}];
 let records=[{id:1,kind:'block',record_date:'2026-09-21',revision:0,status:'draft',payload:{floor:1,note:'本周待补充的曲坯分析',action:''},photos:[]}],report=null;
 let ruleWrites=0,photoWrites=0;
 async function pageFor(role,width){
  const user={id:role==='viewer'?'10':role==='shift_leader'?'30':'20',displayName:role==='viewer'?'测试组长':role==='shift_leader'?'测试班长':'车间管理员',role:role==='shift_leader'?'viewer':role,workshopCode:role==='qu_making'?'qu_making':null};
  const p=await browser.newPage({viewport:{width,height:900},deviceScaleFactor:1});p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(u=>{localStorage.setItem('spare_parts_auth_token','x'.repeat(43));localStorage.setItem('spare_parts_auth_user',JSON.stringify(u))},user);
  await p.route('**/api/**',async route=>{
   const req=route.request(),url=new URL(req.url()),key=url.pathname.replace('/api/work',''),body=req.postDataJSON?.bind(req);let data={};
   if(!url.pathname.startsWith('/api/'))return route.continue();
   if(url.pathname==='/api/auth/me')data={user};
   else if(url.pathname==='/api/health')return route.fulfill({json:{success:true,database:'connected'}});
   else if(key==='/context')data={members:[{user_id:10,name:'测试组长',workshop_code:'qu_making',floor:1}],users:[{id:10,name:'测试组长',role:'viewer'},{id:30,name:'测试班长',role:'viewer'}],isManager:role!=='viewer',canConfigure:role==='qu_making',workRole:role==='viewer'?'group_leader':role==='shift_leader'?'shift_leader':null,scope:role==='viewer'?null:'qu_making',duties};
   else if(key==='/week')data={member:{user_id:10,name:'测试组长',workshop_code:'qu_making',floor:1},records,report,config:rules,rulesKey:'mock-rules',evaluation:report?.result_json||{total:null,items:rules.map(r=>({...r,score:r.kind==='manual'?null:0,reason:r.kind==='manual'?'待负责人复核':'提交0天',evidence:[]}))},events:[]};
   else if(key==='/rules'&&req.method()==='GET')data={current:{rules},history:[{id:1,effective_week:'2026-09-21',created_at:'2026-09-23'}]};
   else if(key==='/reviewers'&&req.method()==='GET')data=[];
   else if(key==='/rules'){ruleWrites++;assert.equal(body().rules.length,2);data=true}
   else if(key==='/overview')data=[{user_id:10,name:'测试组长',floor:1,status:'submitted',submitted_count:2}];
   else if(key==='/records'){const f=body();const id=f.id||nextId++;const row={id,kind:f.kind,record_date:f.date,revision:f.id?f.revision+1:0,status:f.status,payload:f,photos:records.find(r=>r.id===id)?.photos||[]};records=records.filter(r=>r.id!==id).concat(row);data={id,revision:row.revision}}
   else if(/^\/records\/\d+\/photos$/.test(key)){photoWrites++;const id=Number(key.split('/')[2]),raw=req.postDataBuffer()?.toString('latin1')||'',taskKey=raw.match(/name="itemKey"\r\n\r\n([^\r]+)/)?.[1]||null;records.find(r=>r.id===id).photos.push({id:100+photoWrites,task_key:taskKey});data=true}
   else if(key.startsWith('/photos/'))return route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aE5sAAAAASUVORK5CYII=','base64')});
   else if(key==='/suggest'){data={available:true,suggestionId:99,suggestions:[{ruleId:'1',title:rules[0].title,score:0,reason:'本周工艺测量尚未提交，建议班长核对。',evidenceRecordIds:[]},{ruleId:'2',title:rules[1].title,score:50,reason:'已见生产进度异常和5S现场记录，照片内容需班长核对。',evidenceRecordIds:records.filter(r=>r.kind==='duties').map(r=>r.id)}]}}
   else if(key==='/review'){assert.equal(body().rulesKey,'mock-rules');assert.equal(body().action,'publish');assert.equal(body().suggestionId,99);assert.equal(Number(body().manual['2'].score),55);report={status:'published',revision:1,result_json:{total:55,items:rules.map(r=>({...r,score:r.kind==='manual'?55:0,reason:'已核对每日记录',evidence:[]}))}};data=true}
   else throw new Error('Unexpected API '+req.method()+' '+url.pathname);
   return route.fulfill({json:{success:true,data}});
  });
  await p.goto(base+'/work');await p.getByRole('heading',{name:'填报事项',exact:true}).waitFor();
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'page overflow '+width);return p;
 }
 try{
  const p=await pageFor('viewer',390);
  assert.equal(await p.getByRole('button',{name:'评分标准',exact:true}).count(),0);
  assert.equal(await p.getByRole('button',{name:'人员设置',exact:true}).count(),0);
  await p.screenshot({path:path.join(out,'mobile-week.png'),fullPage:true});
  await p.getByRole('button',{name:/基础工作/}).click();
  const processRow=p.locator('.category-task').filter({hasText:'处理指令性工作和突发问题'});
  assert.ok(await processRow.getByText('每日').count(),'work frequency should appear beside its content');
  await p.locator('.special-record-grid article').filter({hasText:'工艺分析'}).getByRole('button',{name:'填写记录'}).click();
  const dialog=p.getByRole('dialog');await dialog.waitFor();
  await dialog.locator('.measurement-grid input').first().fill('6.8');
  await p.screenshot({path:path.join(out,'mobile-form.png'),fullPage:true});
  assert.ok(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'dialog overflow');
  assert.equal(await dialog.locator('.photo-actions input[type=file]').count(),2,'photo upload actions should be visible before a record exists');await dialog.getByRole('button',{name:'保存草稿',exact:true}).click();await p.getByText('草稿已保存',{exact:true}).waitFor();
  // Real browser image conversion and multipart upload to the isolated mock.
  const fixture=await p.evaluate(()=>{const c=document.createElement('canvas');c.width=40;c.height=30;c.getContext('2d').fillRect(0,0,40,30);return c.toDataURL('image/png').split(',')[1]});
  await dialog.locator('input[type=file]').last().setInputFiles({name:'photo.png',mimeType:'image/png',buffer:Buffer.from(fixture,'base64')});
  await p.getByText('照片已上传',{exact:true}).waitFor();assert.equal(photoWrites,1);
  await dialog.getByRole('button',{name:'关闭填报'}).click();
  await p.getByRole('button',{name:/基础工作/}).click();
  const progressRow=p.locator('.category-task').filter({hasText:'跟进生产进度'});await progressRow.getByRole('button',{name:'填写工作内容'}).click();
  const daily=p.getByRole('dialog');await daily.waitFor();
  await daily.getByLabel('本项结果').selectOption('异常');await daily.getByLabel('验证情况').fill('35号车总线故障，停线60分钟');
  await daily.getByLabel('问题类别').selectOption('设备');await daily.getByPlaceholder('如 60分钟').fill('60分钟');
  await daily.locator('.production-issue textarea').fill('总线故障导致车辆停线');await daily.getByPlaceholder('每项措施单独一行').fill('下线检修后复测');
  await daily.getByRole('button',{name:'提交记录',exact:true}).click();await p.getByText('记录已提交').waitFor();
  await p.getByRole('button',{name:/5S管理/}).click();
  const sixSRow=p.locator('.category-task').filter({hasText:'根据酿造四部6S管理标准'});await sixSRow.getByRole('button',{name:'填写工作内容'}).click();
  const sixS=p.getByRole('dialog');await sixS.waitFor();await sixS.getByLabel('本项结果').selectOption('正常');
  assert.equal(await sixS.locator('.photo-actions input[type=file]').count(),2,'photo upload actions should be visible inside the selected work content');
  await p.screenshot({path:path.join(out,'mobile-daily-photo-entry.png'),fullPage:true});
  await sixS.locator('input[type=file]').first().setInputFiles({name:'six-s.png',mimeType:'image/png',buffer:Buffer.from(fixture,'base64')});
  await sixS.locator('.pending-photo').waitFor();assert.equal(await sixS.getByRole('button',{name:'提交记录',exact:true}).isDisabled(),false);
  await sixS.getByRole('button',{name:'提交记录',exact:true}).click();await p.getByText('记录已提交').waitFor();assert.equal(photoWrites,2);assert.equal(records.find(r=>r.kind==='duties'&&r.payload.checks?.[0]?.dutyId==='six_s')?.photos?.[0]?.task_key,'six_s','photo must remain associated with its work content');
  checks.push('category then work content then result/evidence; individual daily and weekly cadence records; production-abnormal entry; photo upload');
  await p.getByRole('button',{name:'填报记录',exact:true}).click();assert.equal(await p.getByRole('button',{name:'导出本周表格'}).count(),0);
  await p.getByRole('button',{name:'周考评',exact:true}).click();assert.equal(await p.getByRole('button',{name:'提交周考评',exact:true}).count(),0);await p.getByRole('heading',{name:'每日上报汇总'}).waitFor();await p.screenshot({path:path.join(out,'mobile-assessment.png'),fullPage:true});checks.push('390px staff daily reporting without a second weekly submission; photo upload/draft and hidden manager controls');
  await p.close();
  const shift=await pageFor('shift_leader',390);
  assert.equal(await shift.getByRole('button',{name:'评分标准',exact:true}).count(),0);
  assert.equal(await shift.getByRole('button',{name:'人员设置',exact:true}).count(),0);
  await shift.getByRole('button',{name:'车间汇总',exact:true}).click();
  await shift.getByRole('button',{name:'查看与复核'}).waitFor();
  await shift.getByRole('button',{name:'周考评',exact:true}).click();
  await shift.getByRole('button',{name:'生成建议分与理由'}).waitFor();
  assert.ok(await shift.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await shift.screenshot({path:path.join(out,'mobile-shift-leader-review.png'),fullPage:true});
  checks.push('shift leader remains staff, sees workshop review, cannot configure rules or roster');
  await shift.close();
  const a=await pageFor('qu_making',1440);
  await a.getByRole('button',{name:'周考评',exact:true}).click();await a.getByRole('heading',{name:'履职明细'}).waitFor();await a.screenshot({path:path.join(out,'desktop-duty-review.png'),fullPage:true});
  assert.ok(await a.locator('.ledger-photos img').count()>0,'manager must see the submitted photo beside its duty result');
  await a.getByRole('button',{name:'周考评',exact:true}).click();await a.getByRole('heading',{name:'履职明细'}).waitFor();for(const label of ['人员','日期','工作事项','工作内容','频次','输出依据','选择结果','验证材料'])await a.locator('.ledger-table thead').getByText(label,{exact:true}).waitFor();assert.ok(await a.locator('.ledger-table tbody tr').count()>=2);await a.getByRole('button',{name:'生成建议分与理由'}).click();await a.getByText('建议分和理由已填入下方，班长可逐项修改后确认发布。').waitFor();const manualCard=a.locator('.score-item').filter({hasText:'异常处理与闭环'});await manualCard.locator('.manual-fields input').fill('55');await manualCard.locator('.manual-fields textarea').fill('已核对本周日常上报与异常处理');await a.locator('.card').filter({has:a.getByRole('heading',{name:'负责人复核',exact:true})}).locator('textarea').fill('本周履职情况已核实');await a.getByRole('button',{name:'确认并发布成绩'}).click();await a.getByRole('button',{name:'确定',exact:true}).click();await a.getByText('已由负责人复核发布',{exact:true}).waitFor();assert.equal(await a.getByRole('button',{name:'确认并发布成绩'}).count(),0);checks.push('manager item-level duty ledger followed by AI suggestion, manual score adjustment and publish review');
  await a.getByRole('button',{name:'评分标准',exact:true}).click();
  await a.locator('.rule-editor input').first().fill('工艺记录完成情况');await a.getByRole('button',{name:'保存新版本'}).click();await a.getByText('评分标准已保存为新版本').waitFor();assert.equal(ruleWrites,1);
  await a.screenshot({path:path.join(out,'desktop-rules.png'),fullPage:true});
  await a.getByRole('button',{name:'车间汇总',exact:true}).click();await a.getByRole('button',{name:'查看与复核'}).waitFor();await a.screenshot({path:path.join(out,'desktop-overview.png'),fullPage:true});checks.push('manager rule editor and workshop overview');
  await a.setViewportSize({width:390,height:844});await a.getByRole('button',{name:'评分标准',exact:true}).click();assert.ok(await a.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await a.screenshot({path:path.join(out,'mobile-rules.png'),fullPage:true});
  assert.deepEqual(errors,[]);const result={syntheticData:true,checks,pageErrors:errors,ruleWrites,photoWrites};await fs.writeFile(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
