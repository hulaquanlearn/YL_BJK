const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { canRead, canManage, createStore } = require('../src/control-passwords');
const { createRouter } = require('../src/routes/control-passwords');
// Keep isolated encrypted fixtures for review/recovery; no additional listening port.
const root = path.resolve(__dirname, '../.local/control-password-tests', crypto.randomUUID());
fs.mkdirSync(root, { recursive: true });
const user = { role:'admin', displayName:'合成测试管理员' };
const body = revision => ({ revision, name:'1号电脑', username:'operator', note:'合成测试记录', password:' Synthetic secret ! ' });
function dispatch(router, { method='GET', url='/', user: account, body: payload }={}) {
  return new Promise(resolve => {
    const req={method,url,headers:{},user:account,body:payload};
    const res={set(){return this},json(data){resolve({status:200,data})}};
    router.handle(req,res,error=>resolve({status:error?.status||404,message:error?.message}));
  });
}
test('only system, qu-making managers and assigned qu-making staff can read',()=>{
  for(const role of ['admin','qu_making']){assert.equal(canRead({role}),true);assert.equal(canManage({role}),true)}
  for(const staffPosition of ['employee','shift_leader','group_leader','maintenance','manufacturer_maintenance',null]) {
    const worker={role:'viewer',staffWorkshopCode:'qu_making',staffPosition};assert.equal(canRead(worker),true);assert.equal(canManage(worker),false);
  }
  for(const account of [null,{role:'viewer'},{role:'raw_grain'},{role:'brewing'},{role:'viewer',staffWorkshopCode:'raw_grain'},{role:'viewer',workshopCode:'qu_making'},{role:'brewing',staffWorkshopCode:'qu_making'}]) assert.equal(canRead(account),false);
});
test('all nine records are seeded without inventing passwords',()=>{
  const store=createStore(path.join(root,'initial')),state=store.list();
  assert.deepEqual(state.rows.map(row=>row.id),[1,2,3,4,5,6,7,8,9]);
  assert.ok(state.rows.every(row=>!row.configured&&!Object.hasOwn(row,'password')));
  assert.equal(store.secret(9).password,'');assert.equal(fs.existsSync(path.join(root,'initial')),false);
});
test('encrypted atomic storage survives reload and never lists secrets',()=>{
  const dir=path.join(root,'roundtrip'),store=createStore(dir),result=store.update(1,body('initial'),user);
  assert.equal(result.row.configured,true);assert.equal(Object.hasOwn(result.row,'password'),false);
  assert.equal(createStore(dir).secret(1).password,body('').password);
  const disk=fs.readFileSync(path.join(dir,'vault.json'),'utf8');assert.ok(!disk.includes('Synthetic'));assert.ok(!disk.includes('operator'));
  assert.equal(fs.readFileSync(path.join(dir,'key')).length,32);
  assert.equal(JSON.stringify(store.list()).includes('Synthetic'),false);
});
test('editing metadata preserves secret, explicit empty clears it, revisions prevent lost updates',()=>{
  const dir=path.join(root,'editing'),store=createStore(dir),first=store.update(1,body('initial'),user);
  assert.throws(()=>store.update(1,body('initial'),user),error=>error.status===409);
  const {password,...patch}=body(first.revision),second=store.update(1,{...patch,note:'第二次合成修改'},user);
  assert.equal(store.secret(1).password,password);
  store.update(1,{...body(second.revision),password:''},user);assert.equal(store.secret(1).password,'');
  assert.equal(fs.readdirSync(path.join(dir,'history')).length,2);
  for(const file of fs.readdirSync(path.join(dir,'history')))assert.ok(!fs.readFileSync(path.join(dir,'history',file),'utf8').includes(password));
});
test('invalid IDs and malformed input leave the vault unchanged',()=>{
  const dir=path.join(root,'validation'),store=createStore(dir);
  for(const id of ['0','10','1.0','../1'])assert.throws(()=>store.secret(id),error=>error.status===404);
  for(const patch of [{name:''},{name:'a'.repeat(81)},{username:[]},{password:123},{password:'a\nb'},{note:'a'.repeat(501)}])assert.throws(()=>store.update(1,{...body('initial'),...patch},user),error=>error.status===400);
  assert.equal(store.list().revision,'initial');assert.equal(fs.existsSync(path.join(dir,'vault.json')),false);
});
test('tampered or missing keys fail closed with a safe error',()=>{
  const dir=path.join(root,'corrupt'),store=createStore(dir);store.update(1,body('initial'),user);
  fs.writeFileSync(path.join(dir,'key'),crypto.randomBytes(32));assert.throws(()=>store.secret(1),error=>error.status===503&&!error.message.includes('Synthetic'));
});
test('router denies direct list, secret and write attempts before touching storage',async()=>{
  let touched=0;const router=createRouter({list(){touched++;return{}},secret(){touched++;return{}},update(){touched++;return{}}});
  for(const account of [undefined,{role:'brewing'},{role:'viewer',staffWorkshopCode:'raw_grain'},{role:'viewer'}])for(const [method,url]of[['GET','/'],['GET','/1/secret'],['PUT','/1']])assert.equal((await dispatch(router,{method,url,user:account,body:{}})).status,account?403:401);
  assert.equal(touched,0);
  const worker={role:'viewer',staffWorkshopCode:'qu_making'};
  assert.equal((await dispatch(router,{user:worker})).status,200);
  assert.equal((await dispatch(router,{url:'/1/secret',user:worker})).status,200);
  assert.equal((await dispatch(router,{method:'PUT',url:'/1',user:worker})).status,403);
  assert.equal(touched,2);
  for(const role of ['admin','qu_making'])assert.equal((await dispatch(router,{method:'PUT',url:'/1',user:{role},body:{}})).status,200);
});
