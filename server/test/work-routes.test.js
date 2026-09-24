const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const utils=require('../src/utils'),W=require('../src/work-assessment');
function routes(query,options={}){
  const handlers=new Map(),router={};for(const verb of ['get','post','delete'])router[verb]=(url,...chain)=>handlers.set(`${verb} ${url}`,chain.at(-1));
  const guardedQuery=(sql,...args)=>sql.startsWith('SELECT workshop_code FROM work_reviewers')&&!options.reviewerScope?Promise.resolve([[]]):query(sql,...args);
  const db={query:guardedQuery,beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release(){}};
  const multer=()=>({single:()=>()=>{}});multer.memoryStorage=()=>({});
  const mocks={express:{Router:()=>router},multer,'../db':{pool:{query:guardedQuery,getConnection:async()=>db}},'../utils':{...utils,asyncHandler:fn=>fn},'../workshop-scope':require('../src/workshop-scope'),'../work-assessment':W,'../config':options.config||{openclaw:{contextTransferEnabled:false}},'../data-protection':require('../src/data-protection')};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/routes/work.js'),'utf8'),{require:n=>mocks[n],module:{exports:{}},Buffer,Date,AbortController,setTimeout,clearTimeout,fetch:options.fetch});return handlers;
}
const member={user_id:10,workshop_code:'qu_making',floor:1,active:1};
const viewer={id:'20',role:'viewer'};
test('week access rejects another staff member before loading any records',async()=>{
  let calls=0;const h=routes(async sql=>{calls++;assert.match(sql,/work_members/);return [[member]]}).get('get /week');
  await assert.rejects(()=>h({user:viewer,query:{userId:'10',week:'2026-09-21'}},{}),{status:403});assert.equal(calls,1);
});
test('photos authorize before reading bytes and reject cross-workshop manager',async()=>{
  const h=routes(async sql=>{if(sql.includes('work_members'))return [[member]];assert.doesNotMatch(sql,/SELECT image/);return [[{id:1,user_id:10,mime:'image/png'}]]}).get('get /photos/:id');
  for(const user of [viewer,{id:'30',role:'raw_grain'}])await assert.rejects(()=>h({user,params:{id:'1'}},{}),{status:403});
});
test('ordinary staff cannot export even their own records',async()=>{
  const h=routes(async sql=>{assert.match(sql,/work_members/);return [[member]]}).get('get /export');
  await assert.rejects(()=>h({user:{id:'10',role:'viewer'},query:{userId:'10',week:'2026-09-21'}},{}),{status:403});
});
test('ordinary staff cannot export production abnormal Word reports',async()=>{
  const h=routes(async sql=>sql.startsWith('SELECT * FROM work_records')?[[{id:1,user_id:10,kind:'duties',status:'submitted',payload:{checks:[]}}]]:[[member]]).get('get /records/:id/production-report');
  await assert.rejects(()=>h({user:{id:10,role:'viewer'},params:{id:'1'}},{}),{status:403});
});
test('ordinary staff cannot set rules, memberships or review',async()=>{
  const h=routes(async()=>[[member]]);
  await assert.rejects(()=>h.get('post /rules')({user:viewer,body:{workshop:'qu_making'}},{}),{status:403});
  await assert.rejects(()=>h.get('post /members')({user:viewer,body:{workshop:'qu_making',userId:10,floor:1}},{}),{status:403});
  await assert.rejects(()=>h.get('post /review')({user:viewer,body:{userId:10,week:'2026-09-21'}},{}),{status:403});
  await assert.rejects(()=>h.get('get /overview')({user:viewer,query:{workshop:'qu_making',week:'2026-09-21'}},{}),{status:403});
});
test('authorized shift leader remains staff and can review only the qu-making workshop',async()=>{
  const query=async sql=>{
    if(sql.startsWith('SELECT workshop_code FROM work_reviewers'))return [[{workshop_code:'qu_making'}]];
    if(sql.includes('FROM work_members'))return [[member]];
    if(sql.startsWith('SELECT m.user_id,m.floor'))return [[]];
    if(sql.startsWith('SELECT * FROM work_reports'))return [[{id:1,status:'draft',revision:0}]];
    return [[]];
  };
  const h=routes(query,{reviewerScope:true});
  let context;
  await h.get('get /context')({user:viewer},{json:value=>{context=value.data}});
  assert.equal(context.workRole,'shift_leader');assert.equal(context.isManager,true);assert.equal(context.canConfigure,false);
  await h.get('get /overview')({user:viewer,query:{workshop:'qu_making',week:'2026-09-21'}},{json(){}});
  await assert.rejects(()=>h.get('post /rules')({user:viewer,body:{workshop:'qu_making'}},{}),{status:403});
  await assert.rejects(()=>h.get('post /members')({user:viewer,body:{workshop:'qu_making',userId:10,floor:1}},{}),{status:403});
  await assert.rejects(()=>h.get('get /overview')({user:viewer,query:{workshop:'raw_grain',week:'2026-09-21'}},{}),{status:403});
  await assert.rejects(()=>h.get('post /review')({user:viewer,body:{userId:10,week:'2026-09-21',revision:1}},{}),{status:409});
});
test('viewer without shift leader grant cannot review a group leader',async()=>{
  const h=routes(async sql=>sql.includes('FROM work_members')?[[member]]:[[]]);
  await assert.rejects(()=>h.get('post /review')({user:viewer,body:{userId:10,week:'2026-09-21'}},{}),{status:403});
});
test('manager cannot review self or other workshop',async()=>{
  const h=routes(async()=>[[member]]).get('post /review');
  for(const user of [{id:'10',role:'qu_making'},{id:'12',role:'raw_grain'}])await assert.rejects(()=>h({user,body:{userId:10,week:'2026-09-21'}},{}),{status:403});
});
test('role-duty scoring suggestions use the local OpenClaw gateway and remain reviewable',async()=>{
  const rules=W.rules([{title:'岗位职责履行',kind:'manual',max:100,standard:'结合每日结果和验证材料评价'}]);
  const report={id:5,user_id:10,week_start:'2026-09-21',status:'draft',revision:0,rules_json:rules};
  const record={id:3,kind:'duties',status:'submitted',record_date:'2026-09-21',payload:{mode:'daily',checks:[{dutyId:'team_feedback',status:'无异常',note:'已核查班组工作'}]}};
  let saved,called=0;
  const query=async sql=>{
    if(sql.startsWith('SELECT * FROM work_members'))return [[member]];
    if(sql.startsWith('SELECT * FROM work_reports'))return [[report]];
    if(sql.startsWith('SELECT * FROM work_records'))return [[record]];
    if(sql.startsWith('SELECT p.record_id'))return [[]];
    if(sql.startsWith('INSERT IGNORE INTO work_reports'))return [{affectedRows:0}];
    if(sql.startsWith('INSERT INTO work_audit'))return [{insertId:77}];
    throw Error('Unexpected SQL '+sql);
  };
  const h=routes(query,{config:{openclaw:{contextTransferEnabled:true,apiUrl:'http://127.0.0.1:14504/v1/chat/completions',token:'test-token',model:'test-model',timeoutMs:1000}},fetch:async(url,options)=>{called++;assert.match(url,/127\.0\.0\.1/);assert.match(options.body,/岗位职责履行/);return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({items:[{ruleId:'1',score:86,reason:'记录3显示已核查班组工作；照片内容未核验，班长还需复核。',evidenceRecordIds:[3]}]})}}]})};}}).get('post /suggest');
  await h({user:{id:20,role:'qu_making'},body:{userId:10,week:'2026-09-21'}},{json(value){saved=value}});
  assert.equal(called,1);assert.equal(saved.data.available,true);assert.equal(saved.data.suggestionId,77);assert.equal(saved.data.suggestions[0].score,86);
  await assert.rejects(()=>h({user:{id:30,role:'viewer'},body:{userId:10,week:'2026-09-21'}},{json(){}}),{status:403});
});
test('locked week rejects record mutation even for owner',async()=>{
  const h=routes(async sql=>sql.includes('work_members')?[[member]]:sql.startsWith('SELECT * FROM work_reports')?[[{id:1,status:'published'}]]:[{}]).get('post /records');
  await assert.rejects(()=>h({user:{id:'10',role:'viewer'},body:{date:'2026-09-21',kind:'block',floor:1,note:'说明',status:'submitted'}},{}),{status:409});
});
test('required duty photos block submission until evidence is uploaded',async()=>{
  const sixS=W.duties.entries.find(x=>x.id==='six_s');
  const h=routes(async sql=>{
    if(sql.includes('work_members'))return [[member]];
    if(sql.startsWith('INSERT IGNORE INTO work_reports'))return [{affectedRows:0}];
    if(sql.startsWith('SELECT * FROM work_reports'))return [[{id:1,status:'draft',revision:0}]];
    if(sql.startsWith('SELECT id,record_date,status,payload'))return [[]];
    if(sql.startsWith('SELECT COUNT(*) AS count FROM work_records'))return [[{count:0}]];
    if(sql.startsWith('INSERT INTO work_records'))return [{insertId:77}];
    if(sql.startsWith('SELECT task_key FROM work_photos'))return [[]];
    return [{}];
  }).get('post /records');
  await assert.rejects(()=>h({user:{id:10,role:'viewer'},body:{kind:'duties',mode:'daily',date:'2026-09-21',floor:1,status:'submitted',checks:[{dutyId:sixS.id,status:sixS.options[0]}]}},{json(){}}),{status:400,message:/上传照片/});
});
test('submitted duty cannot lose its last required photograph',async()=>{
  let deleted=false;
  const h=routes(async sql=>{
    if(sql.startsWith('SELECT * FROM work_members'))return [[member]];
    if(sql.startsWith('SELECT p.id,p.task_key'))return [[{id:7,task_key:'six_s',record_id:3,week_start:'2026-09-21',status:'submitted',payload:{checks:[{dutyId:'six_s',status:'正常'}]}}]];
    if(sql.startsWith('INSERT IGNORE INTO work_reports'))return [{}];
    if(sql.startsWith('SELECT * FROM work_reports'))return [[{id:5,status:'draft'}]];
    if(sql.startsWith('SELECT COUNT(*) AS count FROM work_photos'))return [[{count:1}]];
    if(sql.startsWith('DELETE FROM work_photos'))deleted=true;
    throw Error('Unexpected SQL '+sql);
  }).get('delete /photos/:id');
  await assert.rejects(()=>h({user:{id:10,role:'viewer'},params:{id:7}},{}),{status:400,message:/最后一张/});
  assert.equal(deleted,false);
});
test('stale record revision cannot overwrite a newer edit',async()=>{
  const h=routes(async sql=>sql.includes('work_members')?[[member]]:sql.startsWith('SELECT * FROM work_reports')?[[{id:1,status:'draft'}]]:sql.startsWith('SELECT * FROM work_records')?[[{id:3,kind:'block',revision:2}]]:[{}]).get('post /records');
  await assert.rejects(()=>h({user:{id:'10',role:'viewer'},body:{id:3,revision:1,date:'2026-09-21',kind:'block',floor:1,note:'说明'}},{}),{status:409});
});
test('saved duty record cannot be reassigned to another work content',async()=>{
  const h=routes(async sql=>{
    if(sql.includes('work_members'))return [[member]];
    if(sql.startsWith('INSERT IGNORE INTO work_reports'))return [{affectedRows:0}];
    if(sql.startsWith('SELECT * FROM work_reports'))return [[{id:1,status:'draft',revision:0}]];
    if(sql.startsWith('SELECT id,record_date,status,payload'))return [[]];
    if(sql.startsWith('SELECT * FROM work_records'))return [[{id:3,kind:'duties',revision:0,payload:{mode:'daily',checks:[{dutyId:'team_feedback',status:'无异常'}]}}]];
    throw Error('Unexpected SQL '+sql);
  }).get('post /records');
  await assert.rejects(()=>h({user:{id:10,role:'viewer'},body:{id:3,revision:0,date:'2026-09-21',kind:'duties',mode:'daily',floor:1,status:'submitted',checks:[{dutyId:'standard_operation',status:'正常'}]}},{json(){}}),{status:400,message:/不能更换工作内容/});
});
test('manager grades daily records directly without an extra weekly submission and preserves frozen rules',async()=>{
  const config=W.rules([{title:'完成',kind:'block',max:100,target:1,deduction:100,standard:'提交一天记录'}]);let saved;
  const h=routes(async(sql,params)=>{
    if(sql.includes('work_members'))return [[member]];
    if(sql.startsWith('SELECT * FROM work_reports'))return [[{id:1,status:'returned',revision:2,rules_json:config}]];
    if(sql.startsWith('SELECT * FROM work_records'))return [[{id:4,kind:'block',status:'submitted',record_date:'2026-09-21'}]];
    if(sql.includes('FROM work_rules'))throw Error('must not replace frozen rules');
    if(sql.startsWith('UPDATE work_reports'))saved=params;
    return [{}];
  }).get('post /review');
  await h({user:{id:'20',role:'qu_making'},body:{userId:10,week:'2026-09-21',revision:2,rulesKey:W.ruleKey(config),action:'publish',feedback:'已核对本周每日记录'}},{json(){}});
  assert.deepEqual(JSON.parse(saved[3]),config);assert.equal(JSON.parse(saved[0]).total,100);
});
test('a week without any submission can still be assessed using configured rules',async()=>{
  const config=W.rules([{title:'每日上报',kind:'block',max:100,target:5,deduction:20,standard:'每周五天上报'}]);let saved;
  const h=routes(async(sql,params)=>{
    if(sql.includes('work_members'))return [[member]];
    if(sql.startsWith('SELECT * FROM work_reports'))return [[{id:1,status:'draft',revision:0}]];
    if(sql.startsWith('SELECT * FROM work_rules'))return [[{rules_json:config}]];
    if(sql.startsWith('SELECT * FROM work_records'))return [[]];
    if(sql.startsWith('UPDATE work_reports'))saved=params;
    return [{}];
  }).get('post /review');
  await h({user:{id:20,role:'qu_making'},body:{userId:10,week:'2026-09-21',revision:0,rulesKey:W.ruleKey(config),action:'publish',feedback:'本周未上报，已核实'}},{json(){}});
  assert.equal(JSON.parse(saved[0]).total,0);
});
test('changed evidence, changed rules and duplicate publishing require refresh or explicit return',async()=>{
  const config=W.rules([{title:'每日上报',kind:'block',max:100,target:1,deduction:100,standard:'每日上报'}]);
  for(const scenario of [{status:'draft',revision:1,key:W.ruleKey(config)},{status:'draft',revision:0,key:'old'},{status:'published',revision:0,key:W.ruleKey(config)}]){
    const h=routes(async sql=>sql.includes('work_members')?[[member]]:sql.startsWith('SELECT * FROM work_reports')?[[{id:1,status:scenario.status,revision:scenario.revision,rules_json:config}]]:[{}]).get('post /review');
    await assert.rejects(()=>h({user:{id:20,role:'qu_making'},body:{userId:10,week:'2026-09-21',revision:0,rulesKey:scenario.key,action:'publish',feedback:'核实'}},{}),{status:409});
  }
});
