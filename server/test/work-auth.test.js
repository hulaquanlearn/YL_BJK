const test=require('node:test'),assert=require('node:assert/strict');
test('all work data and writes require an authenticated session at the real app boundary',async()=>{
  const app=require('../src/app');const server=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  try{
    for(const [method,url] of [['GET','/context'],['GET','/week?week=2026-09-21'],['GET','/photos/1'],['GET','/export?userId=1&week=2026-09-21'],['POST','/rules'],['POST','/records'],['POST','/review']]){
      const response=await fetch(`http://127.0.0.1:${server.address().port}/api/work${url}`,{method});
      assert.equal(response.status,401,method+' '+url);assert.match(response.headers.get('cache-control'),/no-store/);
    }
  }finally{await new Promise(resolve=>server.close(resolve));await require('../src/db').pool.end()}
});
