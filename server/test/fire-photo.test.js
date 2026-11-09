const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const R = require('../src/fire-recognition');
const W = require('../src/fire-photo-workflow');
const Q = require('../src/fire-query');
const S = require('../src/fire-store');
const F = require('../src/fire-inspection');
const now = new Date('2026-10-27T04:00:00Z');
const photo = sharp({ create: { width: 320, height: 480, channels: 3, background: '#dd2222' } }).jpeg().toBuffer();
const config = { enabled: true, model: 'deepseek-flash', apiUrl: 'https://api.deepseek.com/chat/completions', token: 'synthetic-not-real', timeoutMs: 1000 };
function card(type = 'extinguisher') {
 return { cardCount: 1, cardComplete: true, deviceCode: '005', deviceType: type, typeConfidence: 0.99, codeConfidence: 0.99, department: '原粮蒸糠', location: '蒸糠大厅（3跨南）', year: 2026, cardYearText: '2026', yearConfidence: 0.99, month: 10, rowLabel: '10月', rowConfidence: 0.99, checks: R.CHECKS[type].map(([key, name]) => ({ key, name, mark: '√', confidence: 0.99 })), concerns: [] };
}
function recognition(raw = card()) { return R.validateRecognition(raw, '2026-10', { now }); }
const candidate = (id = 7, overrides = {}) => ({ point: { id: 4, areaId: 2, areaName: '原粮蒸糠', code: 'P4', name: '蒸糠大厅', location: '蒸糠大厅3跨南' }, asset: { id, type: 'extinguisher', code: '005', name: '灭火器', status: 'active', quantity: 1, ...overrides } });
test('photo recognition requires one card and all independent cells', () => {
 const complete = recognition(); assert.equal(complete.result, 'normal'); assert.deepEqual(complete.reasons, []);
 for (const overrides of [{ cardCount: 2 }, { cardComplete: false }, { typeConfidence: 0.5 }, { concerns: ['反光'] }, { concerns: ['多行检查内容无法确定应读取哪一行'] }]) assert.ok(recognition({ ...card(), ...overrides }).reasons.length, JSON.stringify(overrides));
 for (const mark of ['blank', 'unclear', '', '/', '是', '正常']) { const raw = card(); raw.checks[2].mark = mark; assert.equal(recognition(raw).result, 'unclear', mark); }
 const raw = card(); raw.checks.pop(); assert.equal(recognition(raw).result, 'unclear');
 const doubled = card(); doubled.checks[3].key = 'pressure'; assert.equal(recognition(doubled).result, 'unclear');
 for (const name of ['', '不相关表头']) { const raw = card(); raw.checks[1].name = name; assert.equal(recognition(raw).result, 'unclear'); }
});
test('year is optional while the photographed row must be the current month', () => {
 for (const overrides of [{year:2025,cardYearText:'2025',yearConfidence:0.1},{year:null,cardYearText:'',yearConfidence:null},{rowConfidence:0.3}]) { const out=recognition({...card(),...overrides});assert.deepEqual(out.reasons,[]);assert.equal(out.inspectionMonth,'2026-10');assert.equal(out.year,2026);assert.equal(out.month,10); }
 for (const overrides of [{month:9,rowLabel:'9月'},{month:10,rowLabel:'季度'},{month:null,rowLabel:''},{month:10,rowLabel:'9月'}]) { const out=recognition({...card(),...overrides});assert.equal(out.contentReady,false);assert.match(out.reasons.join('；'),/10月检查行/); }
 const january=R.validateRecognition({...card(),month:1,rowLabel:'1月'},'2027-01');assert.deepEqual(january.reasons,[]);assert.equal(january.year,2027);
});
test('missing or low confidence numbers do not reject clear current-month results',()=>{
 for(const overrides of [{deviceCode:'',codeConfidence:null},{deviceCode:'O05',codeConfidence:0.1}]){const out=recognition({...card(),...overrides});assert.equal(out.contentReady,true);assert.deepEqual(out.reasons,[]);assert.equal(out.result,'normal');}
});
test('one cross is a completed abnormal inspection, never normal and never blank', () => {
 for (const type of ['extinguisher', 'hydrant']) { const raw = card(type); raw.checks[4].mark = '×'; const out = recognition(raw); assert.equal(out.result, 'abnormal'); assert.deepEqual(out.reasons, []); assert.equal(out.checks[4].result, 'abnormal'); }
});
test('code matching retains alphabetic prefixes and leading zeros and requires unique identity', () => {
 assert.equal(R.normalizeCode(' ｘ００３ '), 'X003');
 for (const code of ['5', '0005', 'X005', 'O05']) assert.equal(R.matchCandidate(recognition(), [candidate(7, { code })]), null, code);
 assert.equal(R.matchCandidate(recognition(), [candidate()]).asset.id, 7);
 assert.equal(R.matchCandidate(recognition(), [candidate(7), candidate(8)]), null);
 assert.equal(R.matchCandidate(recognition(), [candidate(7), candidate(8)], { pointId: 4, assetId: 8 }).asset.id, 8);
 const other = candidate(8); other.point = { ...other.point, id: 5, areaName: '六车间', location: '北门' }; assert.equal(R.matchCandidate(recognition(), [candidate(), other]), null);
});
test('matching ignores photographed location and still rejects nonphysical assets', () => {
 for (const overrides of [{ quantity: null }, { quantity: 0 }, { quantity: 2 }, { status: 'retired' }, { status: 'repair' }, { type: 'hydrant' }]) assert.equal(R.matchCandidate(recognition(), [candidate(7, overrides)]), null);
 const raw = card(); raw.location = '二车间西门'; raw.department = '二车间'; assert.equal(R.matchCandidate(recognition(raw), [candidate()]).asset.id, 7); assert.equal(recognition(raw).location, undefined);
});
test('configured cycle inspection month is independent of a deadline crossing months and years', () => {
 assert.equal(Q.cycleView({ id: 1, inspection_month: '2026-10', created_at: '2026-10-27 04:00:00', deadline: '2026-11-30 04:00:00' }).inspectionMonth, '2026-10');
 assert.equal(Q.cycleView({ id: 1, created_at: '2026-12-31 16:01:00', deadline: '2027-02-01 04:00:00' }).inspectionMonth, '2027-01');
});
test('photo service uses the existing official vision channel and a real inline image', async () => {
 let sent;
 const out = await R.recognizePhoto(await photo, '2026-10', { config, now, fetchImpl: async (url, options) => { sent = { url, options, body: JSON.parse(options.body) }; return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(card()) }, finish_reason: 'stop' }] }) }; } });
 assert.equal(out.result, 'normal'); assert.equal(sent.url, 'https://api.deepseek.com/chat/completions'); assert.equal(sent.options.redirect, 'error'); assert.equal(sent.body.model, 'deepseek-flash');
 assert.equal(sent.body.messages[1].role, 'user'); assert.match(sent.body.messages[1].content[1].image_url.url, /^data:image\/jpeg;base64,/); assert.equal(sent.body.messages[1].content[1].image_url.detail, undefined);
 assert.ok(!sent.options.body.includes('synthetic-not-real'));
 await assert.rejects(() => R.recognizePhoto(Buffer.from('x'), '2026-10', { config: { ...config, apiUrl: 'https://untrusted.local' } }), /尚未配置/);
 await assert.rejects(() => R.recognizePhoto(Buffer.from('x'), '2026-10', { config, fetchImpl: async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '{}' }, finish_reason: 'length' }] }) }) }), /格式不完整/);
 assert.equal(R.configuration({ DEEPSEEK_API_KEY: 'x', FIRE_PHOTO_AI_MODEL: 'deepseek-reasoner' }).enabled, false);
 assert.equal(R.configuration({ DEEPSEEK_API_KEY: 'x', FIRE_PHOTO_AI_ENABLED: 'false' }).enabled, false);
});

