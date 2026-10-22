const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const config = require('../config');
const { pool } = require('../db');
const { requireRole } = require('../auth');
const { WORKSHOPS, normalizeWorkshopCode, canWriteWorkshop, assertWorkshopWrite, requireAnyWorkshopEditor } = require('../workshop-scope');
const { ApiError, asyncHandler, positiveInt } = require('../utils');
const { cleanText, knowledgePayload, safeExtension, normalizeUploadFilename } = require('../knowledge-utils');
const { extractDocumentText, getDocumentCapabilities, previewDocument } = require('../document-service');

const router = express.Router();
const uploadDir = config.knowledge.uploadDir;
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, uploadDir),
  filename: (_req, file, callback) => {
    const extension = safeExtension(file.originalname);
    callback(extension ? null : new Error('不支持该文件格式'), `${Date.now()}-${crypto.randomBytes(12).toString('hex')}${extension}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: config.knowledge.maxFileSize, files: 1, fields: 20, parts: 21, fieldSize: 60000 },
  fileFilter: (_req, file, callback) => {
    const allowed = Boolean(safeExtension(file.originalname));
    callback(allowed ? null : new Error('仅支持PDF、Office、文本、表格和常用图片文件'), allowed);
  }
}).single('file');

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, msg: '上传过于频繁，请稍后再试' }
});

function receiveUpload(req, res, next) {
  upload(req, res, error => {
    if (!error) {
      if (req.file) req.file.originalname = normalizeUploadFilename(req.file.originalname);
      return next();
    }
    if (error.code === 'LIMIT_FILE_SIZE') return next(new ApiError(413, `附件不能超过${Math.round(config.knowledge.maxFileSize / 1024 / 1024)}MB`));
    return next(new ApiError(400, error.message || '附件上传失败'));
  });
}

function removeUploadedFile(file) {
  if (!file?.path) return;
  fs.promises.unlink(file.path).catch(() => {});
}

function canManageEntry(row, user) {
  return user?.role === 'admin' || (['raw_grain','qu_making','brewing'].includes(user?.role) && Number(row?.uploadedBy) === Number(user?.id));
}

function assertManageEntry(row, user) {
  if (!canManageEntry(row, user)) throw new ApiError(403, '只能修改自己创建或上传的知识');
}

const authorizeKnowledgeManage = asyncHandler(async (req, _res, next) => {
  const id = positiveInt(req.params.id, 0, Number.MAX_SAFE_INTEGER);
  if (!id) throw new ApiError(400, '知识条目ID无效');
  const [[item]] = await pool.query(
    "SELECT uploaded_by AS uploadedBy FROM fermentation_knowledge_entries WHERE id=? AND status='active' LIMIT 1",
    [id]
  );
  if (!item) throw new ApiError(404, '知识条目不存在或已删除');
  assertManageEntry(item, req.user);
  next();
});

function safeOriginalFilename(value, fallback = '') {
  const normalized = normalizeUploadFilename(value || fallback);
  const filename = path.basename(normalized).replace(/[\u0000-\u001f<>:"/\\|?*]/g, '_').trim().slice(0, 255);
  if (!filename) return '';
  const extension = safeExtension(filename);
  if (!extension) throw new ApiError(400, '附件名称必须保留可支持的文件扩展名');
  const fallbackExtension = safeExtension(fallback);
  if (fallbackExtension && extension !== fallbackExtension) throw new ApiError(400, '只能修正附件名，不能改变文件格式');
  return filename;
}

async function buildIndexResult(file, manualText = '') {
  const supplied = cleanText(manualText, 100000);
  if (!file) {
    return { contentText: supplied, indexStatus: supplied ? 'ready' : 'empty', indexMessage: null, indexedAt: supplied ? new Date() : null };
  }
  try {
    const extracted = await extractDocumentText(file.path, file.originalname, 100000);
    const contentText = cleanText([supplied, extracted].filter(Boolean).join('\n'), 100000);
    return {
      contentText,
      indexStatus: contentText ? 'ready' : 'empty',
      indexMessage: contentText ? null : '文件可预览，但未提取到可检索文字',
      indexedAt: new Date()
    };
  } catch (error) {
    return {
      contentText: supplied,
      indexStatus: 'failed',
      indexMessage: cleanText(error?.message || '附件文字提取失败', 500),
      indexedAt: null
    };
  }
}

function toEntry(row, user) {
  return {
    id: String(row.id),
    workshopCode: row.workshopCode || 'raw_grain',
    workshopName: row.workshopName || WORKSHOPS.find(item => item.code === (row.workshopCode || 'raw_grain'))?.name || '原粮车间',
    entryType: row.entryType,
    title: row.title,
    category: row.category,
    processStage: row.processStage,
    equipmentName: row.equipmentName,
    summary: row.summary,
    faultSymptom: row.faultSymptom,
    faultCause: row.faultCause,
    solution: row.solution,
    preventiveAction: row.preventiveAction,
    contentText: row.contentText,
    tags: row.tags ? row.tags.split(',').filter(Boolean) : [],
    originalFilename: normalizeUploadFilename(row.originalFilename),
    mimeType: row.mimeType,
    fileSize: Number(row.fileSize) || 0,
    hasFile: Boolean(row.storedFilename),
    uploadedByName: row.uploadedByName,
    viewCount: Number(row.viewCount) || 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    revisionNo: Number(row.revisionNo) || 1,
    indexStatus: row.indexStatus || (row.storedFilename ? 'pending' : (row.contentText ? 'ready' : 'empty')),
    indexMessage: row.indexMessage || '',
    indexedAt: row.indexedAt || null,
    canEdit: canManageEntry(row, user),
    canDelete: canManageEntry(row, user)
  };
}

const ENTRY_SELECT = `
  SELECT k.id, k.workshop_code AS workshopCode, ws.name AS workshopName, entry_type AS entryType, title, category, process_stage AS processStage,
         equipment_name AS equipmentName, summary, fault_symptom AS faultSymptom,
         fault_cause AS faultCause, solution, preventive_action AS preventiveAction,
         content_text AS contentText, tags, original_filename AS originalFilename,
         stored_filename AS storedFilename, mime_type AS mimeType, file_size AS fileSize,
         uploaded_by AS uploadedBy, uploaded_by_name AS uploadedByName, view_count AS viewCount,
         revision_no AS revisionNo,index_status AS indexStatus,index_message AS indexMessage,indexed_at AS indexedAt,
         k.created_at AS createdAt, k.updated_at AS updatedAt
  FROM fermentation_knowledge_entries k LEFT JOIN workshops ws ON ws.code=k.workshop_code`;

const ENTRY_LIST_SELECT = `
  SELECT k.id, k.workshop_code AS workshopCode, ws.name AS workshopName, entry_type AS entryType, title, category, process_stage AS processStage,
         equipment_name AS equipmentName, summary,
         LEFT(fault_symptom, 350) AS faultSymptom,
         tags, original_filename AS originalFilename, stored_filename AS storedFilename,
         mime_type AS mimeType, file_size AS fileSize, uploaded_by AS uploadedBy, uploaded_by_name AS uploadedByName,
         view_count AS viewCount,revision_no AS revisionNo,index_status AS indexStatus,index_message AS indexMessage,indexed_at AS indexedAt,
         k.created_at AS createdAt, k.updated_at AS updatedAt
  FROM fermentation_knowledge_entries k LEFT JOIN workshops ws ON ws.code=k.workshop_code`;

async function requireActiveProcessStage(name, workshopCode, database = pool) {
  if (!name) return;
  const [rows] = await database.query(
    "SELECT id FROM knowledge_process_stages WHERE name=? AND workshop_code=? AND status='active' LIMIT 1",
    [name, workshopCode]
  );
  if (!rows.length) throw new ApiError(400, '所选工序/区域已停用或不存在，请刷新后重新选择');
}

async function snapshotEntry(connection, id, revisionNo, user, changeKind, changeSummary) {
  const [result] = await connection.query(
    `INSERT INTO knowledge_entry_revisions
     (entry_id,revision_no,workshop_code,entry_type,title,category,process_stage,equipment_name,summary,
      fault_symptom,fault_cause,solution,preventive_action,content_text,tags,original_filename,stored_filename,
      mime_type,file_size,index_status,index_message,indexed_at,change_kind,change_summary,created_by,created_by_name)
     SELECT id,revision_no,workshop_code,entry_type,title,category,process_stage,equipment_name,summary,
      fault_symptom,fault_cause,solution,preventive_action,content_text,tags,original_filename,stored_filename,
      mime_type,file_size,index_status,index_message,indexed_at,?,?,?,?
     FROM fermentation_knowledge_entries WHERE id=? AND revision_no=?`,
    [changeKind, cleanText(changeSummary, 500) || null, Number(user?.id) || null,
      user?.displayName || user?.username || '系统用户', id, revisionNo]
  );
  if (!result.affectedRows) throw new ApiError(409, '知识已被其他用户更新，请刷新后重试');
}

async function sendDocumentPreview(res, fullPath, originalFilename) {
  let preview;
  try {
    preview = await previewDocument(fullPath, originalFilename);
  } catch (error) {
    console.error('Document preview failed:', error.message);
    throw new ApiError(422, error.message || '文件无法生成安全预览');
  }
  res.setHeader('Content-Type', preview.contentType || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(originalFilename || 'attachment')}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Preview-Mode', cleanText(preview.mode || 'direct', 80));
  if (preview.notice) res.setHeader('X-Preview-Notice', encodeURIComponent(cleanText(preview.notice, 500)));
  if (String(preview.contentType || '').startsWith('text/html')) {
    res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; font-src data:");
  }
  if (preview.filePath) {
    const stream = fs.createReadStream(preview.filePath);
    stream.on('error', error => {
      console.error('Preview stream failed:', error.message);
      if (!res.headersSent) res.status(500).json({ success: false, msg: '预览文件读取失败' });
      else res.destroy(error);
    });
    stream.pipe(res);
    return;
  }
  res.send(preview.body ?? '');
}

router.get('/knowledge/stats', asyncHandler(async (req, res) => {
  const workshopCode = req.query.workshopCode ? normalizeWorkshopCode(req.query.workshopCode) : '';
  const workshopWhere = workshopCode ? ' AND workshop_code=?' : '';
  const workshopParams = workshopCode ? [workshopCode] : [];
  const [countResult, categoryResult, stageResult, tagResult] = await Promise.all([
    pool.query(`SELECT COUNT(*) AS total,
      SUM(entry_type='document') AS documents,
      SUM(entry_type='fault') AS faults,
      COALESCE(SUM(view_count),0) AS views
      FROM fermentation_knowledge_entries WHERE status='active'${workshopWhere}`, workshopParams),
    pool.query(`SELECT category, COUNT(*) AS total FROM fermentation_knowledge_entries
      WHERE status='active'${workshopWhere} GROUP BY category ORDER BY total DESC, category ASC`, workshopParams),
    pool.query(`SELECT process_stage AS processStage, COUNT(*) AS total FROM fermentation_knowledge_entries
      WHERE status='active'${workshopWhere} AND process_stage IS NOT NULL AND process_stage<>''
      GROUP BY process_stage ORDER BY total DESC, process_stage ASC`, workshopParams),
    pool.query(`SELECT tags FROM fermentation_knowledge_entries WHERE status='active'${workshopWhere} AND tags IS NOT NULL AND tags<>''`, workshopParams)
  ]);
  const counts = countResult[0][0] || {};
  const categories = categoryResult[0];
  const stages = stageResult[0];
  const tagSet = new Set();
  tagResult[0].forEach(row => String(row.tags || '').split(',').forEach(tag => { const t = tag.trim(); if (t) tagSet.add(t); }));
  res.json({
    success: true,
    data: {
      total: Number(counts.total) || 0,
      documents: Number(counts.documents) || 0,
      faults: Number(counts.faults) || 0,
      views: Number(counts.views) || 0,
      categories: categories.map(item => ({ ...item, total: Number(item.total) || 0 })),
      stages: stages.map(item => ({ ...item, total: Number(item.total) || 0 })),
      tags: [...tagSet].sort()
    }
  });
}));

router.get('/knowledge/preview-capabilities', requireRole('admin'), asyncHandler(async (_req, res) => {
  res.json({ success: true, data: await getDocumentCapabilities() });
}));

router.get('/knowledge/process-stages', asyncHandler(async (req, res) => {
  const workshopCode = normalizeWorkshopCode(req.query.workshopCode, 'raw_grain');
  const includeDisabled = (req.user.role === 'viewer' || canWriteWorkshop(req.user, workshopCode)) && String(req.query.includeDisabled) === '1';
  const [rows] = await pool.query(
    `SELECT id,workshop_code AS workshopCode,name,sort_order AS sortOrder,status,created_at AS createdAt,updated_at AS updatedAt,
     (SELECT COUNT(*) FROM fermentation_knowledge_entries k2
       WHERE k2.process_stage=knowledge_process_stages.name
         AND k2.workshop_code=knowledge_process_stages.workshop_code
         AND k2.status='active') AS usageCount
     FROM knowledge_process_stages WHERE workshop_code=? ${includeDisabled ? '' : "AND status='active'"}
     ORDER BY status='active' DESC,sort_order ASC,id ASC`
    , [workshopCode]
  );
  res.json({ success: true, data: rows.map(row => ({ ...row, id: String(row.id), sortOrder: Number(row.sortOrder) || 0, usageCount: Number(row.usageCount) || 0 })) });
}));

router.get('/knowledge/tags', asyncHandler(async (req, res) => {
  const workshopCode = normalizeWorkshopCode(req.query.workshopCode, 'raw_grain');
  const includeDisabled = (req.user.role === 'viewer' || canWriteWorkshop(req.user, workshopCode)) && String(req.query.includeDisabled) === '1';
  const [rows] = await pool.query(
    `SELECT id, workshop_code AS workshopCode, name, sort_order AS sortOrder, status
     FROM knowledge_tags WHERE workshop_code=? ${includeDisabled ? '' : "AND status='active'"}
     ORDER BY status='active' DESC, sort_order ASC, name ASC`,
    [workshopCode]
  );
  res.json({ success: true, data: rows.map(row => ({ ...row, id: String(row.id), sortOrder: Number(row.sortOrder) || 0 })) });
}));

router.post('/knowledge/tags', requireAnyWorkshopEditor, asyncHandler(async (req, res) => {
  const workshopCode = normalizeWorkshopCode(req.body?.workshopCode, 'raw_grain');
  assertWorkshopWrite(req.user, workshopCode);
  const name = cleanText(req.body?.name, 60);
  if (!name) throw new ApiError(400, '请填写标签名称');
  try {
    const [result] = await pool.query(
      `INSERT INTO knowledge_tags (workshop_code, name, sort_order, status, created_by, created_by_name)
       VALUES (?, ?, 100, 'active', ?, ?)`,
      [workshopCode, name, Number(req.user.id) || null, req.user.displayName || req.user.username]
    );
    res.status(201).json({ success: true, msg: '标签已新增', data: { id: String(result.insertId) } });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') throw new ApiError(409, '该标签已存在');
    throw error;
  }
}));

router.delete('/knowledge/tags/:id', requireAnyWorkshopEditor, asyncHandler(async (req, res) => {
  const id = positiveInt(req.params.id, 0, Number.MAX_SAFE_INTEGER);
  const [[tag]] = await pool.query('SELECT workshop_code AS workshopCode FROM knowledge_tags WHERE id=? LIMIT 1', [id]);
  if (!tag) throw new ApiError(404, '标签不存在');
  assertWorkshopWrite(req.user, tag.workshopCode);
  await pool.query('DELETE FROM knowledge_tags WHERE id=?', [id]);
  res.json({ success: true, msg: '标签已从可选项中删除；已有知识上的标签文字会保留' });
}));

router.post('/knowledge/process-stages', requireAnyWorkshopEditor, asyncHandler(async (req, res) => {
  const workshopCode = normalizeWorkshopCode(req.body?.workshopCode, 'raw_grain');
  assertWorkshopWrite(req.user, workshopCode);
  const name = cleanText(req.body?.name, 80);
  const sortOrder = Math.min(Math.max(Number(req.body?.sortOrder) || 100, 0), 99999);
  if (!name) throw new ApiError(400, '请填写工序/区域名称');
  try {
    const [result] = await pool.query(
      `INSERT INTO knowledge_process_stages (workshop_code,name,sort_order,status,created_by,created_by_name)
       VALUES (?,?,?,'active',?,?)`,
      [workshopCode, name, sortOrder, Number(req.user.id) || null, req.user.displayName || req.user.username]
    );
    res.status(201).json({ success: true, msg: '工序/区域已新增', data: { id: String(result.insertId) } });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') throw new ApiError(409, '该工序/区域名称已存在');
    throw error;
  }
}));

router.patch('/knowledge/process-stages/:id', requireAnyWorkshopEditor, asyncHandler(async (req, res) => {
  const id = positiveInt(req.params.id, 0, Number.MAX_SAFE_INTEGER);
  const name = cleanText(req.body?.name, 80);
  const sortOrder = Math.min(Math.max(Number(req.body?.sortOrder) || 100, 0), 99999);
  const status = req.body?.status === 'disabled' ? 'disabled' : 'active';
  if (!id) throw new ApiError(400, '工序/区域ID无效');
  if (!name) throw new ApiError(400, '请填写工序/区域名称');
  try {
    const [[stage]] = await pool.query('SELECT workshop_code AS workshopCode FROM knowledge_process_stages WHERE id=? LIMIT 1', [id]);
    if (!stage) throw new ApiError(404, '工序/区域不存在');
    assertWorkshopWrite(req.user, stage.workshopCode);
    const [result] = await pool.query(
      'UPDATE knowledge_process_stages SET name=?,sort_order=?,status=? WHERE id=?',
      [name, sortOrder, status, id]
    );
    if (!result.affectedRows) throw new ApiError(404, '工序/区域不存在');
    res.json({ success: true, msg: '工序/区域配置已保存' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') throw new ApiError(409, '该工序/区域名称已存在');
    throw error;
  }
}));

router.delete('/knowledge/process-stages/:id', requireAnyWorkshopEditor, asyncHandler(async (req, res) => {
  const id = positiveInt(req.params.id, 0, Number.MAX_SAFE_INTEGER);
  if (!id) throw new ApiError(400, '工序/区域ID无效');
  const [[stage]] = await pool.query('SELECT name,workshop_code AS workshopCode FROM knowledge_process_stages WHERE id=? LIMIT 1', [id]);
  if (!stage) throw new ApiError(404, '工序/区域不存在');
  assertWorkshopWrite(req.user, stage.workshopCode);
  await pool.query(
    'UPDATE fermentation_knowledge_entries SET process_stage=NULL WHERE process_stage=? AND workshop_code=?',
    [stage.name, stage.workshopCode]
  );
  await pool.query('DELETE FROM knowledge_process_stages WHERE id=?', [id]);
  res.json({ success: true, msg: '工序/区域已删除' });
}));

router.put('/knowledge/process-stages', requireAnyWorkshopEditor, asyncHandler(async (req, res) => {
  const workshopCode = normalizeWorkshopCode(req.body?.workshopCode, 'raw_grain');
  assertWorkshopWrite(req.user, workshopCode);
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!items.length) throw new ApiError(400, '没有需要保存的工序/区域');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    for (const item of items) {
      const id = positiveInt(item.id, 0, Number.MAX_SAFE_INTEGER);
      const name = cleanText(item.name, 80);
      const sortOrder = Math.min(Math.max(Number(item.sortOrder) || 100, 0), 99999);
      const status = item.status === 'disabled' ? 'disabled' : 'active';
      if (!id || !name) throw new ApiError(400, '工序/区域配置不完整');
      const [result] = await connection.query(
        'UPDATE knowledge_process_stages SET name=?,sort_order=?,status=? WHERE id=? AND workshop_code=?',
        [name, sortOrder, status, id, workshopCode]
      );
      if (!result.affectedRows) throw new ApiError(404, `工序/区域${id}不存在`);
    }
    await connection.commit();
    res.json({ success: true, msg: `已保存${items.length}项工序/区域配置` });
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') throw new ApiError(409, '工序/区域名称重复');
    throw error;
  } finally { connection.release(); }
}));

router.get('/knowledge', asyncHandler(async (req, res) => {
  const page = positiveInt(req.query.page, 1, 100000);
  const pageSize = positiveInt(req.query.pageSize, 12, 50);
  const type = ['document', 'fault'].includes(req.query.type) ? req.query.type : '';
  const category = cleanText(req.query.category, 80);
  const stage = cleanText(req.query.processStage, 80);
  const search = cleanText(req.query.search, 100);
  const conditions = ["k.status='active'"];
  const params = [];
  if (req.query.workshopCode) { conditions.push('k.workshop_code=?'); params.push(normalizeWorkshopCode(req.query.workshopCode)); }
  if (type) { conditions.push('entry_type=?'); params.push(type); }
  if (category) { conditions.push('category=?'); params.push(category); }
  if (stage) { conditions.push('process_stage=?'); params.push(stage); }
  if (search) {
    conditions.push(`(title LIKE ? OR summary LIKE ? OR equipment_name LIKE ? OR fault_symptom LIKE ?
      OR fault_cause LIKE ? OR solution LIKE ? OR content_text LIKE ? OR tags LIKE ?)`);
    const keyword = `%${search}%`;
    params.push(keyword, keyword, keyword, keyword, keyword, keyword, keyword, keyword);
  }
  const where = `WHERE ${conditions.join(' AND ')}`;
  const [countResult, listResult] = await Promise.all([
    pool.query(`SELECT COUNT(*) AS total FROM fermentation_knowledge_entries k ${where}`, params),
    pool.query(`${ENTRY_LIST_SELECT} ${where} ORDER BY k.created_at DESC, k.id DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize])
  ]);
  const countRow = countResult[0][0] || {};
  const rows = listResult[0];
  res.json({ success: true, data: rows.map(row => toEntry(row, req.user)), total: Number(countRow.total) || 0, page, pageSize });
}));

