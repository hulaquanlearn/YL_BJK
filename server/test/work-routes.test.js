const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const utils=require('../src/utils'),W=require('../src/work-assessment');
function routes(query,options={}){
  const handlers=new Map(),router={use(){}};for(const verb of ['get','post','delete'])router[verb]=(url,...chain)=>handlers.set(`${verb} ${url}`,chain.at(-1));
  const guardedQuery=(sql,...args)=>{
    if(sql.includes('FROM work_document_bindings'))return Promise.resolve([[]]);
    if(sql.includes('FROM work_catalog_versions'))return Promise.resolve([[]]);
    if(sql.startsWith('SELECT rest_date,revision'))return Promise.resolve([options.calendar===null?[]:[options.calendar||{rest_date:require('../src/work-flow').addDays(args[0][1],5),revision:0}]]);
    return sql.startsWith('SELECT workshop_code FROM work_reviewers')&&!options.reviewerScope?Promise.resolve([[]]):query(sql,...args);
  };
  const db={query:guardedQuery,beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release(){}};
  const multer=()=>({single:()=>()=>{}});multer.memoryStorage=()=>({});
  const mocks={express:{Router:()=>router},multer,'../db':{pool:{query:guardedQuery,getConnection:async()=>db}},'../utils':{...utils,asyncHandler:fn=>fn},'../workshop-scope':require('../src/workshop-scope'),'../work-assessment':W,'../config':options.config||{openclaw:{contextTransferEnabled:false}},'../data-protection':require('../src/data-protection'),'../work-score-scheduler':{runScore:async args=>args.generate(args)}};
  mocks['../work-statistics']=require('../src/work-statistics');
  mocks['../work-flow']=require('../src/work-flow');
  mocks['../work-deduction']=require('../src/work-deduction');
  mocks['../work-flow-routes']=require('../src/work-flow-routes');
  const runtimeDate=options.now?class extends Date{static now(){return Date.parse(options.now)}}:Date;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/routes/work.js'),'utf8'),{require:n=>mocks[n],module:{exports:{}},Buffer,Date:runtimeDate,AbortController,setTimeout,clearTimeout,fetch:options.fetch});return handlers;
}
const member={user_id:10,workshop_code:'qu_making',floor:1,active:1};
const viewer={id:'20',role:'viewer'};

test('authorized shift leader statistics queries only assigned workshop and normalized week',async()=>{
  let result,recordReads=0;
  const h=routes(async(sql,params)=>{
    if(sql.startsWith('SELECT workshop_code'))return [[{workshop_code:'qu_making'}]];
    assert.match(sql,/m.active=1 AND m.workshop_code=\?/);assert.match(sql,/team.shift_leader_id=\?/);
    if(sql.includes('FROM work_members')){assert.equal(JSON.stringify(params),'["qu_making",20]');return [[{...member,name:'组长'}]];}
    assert.match(sql,/r.week_start=\?/);assert.equal(JSON.stringify(params),'["qu_making","2026-09-21",20]');recordReads++;return [[]];
  },{reviewerScope:true}).get('get /week-statistics');
  await h({user:{id:20,role:'viewer',staffWorkshopCode:'qu_making',staffPosition:'shift_leader'},query:{workshop:'qu_making',week:'2026-09-23'}},{json:r=>result=r.data});
  assert.equal(recordReads,1);assert.equal(result.weekStart,'2026-09-21');assert.equal(result.people[0].userId,10);assert.equal(result.people[0].days.length,6);
});

test('weekly cross-person statistics rejects group leaders before reading work records',async()=>{
  const h=routes(async()=>assert.fail('must not read peer records')).get('get /week-statistics');
  await assert.rejects(()=>h({user:{id:10,role:'viewer',staffWorkshopCode:'qu_making',staffPosition:'group_leader'},query:{workshop:'qu_making',week:'2026-09-28'}},{}),{status:403});
});

