const test=require('node:test'),assert=require('node:assert/strict');
const {createFixture}=require('./fixtures/work-storage-preview.cjs');

async function setup(t){
  const fixture=createFixture();
  const server=await new Promise(resolve=>{const listener=fixture.app.listen(0,'127.0.0.1',()=>resolve(listener));});
  t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
  const base=`http://127.0.0.1:${server.address().port}/api/work-storage`;
  const request=async(suffix='',method='GET',body,role='admin')=>{
    const response=await fetch(base+suffix,{method,headers:{Authorization:`Bearer storage-preview-${role}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
    return {status:response.status,...await response.json()};
  };
  const preview=(feature,kind='')=>request(`/cleanup-preview?function=${feature}&kind=${kind}&cutoff=2026-01-01`);
  const cleanup=(feature,items,kind='')=>request('/cleanup','POST',{function:feature,kind,cutoff:'2026-01-01',items});
  return {fixture,request,preview,cleanup};
}


function addReport(f,id,extra={}){const s=f.inspect();s.rawReports.push({id,revision:1,updatedAt:'2025-01-02',status:'draft',week_start:'2024-12-30',checks_json:[],cadence_json:null,identity_json:{name:'履职测试'},...extra});s.rawPhotos.push({id,report_id:id,filename:id+'.jpg',byte_size:1000})}
test('retired attendance scopes, deletion and retention endpoint cannot access data',async t=>{const{fixture,request}=await setup(t),before=fixture.inspect().calls;
 for(const url of ['?function=attendance&cutoff=2026-01-01','?kind=attendance&cutoff=2026-01-01'])assert.equal((await request(url)).status,400);
 assert.equal((await request('/attendance/1','DELETE',{manual:true,revision:1})).status,400);assert.equal((await request('/attendance/1/retention','PATCH',{})).status,404);assert.equal(fixture.inspect().calls,before);
});
test('manual admin deletion overrides cutoff but never stale revision or role',async t=>{const{fixture,request,preview}=await setup(t);addReport(fixture,1,{updatedAt:'2099-01-01'});assert.equal((await preview('raw_duties')).data.itemCount,0);
 assert.equal((await request('/raw_duty_photo/1','DELETE',{manual:true,revision:1},'raw_grain')).status,403);assert.equal((await request('/raw_duty_photo/1','DELETE',{manual:true,revision:0})).status,409);
 assert.equal((await request('/raw_duty_photo/1','DELETE',{manual:true,revision:1})).status,200);assert.equal(fixture.inspect().rawPhotos.length,0);assert.equal(fixture.inspect().audit.length,0);
});
test('preview includes all pages and refuses more than 1000 items',async t=>{const{fixture,request,preview}=await setup(t);for(let i=1;i<=35;i++)addReport(fixture,i);
 assert.equal((await request('?function=raw_duties&cutoff=2026-01-01')).data.items.length,30);assert.equal((await preview('raw_duties')).data.itemCount,35);for(let i=36;i<=1001;i++)addReport(fixture,i);const r=await preview('raw_duties');assert.equal(r.status,400);assert.match(r.msg,/1000/);assert.equal(fixture.inspect().audit.length,0);
});
test('invalid manifests cannot write and late parent changes roll back the batch',async t=>{const{fixture,preview,cleanup}=await setup(t);addReport(fixture,1);addReport(fixture,2);const items=(await preview('raw_duties')).data.items.map(({kind,id,revision})=>({kind,id,revision}));
 for(const invalid of [[],[items[0],items[0]],[{...items[0],id:'1'}],[{...items[0],revision:-1}],[{...items[0],kind:'attendance'}]])assert.equal((await cleanup('raw_duties',invalid)).status,400);
 fixture.inspect().rawReports[1].revision=2;assert.equal((await cleanup('raw_duties',items)).status,409);assert.equal(fixture.inspect().rawPhotos.length,2);assert.equal(fixture.inspect().audit.length,0);
 fixture.inspect().rawReports[1].revision=1;fixture.inspect().rawReports[1].updatedAt='2099-01-01';assert.equal((await cleanup('raw_duties',items)).status,409);assert.equal(fixture.inspect().rawPhotos.length,2);
});
test('successful cleanup releases exact photo bytes and preserves parent text',async t=>{const{fixture,preview,cleanup}=await setup(t);addReport(fixture,1);addReport(fixture,2);const p=(await preview('raw_duties')).data,r=await cleanup('raw_duties',p.items.map(({kind,id,revision})=>({kind,id,revision})));assert.equal(r.status,200);assert.equal(r.data.releasedBytes,p.totalBytes);assert.equal(fixture.inspect().rawPhotos.length,0);assert.equal(fixture.inspect().rawReports.length,2);assert.equal(fixture.inspect().audit.length,0)});