router.get('/knowledge/:id', asyncHandler(async (req, res) => {
  const id = positiveInt(req.params.id, 0, Number.MAX_SAFE_INTEGER);
  if (!id) throw new ApiError(400, '知识条目ID无效');
  const [rows] = await pool.query(`${ENTRY_SELECT} WHERE k.id=? AND k.status='active' LIMIT 1`, [id]);
  if (!rows.length) throw new ApiError(404, '知识条目不存在或已删除');
  await pool.query('UPDATE fermentation_knowledge_entries SET view_count=view_count+1 WHERE id=?', [id]);
  rows[0].viewCount = Number(rows[0].viewCount) + 1;
  res.json({ success: true, data: toEntry(rows[0], req.user) });
}));

router.get('/knowledge/:id/revisions', asyncHandler(async (req, res) => {
  const id = positiveInt(req.params.id, 0, Number.MAX_SAFE_INTEGER);
  if (!id) throw new ApiError(400, '知识条目ID无效');
  const [[entry]] = await pool.query("SELECT id,revision_no AS revisionNo FROM fermentation_knowledge_entries WHERE id=? AND status='active' LIMIT 1", [id]);
  if (!entry) throw new ApiError(404, '知识条目不存在或已删除');
  const [rows] = await pool.query(
    `SELECT revision_no AS revisionNo,title,original_filename AS originalFilename,file_size AS fileSize,
            index_status AS indexStatus,change_kind AS changeKind,change_summary AS changeSummary,
            created_by_name AS createdByName,created_at AS createdAt
     FROM knowledge_entry_revisions WHERE entry_id=? ORDER BY revision_no DESC`,
    [id]
  );
  res.json({
    success: true,
    data: rows.map(row => ({
      ...row,
      revisionNo: Number(row.revisionNo), fileSize: Number(row.fileSize) || 0,
      originalFilename: normalizeUploadFilename(row.originalFilename)
    })),
    currentRevisionNo: Number(entry.revisionNo) || 1
  });
}));

