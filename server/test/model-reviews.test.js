'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const M = require('../src/model-reviews');
const { createAssetReader } = require('../src/model-review-assets');
const { createRouter } = require('../src/routes/part-model-reviews');
const admin = { id: 9, role: 'admin', displayName: '服务器登录人' };
function fixture() {
 const state = { models: [{ id: 1, name: '测试模型', model_url: '/models/test.glb', image_url: '/models/test.jpg', front_rotation_y: 0, model_scale: 1, workshop_code: null, active: 1 }], parts: [{ id: 11, bound_model_id: 1, code: 'P001', name: '测试部件', spec: '规格A', brand: '厂家A', image_url: '/uploads/part-images/photo.jpg' }], owners: [{ part_id: 11, workshopCode: 'raw_grain' }], reviews: [], queries: [], assets: { '/models/test.glb': 'a'.repeat(64), '/models/test.jpg': 'b'.repeat(64), '/uploads/part-images/photo.jpg': 'c'.repeat(64) } }; let backup;
 const reader = { read: async (url, kind, options) => ({ url: url || '', sha256: state.assets[url] || null, available: !!state.assets[url], reason: state.assets[url] ? '' : '测试文件不存在' }) };
 const db = { getConnection: async () => db, beginTransaction: async () => { backup = structuredClone(state.reviews); }, commit: async () => {}, rollback: async () => { state.reviews = backup; }, release() {}, query: async (sql, args = []) => {
  state.queries.push({ sql, args });
  if (sql.startsWith('SELECT * FROM part_models WHERE id IN')) return [state.models.filter(m => args.includes(m.id) && m.active)];
  if (sql.startsWith('SELECT * FROM part_models WHERE id=')) return [state.models.filter(m => m.id === args[0] && m.active)];
  if (sql.startsWith('SELECT id,bound_model_id')) return [state.parts.filter(p => args.includes(p.bound_model_id))];
  if (sql.startsWith('SELECT part_id,')) return [state.owners.filter(p => args.includes(p.part_id))];
  if (sql.startsWith('SELECT * FROM part_model_reviews WHERE model_id')) return [state.reviews.filter(r => r.model_id === args[0]).sort((a,b) => b.id-a.id)];
  if (sql.startsWith('SELECT id,model_id,request_hash')) return [state.reviews.filter(r => r.actor_id === args[0] && r.request_id === args[1])];
  if (sql.startsWith('SELECT r.* FROM part_model_reviews')) { const rows = args.map(id => state.reviews.filter(r => r.model_id === id).sort((a,b) => b.id-a.id)[0]).filter(Boolean); return [rows]; }
  if (sql.startsWith('INSERT INTO part_model_reviews')) { const keys = ['model_id','status','note','actor_id','actor_name','version_hash','model_file_hash','version_snapshot','reference_type','reference_part_id','reference_snapshot','checks_json','request_id','request_hash'], row = { id: state.reviews.length+1, reviewed_at: '2026-10-27 08:00:00' }; keys.forEach((key,i) => row[key]=args[i]); state.reviews.push(row); return [{ insertId: row.id }]; }
  if (sql.startsWith('CREATE TABLE IF NOT EXISTS part_model_reviews')) return [{}];
  throw Error('Unexpected SQL: '+sql);
 } };
 const options = { assetReader: reader };
 const detail = user => M.detail(db, user || admin, 1, options);
 const body = async overrides => ({ expectedVersionHash: (await detail()).version.hash, status: 'approved', note: '已逐项对照现场实物照片，型号外形及接口位置一致。', referenceType: 'physical_photo', referencePartId: 11, checks: { identity: true, outline: true, interfaces: true }, requestId: 'review_test_123456', ...overrides });
 return { state, db, options, detail, body, submit: async (data,user=admin) => M.submit(db,user,1,data,options) };
}
test('review submission stores server-owned append-only evidence and retries idempotently', async () => {
 const f = fixture(), body = await f.body({ actorId: 999, actorName: '伪造' }), first = await f.submit(body), retry = await f.submit(body);
 assert.equal(first.review.status,'approved'); assert.equal(first.review.valid,true); assert.equal(first.review.actorName,'服务器登录人'); assert.equal(first.review.actorId,9); assert.equal(first.review.referenceSnapshot.part.code,'P001'); assert.equal(retry.review.id,first.review.id); assert.equal(f.state.reviews.length,1);
 assert.ok(f.state.queries.some(q => /part_models.*FOR UPDATE/.test(q.sql))); assert.ok(f.state.queries.some(q => /parts.*FOR SHARE/.test(q.sql)));
 await assert.rejects(() => f.submit({ ...body,note:'同标识内容变更，不应形成另一结论。' }),/其他核对/); assert.equal(f.state.reviews.length,1);
 const second=await f.submit(await f.body({status:'needs_fix',note:'接口位置不符，待重新建模。',requestId:'review_second_123'}));assert.equal(second.history.length,2);assert.equal(second.review.status,'needs_fix');assert.equal(second.history[1].status,'approved');assert.ok(f.state.queries.every(q => !/^(UPDATE|DELETE|REPLACE) /.test(q.sql)));
});
test('approval needs explicit evidence, one bound part and all three human checks', async () => {
 const f=fixture();for(const overrides of [{checks:{identity:true,outline:true}},{note:'通过'},{referencePartId:null},{referencePartId:12},{referenceType:'model_name'}])await assert.rejects(async()=>f.submit(await f.body(overrides)));
 delete f.state.assets['/uploads/part-images/photo.jpg'];await assert.rejects(async()=>f.submit(await f.body()),/实物照片/);
 assert.equal(f.state.reviews.length,0);
});
test('unbound models only accept an explained on-site approval and invalid GLB cannot be approved',async()=>{
 const f=fixture();f.state.parts=[];f.state.owners=[];await assert.rejects(async()=>f.submit(await f.body({referencePartId:null})),/尚无关联/);
 const passed=await f.submit(await f.body({referencePartId:null,referenceType:'onsite'}));assert.equal(passed.review.valid,true);
 delete f.state.assets['/models/test.glb'];await assert.rejects(async()=>f.submit(await f.body({referencePartId:null,referenceType:'onsite',requestId:'missing_model_123'})),/文件不存在/);
});
test('a stale expected version cannot approve after geometry, angle, photo, identity or binding changes',async()=>{
 for(const mutate of [f=>f.state.assets['/models/test.glb']='d'.repeat(64),f=>f.state.models[0].front_rotation_y=1,f=>f.state.assets['/models/test.jpg']='e'.repeat(64),f=>f.state.assets['/uploads/part-images/photo.jpg']='f'.repeat(64),f=>f.state.parts[0].spec='规格B',f=>f.state.parts.push({...f.state.parts[0],id:12,code:'P002'})]){const f=fixture(),body=await f.body();mutate(f);await assert.rejects(()=>f.submit(body),/已变化/);assert.equal(f.state.reviews.length,0);}
});
test('old history survives version changes but valid approvals return stale and are not reusable across entry points',async()=>{
 const f=fixture();await f.submit(await f.body());f.state.models[0].front_rotation_y=2;const out=await f.detail();assert.equal(out.review.valid,false);assert.equal(out.review.stale,true);assert.equal(out.history.length,1);
 const models=await M.decorateModels(f.db,admin,f.state.models,f.options);assert.equal(models[0].reviewDecision.valid,false);
 const parts=await M.decoratePartRows(f.db,admin,[{id:101,categoryModelId:1,categoryModelReviewId:1}],f.options);assert.equal(parts[0].categoryModelReviewDecision.valid,false);assert.equal(parts[0].categoryModelReviewId,undefined);
});
test('unchanged approved versions propagate to all duplicated part entries with bounded queries',async()=>{
 const f=fixture();await f.submit(await f.body());f.state.queries=[];const out=await M.decoratePartRows(f.db,admin,Array.from({length:200},(_,i)=>({id:i+1,categoryModelId:1,categoryModelReviewId:1})),f.options);
 assert.ok(out.every(p=>p.categoryModelReviewDecision.valid&&p.categoryModelReviewDecision.status==='approved'));assert.equal(f.state.queries.length,4);
 f.state.queries=[];const plain=await M.decoratePartRows(f.db,admin,[{id:300,categoryModelId:2}],f.options);assert.equal(plain[0].categoryModelReviewDecision,null);assert.equal(f.state.queries.length,0);
});
test('no-history model listing preserves the original baseline and never hashes all models',async()=>{
 const f=fixture();let assetCalls=0;const rows=await M.decorateModels(f.db,admin,f.state.models,{assetReader:{read:async()=>{assetCalls++;throw Error('Must not read');}}});assert.equal(rows[0].reviewDecision,null);assert.equal(assetCalls,0);assert.equal(f.state.queries.length,1);
});
test('public models are admin-maintained and foreign private models and reference photos stay scoped',async()=>{
 const f=fixture(),body=await f.body();await assert.rejects(()=>f.submit(body,{id:2,role:'raw_grain'}),/公共模型/);assert.equal((await f.detail({id:3,role:'viewer',workshopCode:'raw_grain'})).permissions.canReview,false);
 await f.submit(body);const hidden=await f.detail({id:4,role:'viewer',workshopCode:'brewing'});assert.deepEqual(hidden.parts,[]);assert.equal(hidden.review.referencePartId,null);assert.equal(hidden.review.referenceSnapshot.restricted,true);assert.ok(!JSON.stringify(hidden).includes('P001'));
 f.state.models[0].workshop_code='qu_making';await assert.rejects(()=>f.detail({id:2,role:'raw_grain'}),/没有该车间/);
 f.state.models[0].workshop_code='raw_grain';const employee=await f.detail({id:5,role:'viewer',staffWorkshopCode:'raw_grain',staffPosition:'shift_leader'});assert.equal(employee.parts.length,1);assert.equal(employee.permissions.canReview,false);await assert.rejects(()=>f.submit(body,{id:5,role:'viewer',staffWorkshopCode:'raw_grain'}),/车间管理员/);
});
test('a current pending decision on a missing model is not falsely called a changed version',async()=>{
 const f=fixture();delete f.state.assets['/models/test.glb'];const out=await f.submit(await f.body({status:'pending',note:'模型尚待上传核对。'}));assert.equal(out.review.status,'pending');assert.equal(out.review.valid,true);assert.equal(out.review.stale,false);assert.equal(out.version.available,false);
});
test('the additive schema only creates an independent append-only review table',async()=>{
 const statements=[];await M.ensureModelReviewSchema({query:async sql=>statements.push(sql)});assert.equal(statements.length,1);assert.match(statements[0],/^CREATE TABLE IF NOT EXISTS part_model_reviews/);assert.doesNotMatch(statements[0],/DROP|TRUNCATE|UPDATE parts/i);
});
test('asset fingerprints refuse arbitrary paths and recalculate same-path changed files, with force bypassing cache',async()=>{
 const root=path.resolve('fixture-review-assets'),bytes=Buffer.alloc(24);bytes.write('glTF');bytes.writeUInt32LE(2,4);bytes.writeUInt32LE(24,8);let stamp=1,reads=0;
 const fake={realpath:async p=>p,stat:async()=>({size:bytes.length,mtimeMs:stamp,ctimeMs:stamp,isFile:()=>true}),readFile:async()=>{reads++;return bytes;}};
 const reader=createAssetReader({modelDir:root,imageDir:root,staticRoots:[root],fileSystem:fake});
 for(const url of ['https://host/test.glb','/models/../../server/.env.glb','/models/%2e%2e/test.glb','//host/test.glb','/models/a.glb?x=1','/uploads/part-models/child/a.glb'])assert.equal((await reader.read(url,'model')).available,false,url);
 const a=await reader.read('/models/test.glb','model');assert.equal(a.available,true);await reader.read('/models/test.glb','model');assert.equal(reads,1);bytes[23]=1;stamp++;const b=await reader.read('/models/test.glb','model');assert.notEqual(a.sha256,b.sha256);await reader.read('/models/test.glb','model',{force:true});assert.equal(reads,3);
 const escape=createAssetReader({modelDir:root,staticRoots:[root],fileSystem:{...fake,realpath:async p=>p===root?p:path.resolve(root,'../private/model.glb')}});assert.equal((await escape.read('/models/test.glb','model')).available,false);
});
test('review routes never need a listening port and reject anonymous and viewer writes',async()=>{
 const f=fixture(),router=createRouter(f.db,f.options);
 const invoke=(method,user,body={})=>new Promise((resolve,reject)=>router.handle({method,url:'/part-models/1/'+(method==='GET'?'review':'reviews'),headers:{},body,user},{status(){return this},json:resolve},error=>reject(error||Error('No route'))));
 await assert.rejects(()=>invoke('GET',null),/请先登录/);await assert.rejects(()=>invoke('POST',{id:2,role:'viewer'}),/修改权限/);assert.equal((await invoke('GET',admin)).data.model.id,1);
});