function fixture({ abnormal = false, raw = null, inspectionMonth = '2026-10', revokeAfterRecognition = false, retired = false, badPhotoBind = false } = {}) {
 const c = candidate(), point = { ...c.point, assets: [c.asset] };
 const state = { records: [], photos: [], mappings: [], issues: [], events: [], calls: 0, revoked: false, currentAsset: { id: 7, point_id: 4, active: retired ? 0 : 1, status: 'active', quantity: 1, code: '005', type: 'extinguisher' }, account: { id: 5, enabled: 1, role: 'viewer', username: 'tester', display_name: '真实登录人' } }; let backup;
 const db = { getConnection: async () => db, beginTransaction: async () => { backup = structuredClone(state); }, commit: async () => {}, rollback: async () => Object.assign(state, backup), release() {}, query: async (sql, args = []) => {
  if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]]; if (sql.includes('RELEASE_LOCK')) return [[{ released: 1 }]];
  if (sql.startsWith('SELECT m.area_id')) return [state.revoked ? [] : [{ area_id: 2 }]];
  if (sql.startsWith('SELECT id,username,display_name,role,enabled')) { assert.match(sql, /FOR SHARE$/); return [[state.account]]; }
  if (sql.startsWith('SELECT * FROM fire_cycles')) return [[{ id: 1, inspection_month: inspectionMonth, name: '本期', status: 'open', created_at: '2026-10-01 01:00:00', deadline: '2026-11-01 01:00:00' }]];
  if (sql.startsWith('SELECT cp.point_id,cp.area_id')) return [[{ point_id: 4, area_id: 2, snapshot_json: point }]];
  if (sql.startsWith('SELECT cp.*,c.status')) return [[{ area_id: 2, cycle_status: 'open', snapshot_json: point }]];
  if (sql.startsWith('SELECT id,point_id,cycle_id')) return [state.records.filter(r => r.actor_id === args[0] && r.request_id === args[1])];
  if (sql.includes("JSON_EXTRACT(point_snapshot,'$.recognition.photoHash')")) return [state.records.filter(r => JSON.parse(r.point_snapshot).recognition?.photoHash === args[0]).map(r => ({ id: r.id }))];
  if (sql.startsWith('SELECT id,point_id,active,status,quantity')) return [[state.currentAsset]];
  if (sql.startsWith('SELECT asset_id,record_id,')) return [state.mappings.filter(m => m.cycle_id === args[0] && m.point_id === args[1])];
  if (sql.startsWith('INSERT INTO fire_photos')) { const keys = ['point_id', 'owner_id', 'asset_id', 'image', 'mime', 'filename', 'byte_size'], p = { id: state.photos.length + 1, record_id: null, issue_id: null }; keys.forEach((k, i) => p[k] = args[i]); state.photos.push(p); return [{ insertId: p.id }]; }
  if (sql.startsWith('INSERT INTO fire_records')) { const keys = ['cycle_id', 'point_id', 'area_id', 'actor_id', 'actor_name', 'actual_checked_at', 'backfill_reason', 'result', 'remark', 'items_json', 'point_snapshot', 'request_id'], r = { id: state.records.length + 1, submitted_at: '2026-10-27 04:01:00' }; keys.forEach((k, i) => r[k] = args[i]); state.records.push(r); return [{ insertId: r.id }]; }
  if (sql.startsWith('SELECT id,owner_id,point_id')) return [state.photos.filter(p => args.includes(p.id)).map(p => ({ ...p, owner_id: badPhotoBind ? 999 : p.owner_id }))];
  if (sql.startsWith('UPDATE fire_photos SET record_id')) { state.photos.filter(p => args.slice(1).includes(p.id)).forEach(p => p.record_id = args[0]); return [{ affectedRows: 1 }]; }
  if (sql.startsWith('INSERT INTO fire_record_assets')) { const keys = ['cycle_id', 'point_id', 'asset_id', 'record_id', 'result'], m = {}; keys.forEach((k, i) => m[k] = args[i]); state.mappings.push(m); return [{ affectedRows: 1 }]; }
  if (sql.startsWith('INSERT INTO fire_issues')) { state.issues.push({ id: 1, record_id: args[0], remark: args[4] }); return [{ insertId: 1 }]; }
  if (sql.startsWith('INSERT INTO fire_issue_events')) { state.events.push({ action: args[3], actor_name: args[2] }); return [{ insertId: 1 }]; }
  if (sql.startsWith('SELECT * FROM fire_records WHERE id')) return [state.records.filter(r => r.id === args[0])];
  if (sql.includes('FROM fire_photos WHERE record_id')) return [state.photos.filter(p => p.record_id === args[0])];
  throw Error('Unexpected query: ' + sql);
 } };
 const recognize = async () => { state.calls++; if (revokeAfterRecognition) state.revoked = true; const input = raw || card(); if (abnormal) input.checks[4].mark = '×'; return recognition(input); };
 const run = async (body = {}, options = {}) => {
  const args = [db, { id: 5, role: 'viewer', displayName: '真实登录人' }, { buffer: await photo, originalname: '检查卡.jpg' }], payload = { cycleId: 1, requestId: 'photo_test_123456', ...body }, settings = { recognize, now, config, clock: () => now, ...options };
  const first = await W.processPhoto(...args, payload, settings);
  if (first.status !== 'awaiting_confirmation' || options.previewOnly || body.confirmationToken) return first;
  return W.processPhoto(...args, { ...payload, confirmationToken: first.confirmationToken, deviceCode: first.recognition.deviceCode, location: first.candidates[0].location, confirmedAssetId: first.candidates[0].assetId }, settings);
 };
 return { state, db, run };
}
test('confirmed photograph saves one real asset record with original evidence, current actor and idempotency', async () => {
 const { run, state } = fixture(); const out = await run(); assert.equal(out.status, 'completed'); assert.equal(out.record.actorName, '真实登录人'); assert.equal(out.record.items[0].assetId, 7); assert.equal(out.record.source, 'ai_photo'); assert.equal(out.record.photos.length, 1); assert.match(out.record.recognition.photoHash, /^[a-f0-9]{64}$/);
 const point = S.inspectionPoint({ assets: [candidate().asset] }, state.mappings); assert.equal(point.status, 'checked'); assert.equal(point.assets[0].inspectionStatus, 'checked'); assert.equal(state.records.length, 1); assert.equal(state.photos[0].record_id, out.record.id); assert.equal(state.calls, 1);
 const retry = await run(); assert.equal(retry.record.id, out.record.id); assert.equal(state.calls, 1); assert.equal(state.records.length, 1);
 await assert.rejects(() => run({ assetId: 7, pointId: 4 }), /用于其他照片或任务/); assert.equal(state.calls, 1);
});
test('a missing photo number proceeds to manual ledger selection without another model call', async()=>{
 const raw={...card(),deviceCode:'',codeConfidence:null,year:null,cardYearText:'',yearConfidence:null};const f=fixture({raw});
 const preview=await f.run({}, {previewOnly:true});assert.equal(preview.status,'awaiting_confirmation');assert.equal(preview.recognition.deviceCode,'');assert.equal(f.state.records.length,0);
 const out=await f.run({confirmationToken:preview.confirmationToken,deviceCode:'005',confirmedAssetId:7,location:preview.candidates[0].location});
 assert.equal(out.status,'completed');assert.equal(f.state.calls,1);assert.equal(f.state.records.length,1);assert.equal(out.record.recognition.confirmation.originalDeviceCode,'');assert.equal(out.record.recognition.deviceCode,'005');
});
test('clear marks from another month cannot create a current-month completion',async()=>{
 const f=fixture({raw:{...card(),month:9,rowLabel:'9月'}});const out=await f.run();assert.equal(out.status,'needs_review');assert.match(out.message,/10月检查行/);assert.equal(f.state.records.length,0);
});
test('abnormal crosses complete the asset and create an independent unresolved issue', async () => {
 const { run, state } = fixture({ abnormal: true }); const out = await run(); assert.equal(out.status, 'completed'); assert.equal(out.record.result, 'abnormal'); assert.equal(state.mappings.length, 1); assert.equal(state.issues.length, 1); assert.match(state.issues[0].remark, /筒体×/); assert.equal(state.events[0].actor_name, '真实登录人');
});
test('old month and retired photographs never persist a photo or a completion', async () => {
 const unclear = card(); unclear.checks[0].mark = 'unclear';
 for (const options of [{ inspectionMonth: '2026-09' }, { retired: true }]) { const { run, state } = fixture(options); const out = await run(); assert.equal(out.status, 'needs_review'); assert.equal(state.records.length, 0); assert.equal(state.photos.length, 0); assert.equal(state.mappings.length, 0); }
});
test('a grant revoked while the model is running is rechecked before any photo or record is saved', async () => {
 const { run, state } = fixture({ revokeAfterRecognition: true }); await assert.rejects(() => run(), /没有该消防区域/); assert.equal(state.records.length, 0); assert.equal(state.photos.length, 0);
});
test('current identity and account enabled state are checked again after recognition', async () => {
 for (const change of [state => { state.currentAsset.code = '006'; }, state => { state.currentAsset.type = 'hydrant'; }]) {
  const { run, state } = fixture(); change(state); const out = await run(); assert.equal(out.status, 'needs_review'); assert.equal(state.records.length, 0); assert.equal(state.photos.length, 0);
 }
 const { run, state } = fixture(); state.account.enabled = 0; await assert.rejects(() => run(), /账号已停用/); assert.equal(state.records.length, 0);
});
test('photo binding failure rolls back the inserted AI photograph and record together', async () => {
 const { run, state } = fixture({ badPhotoBind: true }); await assert.rejects(() => run(), /本人/); assert.equal(state.records.length, 0); assert.equal(state.photos.length, 0); assert.equal(state.mappings.length, 0);
});
test('reused photos with a new request cannot count a second time', async () => {
 const { run, state } = fixture(); await run(); const out = await run({ requestId: 'photo_new_request_123' }); assert.equal(out.status, 'needs_review'); assert.match(out.message, /已用于点检/); assert.equal(state.calls, 1); assert.equal(state.records.length, 1);
});
test('same-request retries share the in-flight model call while different concurrent photos for one actor are refused', async () => {
 const { run, state } = fixture(); let release, entered; const enteredPromise = new Promise(resolve => entered = resolve), gate = new Promise(resolve => release = resolve);
 const recognize = async () => { state.calls++; entered(); await gate; return recognition(); };
 const first = run({}, { recognize }); await enteredPromise;
 const retry = run({}, { recognize }); await assert.rejects(() => run({ requestId: 'another_photo_123' }, { recognize }), /已有一张照片正在识别/); release();
 const [a, b] = await Promise.all([first, retry]); assert.equal(a.record.id, b.record.id); assert.equal(state.calls, 1);
});
test('photo hash serialization lock stays held through transaction commit', async () => {
 const calls = [], db = { query: async sql => { calls.push(sql.includes('GET_LOCK') ? 'lock' : 'unlock'); return [[{ acquired: 1 }]]; }, beginTransaction: async () => calls.push('begin'), commit: async () => calls.push('commit'), release: () => calls.push('release') };
 await F.transaction({ getConnection: async () => db }, async () => calls.push('write'), { serializePhotoHash: 'a'.repeat(64) }); assert.deepEqual(calls, ['lock', 'begin', 'write', 'commit', 'unlock', 'release']);
});