router.get('/knowledge/:id/revisions/:revisionNo', asyncHandler(async (req, res) => {
  const id = positiveInt(req.params.id, 0, Number.MAX_SAFE_INTEGER);
  const revisionNo = positiveInt(req.params.revisionNo, 0, Number.MAX_SAFE_INTEGER);
  const [[active]] = await pool.query("SELECT id FROM fermentation_knowledge_entries WHERE id=? AND status='active' LIMIT 1", [id]);
  if (!active) throw new ApiError(404, '知识条目不存在或已删除');
  const [rows] = await pool.query(
    `SELECT entry_id AS id,revision_no AS revisionNo,workshop_code AS workshopCode,entry_type AS entryType,
            title,category,process_stage AS processStage,equipment_name AS equipmentName,summary,
            fault_symptom AS faultSymptom,fault_cause AS faultCause,solution,preventive_action AS preventiveAction,
            content_text AS contentText,tags,original_filename AS originalFilename,stored_filename AS storedFilename,
            mime_type AS mimeType,file_size AS fileSize,index_status AS indexStatus,index_message AS indexMessage,
            indexed_at AS indexedAt,change_kind AS changeKind,change_summary AS changeSummary,
            created_by_name AS createdByName,created_at AS createdAt
     FROM knowledge_entry_revisions WHERE entry_id=? AND revision_no=? LIMIT 1`,
    [id, revisionNo]
  );
  if (!rows.length) throw new ApiError(404, '该历史版本不存在');
  const row = rows[0];
  res.json({ success: true, data: {
    ...row, id: String(row.id), revisionNo: Number(row.revisionNo), fileSize: Number(row.fileSize) || 0,
    tags: row.tags ? row.tags.split(',').filter(Boolean) : [], hasFile: Boolean(row.storedFilename),
    originalFilename: normalizeUploadFilename(row.originalFilename)
  } });
}));

