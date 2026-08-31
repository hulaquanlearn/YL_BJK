const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const config = require('../config');
const { pool } = require('../db');
const { ApiError, asyncHandler, positiveInt } = require('../utils');
const { parsePlcFile } = require('../plc-parser');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { files: 1, fileSize: config.plc.maxFileSize } }).single('result');

function sameToken(actual, expected) {
  const left = Buffer.from(String(actual || ''));
  const right = Buffer.from(String(expected || ''));
  return left.length === right.length && left.length >= 32 && crypto.timingSafeEqual(left, right);
}

router.use((req, _res, next) => {
  if (!config.plc.agentToken) return next(new ApiError(503, 'PROGRAM_AGENT_NOT_CONFIGURED'));
  if (!sameToken(req.get('x-program-agent-token'), config.plc.agentToken)) return next(new ApiError(401, 'PROGRAM_AGENT_UNAUTHORIZED'));
  next();
});

router.get('/jobs/next', asyncHandler(async (req, res) => {
  const version = ['V16', 'V17'].includes(req.query.version) ? req.query.version : '';
  if (!version) throw new ApiError(400, 'version 必须是 V16 或 V17');
  const [projects] = await pool.query(`SELECT id,name,tia_version AS tiaVersion,plant_area AS plantArea
    FROM plc_projects WHERE status='active' AND program_family='siemens_tia'
      AND parse_status='requires_extractor' AND tia_version=?
      AND EXISTS (SELECT 1 FROM plc_project_files f WHERE f.project_id=plc_projects.id AND f.file_type IN ('.ap16','.ap17'))
    ORDER BY created_at,id LIMIT 1`, [version]);
  if (!projects.length) return res.json({ success: true, data: null });
  const project = projects[0];
  const [entries] = await pool.query(`SELECT id,original_filename AS originalFilename,sha256
    FROM plc_project_files WHERE project_id=? AND file_type IN ('.ap16','.ap17') ORDER BY id`, [project.id]);
  res.json({ success: true, data: { ...project, id: String(project.id), entries: entries.map(item => ({ ...item, id: String(item.id) })) } });
}));

router.post('/jobs/:id/result', (req, res, next) => upload(req, res, error => error ? next(new ApiError(400, error.message)) : next()), asyncHandler(async (req, res) => {
  const projectId = positiveInt(req.params.id, 0, Number.MAX_SAFE_INTEGER);
  if (!req.file) throw new ApiError(400, '缺少 .plcai 解析结果');
  const parsed = parsePlcFile(req.file.buffer, req.file.originalname);
  if (!parsed.items.length) throw new ApiError(400, '解析结果中没有程序条目');
  const connection = await pool.getConnection();
  const storedFilename = `${Date.now()}-${crypto.randomBytes(12).toString('hex')}.plcai`;
  const target = path.join(config.plc.uploadDir, storedFilename);
  try {
    await connection.beginTransaction();
    const [projects] = await connection.query(`SELECT id FROM plc_projects WHERE id=? AND status='active' AND program_family='siemens_tia' LIMIT 1`, [projectId]);
    if (!projects.length) throw new ApiError(404, '解析任务不存在');
    await fs.promises.mkdir(config.plc.uploadDir, { recursive: true });
    await fs.promises.writeFile(target, req.file.buffer, { flag: 'wx' });
    const sha256 = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
    await connection.query(`INSERT INTO plc_project_files
      (project_id,original_filename,stored_filename,file_type,file_size,sha256,parse_status,parse_message)
      VALUES (?,?,?,?,?,?,?,NULL)`, [projectId, req.file.originalname.slice(0, 255), storedFilename, '.plcai', req.file.size, sha256, 'parsed']);
    for (const item of parsed.items) {
      await connection.query(`INSERT INTO plc_program_items
        (project_id,item_type,name,block_type,block_number,language,network_no,address,data_type,
         comment_text,content_text,source_path,source_ref,is_protected,metadata_json)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [projectId, item.itemType, item.name, item.blockType || null,
        item.blockNumber || null, item.language || null, item.networkNo || null, item.address || null,
        item.dataType || null, item.commentText || null, item.contentText || null, item.sourcePath || null,
        item.sourceRef || null, item.isProtected ? 1 : 0, JSON.stringify(item.metadata || {})]);
    }
    const count = type => parsed.items.filter(item => item.itemType === type).length;
    const protectedCount = parsed.items.filter(item => item.isProtected).length;
    const parseStatus = parsed.warnings?.length ? 'partial' : 'ready';
    const parseMessage = parsed.warnings?.length ? `解析节点报告 ${parsed.warnings.length} 条导出警告，结果不完整；请修复 TIA 编译一致性后重新解析` : null;
    const projectMetadata = parsed.projectMetadata || {};
    await connection.query(`UPDATE plc_projects SET parse_status=?,parse_message=?,
      cpu_model=COALESCE(NULLIF(?,''),cpu_model),platform_metadata=?,
      item_count=?,block_count=?,tag_count=?,io_count=?,alarm_count=?,protected_count=? WHERE id=?`,
      [parseStatus, parseMessage, String(projectMetadata.cpuModel || '').slice(0, 120) || null,
        JSON.stringify(projectMetadata), parsed.items.length, count('block'), count('tag'), count('io'),
        count('alarm'), protectedCount, projectId]);
    await connection.commit();
    res.json({ success: true, data: { projectId: String(projectId), itemCount: parsed.items.length } });
  } catch (error) {
    await connection.rollback();
    await fs.promises.unlink(target).catch(() => {});
    throw error;
  } finally { connection.release(); }
}));

module.exports = router;
