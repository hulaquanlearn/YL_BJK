const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const utils = require('../src/utils');

function loadKnowledgeRoute({ pool, uploadDir, extractDocumentText = async () => '' }) {
  const handlers = new Map();
  let uploadCalls = 0;
  const router = Object.fromEntries(['get', 'post', 'put', 'patch', 'delete'].map(method => [
    method,
    (url, ...chain) => handlers.set(`${method} ${url}`, chain)
  ]));
  router.use = () => {};
  const multer = () => ({ single: () => (_req, _res, next) => { uploadCalls += 1; next(); } });
  multer.diskStorage = () => ({});
  const rateLimit = () => (_req, _res, next) => next();
  const module = { exports: {} };
  const mocks = {
    express: { Router: () => router },
    crypto: require('node:crypto'),
    fs,
    path,
    multer,
    'express-rate-limit': rateLimit,
    '../config': { knowledge: { uploadDir, maxFileSize: 500 * 1024 * 1024 } },
    '../db': { pool },
    '../auth': { requireRole: () => (_req, _res, next) => next() },
    '../workshop-scope': {
      WORKSHOPS: [{ code: 'raw_grain', name: '原粮车间' }],
      normalizeWorkshopCode: value => value || 'raw_grain',
      canWriteWorkshop: () => true,
      assertWorkshopWrite: () => {},
      requireAnyWorkshopEditor: (_req, _res, next) => next()
    },
    '../utils': { ...utils, asyncHandler: fn => fn },
    '../knowledge-utils': require('../src/knowledge-utils'),
    '../document-service': {
      extractDocumentText,
      getDocumentCapabilities: async () => ({}),
      previewDocument: async () => ({ body: '', contentType: 'text/html', mode: 'text' })
    }
  };
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/knowledge.js'), 'utf8');
  vm.runInNewContext(source, { require: name => mocks[name] ?? require(name), module, console, Buffer, Date, setTimeout, clearTimeout });
  return { handlers, getUploadCalls: () => uploadCalls };
}

function responseCapture() {
  return {
    statusCode: 200,
    body: null,
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; }
  };
}

function request({ userId = 7, role = 'raw_grain', body = {}, revisionNo = '1' } = {}) {
  return {
    params: { id: '9', revisionNo }, body, file: null,
    user: { id: userId, role, username: `u${userId}`, displayName: `用户${userId}` },
    query: {}, get: () => ''
  };
}

test('knowledge PUT rejects a non-owner before upload and extraction middleware run', async () => {
  let extractionCalls = 0;
  const pool = { query: async () => [[{ uploadedBy: 8 }]] };
  const app = loadKnowledgeRoute({
    pool,
    uploadDir: fs.mkdtempSync(path.join(os.tmpdir(), 'knowledge-auth-')),
    extractDocumentText: async () => { extractionCalls += 1; return ''; }
  });
  const chain = app.handlers.get('put /knowledge/:id');
  let nextCalled = false;
  await assert.rejects(() => chain[0](request(), {}, () => { nextCalled = true; }), error => error.status === 403);
  assert.equal(nextCalled, false);
  assert.equal(app.getUploadCalls(), 0);
  assert.equal(extractionCalls, 0);
});

test('knowledge PUT snapshots the locked revision before updating to the next version', async () => {
  const calls = [];
  const current = {
    id: 9, workshopCode: 'raw_grain', entryType: 'document', title: '旧标题', category: '设备资料',
    processStage: null, equipmentName: null, summary: '旧摘要', faultSymptom: null, faultCause: null,
    solution: null, preventiveAction: null, contentText: '已建索正文', tags: '电机',
    originalFilename: 'manual.docx', storedFilename: 'stored.docx', mimeType: 'application/docx',
    fileSize: 120, uploadedBy: 7, revisionNo: 3, indexStatus: 'ready', indexMessage: null,
    indexedAt: '2026-09-05 08:00:00'
  };
  const connection = {
    async beginTransaction() { calls.push('begin'); },
    async commit() { calls.push('commit'); },
    async rollback() { calls.push('rollback'); },
    release() { calls.push('release'); },
    async query(sql, params = []) {
      if (/SELECT id,workshop_code/.test(sql)) return [[current]];
      if (/INSERT INTO knowledge_entry_revisions/.test(sql)) { calls.push({ kind: 'snapshot', sql, params }); return [{ affectedRows: 1 }]; }
      if (/UPDATE fermentation_knowledge_entries SET workshop_code/.test(sql)) { calls.push({ kind: 'update', sql, params }); return [{ affectedRows: 1 }]; }
      throw new Error(`unexpected SQL: ${sql}`);
    }
  };
  const pool = { getConnection: async () => connection, query: async () => [[]] };
  const app = loadKnowledgeRoute({ pool, uploadDir: fs.mkdtempSync(path.join(os.tmpdir(), 'knowledge-put-')) });
  const handler = app.handlers.get('put /knowledge/:id').at(-1);
  const res = responseCapture();
  await handler(request({ body: { entryType: 'document', title: '新标题', category: '设备资料', summary: '新摘要', tags: '电机' } }), res);
  const snapshotIndex = calls.findIndex(item => item?.kind === 'snapshot');
  const updateIndex = calls.findIndex(item => item?.kind === 'update');
  assert.ok(snapshotIndex >= 0 && updateIndex > snapshotIndex);
  const update = calls[updateIndex];
  assert.equal(update.params[11], '已建索正文');
  assert.equal(update.params[17], 4);
  assert.equal(res.body.data.revisionNo, 4);
  assert.ok(calls.includes('commit'));
});

