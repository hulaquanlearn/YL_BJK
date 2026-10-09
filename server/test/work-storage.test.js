const test=require('node:test'),assert=require('node:assert/strict');
const S=require('../src/work-storage');
function setup({kind='attendance',referenceCount=0,revision=2,retentionUntil=null,updatedAt='2025-01-01 10:00:00',processing=false}={}){
  const calls=[],parent={id:5,revision,updatedAt,retentionUntil},item={kind,id:1,title:'过期资料',bytes:1234,fileCount:2,referenceCount};
  const db={query:async(sql,args)=>{calls.push([sql,args]);if(sql.includes('SELECT * FROM ('))return [[item]];if(sql.includes("status='processing'"))return [processing?[{id:1}]:[]];if(sql.startsWith('SELECT'))return [[parent]];return [{affectedRows:1}]}};
  return {db,calls,request:{kind,id:1,cutoff:'2025-02-01',revision}};
}
test('storage and attendance enforce server roles before touching data',()=>{
  const attendance=require('../src/routes/attendance').requireAttendanceAccess;
  for(const role of ['viewer','qu_making','brewing',undefined]){let error;attendance({user:{role}},null,e=>error=e);assert.equal(error.status,403)}
  for(const role of ['raw_grain','admin']){let error;attendance({user:{role}},null,e=>error=e);assert.equal(error,undefined)}
  for(const role of ['viewer','raw_grain','qu_making','brewing']){let error;S.requireStorageAdmin({user:{role}},null,e=>error=e);assert.equal(error.status,403)}
});
test('attendance cleanup removes sources/notes/results in transaction callback and keeps deletion audit',async()=>{
  const {db,calls,request}=setup();const r=await S.deleteStorageItem(db,{id:9,role:'admin'},request);assert.equal(r.releasedBytes,1234);assert.deepEqual(calls.filter(([s])=>s.startsWith('DELETE')).map(([s])=>s),['DELETE FROM attendance_notes WHERE report_id=?','DELETE FROM attendance_sources WHERE report_id=?','DELETE FROM attendance_reports WHERE id=?']);assert.match(calls.at(-1)[0],/INSERT INTO work_storage_audit/);
});
test('inspection cleanup also removes retained snapshots, but cannot delete processing notices',async()=>{
  const {db,calls,request}=setup({kind:'inspection'});await S.deleteStorageItem(db,{id:9,role:'admin'},request);assert.ok(calls.some(([s])=>s.startsWith('DELETE FROM inspection_events')));
  const pending=setup({kind:'inspection',processing:true});await assert.rejects(S.deleteStorageItem(pending.db,{id:9,role:'admin'},pending.request),{status:409});assert.ok(pending.calls.every(([s])=>!s.startsWith('DELETE')));
});
test('wrong role, stale revision, retention and referenced task attachments cannot delete anything',async()=>{
  for(const opts of [{revision:3},{retentionUntil:'2099-12-31'},{updatedAt:'2099-01-01 00:00:00'},{kind:'task_file',referenceCount:1}]){
    const {db,calls,request}=setup(opts);await assert.rejects(S.deleteStorageItem(db,{id:9,role:'admin'},{...request,revision:2}),{status:409});assert.ok(calls.every(([s])=>!s.startsWith('DELETE')));
  }
  const {db,calls,request}=setup();await assert.rejects(S.deleteStorageItem(db,{id:9,role:'raw_grain'},request),{status:403});assert.equal(calls.length,0);
});
test('制曲 cleanup only removes binary attachment and preserves work/report text',async()=>{
  for(const kind of ['work_photo','task_file']){const {db,calls,request}=setup({kind});await S.deleteStorageItem(db,{id:9,role:'admin'},request);assert.equal(calls.filter(([s])=>s.startsWith('DELETE')).length,1);assert.ok(calls.every(([s])=>!/^DELETE FROM work_(records|reports|tasks)\b/.test(s)));assert.ok(calls.some(([s])=>s.startsWith('UPDATE work_')));}
});
