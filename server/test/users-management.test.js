const test=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {usersQuery}=require('./fixtures/users-preview.cjs'),{verifyPassword}=require('../src/password');
test('web account management reuses restricted users APIs, keeps credentials private and revokes sessions',async t=>{
 const {pool}=require('../src/db'),oldQuery=pool.query,oldConnection=pool.getConnection;
 const users=[{id:1,username:'admin',name:'管理员',role:'admin',enabled:true},{id:2,username:'worker',name:'员工',role:'viewer',staffWorkshopCode:'raw_grain',staffPosition:'employee',enabled:true},{id:3,username:'other',name:'其他车间',role:'viewer',staffWorkshopCode:'qu_making',staffPosition:'group_leader',enabled:true}];
 const fixture=usersQuery(users);pool.query=fixture.query;pool.getConnection=async()=>({query:fixture.query,async beginTransaction(){},async commit(){},async rollback(){},release(){}});t.after(()=>{pool.query=oldQuery;pool.getConnection=oldConnection});
 const app=express();app.use(express.json());app.use((req,_res,next)=>{req.user={id:1,role:req.get('x-role')||'admin'};next()});app.use('/users',require('../src/routes/users'));app.use((e,_req,res,_next)=>res.status(e.status||500).json({msg:e.message}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>{server.close();server.closeAllConnections()});const base='http://127.0.0.1:'+server.address().port;
 async function request(url,method='GET',body,role='admin'){const r=await fetch(base+'/users'+url,{method,headers:{'x-role':role,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,...await r.json()}}
 assert.equal((await request('','GET',undefined,'viewer')).status,403);
 const initial=await request('');assert.equal(initial.data.length,3);assert.ok(initial.data.every(u=>!('passwordHash'in u)));
 const data={username:'NewUser',displayName:'新人员',role:'viewer',staffWorkshopCode:'raw_grain',staffPosition:'shift_leader',password:'FixturePass123'};
 assert.equal((await request('','POST',{...data,staffPosition:'invalid'})).status,400);assert.equal((await request('','POST',{...data,password:'weak'})).status,400);assert.equal(users.length,3);
 assert.equal((await request('','POST',data)).status,201);const created=users.at(-1);assert.equal(created.role,'viewer');assert.ok(await verifyPassword(data.password,created.passwordHash));
 assert.equal((await request('','POST',data)).status,409);
 assert.equal((await request('/'+created.id,'PATCH',{displayName:'修改姓名',role:'raw_grain'})).status,200);assert.equal(created.displayName,'修改姓名');assert.equal(created.staffPosition,null);
 assert.equal((await request('/1','PATCH',{role:'viewer',staffWorkshopCode:'raw_grain',staffPosition:'employee'})).status,400);assert.equal((await request('/1','PATCH',{enabled:false})).status,400);
 assert.equal((await request('/2','PATCH',{enabled:false})).status,200);assert.equal(users[1].enabled,0);assert.ok(fixture.sessions.includes(2));
 assert.equal((await request('/2/reset-password','POST',{password:'NewFixture123'})).status,200);assert.ok(await verifyPassword('NewFixture123',users[1].passwordHash));assert.ok(!(await verifyPassword('WrongFixture123',users[1].passwordHash)));
 const visible=await request('','GET',undefined,'raw_grain');assert.ok(visible.data.every(u=>u.role==='viewer'&&u.staffWorkshopCode==='raw_grain'));assert.equal((await request('/3','PATCH',{displayName:'不允许'},'raw_grain')).status,403);assert.equal((await request('','POST',{...data,username:'elevated',role:'admin'},'raw_grain')).status,403);
 const final=await request('');assert.doesNotMatch(JSON.stringify(final),/scrypt\$|passwordHash|FixturePass123|NewFixture123/);
});
