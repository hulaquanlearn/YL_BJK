const test=require('node:test'),assert=require('node:assert/strict');
const {syncTaskRecord}=require('../src/work-task-record');
const W=require('../src/work-assessment');
function fixture(){
  let row=null,published=false;const events=[],refs=[];
  const db={query:async(sql,p)=>{
    if(sql.includes('FROM work_document_bindings'))return [[]];
    if(sql.startsWith('SELECT * FROM work_records'))return [row?[row]:[]];
    if(sql.includes('FROM work_catalog_versions'))return [[]];
    if(sql.startsWith('INSERT INTO work_records')){row={id:81,user_id:p[0],week_start:p[1],record_date:p[2],kind:p[3],status:p[4],payload:JSON.parse(p[5])};return [{insertId:81}];}
    if(sql.startsWith("UPDATE work_records SET status='submitted'")){row.status='submitted';row.payload=JSON.parse(p[0]);return [{}];}
    if(sql.startsWith("UPDATE work_records SET status='draft'")){row.status='draft';return [{}];}
    if(sql.startsWith('INSERT IGNORE INTO work_task_file_references')){refs.push(p);return [{}];}
    assert.fail(sql);
  }};
  const options={day:'2026-09-29',submitted:true,result:'正常',note:'已检查',reference:'https://example.com/doc',files:[{id:6}],member:async()=>({floor:1,workshop_code:'qu_making'}),lockReport:async()=>({id:9,status:published?'published':'draft'}),audit:async(...args)=>events.push(args)};
  return {db,options,events,refs,get row(){return row},publish(){published=true}};
}
test('task auto record preserves evidence, returns to missing and resubmits without duplicates',async()=>{
  const f=fixture(),a={id:7,user_id:10,title:'检查压取机'},u={id:10};
  await syncTaskRecord(f.db,a,u,f.options);
  assert.equal(f.row.payload.sourceTaskId,7);assert.equal(f.row.payload.checks[0].taskEvidence[0].files[0].id,6);
  assert.equal(f.row.status,'submitted');assert.deepEqual(f.refs[0],[6,81]);
  await syncTaskRecord(f.db,a,u,{...f.options,submitted:false});assert.equal(f.row.status,'draft');
  await syncTaskRecord(f.db,a,u,{...f.options,day:'2026-10-05'});
  assert.equal(f.row.id,81);assert.equal(f.row.record_date,'2026-09-29');assert.equal(f.row.status,'submitted');
  f.publish();await assert.rejects(()=>syncTaskRecord(f.db,a,u,{...f.options,submitted:false}),{status:409});
});
test('same-day manual and multiple task records count once in formula scoring',async()=>{
  const f=fixture();await syncTaskRecord(f.db,{id:7,user_id:10,title:'检查'}, {id:10}, f.options);
  const rules=[{id:'1',title:'指令',dutyId:'directive_tasks',kind:'duties',max:100,target:5,deduction:20,standard:'按天'}];
  const result=W.evaluate(rules,[f.row,{...f.row,id:82},{...f.row,id:83}],{});
  assert.equal(result.total,20);
});