test('weekly statistics rejects unrelated workshops and ordinary staff',async()=>{
  const h=routes(async()=>assert.fail('must not query work data')).get('get /week-statistics');
  for(const user of [{id:30,role:'viewer',staffWorkshopCode:'raw_grain',staffPosition:'shift_leader'}])
    await assert.rejects(()=>h({user,query:{workshop:'qu_making',week:'2026-09-28'}},{}),{status:403});
  await assert.rejects(()=>h({user:{id:1,role:'admin'},query:{workshop:'raw_grain',week:'2026-09-28'}},{}),{status:403});
});

test('group leader cannot select another person even by editing request parameters',async()=>{
  const h=routes(async()=>assert.fail('must not load another person')).get('get /week');
  await assert.rejects(()=>h({user:{id:10,role:'viewer',staffWorkshopCode:'qu_making',staffPosition:'group_leader'},query:{userId:11,week:'2026-09-21'}},{}),{status:403});
});

test('group leader context contains only own membership and no candidate user list',async()=>{
  const h=routes(async(sql,params)=>{
    assert.match(sql,/AND m.user_id=\?/);assert.equal(JSON.stringify(params),'[10]');return [[member]];
  }).get('get /context');
  let result;await h({user:{id:10,role:'viewer',staffWorkshopCode:'qu_making',staffPosition:'group_leader'}},{json:r=>result=r.data});
  assert.equal(result.isManager,false);assert.equal(result.canConfigure,false);assert.equal(result.members.length,1);assert.equal(result.users.length,0);
});

test('only system admin may trigger scoring even when shift leader has review access',async()=>{
  const h=routes(async()=>{throw Error('must reject before database');},{reviewerScope:true}).get('post /suggest');
  for(const user of [{id:20,role:'qu_making'},{id:30,role:'viewer',staffWorkshopCode:'qu_making',staffPosition:'shift_leader'}])
    await assert.rejects(()=>h({user,body:{userId:10,week:'2026-09-21'}},{}),{status:403});
});

test('opening week restores shared AI suggestion without invoking model or calculating new scores',async()=>{
  const rules=W.rules([{title:'履职',kind:'manual',max:100,standard:'核对材料'}]);
  const detail={revision:2,rulesKey:W.ruleKey(rules),suggestions:[{ruleId:'1',score:85,reason:'核对记录',evidenceRecordIds:[3]}]};
  const h=routes(async sql=>{
    if(sql.includes('FROM work_members'))return [[member]];
    if(sql.startsWith('SELECT * FROM work_reports'))return [[{id:5,status:'draft',revision:2,rules_json:rules}]];
    if(sql.startsWith('SELECT id,detail'))return [[{id:77,detail}]];
    if(sql.includes('FROM work_score_jobs'))return [[{status:'completed'}]];
    return [[]];
  },{fetch:()=>assert.fail('GET must never call model')}).get('get /week');
  let result;await h({user:{id:20,role:'qu_making'},query:{userId:10,week:'2026-09-21'}},{json:r=>result=r.data});
  assert.equal(result.suggestion.suggestionId,77);assert.equal(result.suggestion.stale,false);
  assert.equal(result.evaluation.total,null);assert.equal(result.evaluation.items[0].score,null);
  detail.revision=1;
  await h({user:{id:20,role:'qu_making'},query:{userId:10,week:'2026-09-21'}},{json:r=>result=r.data});
  assert.equal(result.suggestion.stale,true);
});

