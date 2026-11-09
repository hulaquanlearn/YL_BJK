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
test('raw photo storage projection exposes unique derived column names',()=>{
  const expected=['kind','id','title','workshopCode','updatedAt','retentionUntil','bytes','fileCount','referenceCount','revision','processingCount','historyCount'];
  const branches=S.STORAGE_SELECT.split(/\bUNION ALL\b/i);assert.equal(branches.length,1);assert.doesNotMatch(S.STORAGE_SELECT,/attendance_/);
  for(const branch of branches){
    const columns=projectionColumns(branch);
    const names=columns.map(column=>{const match=column.match(/\sAS\s+([a-zA-Z]\w*)$/i);assert.ok(match,'Unaliased storage column: '+column);return match[1];});
    assert.equal(new Set(names.map(n=>n.toLowerCase())).size,expected.length);
    assert.deepEqual(names,expected);
  }
});

test('retired types and non-admin users fail before accessing data',async()=>{
 const db={query:async()=>{throw Error('Unexpected data access')}};
 for(const kind of ['attendance','inspection','work_photo','task_file'])await assert.rejects(S.deleteStorageItem(db,{role:'admin'},{kind,id:1,manual:true,revision:1}),{status:400});
 for(const role of ['raw_grain','qu_making','brewing','viewer',undefined]){let error;S.requireStorageAdmin({user:{role}},null,e=>error=e);assert.equal(error.status,403);await assert.rejects(S.deleteStorageItem(db,{role},{kind:'raw_duty_photo',id:1}),{status:403})}
});
test('cleanup cutoff validates actual dates and excludes today and future dates',()=>{
 assert.equal(S.cutoffDate('2024-02-29'),'2024-02-29');for(const v of ['2025-02-29','2025-13-01','invalid',S.today(),'2099-01-01'])assert.throws(()=>S.cutoffDate(v),{status:400});
});
test('historical photo eligibility follows cutoff without changing parent data',()=>{
 const row={kind:'raw_duty_photo',bytes:'100',fileCount:1,referenceCount:1,historyCount:1,updatedAt:'2025-01-01'};
 assert.equal(S.decorate(row,'2026-01-01').eligible,true);assert.equal(S.decorate({...row,updatedAt:'2099-01-01'},'2026-01-01').eligible,false);assert.equal(S.decorate({...row,processingCount:1},'2026-01-01').canDelete,false);assert.equal(row.bytes,'100');
});