router.put('/knowledge/:id', authorizeKnowledgeManage, uploadLimiter, receiveUpload, asyncHandler(async (req, res) => {
  const id = positiveInt(req.params.id, 0, Number.MAX_SAFE_INTEGER);
  if (!id) { removeUploadedFile(req.file); throw new ApiError(400, '知识条目ID无效'); }
  const payload = knowledgePayload(req.body);
  const newFileIndex = req.file ? await buildIndexResult(req.file, payload.contentText) : null;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[current]] = await connection.query(
      `SELECT id,workshop_code AS workshopCode,entry_type AS entryType,title,category,process_stage AS processStage,
              equipment_name AS equipmentName,summary,fault_symptom AS faultSymptom,fault_cause AS faultCause,
              solution,preventive_action AS preventiveAction,content_text AS contentText,tags,
              original_filename AS originalFilename,stored_filename AS storedFilename,mime_type AS mimeType,
              file_size AS fileSize,uploaded_by AS uploadedBy,revision_no AS revisionNo,
              index_status AS indexStatus,index_message AS indexMessage,indexed_at AS indexedAt
       FROM fermentation_knowledge_entries WHERE id=? AND status='active' FOR UPDATE`,
      [id]
    );
    if (!current) throw new ApiError(404, '知识条目不存在或已删除');
    assertManageEntry(current, req.user);
    const workshopCode = req.user.role === 'admin'
      ? normalizeWorkshopCode(req.body?.workshopCode, current.workshopCode)
      : current.workshopCode;
    if (!payload.title) throw new ApiError(400, '请填写知识标题');
    if (!payload.category) throw new ApiError(400, '请选择知识分类');
    if (payload.entryType === 'document' && !req.file && !current.storedFilename) throw new ApiError(400, '资料文档必须保留或上传附件');
    if (payload.entryType === 'fault' && (!payload.faultSymptom || !payload.solution)) {
      throw new ApiError(400, '故障知识必须填写故障现象和处理方法');
    }
    await requireActiveProcessStage(payload.processStage, workshopCode, connection);
    const fallbackName = req.file?.originalname || current.originalFilename || '';
    const requestedName = Object.prototype.hasOwnProperty.call(req.body || {}, 'originalFilename')
      ? req.body.originalFilename : fallbackName;
    const originalFilename = fallbackName ? safeOriginalFilename(requestedName, fallbackName) : '';
    const keepsDerivedText = !req.file && !Object.prototype.hasOwnProperty.call(req.body || {}, 'contentText');
    const indexResult = newFileIndex || (keepsDerivedText ? {
      contentText: current.contentText || '', indexStatus: current.indexStatus || 'pending',
      indexMessage: current.indexMessage || null, indexedAt: current.indexedAt || null
    } : await buildIndexResult(null, payload.contentText));
    const nextRevision = (Number(current.revisionNo) || 1) + 1;
    await snapshotEntry(connection, id, Number(current.revisionNo) || 1, req.user, req.file ? 'replace_attachment' : 'edit', req.body?.changeSummary);
    await connection.query(
      `UPDATE fermentation_knowledge_entries SET workshop_code=?,entry_type=?,title=?,category=?,process_stage=?,
       equipment_name=?,summary=?,fault_symptom=?,fault_cause=?,solution=?,preventive_action=?,content_text=?,tags=?,
       original_filename=?,stored_filename=?,mime_type=?,file_size=?,revision_no=?,index_status=?,index_message=?,indexed_at=?
       WHERE id=?`,
      [workshopCode, payload.entryType, payload.title, payload.category, payload.processStage || null,
        payload.equipmentName || null, payload.summary || null, payload.faultSymptom || null,
        payload.faultCause || null, payload.solution || null, payload.preventiveAction || null,
        indexResult.contentText || null, payload.tags || null, originalFilename || null,
        req.file?.filename || current.storedFilename || null, req.file?.mimetype || current.mimeType || null,
        req.file?.size || current.fileSize || null, nextRevision, indexResult.indexStatus,
        indexResult.indexMessage || null, indexResult.indexedAt || null, id]
    );
    await connection.commit();
    res.json({
      success: true,
      msg: indexResult.indexStatus === 'failed' ? '知识已修订，新附件索引可稍后重试' : `知识已修订为 V${nextRevision}`,
      data: { id: String(id), revisionNo: nextRevision, indexStatus: indexResult.indexStatus }
    });
  } catch (error) {
    await connection.rollback();
    removeUploadedFile(req.file);
    throw error;
  } finally { connection.release(); }
}));

