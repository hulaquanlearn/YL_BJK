const test=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {once}=require('node:events');
const {pool}=require('../src/db');

test('password guessing is bounded per authenticated account across IPs and session tokens',async()=>{
  const original=pool.query; let passwordQueries=0;
  pool.query=async(sql,params)=>{
    if(sql.includes('FROM app_sessions'))return [[{id:params[0]===require('crypto').createHash('sha256').update('c'.repeat(43)).digest('hex')?8:7,username:'fixture',display_name:'fixture',role:'viewer',enabled:1,session_id:1}]];
    if(sql.includes('SELECT password_hash')){passwordQueries++;return [[]]}
    throw new Error('unexpected mutation');
  };
  const app=express(); app.set('trust proxy','loopback'); app.use(express.json());
  app.use('/auth',require('../src/routes/auth'));
  app.use((e,_req,res,_next)=>res.status(e.status||500).json({msg:e.message}));
  const server=app.listen(0,'127.0.0.1'); await once(server,'listening');
  const base=`http://127.0.0.1:${server.address().port}/auth/change-password`;
  const headers=(token,ip)=>({'content-type':'application/json',authorization:`Bearer ${token.repeat(43)}`,'x-forwarded-for':ip});
  try {
    for(let i=0;i<8;i++)assert.equal((await fetch(base,{method:'POST',headers:headers(i%2?'a':'b',`192.0.2.${i+1}`),body:JSON.stringify({oldPassword:'wrong',newPassword:'Ab1'})})).status,400);
    const blocked=await fetch(base,{method:'POST',headers:headers('b','198.51.100.1'),body:JSON.stringify({oldPassword:'wrong',newPassword:'Ab1'})});
    assert.equal(blocked.status,429); assert.ok(Number(blocked.headers.get('retry-after'))>0); assert.equal(passwordQueries,8);
    assert.equal((await fetch(base,{method:'POST',headers:headers('c','198.51.100.1'),body:JSON.stringify({oldPassword:'wrong',newPassword:'Ab1'})})).status,400);
    assert.equal(passwordQueries,9);
  }finally{pool.query=original;await new Promise(resolve=>server.close(resolve))}
});