test('recognition preview never writes and allows low-confidence number correction without another model call', async () => {
 const raw = card(); raw.deviceCode = 'O05'; raw.codeConfidence = 0.3; raw.location = '错误位置';
 const f = fixture({ raw }), preview = await f.run({}, { previewOnly: true });
 assert.equal(preview.status, 'awaiting_confirmation'); assert.equal(preview.candidates[0].location, '蒸糠大厅3跨南'); assert.equal(preview.recognition.location, undefined);
 assert.equal(f.state.records.length, 0); assert.equal(f.state.photos.length, 0); assert.equal(f.state.calls, 1);
 const payload = { confirmationToken: preview.confirmationToken, deviceCode: '005', location: '人工核对的实际位置', confirmedAssetId: 7 };
 const saved = await f.run(payload); assert.equal(saved.status, 'completed'); assert.equal(f.state.calls, 1);
 assert.equal(saved.record.pointSnapshot.location, payload.location);
 assert.equal(saved.record.recognition.confirmation.originalDeviceCode, 'O05'); assert.equal(saved.record.recognition.confirmation.ledgerLocation, '蒸糠大厅3跨南');
 assert.equal(saved.record.recognition.deviceCode, '005'); assert.equal(saved.record.recognition.confirmation.actorId, 5);
 assert.equal((await f.run(payload)).record.id, saved.record.id);
 await assert.rejects(() => f.run({ ...payload, location: '保存后篡改' }), /不能用同一提交标识修改/);
});
test('a corrected number must still resolve to one authorized real ledger asset', async () => {
 const f = fixture(), p = await f.run({}, { previewOnly: true });
 const payload = { confirmationToken: p.confirmationToken, deviceCode: 'X005', location: '人工位置', confirmedAssetId: 7 };
 assert.equal((await f.run(payload)).status, 'needs_review'); assert.equal(f.state.records.length, 0);
 assert.equal((await f.run({ ...payload, deviceCode: '005' })).status, 'completed'); assert.equal(f.state.calls, 1);
});
test('signed confirmation rejects forged evidence, another account/photo and expired tickets', async () => {
 const C = require('../src/fire-photo-confirmation'), f = fixture(), p = await f.run({}, { previewOnly: true });
 const target = { cycleId: 1, requestId: 'photo_test_123456', pointId: null, assetId: null }, digest = p.recognition.photoHash;
 assert.equal(C.read(p.confirmationToken, { id: 5 }, target, digest, now).deviceCode, '005');
 for (const args of [
  [p.confirmationToken + 'x', { id: 5 }, target, digest, now],
  [p.confirmationToken, { id: 6 }, target, digest, now],
  [p.confirmationToken, { id: 5 }, target, '0'.repeat(64), now],
  [p.confirmationToken, { id: 5 }, target, digest, new Date(now.getTime() + 16 * 60000)]
 ]) assert.throws(() => C.read(...args), /核对已过期/);
 const tokenParts = p.confirmationToken.split('.'), data = JSON.parse(Buffer.from(tokenParts[0], 'base64url')); data.recognition.checks[0].mark = '×'; tokenParts[0] = Buffer.from(JSON.stringify(data)).toString('base64url');
 assert.throws(() => C.read(tokenParts.join('.'), { id: 5 }, target, digest, now), /核对已过期/);
 assert.equal(f.state.records.length, 0);
});
test('confirmation rechecks grants, open month and device state after preview', async () => {
 for (const change of [f => f.state.revoked = true, f => f.state.account.enabled = 0, f => f.state.currentAsset.active = 0]) {
  const f = fixture(), p = await f.run({}, { previewOnly: true }); change(f);
  try { await f.run({ confirmationToken: p.confirmationToken, deviceCode: '005', location: '台账位置', confirmedAssetId: 7 }); } catch (e) { assert.match(e.message, /授权|停用|权限/); }
  assert.equal(f.state.records.length, 0); assert.equal(f.state.photos.length, 0);
 }
 const f = fixture(), p = await f.run({}, { previewOnly: true });
 const result = await f.run({ confirmationToken: p.confirmationToken, deviceCode: '005', location: '台账位置', confirmedAssetId: 7 }, { now: new Date('2026-10-31T16:00:00Z'), clock: () => new Date('2026-10-31T16:00:00Z') });
 assert.equal(result.status, 'needs_review'); assert.match(result.message, /2026-11/); assert.equal(f.state.records.length, 0);
});