router.post('/knowledge/:id/reindex', asyncHandler(async (req, res) => {
  const id = positiveInt(req.params.id, 0, Number.MAX_SAFE_INTEGER);
  const [[item]] = await pool.query(
    `SELECT id,uploaded_by AS uploadedBy,stored_filename AS storedFilename,original_filename AS originalFilename,
            content_text AS contentText,revision_no AS revisionNo
     FROM fermentation_knowledge_entries WHERE id=? AND status='active' LIMIT 1`, [id]
  );
  if (!item) throw new ApiError(404, '知识条目不存在或已删除');
  assertManageEntry(item, req.user);
  let result;
  if (!item.storedFilename) result = await buildIndexResult(null, item.contentText);
  else {
    const fullPath = path.resolve(uploadDir, item.storedFilename);
    if (path.dirname(fullPath) !== path.resolve(uploadDir) || !fs.existsSync(fullPath)) {
      result = { contentText: item.contentText || '', indexStatus: 'failed', indexMessage: '附件文件不存在', indexedAt: null };
    } else result = await buildIndexResult({ path: fullPath, originalname: item.originalFilename }, '');
  }
  const [updated] = await pool.query(
    `UPDATE fermentation_knowledge_entries SET content_text=?,index_status=?,index_message=?,indexed_at=?
     WHERE id=? AND revision_no=?`,
    [result.indexStatus === 'failed' ? (item.contentText || null) : (result.contentText || null),
      result.indexStatus, result.indexMessage || null, result.indexedAt || null, id, item.revisionNo]
  );
  if (!updated.affectedRows) throw new ApiError(409, '知识在重建索引时被修订，请刷新后重试');
  res.json({
    success: true,
    msg: result.indexStatus === 'ready' ? '附件全文索引已更新' : (result.indexStatus === 'empty' ? '附件中未提取到可检索文字' : '索引更新失败，可在补齐转换/OCR依赖后重试'),
    data: { indexStatus: result.indexStatus, indexMessage: result.indexMessage || '' }
  });
}));

