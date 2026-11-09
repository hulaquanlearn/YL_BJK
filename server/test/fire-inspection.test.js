const test=require('node:test');
const assert=require('node:assert/strict');
const F=require('../src/fire-inspection');
const S=require('../src/fire-store');
const now=new Date('2026-10-26T04:00:00Z');
const point={id:4,areaId:2,assets:[{id:7,type:'extinguisher',name:'灭火器',quantity:1,status:'active'}]};
const valid=()=>({cycleId:1,result:'normal',remark:'',items:[{assetId:7,result:'normal',remark:''}],photoIds:[11],requestId:'record_req_123'});
test('fire record requires a photograph and all frozen assets',()=>{
 assert.throws(()=>F.normalizeRecord({...valid(),photoIds:[]},point,now),/现场照片/);
 assert.throws(()=>F.normalizeRecord({...valid(),items:[]},point,now),/全部未检器材/);
 assert.throws(()=>F.normalizeRecord({...valid(),items:[{assetId:8,result:'normal'}]},point,now),/不属于/);
});
test('fire record never accepts unknown, unconfigured or retired assets as normal',()=>{
 for(const asset of [{quantity:null,status:'active'},{quantity:0,status:'active'},{quantity:1,status:'unconfigured'},{quantity:1,status:'repair'},{quantity:1,status:'retired'}])assert.throws(()=>F.normalizeRecord(valid(),{...point,assets:[{id:7,...asset}]},now),/不能按正常通过/);
});
test('fire abnormalities require reasons and consistent overall result',()=>{
 assert.throws(()=>F.normalizeRecord({...valid(),items:[{assetId:7,result:'missing'}]},point,now),/填写原因/);
 assert.throws(()=>F.normalizeRecord({...valid(),items:[{assetId:7,result:'missing',remark:'实物未找到'}]},point,now),/应为异常/);
 const r=F.normalizeRecord({...valid(),result:'abnormal',items:[{assetId:7,result:'missing',remark:'实物未找到'}]},point,now);assert.equal(r.result,'abnormal');assert.equal(r.items[0].assetSnapshot.name,'灭火器');
});