test('sticker side views are sent separately, persisted together, and bound to confirmation', async()=>{
 const first=await photo,second=await sharp({create:{width:250,height:400,channels:3,background:'#22dd22'}}).jpeg().toBuffer();
 const evidence=await W.photoEvidence({buffer:first,views:[{buffer:first},{buffer:second}]});
 const meta=await sharp(evidence.image).metadata();assert.equal(meta.height,880);assert.equal(evidence.views.length,2);
 let sent;await R.recognizePhoto(evidence.image,'2026-10',{config,now,views:evidence.views,fetchImpl:async(url,options)=>{sent=JSON.parse(options.body);return{ok:true,json:async()=>({choices:[{message:{content:JSON.stringify(card())}}]})}}});
 assert.equal(sent.messages[1].content.filter(c=>c.type==='image_url').length,2);
 assert.match(sent.messages[0].content,/弧面/);assert.match(sent.messages[0].content,/不得跨器材拼接/);
 const f=fixture();let options;
 const result=await W.processPhoto(f.db,{id:5,role:'viewer'},{buffer:first,views:[{buffer:first},{buffer:second}]},{cycleId:1,requestId:'sticker_multiple_123'},{now,config,clock:()=>now,recognize:async(image,month,o)=>{options=o;return recognition()}});
 assert.equal(result.status,'awaiting_confirmation');assert.equal(options.views.length,2);assert.equal(result.recognition.viewCount,2);assert.equal(f.state.records.length,0);
 const saved=await W.processPhoto(f.db,{id:5,role:'viewer'},{buffer:first,views:[{buffer:first},{buffer:second}]},{cycleId:1,requestId:'sticker_multiple_123',confirmationToken:result.confirmationToken,deviceCode:'005',location:'北门',confirmedAssetId:7},{now,config,clock:()=>now});
 assert.equal(saved.status,'completed');assert.equal(saved.record.recognition.viewCount,2);assert.equal((await sharp(f.state.photos[0].image).metadata()).height,880);
 await assert.rejects(()=>W.processPhoto(f.db,{id:5,role:'viewer'},{buffer:first,views:[{buffer:second},{buffer:first}]},{cycleId:1,requestId:'sticker_multiple_123',confirmationToken:result.confirmationToken,deviceCode:'005',location:'北门',confirmedAssetId:7},{now,config}),/其他照片或任务/);
 await assert.rejects(()=>W.photoEvidence({buffer:first,views:Array(4).fill({buffer:first})}),/最多拍3张/);
 const conflict=card();conflict.concerns=['不同视角器材编号不一致'];assert.equal(recognition(conflict).contentReady,false);
});