router.post('/knowledge/:id/revisions/:revisionNo/restore', asyncHandler(async (req, res) => {
  const id = positiveInt(req.params.id, 0, Number.MAX_SAFE_INTEGER);
  const revisionNo = positiveInt(req.params.revisionNo, 0, Number.MAX_SAFE_INTEGER);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[current]] = await connection.query(
      `SELECT id,uploaded_by AS uploadedBy,revision_no AS revisionNo FROM fermentation_knowledge_entries
       WHERE id=? AND status='active' FOR UPDATE`, [id]
    );
    if (!current) throw new ApiError(404, '知识条目不存在或已删除');
    assertManageEntry(current, req.user);
    const [[revision]] = await connection.query(
      `SELECT * FROM knowledge_entry_revisions WHERE entry_id=? AND revision_no=? LIMIT 1`, [id, revisionNo]
    );
    if (!revision) throw new ApiError(404, '该历史版本不存在');
    const nextRevision = (Number(current.revisionNo) || 1) + 1;
    await snapshotEntry(connection, id, Number(current.revisionNo) || 1, req.user, 'restore', `恢复 V${revisionNo} 前的快照`);
    await connection.query(
      `UPDATE fermentation_knowledge_entries SET workshop_code=?,entry_type=?,title=?,category=?,process_stage=?,
       equipment_name=?,summary=?,fault_symptom=?,fault_cause=?,solution=?,preventive_action=?,content_text=?,tags=?,
       original_filename=?,stored_filename=?,mime_type=?,file_size=?,revision_no=?,index_status=?,index_message=?,indexed_at=?
       WHERE id=?`,
      [revision.workshop_code, revision.entry_type, revision.title, revision.category, revision.process_stage,
        revision.equipment_name, revision.summary, revision.fault_symptom, revision.fault_cause, revision.solution,
        revision.preventive_action, revision.content_text, revision.tags, revision.original_filename,
        revision.stored_filename, revision.mime_type, revision.file_size, nextRevision, revision.index_status,
        revision.index_message, revision.indexed_at, id]
    );
    await connection.commit();
    res.json({ success: true, msg: `已将 V${revisionNo} 恢复为当前 V${nextRevision}`, data: { revisionNo: nextRevision } });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
}));