test('reviewer can publish a current scheduled suggestion authored by system, preserving its audit link',async()=>{
  const rules=W.rules([{title:'履职',kind:'manual',max:100,standard:'核对材料'}]);
  let publication;
  const h=routes(async(sql,params)=>{
    if(sql.includes('FROM work_members'))return [[member]];
    if(sql.startsWith('SELECT * FROM work_reports'))return [[{id:5,status:'draft',revision:0,rules_json:rules}]];
    if(sql.startsWith('SELECT id,actor_id,detail'))return [[{id:77,actor_id:0,detail:{revision:0,rulesKey:W.ruleKey(rules),suggestions:[{ruleId:'1',score:85}]}}]];
    if(sql.startsWith('SELECT'))return [[]];
    if(sql.startsWith('INSERT INTO work_audit'))publication=JSON.parse(params[3]);
    return [{}];
  }).get('post /review');
  await h({user:{id:20,role:'qu_making'},body:{userId:10,week:'2026-09-21',revision:0,rulesKey:W.ruleKey(rules),suggestionId:77,action:'publish',manual:{1:{score:90,reason:'核对证据后调整'}},feedback:'已复核'}},{json(){}});
  assert.equal(publication.suggestionId,77);assert.equal(publication.adjustments[0].finalScore,90);
});
test('week access rejects another staff member before loading any records',async()=>{
  let calls=0;const h=routes(async sql=>{calls++;assert.match(sql,/work_members/);return [[member]]}).get('get /week');
  await assert.rejects(()=>h({user:viewer,query:{userId:'10',week:'2026-09-21'}},{}),{status:403});assert.equal(calls,1);
});
test('photos authorize before reading bytes and reject unassigned staff',async()=>{
  const h=routes(async sql=>{if(sql.includes('work_members'))return [[member]];assert.doesNotMatch(sql,/SELECT image/);return [[{id:1,user_id:10,mime:'image/png'}]]}).get('get /photos/:id');
  for(const user of [viewer])await assert.rejects(()=>h({user,params:{id:'1'}},{}),{status:403});
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
  await assert.rejects(()=>h.get('post /members')({user:viewer,body:{workshop:'qu_making',userId:10,floor:1,shiftLeaderId:20}},{}),{status:403});
  await assert.rejects(()=>h.get('post /review')({user:viewer,body:{userId:10,week:'2026-09-21'}},{}),{status:403});
  await assert.rejects(()=>h.get('get /overview')({user:viewer,query:{workshop:'qu_making',week:'2026-09-21'}},{}),{status:403});
});
test('authorized shift leader remains staff and can review only the qu-making workshop',async()=>{
  const shiftViewer={...viewer,staffWorkshopCode:'qu_making',staffPosition:'shift_leader'};
  const query=async sql=>{
    if(sql.startsWith('SELECT workshop_code FROM work_reviewers'))return [[{workshop_code:'qu_making'}]];
    if(sql.startsWith('SELECT user_id FROM work_team_assignments'))return [[{user_id:10}]];
    if(sql.includes('FROM work_members'))return [[member]];
    if(sql.startsWith('SELECT m.user_id,m.floor'))return [[]];
    if(sql.startsWith('SELECT * FROM work_reports'))return [[{id:1,status:'draft',revision:0}]];
    return [[]];
  };
  const h=routes(query,{reviewerScope:true});
  let context;
  await h.get('get /context')({user:shiftViewer},{json:value=>{context=value.data}});
  assert.equal(context.workRole,'shift_leader');assert.equal(context.isManager,true);assert.equal(context.canConfigure,false);
  await h.get('get /overview')({user:shiftViewer,query:{workshop:'qu_making',week:'2026-09-21'}},{json(){}});
  await assert.rejects(()=>h.get('post /rules')({user:shiftViewer,body:{workshop:'qu_making'}},{}),{status:403});
  await assert.rejects(()=>h.get('post /members')({user:shiftViewer,body:{workshop:'qu_making',userId:10,floor:1}},{}),{status:403});
  await assert.rejects(()=>h.get('get /overview')({user:shiftViewer,query:{workshop:'raw_grain',week:'2026-09-21'}},{}),{status:403});
  await assert.rejects(()=>h.get('post /review')({user:shiftViewer,body:{userId:10,week:'2026-09-21',revision:1}},{}),{status:409});
});
test('viewer without shift leader grant cannot review a group leader',async()=>{
  const h=routes(async sql=>sql.includes('FROM work_members')?[[member]]:[[]]);
  await assert.rejects(()=>h.get('post /review')({user:viewer,body:{userId:10,week:'2026-09-21'}},{}),{status:403});
});
test('work assignments reject staff from another workshop or the wrong position',async()=>{
  const manager={id:'30',role:'qu_making'};
  const otherWorkshop=routes(async sql=>sql.startsWith('SELECT role,staff_workshop_code')?[[{role:'viewer',staff_workshop_code:'raw_grain',staff_position:'shift_leader'}]]:[[]]);
  await assert.rejects(()=>otherWorkshop.get('post /reviewers')({user:manager,body:{workshop:'qu_making',userId:20,active:true}},{}),{status:403});
  const wrongPosition=routes(async sql=>sql.startsWith('SELECT id,role,staff_workshop_code')?[[{role:'viewer',staff_workshop_code:'qu_making',staff_position:'shift_leader'}]]:[[]]);
  await assert.rejects(()=>wrongPosition.get('post /members')({user:manager,body:{workshop:'qu_making',userId:20,floor:1,shiftLeaderId:30}},{}),{status:403});
  const unassigned=routes(async sql=>sql.startsWith('SELECT id,role,staff_workshop_code')?[[{role:'viewer',staff_workshop_code:null,staff_position:'group_leader'}]]:[[]]);
  await assert.rejects(()=>unassigned.get('post /members')({user:manager,body:{workshop:'qu_making',userId:20,floor:1,shiftLeaderId:30}},{}),{status:403});
  const unassignedReviewer=routes(async sql=>sql.startsWith('SELECT role,staff_workshop_code')?[[{role:'viewer',staff_workshop_code:null,staff_position:'shift_leader'}]]:[[]]);
  await assert.rejects(()=>unassignedReviewer.get('post /reviewers')({user:manager,body:{workshop:'qu_making',userId:20,active:true}},{}),{status:403});
});
test('configuration candidates are limited to assigned qu-making leaders',async()=>{
  let userQuery='';
  const h=routes(async sql=>{
    if(sql.startsWith('SELECT m.*,u.display_name'))return [[]];
    if(sql.startsWith('SELECT id,display_name')){userQuery=sql;return [[{id:10,name:'制曲组长',role:'viewer',staffWorkshopCode:'qu_making',staffPosition:'group_leader'}]]}
    throw Error('unexpected query '+sql);
  });
  let result;await h.get('get /context')({user:{id:1,role:'admin'}},{json:value=>{result=value.data}});
  assert.match(userQuery,/staff_workshop_code='qu_making'/);
  assert.match(userQuery,/staff_position IN \('group_leader','shift_leader'\)/);
  assert.deepEqual(result.users.map(user=>user.id),[10]);
});
test('rule API rejects free-text scoring projects even for a manager',async()=>{
  const h=routes(async()=>{throw Error('invalid rule must not reach the database')});
  await assert.rejects(()=>h.get('post /rules')({user:{id:1,role:'qu_making'},body:{workshop:'qu_making',effectiveWeek:'2026-09-28',rules:[{title:'随意项目',kind:'manual',max:100,standard:'人工判断'}]}},{}),/已建工作事项/);
});
test('administrator saves a shared standard without selecting a leader, effective immediately',async()=>{
  let saved,result
  const h=routes(async(sql,params)=>{
    if(sql.includes('FROM work_rules'))return [[]]
    if(sql.startsWith('INSERT INTO work_rules')){saved=params;return [{insertId:42}]}
    throw Error('unexpected query '+sql)
  })
  const effectiveWeek=new Date(Date.now()+8*3600000).toISOString().slice(0,10)
  await h.get('post /rules')({user:{id:1,role:'admin'},body:{workshop:'qu_making',effectiveWeek,rules:[{dutyId:'production_progress',kind:'manual',max:24.5,standard:'依据已提交生产材料复核'},{dutyId:'team_feedback',kind:'manual',max:0.5,standard:'依据反馈记录复核'}]}},{json:value=>result=value.data})
  const next=W.week(effectiveWeek)
  assert.equal(saved[0],'qu_making');assert.equal(saved[1],next);assert.equal(saved[3],1);assert.equal(result.effectiveWeek,next)
  const persisted=JSON.parse(saved[2]);assert.equal(persisted.length,2);assert.equal(persisted[1].max,0.5)
  assert.equal(result.id,42)
})
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
  await h({user:{id:20,role:'admin'},body:{userId:10,week:'2026-09-21'}},{json(value){saved=value}});
  assert.equal(called,1);assert.equal(saved.data.available,true);assert.equal(saved.data.suggestionId,77);assert.equal(saved.data.suggestions[0].score,86);
  await assert.rejects(()=>h({user:{id:30,role:'viewer'},body:{userId:10,week:'2026-09-21'}},{json(){}}),{status:403});
});
test('locked week rejects record mutation even for owner',async()=>{
  const h=routes(async sql=>sql.includes('work_members')?[[member]]:sql.startsWith('SELECT * FROM work_reports')?[[{id:1,status:'published'}]]:[{}]).get('post /records');
  await assert.rejects(()=>h({user:{id:'10',role:'viewer'},body:{date:'2026-09-21',kind:'block',floor:1,note:'说明',status:'submitted'}},{}),{status:409});
});
test('rest and Sunday cannot be bypassed with direct record submissions',async()=>{
 let recordWrites=0;const h=routes(async sql=>{if(sql.includes('work_members'))return [[member]];if(sql.startsWith('SELECT * FROM work_reports'))return [[{id:1,status:'draft'}]];if(sql.startsWith('INSERT INTO work_records'))recordWrites++;return [{}]}).get('post /records');
 for(const date of ['2026-09-26','2026-09-27'])await assert.rejects(()=>h({user:{id:10,role:'viewer'},body:{date,kind:'block',format:'simple',floor:1,result:'正常',status:'submitted'}},{}),/休息日/);assert.equal(recordWrites,0);
});
test('formula suggestions cannot be overwritten by a model score',async()=>{
 const rules=W.rules([{title:'五日履职',kind:'duties',max:100,target:5,deduction:20,standard:'按五日提交计算'}]);let result;
 const h=routes(async sql=>{if(sql.includes('work_members'))return [[member]];if(sql.startsWith('SELECT * FROM work_reports'))return [[{id:5,status:'draft',revision:0,rules_json:rules}]];if(sql.startsWith('SELECT * FROM work_records'))return [[{id:3,kind:'duties',record_date:'2026-09-21',status:'submitted',payload:{mode:'daily',checks:[]}}]];if(sql.startsWith('SELECT'))return [[]];return [{insertId:77}]},{config:{openclaw:{contextTransferEnabled:true,apiUrl:'http://127.0.0.1:14504/v1/chat/completions',token:'test',model:'test',timeoutMs:1000}},fetch:async()=>({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({items:[{ruleId:'1',score:99,reason:'模型给出错误的高分',evidenceRecordIds:[3]}]})}}]})})}).get('post /suggest');
 await h({user:{id:1,role:'admin'},body:{userId:10,week:'2026-09-21'}},{json:r=>result=r.data});assert.equal(result.suggestions[0].score,20);assert.equal(result.suggestions[0].source,'formula');assert.doesNotMatch(result.suggestions[0].reason,/错误的高分/);
});
test('missing rest confirmation blocks publication instead of guessing a work calendar',async()=>{
 const rules=W.rules([{title:'复核',kind:'manual',max:100,standard:'核对'}]);const h=routes(async sql=>{if(sql.includes('work_members'))return [[member]];if(sql.startsWith('SELECT * FROM work_reports'))return [[{id:5,status:'draft',revision:0,rules_json:rules}]];if(sql.startsWith('SELECT'))return [[]];return [{}]},{calendar:null}).get('post /review');
 await assert.rejects(()=>h({user:{id:20,role:'qu_making'},body:{userId:10,week:'2026-09-21',revision:0,rulesKey:W.ruleKey(rules),action:'publish',feedback:'复核完成',manual:{1:{score:90,reason:'核对记录'}}}},{}),/确认本周休息日/);
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

const shiftUser={id:20,role:'viewer',staffWorkshopCode:'qu_making',staffPosition:'shift_leader'};
test('shift identity opens empty team and assignment candidates without legacy reviewer grant',async()=>{
  let result;const h=routes(async(sql,params)=>{
    assert.doesNotMatch(sql,/work_reviewers/);
    if(sql.startsWith('SELECT m.*')){assert.match(sql,/team.shift_leader_id=\?/);assert.equal(params.at(-1),20);return [[]];}
    assert.match(sql,/NOT EXISTS.*work_team_assignments/);assert.equal(JSON.stringify(params),'[1,20]');return [[{id:10}]];
  });await h.get('get /context')({user:shiftUser},{json:r=>result=r.data});
  assert.equal(result.workRole,'shift_leader');assert.equal(result.canAssignMembers,true);assert.equal(result.canConfigure,false);assert.equal(result.members.length,0);
});
test('shift leader assigns an unclaimed group leader to self and records audit',async()=>{
  const writes=[];const h=routes(async(sql,params)=>{
    if(sql.startsWith('SELECT id,role')){assert.match(sql,/FOR UPDATE/);return [[{id:10,role:'viewer',staff_workshop_code:'qu_making',staff_position:'group_leader'}]];}
    if(sql.startsWith('SELECT id FROM app_users'))return [[{id:20}]];
    if(sql.startsWith('SELECT'))return [[]];writes.push([sql,Array.from(params)]);return [{}];
  });await h.get('post /members')({user:shiftUser,body:{workshop:'qu_making',userId:10,floor:3}},{json(){}});
  assert.equal(writes.length,3);assert.deepEqual(writes[1][1],[10,20,20]);assert.deepEqual(writes[2][1],[10,20,null,20,3]);
});
test('shift leader cannot steal another team member or assign for another shift leader',async()=>{
  const h=routes(async sql=>{
    if(sql.startsWith('SELECT id,role'))return [[{role:'viewer',staff_workshop_code:'qu_making',staff_position:'group_leader'}]];
    if(sql.startsWith('SELECT id FROM app_users'))return [[{id:20}]];
    if(sql.startsWith('SELECT shift_leader_id'))return [[{shift_leader_id:30}]];
    assert.fail('must not write');
  }).get('post /members');
  await assert.rejects(()=>h({user:shiftUser,body:{workshop:'qu_making',userId:10,floor:1}},{}),{status:409});
  await assert.rejects(()=>h({user:shiftUser,body:{workshop:'qu_making',userId:10,floor:1,shiftLeaderId:30}},{}),{status:403});
});
test('another teams records photos reviews and exports are denied before material loading',async()=>{
  const h=routes(async sql=>{
    if(sql.includes('FROM work_members'))return [[member]];
    if(sql.includes('FROM work_team_assignments'))return [[]];
    if(sql.startsWith('SELECT record_id,user_id'))return [[{record_id:1,user_id:10}]];
    if(sql.startsWith('SELECT p.record_id'))return [[{record_id:1,user_id:10}]];
    if(sql.includes('work_photos')&&!sql.includes('SELECT image'))return [[{id:1,user_id:10}]];
    assert.fail('must not load materials: '+sql);
  });
  for(const [key,request] of [['get /week',{query:{userId:10,week:'2026-09-21'}}],['post /review',{body:{userId:10,week:'2026-09-21'}}],['get /export',{query:{userId:10,week:'2026-09-21'}}],['get /photos/:id',{params:{id:1}}]])await assert.rejects(()=>h.get(key)({user:shiftUser,...request},{}),{status:403});
});
test('overview query is limited to the current shift leader team',async()=>{
  const h=routes(async(sql,params)=>{if(sql.includes('FROM work_members')){assert.match(sql,/team.shift_leader_id=\?/);assert.equal(params.at(-1),20);}return [[]];});
  await h.get('get /overview')({user:shiftUser,query:{workshop:'qu_making',week:'2026-09-21'}},{json(){}});
});

test('shift leaders may review assigned teams but cannot change shared standards',async()=>{
 const h=routes(async()=>assert.fail('must deny before database access')).get('post /rules');
 for(const body of [{workshop:'qu_making',rules:[]},{workshop:'qu_making',shiftLeaderId:20,rules:[]}])await assert.rejects(()=>h({user:shiftUser,body},{}),{status:403});
});
test('every group leader uses workshop shared standards without choosing a班长',async()=>{
 const rules=W.rules([{dutyId:'production_progress',kind:'manual',max:25,standard:'统一要求'}],{requireDuty:true});let result;
 const h=routes(async(sql,params)=>{if(sql.includes('FROM work_members'))return [[member]];if(sql.includes('FROM work_rules')){assert.equal(params[0],'qu_making');return [[{id:3,rules_json:rules}]];}assert.doesNotMatch(sql,/FROM work_team_rules|SELECT shift_leader_id/);return [[]];}).get('get /week');
 await h({user:{id:10,role:'viewer',staffWorkshopCode:'qu_making',staffPosition:'group_leader'},query:{week:'2026-09-28'}},{json:r=>result=r.data});assert.deepEqual(result.config.map(r=>r.max),[25]);
});
test('current week waits for shared standards instead of silently adopting a team standard',async()=>{
 let result;const h=routes(async sql=>{if(sql.includes('FROM work_members'))return [[member]];assert.doesNotMatch(sql,/FROM work_team_rules/);return [[]];},{now:'2026-09-30T03:00:00Z'}).get('get /week');
 await h({user:{id:10,role:'viewer',staffWorkshopCode:'qu_making',staffPosition:'group_leader'},query:{week:'2026-09-28'}},{json:r=>result=r.data});assert.equal(result.config.length,0);
});
test('fixed document submission requires a screenshot and stores the configured reference',async()=>{
 let saved,hasPhoto=false;
 const h=routes(async(sql,params)=>{
  if(sql.includes('work_members'))return [[member]];
  if(sql.startsWith('SELECT * FROM work_reports'))return [[{id:1,status:'draft',revision:0}]];
  if(sql.startsWith('SELECT COUNT(*) AS count FROM work_records'))return [[{count:0}]];
  if(sql.startsWith('SELECT task_key FROM work_photos'))return [hasPhoto?[{task_key:'standard_operation'}]:[]];
  if(sql.startsWith('SELECT'))return [[]];
  if(sql.startsWith('INSERT INTO work_records')){saved=params.map(x=>typeof x==='string'&&x.startsWith('{')?JSON.parse(x):null).find(x=>x?.checks);return [{insertId:77}]}
  return [{}];
 }).get('post /records');
 const body={kind:'duties',mode:'daily',date:'2026-09-21',floor:1,status:'submitted',checks:[{dutyId:'standard_operation'}]};
 await assert.rejects(()=>h({user:{id:10,role:'viewer'},body},{json(){}}),/工作截图/);
 hasPhoto=true;
 await h({user:{id:10,role:'viewer'},body},{json(){}});
 assert.equal(saved.checks[0].reference,'https://www.kdocs.cn/l/cuvwtXifQI5l');
 await h({user:{id:10,role:'viewer'},body:{...body,checks:[{dutyId:'standard_operation',reference:'https://example.com/work-record'}]}},{json(){}});
 assert.equal(saved.checks[0].status,'已提交材料');
 assert.equal(saved.checks[0].reference,'https://www.kdocs.cn/l/cuvwtXifQI5l');
});

test('rules save ignores requested scheduling and keeps identical standard without new version',async()=>{
 const item={custom:true,customId:'custom_1',title:'新事项',kind:'manual',max:25,standard:'依据材料复核',bonusPerClosure:0};const normalized=W.rules([item],{requireDuty:true});let inserts=0,response;const h=routes(async(sql,params)=>{if(sql.startsWith('SELECT id FROM app_users'))return [[{id:20}]];if(sql.includes('FROM work_rules')){assert.match(sql,/ORDER BY id DESC/);return [[{id:55,effective_week:'2026-09-21',rules_json:JSON.stringify(normalized)}]]}if(sql.startsWith('INSERT INTO work_rules')){inserts++;return [{insertId:56}]}throw Error(sql)},{now:'2026-09-30T03:00:00Z'}).get('post /rules');await h({user:{id:1,role:'admin'},body:{workshop:'qu_making',shiftLeaderId:20,effectiveWeek:'2027-01-01',rules:[item]}},{json:v=>response=v.data});assert.equal(inserts,0);assert.equal(response.unchanged,true);assert.equal(response.id,55)
})
test('changed custom standard takes effect this week even with a future client date',async()=>{
 let inserted,response;const h=routes(async(sql,params)=>{if(sql.startsWith('SELECT id FROM app_users'))return [[{id:20}]];if(sql.includes('FROM work_rules'))return [[]];if(sql.startsWith('INSERT INTO work_rules')){inserted=params;return [{insertId:56}]}throw Error(sql)},{now:'2026-09-27T16:01:00Z'}).get('post /rules');await h({user:{id:1,role:'admin'},body:{workshop:'qu_making',shiftLeaderId:20,effectiveWeek:'2027-01-01',rules:[{custom:true,customId:'custom_1',title:'新事项',kind:'manual',max:25,standard:'材料齐全满分'}]}},{json:v=>response=v.data});assert.equal(inserted[1],'2026-09-28');assert.equal(response.effectiveWeek,'2026-09-28');assert.equal(JSON.parse(inserted[2])[0].custom,true)
})

test('班长 identity reads shared standards directly with no separate reviewer or member setup',async()=>{
 const rules=W.rules([{dutyId:'production_progress',kind:'manual',max:25,standard:'统一标准'}],{requireDuty:true});let data;
 const h=routes(async sql=>{if(sql.startsWith('SELECT * FROM work_rules'))return [[{id:8,rules_json:rules}]];if(sql.startsWith('SELECT id,effective_week'))return [[]];assert.fail('should not query personal membership or reviewer '+sql)}).get('get /rules');
 await h({user:shiftUser,query:{workshop:'qu_making'}},{json:r=>data=r.data});assert.equal(data.scope,'workshop');assert.equal(data.canEdit,false);assert.equal(data.current.id,8);
});

test('equipment normal needs no extra material while abnormal requires note and actual photo',async()=>{
 let saved;
 const h=routes(async(sql,params)=>{
  if(sql.includes('work_members'))return [[member]];
  if(sql.startsWith('SELECT * FROM work_reports'))return [[{id:1,status:'draft',revision:0}]];
  if(sql.startsWith('SELECT COUNT(*) AS count FROM work_records'))return [[{count:0}]];
  if(sql.startsWith('SELECT'))return [[]];
  if(sql.startsWith('INSERT INTO work_records')){saved=JSON.parse(params.at(-1));return [{insertId:77}]}
  return [{}];
 }).get('post /records');
 const body={kind:'duties',mode:'daily',date:'2026-09-21',floor:1,status:'submitted',checks:[{dutyId:'mes_maintenance',status:'正常'}]};
 await h({user:{id:10,role:'viewer'},body},{json(){}});assert.equal(saved.checks[0].status,'正常');
 await assert.rejects(()=>h({user:{id:10,role:'viewer'},body:{...body,checks:[{dutyId:'mes_maintenance',status:'异常'}]}},{json(){}}),{status:400,message:/说明/});
 await assert.rejects(()=>h({user:{id:10,role:'viewer'},body:{...body,checks:[{dutyId:'mes_maintenance',status:'异常',note:'工单异常',reference:'https://example.com/doc'}]}},{json(){}}),{status:400,message:/上传照片/});
});
test('administrator can review legacy draft before saving one shared standard for all teams',async()=>{
 const rules=W.rules([{dutyId:'production_progress',kind:'manual',max:25,standard:'原标准'}],{requireDuty:true});let data;
 const h=routes(async sql=>{if(sql.startsWith('SELECT * FROM work_rules')||sql.startsWith('SELECT id,effective_week'))return [[]];if(sql.includes('FROM work_team_rules'))return [[{rules_json:rules}]];assert.fail(sql)}).get('get /rules');
 await h({user:{id:1,role:'admin'},query:{workshop:'qu_making'}},{json:r=>data=r.data});assert.equal(data.current,null);assert.equal(data.draft.rules[0].standard,'原标准');assert.equal(data.canEdit,true)
});
