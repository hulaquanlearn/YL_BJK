const test=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {pool}=require('../src/db'),{hashPassword}=require('../src/password');
test('login preserves case and rejects differently cased account names before creating a session',async t=>{
 const original=pool.query,passwordHash=await hashPassword('Test123');let sessions=0;const seen=[];
 pool.query=async(sql,args=[])=>{
  if(sql.includes('FROM app_users WHERE username')){
   seen.push(args[0]);assert.match(sql,/CAST\(username AS BINARY\)\s*=\s*CAST\(\? AS BINARY\)/);
   assert.deepEqual(args,[args[0],args[0]]);
   return [args[0]==='Zhang_01'?[{id:1,username:'Zhang_01',password_hash:passwordHash,display_name:'测试账号',role:'viewer',enabled:1}]:[]];
  }
  if(sql.startsWith('INSERT INTO app_sessions'))sessions++;
  return [{affectedRows:1}];
 };
 const app=express();app.use(express.json());app.use('/auth',require('../src/routes/auth'));
 app.use((e,_req,res,_next)=>res.status(e.status||500).json({msg:e.message}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 t.after(async()=>{pool.query=original;await new Promise(r=>server.close(r))});
 const login=username=>fetch(`http://127.0.0.1:${server.address().port}/auth/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username,password:'Test123'})});
 assert.equal((await login('zhang_01')).status,401);assert.equal((await login('ZHANG_01')).status,401);assert.equal(sessions,0);
 const ok=await login(' Zhang_01 ');assert.equal(ok.status,200);assert.equal((await ok.json()).data.user.username,'Zhang_01');assert.equal(sessions,1);
 assert.deepEqual(seen,['zhang_01','ZHANG_01','Zhang_01']);
});