test('knowledge PUT rolls back when the optimistic revision snapshot no longer matches', async () => {
  let updates = 0;
  const state = { rolledBack: false };
  const current = {
    id: 9, workshopCode: 'raw_grain', entryType: 'document', title: '标题', category: '设备资料',
    contentText: '正文', originalFilename: 'manual.docx', storedFilename: 'stored.docx', mimeType: 'application/docx',
    fileSize: 120, uploadedBy: 7, revisionNo: 4, indexStatus: 'ready'
  };
  const connection = {
    async beginTransaction() {}, async commit() {}, async rollback() { state.rolledBack = true; }, release() {},
    async query(sql) {
      if (/SELECT id,workshop_code/.test(sql)) return [[current]];
      if (/INSERT INTO knowledge_entry_revisions/.test(sql)) return [{ affectedRows: 0 }];
      if (/UPDATE fermentation_knowledge_entries/.test(sql)) { updates += 1; return [{ affectedRows: 1 }]; }
      throw new Error(`unexpected SQL: ${sql}`);
    }
  };
  const app = loadKnowledgeRoute({ pool: { getConnection: async () => connection }, uploadDir: fs.mkdtempSync(path.join(os.tmpdir(), 'knowledge-conflict-')) });
  await assert.rejects(
    () => app.handlers.get('put /knowledge/:id').at(-1)(request({ body: { entryType: 'document', title: '新标题', category: '设备资料' } }), responseCapture()),
    error => error.status === 409
  );
  assert.equal(updates, 0);
  assert.equal(state.rolledBack, true);
});

test('reindex failure keeps the prior searchable body and records the failure', async t => {
  const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'knowledge-reindex-'));
  t.after(() => fs.rmSync(uploadDir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(uploadDir, 'stored.pdf'), 'fixture');
  const calls = [];
  const pool = { async query(sql, params = []) {
    if (/SELECT id,uploaded_by/.test(sql)) return [[{
      id: 9, uploadedBy: 7, storedFilename: 'stored.pdf', originalFilename: 'manual.pdf',
      contentText: '仍可检索的旧正文', revisionNo: 2
    }]];
    if (/UPDATE fermentation_knowledge_entries SET content_text/.test(sql)) { calls.push({ sql, params }); return [{ affectedRows: 1 }]; }
    throw new Error(`unexpected SQL: ${sql}`);
  } };
  const app = loadKnowledgeRoute({ pool, uploadDir, extractDocumentText: async () => { throw new Error('OCR 未安装'); } });
  const res = responseCapture();
  await app.handlers.get('post /knowledge/:id/reindex').at(-1)(request(), res);
  assert.equal(calls[0].params[0], '仍可检索的旧正文');
  assert.equal(calls[0].params[1], 'failed');
  assert.match(calls[0].params[2], /OCR 未安装/);
  assert.equal(res.body.data.indexStatus, 'failed');
});

test('restore requires owner permission and archives the current version before restoring', async () => {
  const calls = [];
  const current = { id: 9, uploadedBy: 7, revisionNo: 5 };
  const revision = {
    workshop_code: 'raw_grain', entry_type: 'document', title: 'V2 标题', category: '设备资料',
    process_stage: null, equipment_name: null, summary: '旧摘要', fault_symptom: null, fault_cause: null,
    solution: null, preventive_action: null, content_text: 'V2 正文', tags: '历史',
    original_filename: 'v2.docx', stored_filename: 'stored-v2.docx', mime_type: 'application/docx',
    file_size: 222, index_status: 'ready', index_message: null, indexed_at: '2026-09-01 08:00:00'
  };
  const connection = {
    async beginTransaction() {}, async commit() { calls.push('commit'); }, async rollback() { calls.push('rollback'); }, release() {},
    async query(sql, params = []) {
      if (/SELECT id,uploaded_by AS uploadedBy,revision_no/.test(sql)) return [[current]];
      if (/SELECT \* FROM knowledge_entry_revisions/.test(sql)) return [[revision]];
      if (/INSERT INTO knowledge_entry_revisions/.test(sql)) { calls.push({ kind: 'snapshot', params }); return [{ affectedRows: 1 }]; }
      if (/UPDATE fermentation_knowledge_entries SET workshop_code/.test(sql)) { calls.push({ kind: 'update', params }); return [{ affectedRows: 1 }]; }
      throw new Error(`unexpected SQL: ${sql}`);
    }
  };
  const app = loadKnowledgeRoute({ pool: { getConnection: async () => connection }, uploadDir: fs.mkdtempSync(path.join(os.tmpdir(), 'knowledge-restore-')) });
  const handler = app.handlers.get('post /knowledge/:id/revisions/:revisionNo/restore').at(-1);
  await assert.rejects(() => handler(request({ userId: 8, revisionNo: '2' }), responseCapture()), error => error.status === 403);
  assert.equal(calls.some(item => item?.kind === 'snapshot'), false);

  const res = responseCapture();
  await handler(request({ userId: 7, revisionNo: '2' }), res);
  const snapshotIndex = calls.findIndex(item => item?.kind === 'snapshot');
  const updateIndex = calls.findIndex(item => item?.kind === 'update');
  assert.ok(snapshotIndex >= 0 && updateIndex > snapshotIndex);
  assert.equal(calls[updateIndex].params[11], 'V2 正文');
  assert.equal(calls[updateIndex].params[17], 6);
  assert.equal(res.body.data.revisionNo, 6);
  assert.ok(calls.includes('commit'));
});

