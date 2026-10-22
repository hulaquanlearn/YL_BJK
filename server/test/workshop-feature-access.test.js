const test=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {once}=require('node:events');
const {pool}=require('../src/db');
test('workshop managers edit only their own staff; staff cannot list accounts',async()=>{
  const original=pool.query,calls=[];
  pool.query=async(sql,p=[])=>{calls.push([sql,p]);
    if(sql.includes('SELECT role, staff_workshop_code'))return [[{role:'viewer',staff_workshop_code:'qu_making',staff_position:'group_leader'}]];
    if(sql.startsWith('UPDATE app_users'))return [{affectedRows:1}];
    return [[]];
  };
  const app=express();app.use(express.json());app.use((req,_res,next)=>{req.user={id:20,role:req.get('x-role')||'raw_grain'};next()});
  app.use('/users',require('../src/routes/users'));
  app.use((error,_req,res,_next)=>res.status(error.status||500).json({message:error.message}));
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
  try{
    const before=calls.length;for(const url of ['/users','/users/roles'])assert.equal((await fetch(base+url,{headers:{'x-role':'viewer'}})).status,403);assert.equal(calls.length,before);
    assert.equal((await fetch(base+'/users')).status,200);const last=calls.at(-1);assert.match(last[0],/WHERE role='viewer' AND staff_workshop_code=\?/);assert.deepEqual(last[1],['raw_grain']);
    assert.equal((await fetch(base+'/users/10',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({displayName:'跨车间'})})).status,403);
    const ownHeaders={'x-role':'qu_making','content-type':'application/json'};
    assert.equal((await fetch(base+'/users/10',{method:'PATCH',headers:ownHeaders,body:JSON.stringify({displayName:'本车间组长'})})).status,200);
    assert.match(calls.at(-1)[0],/AND role='viewer' AND staff_workshop_code=\?/);assert.equal(calls.at(-1)[1].at(-1),'qu_making');
    assert.equal((await fetch(base+'/users/10',{method:'PATCH',headers:ownHeaders,body:JSON.stringify({role:'admin'})})).status,403);
    assert.equal((await fetch(base+'/users',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'newstaff',password:'Abcd1234',displayName:'测试',role:'admin'})})).status,403);
  }finally{pool.query=original;await new Promise(resolve=>server.close(resolve))}
});
