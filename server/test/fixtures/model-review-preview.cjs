'use strict';
// Local opt-in UI fixture only. No database, private uploads, network or real approvals.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const reviews = new Map(), requests = new Map();
let nextId = 1;
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const publicRoot = path.resolve(__dirname, '../../../spare-parts-web-release/public');
const referenceCatalog = require('../../../spare-parts-web-release/public/models/reference-20260904/manifest.json');
const ledger = require('../../data/ledger-model-catalog.json');
const models = referenceCatalog.models.map((item, index) => ({ id: index + 1, name: item.name, modelUrl: '/models/reference-20260904/' + item.model, imageUrl: '/models/reference-20260904/' + item.image, frontRotationY: Number(item.frontRotationY) || 0, modelScale: 1, associatedParts: 3, workshopCode: null }));
const legacy = ledger.models.find(item => item.id === 13);
models.push({ id: 13, name: '【本地合成】' + legacy.name + ' · 核对流程', modelUrl: legacy.modelUrl, imageUrl: '', frontRotationY: 0, modelScale: 1, associatedParts: 1, workshopCode: null });
function asset(url) {
  if (!url) return { url: '', sha256: null, available: false, reason: '【本地合成】未提供图片' };
  const filename = path.resolve(publicRoot, '.' + url);
  if (!filename.startsWith(publicRoot + path.sep) || !fs.existsSync(filename) || !fs.statSync(filename).isFile()) return { url, sha256: null, available: false, reason: '本地公有模型文件不存在' };
  return { url, sha256: digest(fs.readFileSync(filename)), available: true, reason: '' };
}
function modelState(model, user) {
  const parts = [{ id: model.id * 100 + 1, code: 'LOCAL-QA-' + model.id, name: '【本地合成】对照备件', spec: '仅用于界面核验的示意规格', brand: '本地合成资料', partImageUrl: '', workshopCodes: ['raw_grain'] }];
  const file = asset(model.modelUrl), image = asset(model.imageUrl);
  const version = { hash: digest(JSON.stringify({ synthetic: true, model, fileHash: file.sha256, parts })), modelFileHash: file.sha256, available: file.available, reason: file.reason, modelImage: image, partImages: parts.map(part => ({ partId: part.id, url: '', sha256: null, available: false, reason: '【本地合成】尚无实物照片，请选现场核对' })) };
  const history = (reviews.get(model.id) || []).map(row => ({ ...row, valid: row.versionHash === version.hash && (row.status !== 'approved' || version.available), stale: row.versionHash !== version.hash }));
  return { synthetic: true, model, version, review: history[0] || null, history, parts, permissions: { canReview: user?.role === 'admin' }, meshes: [] };
}
function mountModelReviewPreview(app) {
  if (process.env.PREVIEW_FIRE_SPLIT !== '1') throw Error('Model review preview requires the explicit PREVIEW_FIRE_SPLIT local opt-in');
  const fail = (res, status, msg) => res.status(status).json({ success: false, msg });
  const authorized = (req, res, next) => req.user ? next() : fail(res, 401, '请先登录本地验收账号');
  const find = id => models.find(model => Number(model.id) === Number(id));
  // The same seven generic preview models plus one explicitly synthetic legacy
  // sample allow pending -> approved -> persisted listing checks on a real GLB.
  app.get(['/api/part-models', '/api/part-category-models'], authorized, (req, res) => res.json({ success: true, data: models.map(model => ({ ...model, reviewDecision: modelState(model, req.user).review })) }));
  app.get('/api/part-models/:id/review', authorized, (req, res) => {
    const model = find(req.params.id); if (!model) return fail(res, 404, '本地合成模型不存在');
    res.json({ success: true, data: modelState(model, req.user) });
  });
  app.post('/api/part-models/:id/reviews', authorized, (req, res) => {
    if (req.user.role !== 'admin') return fail(res, 403, '公共模型仅本地管理员可登记合成核对');
    const model = find(req.params.id); if (!model) return fail(res, 404, '本地合成模型不存在');
    try {
      const input = require('../../src/model-reviews').input(req.body), current = modelState(model, req.user);
      if (input.expectedVersionHash !== current.version.hash) return fail(res, 409, '本地模型版本已改变，请重新加载');
      const selected = current.parts.find(part => part.id === input.referencePartId);
      if (input.referencePartId && !selected) return fail(res, 400, '请选择本地合成关联备件');
      if (input.status === 'approved' && (!selected || input.referenceType !== 'onsite' || !current.version.available)) return fail(res, 400, '本地合成确认请选择关联备件和现场实物核对；当前未模拟实物照片');
      const key = String(req.user.id) + ':' + input.requestId, signature = digest(JSON.stringify({ modelId: model.id, ...input }));
      if (requests.has(key)) {
        if (requests.get(key) !== signature) return fail(res, 409, '同一标识不能提交不同合成结论');
        return res.status(201).json({ success: true, data: current });
      }
      const actorName = '【本地合成】' + (req.user.displayName || req.user.name || req.user.username || '管理员');
      const row = { id: nextId++, status: input.status, note: input.note, versionHash: current.version.hash, modelFileHash: current.version.modelFileHash, actorId: Number(req.user.id), actorName, reviewedAt: new Date().toISOString(), referenceType: input.referenceType, referencePartId: input.referencePartId, checks: input.checks, referenceSnapshot: { synthetic: true, referenceType: input.referenceType, part: selected || null, note: input.note } };
      reviews.set(model.id, [row, ...(reviews.get(model.id) || [])]); requests.set(key, signature);
      res.status(201).json({ success: true, data: modelState(model, req.user) });
    } catch (error) { fail(res, error.status || 400, error.message); }
  });
  return { synthetic: true, sampleModelId: 13, reviews };
}
module.exports = { mountModelReviewPreview };
