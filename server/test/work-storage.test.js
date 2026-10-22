const test=require('node:test'),assert=require('node:assert/strict');
const S=require('../src/work-storage');
// Inspect only the outer projection, ignoring commas/FROM/AS inside subqueries
// and strings. The HTTP fixture does not ask MySQL to name derived columns.
function projectionColumns(branch){
  const sql=branch.trim().replace(/^SELECT\s+/i,'');
  const columns=[];let start=0,depth=0,quote='';
  for(let i=0;i<sql.length;i++){
    const c=sql[i];
    if(quote){if(c===quote){if(sql[i+1]===quote)i++;else quote=''}continue;}
    if(c==="'"||c==='"'||c==='`'){quote=c;continue;}
    if(c==='(')depth++;
    else if(c===')')depth--;
    else if(!depth&&c===','){columns.push(sql.slice(start,i).trim());start=i+1;}
    else if(!depth&&/^\sFROM\s/i.test(sql.slice(i))){columns.push(sql.slice(start,i).trim());return columns;}
  }
  throw new Error('Missing top-level FROM');
}
test('attendance storage projection exposes the same unique derived column names',()=>{
  const expected=['kind','id','title','workshopCode','updatedAt','retentionUntil','bytes','fileCount','referenceCount','revision','processingCount','historyCount'];
  const branches=S.STORAGE_SELECT.split(/\bUNION ALL\b/i);assert.equal(branches.length,2);
  for(const branch of branches){
    const columns=projectionColumns(branch);
    const names=columns.map(column=>{const match=column.match(/\sAS\s+([a-zA-Z]\w*)$/i);assert.ok(match,'Unaliased storage column: '+column);return match[1];});
    assert.equal(new Set(names.map(n=>n.toLowerCase())).size,expected.length);
    assert.deepEqual(names,expected);
  }
});
function setup({kind='attendance',referenceCount=0,revision=2,retentionUntil=null,updatedAt='2025-01-01 10:00:00',processing=false}={}){
  const calls=[],parent={id:5,revision,updatedAt,retentionUntil},item={kind,id:1,title:'过期资料',bytes:1234,fileCount:2,referenceCount};
  const db={query:async(sql,args)=>{calls.push([sql,args]);if(sql.includes('SELECT * FROM ('))return [[item]];if(sql.includes("status='processing'"))return [processing?[{id:1}]:[]];if(sql.startsWith('SELECT'))return [[parent]];return [{affectedRows:1}]}};
  return {db,calls,request:{kind,id:1,cutoff:'2025-02-01',revision}};
}
test('storage and attendance enforce server roles before touching data',()=>{
  const attendance=require('../src/routes/attendance').requireAttendanceAccess;
  for(const role of ['viewer','qu_making','brewing',undefined]){let error;attendance({user:{role}},null,e=>error=e);assert.equal(error.status,403)}
  for(const role of ['raw_grain','admin']){let error;attendance({user:{role}},null,e=>error=e);assert.equal(error,undefined)}
  for(const staffPosition of ['shift_leader']){const user={role:'viewer',staffWorkshopCode:'raw_grain',staffPosition};let error;attendance({user,method:'GET'},null,e=>error=e);assert.equal(error,undefined);attendance({user,method:'POST'},null,e=>error=e);assert.equal(error.status,403)}
  for(const role of ['viewer','raw_grain','qu_making','brewing']){let error;S.requireStorageAdmin({user:{role}},null,e=>error=e);assert.equal(error.status,403)}
});
test('attendance cleanup removes sources/notes/results in transaction callback and keeps deletion audit',async()=>{
  const {db,calls,request}=setup();const r=await S.deleteStorageItem(db,{id:9,role:'admin'},request);assert.equal(r.releasedBytes,1234);assert.deepEqual(calls.filter(([s])=>s.startsWith('DELETE')).map(([s])=>s),['DELETE FROM attendance_notes WHERE report_id=?','DELETE FROM attendance_sources WHERE report_id=?','DELETE FROM attendance_reports WHERE id=?']);assert.match(calls.at(-1)[0],/INSERT INTO work_storage_audit/);
});
test('retired inspection sources cannot be listed or deleted',async()=>{
 assert.equal(S.TYPES.includes('inspection'),false);assert.doesNotMatch(S.STORAGE_SELECT,/inspection_notices|inspection_sources/);
 const {db,calls,request}=setup({kind:'inspection'});await assert.rejects(S.deleteStorageItem(db,{id:9,role:'admin'},request),{status:400});assert.equal(calls.length,0);
});
test('wrong role, stale revision, retention and referenced task attachments cannot delete anything',async()=>{
  for(const opts of [{revision:3},{retentionUntil:'2099-12-31'},{updatedAt:'2099-01-01 00:00:00'}]){
    const {db,calls,request}=setup(opts);await assert.rejects(S.deleteStorageItem(db,{id:9,role:'admin'},{...request,revision:2}),{status:409});assert.ok(calls.every(([s])=>!s.startsWith('DELETE')));
  }
  const {db,calls,request}=setup();await assert.rejects(S.deleteStorageItem(db,{id:9,role:'raw_grain'},request),{status:403});assert.equal(calls.length,0);
});
test('retired qu-making attachment kinds reject deletion before database access',async()=>{
  for(const kind of ['work_photo','task_file']){const {db,calls,request}=setup({kind});await assert.rejects(S.deleteStorageItem(db,{id:9,role:'admin'},request),{status:400});assert.equal(calls.length,0)}
  assert.doesNotMatch(S.STORAGE_SELECT,/work_members|work_records|work_photos|work_task/);
});

test('manual admin deletion overrides retention and cutoff, preserves revision checks, and audits the override',async()=>{
  const {db,calls,request}=setup({retentionUntil:'2099-12-31',updatedAt:'2099-01-01 00:00:00'});
  await S.deleteStorageItem(db,{id:9,role:'admin'},{...request,cutoff:undefined,manual:true});
  assert.equal(calls.filter(([s])=>s.startsWith('DELETE')).length,3);
  const detail=JSON.parse(calls.at(-1)[1][5]);assert.equal(detail.manual,true);assert.equal(detail.cutoff,null);assert.equal(detail.retentionUntil,'2099-12-31');
  for(const opts of [{revision:3}]){
    const protectedItem=setup(opts);
    await assert.rejects(S.deleteStorageItem(protectedItem.db,{id:9,role:'admin'},{...protectedItem.request,revision:2,manual:true}),{status:409});
    assert.ok(protectedItem.calls.every(([s])=>!s.startsWith('DELETE')));
  }
});
test('manual deletion cannot be enabled by a truthy string or a non-admin role',async()=>{
  for(const manual of ['true',1,{},[]]){const {db,calls,request}=setup();await assert.rejects(S.deleteStorageItem(db,{id:9,role:'admin'},{...request,manual}),{status:400});assert.equal(calls.length,0)}
  const {db,calls,request}=setup();await assert.rejects(S.deleteStorageItem(db,{id:9,role:'raw_grain'},{...request,manual:true}),{status:403});assert.equal(calls.length,0);
});
test('manual eligibility is independent of retention/date but never overrides references or processing',()=>{
  const row={bytes:1,fileCount:1,referenceCount:0,processingCount:0,updatedAt:'2099-01-01',retentionUntil:'2099-12-31'};
  assert.equal(S.decorate(row,'2025-01-01').eligible,false);assert.equal(S.decorate(row,'2025-01-01').canDelete,true);
  for(const protectedRow of [{...row,referenceCount:1},{...row,processingCount:1}])assert.equal(S.decorate(protectedRow,'2025-01-01').canDelete,false);
});