router.post('/knowledge', requireAnyWorkshopEditor, uploadLimiter, receiveUpload, asyncHandler(async (req, res) => {
  const payload = knowledgePayload(req.body);
  try {
    const workshopCode = normalizeWorkshopCode(req.body?.workshopCode, 'raw_grain');
    assertWorkshopWrite(req.user, workshopCode);
    if (!payload.title) throw new ApiError(400, '请填写知识标题');
    if (!payload.category) throw new ApiError(400, '请选择知识分类');
    if (payload.entryType === 'document' && !req.file) throw new ApiError(400, '请选择需要上传的资料文件');
    if (payload.entryType === 'fault' && (!payload.faultSymptom || !payload.solution)) {
      throw new ApiError(400, '故障知识必须填写故障现象和处理方法');
    }
    await requireActiveProcessStage(payload.processStage, workshopCode);

    const indexResult = await buildIndexResult(req.file, payload.contentText);

    const [result] = await pool.query(
      `INSERT INTO fermentation_knowledge_entries
       (workshop_code,entry_type,title,category,process_stage,equipment_name,summary,fault_symptom,fault_cause,
        solution,preventive_action,content_text,tags,original_filename,stored_filename,mime_type,file_size,
        uploaded_by,uploaded_by_name,revision_no,index_status,index_message,indexed_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [workshopCode, payload.entryType, payload.title, payload.category, payload.processStage || null,
        payload.equipmentName || null, payload.summary || null, payload.faultSymptom || null,
        payload.faultCause || null, payload.solution || null, payload.preventiveAction || null,
        indexResult.contentText || null, payload.tags || null, req.file?.originalname || null,
        req.file?.filename || null, req.file?.mimetype || null, req.file?.size || null,
        Number(req.user.id) || null, req.user.displayName || req.user.username,
        1, indexResult.indexStatus, indexResult.indexMessage, indexResult.indexedAt]
    );
    res.status(201).json({
      success: true,
      msg: indexResult.indexStatus === 'failed' ? '知识已保存，附件全文索引可稍后重试' : '知识已提交',
      data: { id: String(result.insertId), indexStatus: indexResult.indexStatus }
    });
  } catch (error) {
    removeUploadedFile(req.file);
    throw error;
  }
}));

router.get('/knowledge/:id/download', asyncHandler(async (req, res) => {
  const id = positiveInt(req.params.id, 0, Number.MAX_SAFE_INTEGER);
  const [rows] = await pool.query(
    `SELECT original_filename AS originalFilename, stored_filename AS storedFilename
     FROM fermentation_knowledge_entries WHERE id=? AND status='active' LIMIT 1`, [id]
  );
  const item = rows[0];
  if (!item?.storedFilename) throw new ApiError(404, '该知识条目没有可下载附件');
  const fullPath = path.resolve(uploadDir, item.storedFilename);
  if (path.dirname(fullPath) !== path.resolve(uploadDir) || !fs.existsSync(fullPath)) throw new ApiError(404, '附件文件不存在');
  res.download(fullPath, normalizeUploadFilename(item.originalFilename) || 'attachment');
}));

router.get('/knowledge/:id/preview', asyncHandler(async (req, res) => {
  const id = positiveInt(req.params.id, 0, Number.MAX_SAFE_INTEGER);
  const [rows] = await pool.query(
    `SELECT original_filename AS originalFilename, stored_filename AS storedFilename, mime_type AS mimeType
     FROM fermentation_knowledge_entries WHERE id=? AND status='active' LIMIT 1`, [id]
  );
  const item = rows[0];
  if (!item?.storedFilename) throw new ApiError(404, '该知识条目没有可预览附件');
  const fullPath = path.resolve(uploadDir, item.storedFilename);
  if (path.dirname(fullPath) !== path.resolve(uploadDir) || !fs.existsSync(fullPath)) throw new ApiError(404, '附件文件不存在');
  const originalFilename = normalizeUploadFilename(item.originalFilename);
  await sendDocumentPreview(res, fullPath, originalFilename);
}));

router.delete('/knowledge/:id', asyncHandler(async (req, res) => {
  const id = positiveInt(req.params.id, 0, Number.MAX_SAFE_INTEGER);
  const connection = await pool.getConnection();
  let storedFilenames = [];
  try {
    await connection.beginTransaction();
    const [[item]] = await connection.query('SELECT stored_filename AS storedFilename, uploaded_by AS uploadedBy,revision_no AS revision FROM fermentation_knowledge_entries WHERE id=? FOR UPDATE', [id]);
    if (!item) throw new ApiError(404, '知识条目不存在');
    if (req.body?.revision!==undefined && Number(req.body.revision)!==Number(item.revision)) throw new ApiError(409, '知识已更新，请刷新数据管理后核对删除');
    if (req.user.role !== 'admin' && Number(item.uploadedBy) !== Number(req.user.id)) {
      throw new ApiError(403, '只能删除自己创建或上传的知识');
    }
    const [revisionFiles] = await connection.query(
      'SELECT stored_filename AS storedFilename FROM knowledge_entry_revisions WHERE entry_id=? AND stored_filename IS NOT NULL',
      [id]
    );
    storedFilenames = [...new Set([item.storedFilename, ...revisionFiles.map(row => row.storedFilename)].filter(Boolean))];
    await connection.query('DELETE FROM fermentation_knowledge_entries WHERE id=?', [id]);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
  const cleanupWarnings = [];
  for (const storedFilename of storedFilenames) {
    const root = path.resolve(uploadDir);
    const fullPath = path.resolve(root, storedFilename);
    if (path.dirname(fullPath) !== root) { cleanupWarnings.push(storedFilename); continue; }
    try { await fs.promises.unlink(fullPath); }
    catch (error) { if (error.code !== 'ENOENT') cleanupWarnings.push(storedFilename); }
  }
  res.json({
    success: true,
    msg: cleanupWarnings.length ? '知识条目已删除，个别历史附件需管理员清理' : '知识条目及历史附件已彻底删除',
    data: { cleanupWarnings }
  });
}));

module.exports = router;