test('unclear cells use the supplied standards and remain pending without failing the confirmed month',()=>{
 const raw=card();raw.checks[2].mark='unclear';raw.checks[2].note='反光看不清';raw.checks[3].confidence=0.4;raw.checks[5].name='提拔压把';
 const out=recognition(raw);assert.equal(out.contentReady,true);assert.deepEqual(out.reasons,[]);assert.equal(out.result,'unclear');assert.deepEqual(out.manualCheckKeys,['pressure','seal']);
 assert.equal(out.checks[2].standard,'压力是否正常');assert.equal(out.checks[2].mark,'');assert.equal(out.checks[3].recognizedMark,'√');assert.equal(out.checks[3].result,'unclear');
 assert.equal(out.checks[5].result,'normal');const hydrant=recognition(card('hydrant'));assert.equal(hydrant.checks[4].name,'栓接头');assert.equal(hydrant.checks[4].standard,'无堵塞、与水带相连接');
 const missing=card();missing.checks.pop();const filled=recognition(missing);assert.equal(filled.checks.length,6);assert.equal(filled.checks[5].requiresConfirmation,true);assert.equal(filled.checks[5].mark,'');
});
test('manual cell choices require explicit completion and save original evidence and responsible actor',async()=>{
 for(const selected of ['normal','abnormal']){
  const raw=card();raw.checks[2].mark='blank';const f=fixture({raw});const preview=await f.run({}, {previewOnly:true});assert.equal(preview.status,'awaiting_confirmation');assert.equal(f.state.records.length,0);
  const payload={confirmationToken:preview.confirmationToken,deviceCode:'005',location:preview.candidates[0].location,confirmedAssetId:7};
  await assert.rejects(()=>f.run(payload),/人工确认.*压力表/);assert.equal(f.state.records.length,0);assert.equal(f.state.photos.length,0);
  const result=await f.run({...payload,manualChecks:JSON.stringify({pressure:selected})});assert.equal(result.status,'completed');assert.equal(f.state.calls,1);assert.equal(result.record.result,selected);assert.equal(f.state.issues.length,selected==='abnormal'?1:0);
  const c=result.record.recognition.checks.find(c=>c.key==='pressure');assert.equal(c.source,'manual_confirmation');assert.equal(c.recognizedMark,'blank');assert.equal(c.mark,selected==='normal'?'√':'×');
  assert.equal(result.record.recognition.confirmation.actorId,5);assert.equal(result.record.recognition.confirmation.checks[0].originalMark,'blank');assert.equal(result.record.recognition.confirmation.checks[0].result,selected);assert.match(result.record.remark,/人工确认：压力表/);
  const retry=await f.run({...payload,manualChecks:JSON.stringify({pressure:selected})});assert.equal(retry.record.id,result.record.id);assert.equal(f.state.records.length,1);
  await assert.rejects(()=>f.run({...payload,manualChecks:JSON.stringify({pressure:selected==='normal'?'abnormal':'normal'})}),/不能用同一提交标识修改/);
 }
});
test('manual checks cannot overwrite recognized cells or bypass unresolved fields and invalid values',async()=>{
 const raw=card();raw.checks[0].mark='unclear';raw.checks[2].mark='blank';const f=fixture({raw}),p=await f.run({}, {previewOnly:true});
 const payload={confirmationToken:p.confirmationToken,deviceCode:'005',location:p.candidates[0].location,confirmedAssetId:7};
 for(const manualChecks of [{appearance:'normal'},{appearance:'normal',pressure:'normal',box:'abnormal'},{appearance:'yes',pressure:'normal'},['normal'],'not-json'])await assert.rejects(()=>f.run({...payload,manualChecks:typeof manualChecks==='string'?manualChecks:JSON.stringify(manualChecks)}),/人工确认|仅可补充/);
 assert.equal(f.state.records.length,0);assert.equal(f.state.photos.length,0);const out=await f.run({...payload,manualChecks:JSON.stringify({pressure:'normal',appearance:'abnormal'})});assert.equal(out.status,'completed');assert.equal(out.record.result,'abnormal');assert.equal(f.state.calls,1);
});