test('fire record identity is server-owned and input cannot inject it',()=>{
 const r=F.normalizeRecord({...valid(),actorId:999,actorName:'伪造人员',submittedAt:'2000-01-01'},point,now);assert.equal(r.actorId,undefined);assert.equal(r.actorName,undefined);assert.equal(r.submittedAt,undefined);
});
test('fire permissions are independent of inventory manager roles and reload assignments',async()=>{
 const calls=[],db={query:async(sql,args)=>{calls.push({sql,args});return[[{area_id:2}]];}};
 const access=await F.loadFireAccess({id:5,role:'brewing'},db);assert.deepEqual(access,{canRead:true,canManage:false,areaIds:[2]});F.assertArea(access,2);assert.throws(()=>F.assertArea(access,3),/权限/);assert.throws(()=>F.assertManager(access),/系统管理员/);
 assert.equal(calls.length,1);const revoked=await F.loadFireAccess({id:5,role:'brewing'},{query:async()=>[[]]});assert.equal(revoked.canRead,false);
 assert.deepEqual(await F.loadFireAccess({id:1,role:'admin'},db),{canRead:true,canManage:true,areaIds:[]});
});
test('fire point validation preserves unknown quantity, manufacturing precision and source',()=>{
 const p=F.normalizePoint({areaId:2,code:'P-1',name:'北门',assets:[{type:'extinguisher',quantity:null,manufacturedDate:'2024-03',manufacturer:'淮海',source:{sheet:'灭火器',row:2}}]});assert.equal(p.assets[0].quantity,null);assert.equal(p.assets[0].manufacturedDate,'2024-03');assert.deepEqual(p.assets[0].source,{sheet:'灭火器',row:2});
 assert.throws(()=>F.normalizePoint({...p,assets:[{id:1,type:'hydrant',quantity:1},{id:1,type:'hydrant',quantity:1}]}),/重复/);
});
test('fire retired source rows cannot appear active or printable while absent active fields preserve snapshots',()=>{
 assert.equal(F.assetRow({id:7,type:'extinguisher',quantity:1,status:'active',active:0}).status,'retired');
 assert.equal(F.assetRow({id:7,type:'extinguisher',quantity:1,status:'active',active:'0'}).status,'retired');
 assert.equal(F.assetRow({id:7,type:'extinguisher',quantity:1,status:'active'}).status,'active');
});
test('fire photographs cannot be borrowed from another user, point or completed record',async()=>{
 for(const row of [{id:11,owner_id:8,point_id:4},{id:11,owner_id:5,point_id:9},{id:11,owner_id:5,point_id:4,record_id:6},{id:11,owner_id:5,point_id:4,issue_id:6}]){
  let writes=0;const db={query:async sql=>{if(sql.startsWith('SELECT'))return[[row]];writes++;return[{}];}};await assert.rejects(()=>S.bindPhotos(db,[11],5,4,'record',1),/本人/);assert.equal(writes,0);
 }
});
test('fire photo permission follows authorized pending frozen work after a point moves area',async()=>{
 const queries=[],db={query:async(sql,args)=>{queries.push({sql,args});return[[{point_id:4}]];}};
 await S.assertPhotoPointAccess(db,{canManage:false,areaIds:[2]},4,9);assert.equal(queries.length,1);assert.match(queries[0].sql,/cp\.area_id IN \(\?\)/);assert.match(queries[0].sql,/fire_record_assets/);assert.match(queries[0].sql,/JSON_LENGTH/);assert.deepEqual(queries[0].args,[4,2]);
});
test('fire photo permission follows an authorized unresolved issue but denies completed or revoked old work',async()=>{
 let calls=0;const issueDb={query:async(sql,args)=>{calls++;if(sql.includes('fire_cycle_points'))return[[]];assert.match(sql,/status<>'closed'/);assert.match(sql,/area_id IN \(\?\)/);assert.deepEqual(args,[4,2]);return[[{id:5}]];}};
 await S.assertPhotoPointAccess(issueDb,{canManage:false,areaIds:[2]},4,9);assert.equal(calls,2);
 await assert.rejects(()=>S.assertPhotoPointAccess({query:async()=>[[]]},{canManage:false,areaIds:[2]},4,9),/照片权限/);
 assert.equal(await S.canPhotoPointAccess({query:async()=>{throw Error('must not query without grants');}},{canManage:false,areaIds:[]},4,9),false);
});
test('fire retired asset can still supply a missing-item photo for an authorized unfinished frozen task',async()=>{
 const queries=[],db={query:async(sql,args)=>{queries.push({sql,args});if(sql.startsWith('SELECT id,active'))return[[{id:7,active:0}]];if(sql.includes('fire_cycle_points'))return[[{point_id:4}]];throw Error('unexpected query');}};
 await S.assertPhotoAssetAccess(db,{canManage:false,areaIds:[2]},4,9,7);assert.equal(queries.length,2);assert.match(queries[1].sql,/JSON_CONTAINS/);assert.match(queries[1].sql,/ra\.asset_id=\?/);assert.deepEqual(queries[1].args,[4,7,7,2]);
 const data=F.normalizeRecord({...valid(),assetId:7,result:'abnormal',items:[{assetId:7,result:'missing',remark:'本期冻结后实物已更换'}]},point,now);assert.equal(data.items[0].result,'missing');
 await assert.rejects(()=>S.assertPhotoAssetAccess({query:async sql=>sql.startsWith('SELECT id,active')?[[{id:7,active:0}]]:[[]]},{canManage:false,areaIds:[9]},4,9,7),/照片权限/);
});
test('fire idempotent requests must preserve object IDs and single-versus-bulk work order scope',()=>{
 const prior={point_id:4,cycle_id:1,items_json:[{assetId:7}],point_snapshot:{submissionTargetAssetId:7}};
 F.assertIdempotentRequest(prior,{assetId:7,items:[{assetId:7}]},4,1);
 assert.throws(()=>F.assertIdempotentRequest(prior,{assetId:8,items:[{assetId:8}]},4,1),/其他器材工单/);
 assert.throws(()=>F.assertIdempotentRequest(prior,{items:[{assetId:7}]},4,1),/其他器材工单/);
});
test('fire record and photo binding rollback together on a failed transaction',async()=>{
 const events=[],connection={beginTransaction:async()=>events.push('begin'),commit:async()=>events.push('commit'),rollback:async()=>events.push('rollback'),release:()=>events.push('release')};
 await assert.rejects(()=>F.transaction({getConnection:async()=>connection},async()=>{throw new Error('photo unavailable');}),/photo unavailable/);assert.deepEqual(events,['begin','rollback','release']);
});
test('fire point list uses frozen cycle scope and a new cycle resets completion',async()=>{
 const snapshot={...point,code:'P1',name:'北门',areaName:'一区',building:'旧楼',floor:'1F',room:'',location:'北门'},db={query:async(sql,args)=>{
  if(sql.startsWith('SELECT * FROM fire_cycles'))return[[{id:args[0],name:'本期',status:'open'}]];
  if(sql.includes('FROM fire_cycle_points cp LEFT JOIN'))return[[{snapshot_json:snapshot,completed_asset_ids:args[0]===1?[7]:[],open_issue_count:1,record_id:args[0]===1?9:null,result:args[0]===1?'abnormal':null,actor_name:args[0]===1?'张三':null,actual_checked_at:args[0]===1?'2026-10-26 04:00:00':null}]];
  throw new Error(sql);
 }};
 const old=await S.points(db,{canManage:true,areaIds:[]},{cycleId:1}),fresh=await S.points(db,{canManage:true,areaIds:[]},{cycleId:2});assert.equal(old.items[0].status,'checked');assert.equal(old.items[0].hasIssue,true);assert.equal(old.items[0].lastResult,'abnormal');assert.equal(old.items[0].building,'旧楼');assert.equal(fresh.items[0].status,'pending');assert.equal(fresh.stats.pending,1);assert.equal(fresh.items[0].lastCheckedAt,null);assert.equal(fresh.items[0].hasIssue,true,'unresolved previous-cycle issues survive the reset');
});
test('fire unresolved issue counts are scoped independently from the current point area',async()=>{
 let params,statement;const db={query:async(sql,args)=>{
  if(sql.startsWith('SELECT * FROM fire_cycles'))return[[{id:3,name:'本期',status:'open'}]];
  statement=sql;params=args;return[[{snapshot_json:{...point,code:'P4',name:'点位'},completed_asset_ids:[7],record_id:8,result:'abnormal',issue_status:'closed',open_issue_count:0}]];
 }};
 const out=await S.points(db,{canManage:false,areaIds:[2]},{cycleId:3});assert.match(statement,/oi\.area_id IN \(\?\)/);assert.deepEqual(params,[2,3,2]);assert.equal(out.items[0].hasIssue,false);assert.equal(out.items[0].lastResult,'abnormal');assert.equal(out.items[0].status,'checked');assert.equal(out.stats.abnormal,0);
});
test('fire cycle metadata is not returned for a completely unauthorized scope',async()=>{
 const db={query:async sql=>sql.startsWith('SELECT * FROM fire_cycles')?[[{id:99,name:'不可见区域计划',status:'open'}]]:[[]]};await assert.rejects(()=>S.points(db,{canManage:false,areaIds:[2]},{cycleId:99}),/点检月份不存在/);
});
test('fire quantities expand into distinct physical assets and cannot change an existing id into multiple items',()=>{
 const p=F.normalizePoint({areaId:2,code:'P2',name:'门口',assets:[{type:'extinguisher',code:'E01',quantity:3}]});assert.equal(p.assets.length,3);assert.deepEqual(p.assets.map(a=>a.quantity),[1,1,1]);assert.deepEqual(p.assets.map(a=>a.source.instanceIndex),[1,2,3]);assert.ok(p.assets.every(a=>a.source.originalQuantity===3&&a.code==='E01'));
 assert.throws(()=>F.normalizePoint({areaId:2,code:'P2',name:'门口',assets:[{id:7,type:'extinguisher',quantity:2}]}),/一物一码/);
 assert.throws(()=>F.normalizePoint({areaId:2,code:'P2',name:'门口',assets:[{type:'extinguisher',quantity:101}]}),/0至100/);
});
test('fire single-asset work orders and bulk work orders use only their uninspected target assets',()=>{
 const p={...point,assets:[...point.assets,{id:8,type:'extinguisher',quantity:1,status:'active'}],completedAssetIds:[7]};
 const next=F.normalizeRecord({...valid(),items:[{assetId:8,result:'normal'}]},p,now);assert.deepEqual(next.assetIds,[8]);
 assert.throws(()=>F.normalizeRecord({...valid(),assetId:7},p,now),/本期已点检/);
 assert.throws(()=>F.normalizeRecord({...valid(),assetId:8},p,now),/不属于/);
 const summary=S.inspectionPoint({...p,completedAssetIds:undefined},[{asset_id:7,record_id:11,result:'normal'}]);assert.equal(summary.status,'pending');assert.equal(summary.checkedAssetCount,1);assert.equal(summary.assets[0].inspectionResult,'normal');assert.equal(summary.assets[1].inspectionStatus,'pending');assert.equal(summary.assets[1].inspectionResult,null);assert.equal(S.inspectionPoint(p,[7,8]).status,'checked');
 const mixed=S.inspectionPoint(p,[{asset_id:7,result:'normal'},{asset_id:8,result:'abnormal'}]);assert.deepEqual(mixed.assets.map(a=>a.inspectionResult),['normal','abnormal']);
});
test('fire import advisory lock is held until after the committed transaction',async()=>{
 const calls=[],c={query:async sql=>{calls.push(sql.includes('GET_LOCK')?'lock':'unlock');return[[{acquired:1}]];},beginTransaction:async()=>calls.push('begin'),commit:async()=>calls.push('commit'),rollback:async()=>calls.push('rollback'),release:()=>calls.push('release')};
 await F.transaction({getConnection:async()=>c},async()=>calls.push('write'),{serializeImport:true});assert.deepEqual(calls,['lock','begin','write','commit','unlock','release']);
});
test('fire schema consists only of independent additive tables and is repeatable',async()=>{
 const queries=[];const db={query:async s=>queries.push(s)};await F.initializeFireSchema(db);const count=queries.length;await F.initializeFireSchema(db);assert.ok(count>=12);assert.equal(queries.length,count*2);assert.ok(queries.every(s=>/^(?:CREATE TABLE IF NOT EXISTS fire_|SET @fire_photo_month_sql|PREPARE fire_photo_month_stmt|EXECUTE fire_photo_month_stmt|DEALLOCATE PREPARE fire_photo_month_stmt|SET @fire_section_sql|PREPARE fire_section_stmt|EXECUTE fire_section_stmt|DEALLOCATE PREPARE fire_section_stmt)/.test(s)));assert.ok(!queries.some(s=>/^(?:DROP|TRUNCATE|UPDATE |DELETE FROM)/i.test(s)));
});

test('raw grain administrator and every staff level inherit fire access without gaining other module rights',async()=>{const db={query:async sql=>{assert.match(sql,/SELECT id FROM fire_areas/);return [[{id:2},{id:4}]]}};assert.deepEqual(await F.loadFireAccess({id:7,role:'raw_grain'},db),{canRead:true,canManage:true,areaIds:[]});for(const staffPosition of ['shift_leader','employee','group_leader']){const access=await F.loadFireAccess({id:8,role:'viewer',staffWorkshopCode:'raw_grain',staffPosition},db);assert.equal(access.canRead,true);assert.equal(access.canManage,false);F.assertArea(access,4);assert.throws(()=>F.assertManager(access),/管理员/)}assert.equal((await F.loadFireAccess({id:8,role:'viewer',staffWorkshopCode:'raw_grain'},{query:async()=>[[]]})).canRead,true)})

test('new photo records use server time and cannot be backdated by client fields',()=>{const r=F.normalizeRecord({...valid(),actualCheckedAt:'2000-01-01T00:00:00Z',backfillReason:'old client value'},point,now);assert.equal(r.actualCheckedAt,'2026-10-26 04:00:00');assert.equal(r.backfillReason,'');});
