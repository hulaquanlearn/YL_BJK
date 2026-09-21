const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const config = require('../config');
const { pool } = require('../db');
const { ApiError, asyncHandler, positiveInt } = require('../utils');
const { parsePlcFile } = require('../plc-parser');
const { claimHash, assertClaim, excludedJobIds } = require('../plc-agent-lease');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { files: 1, fileSize: config.plc.maxFileSize } }).single('result');

// 领取后超过该时长未回传结果，视为解析节点已中断，任务重新开放领取。
const CLAIM_TIMEOUT_MINUTES = 30;

// 待领取项目：等待本机解析、部分解析且尚无 .plcai 结果，或认领超时未被释放。
const CLAIMABLE_SQL = `(
  parse_status='requires_extractor'
  OR (
    parse_status='partial'
    AND NOT EXISTS (SELECT 1 FROM plc_project_files parsed_result
      WHERE parsed_result.project_id=plc_projects.id AND parsed_result.file_type='.plcai')
  )
  OR (
    parse_status='extracting'
    AND extracting_since IS NOT NULL
    AND extracting_since < NOW() - INTERVAL ${CLAIM_TIMEOUT_MINUTES} MINUTE
  )
)`;

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
  if (req.query.protocol !== '2') throw new ApiError(426, '请更新 Windows 解析助手后重试');
  const excluded = excludedJobIds(req.query.exclude);
  const claimToken = crypto.randomBytes(32).toString('hex');
  const version = ['V16', 'V17'].includes(req.query.version) ? req.query.version : '';
  if (!version) throw new ApiError(400, 'version 必须是 V16 或 V17');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    // SKIP LOCKED 保证多台解析节点同时轮询时不会领取同一个项目。
    const [claimed] = await connection.query(`SELECT id FROM plc_projects
      WHERE status='active' AND program_family='siemens_tia' AND ${CLAIMABLE_SQL} AND tia_version=? ${excluded.length ? 'AND id NOT IN (' + excluded.map(() => '?').join(',') + ')' : ''}
        AND EXISTS (SELECT 1 FROM plc_project_files f WHERE f.project_id=plc_projects.id AND f.file_type IN ('.ap16','.ap17'))
      ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED`, [version, ...excluded]);
    if (!claimed.length) {
      await connection.commit();
      return res.json({ success: true, data: null });
    }
    await connection.query(`UPDATE plc_projects SET parse_status='extracting', extracting_since=NOW(), extracting_claim_hash=? WHERE id=?`, [claimHash(claimToken), claimed[0].id]);
    const [[project]] = await connection.query(`SELECT id,name,tia_version AS tiaVersion,plant_area AS plantArea
      FROM plc_projects WHERE id=? LIMIT 1`, [claimed[0].id]);
    const [entries] = await connection.query(`SELECT id,original_filename AS originalFilename,sha256
      FROM plc_project_files WHERE project_id=? AND file_type IN ('.ap16','.ap17') ORDER BY id`, [project.id]);
    await connection.commit();
    res.json({ success: true, data: { ...project, claimToken, heartbeatSeconds: 60, id: String(project.id), entries: entries.map(item => ({ ...item, id: String(item.id) })) } });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

// Heartbeats and release are fenced by the current claim, including after timeout/reclaim.
for (const action of ['heartbeat', 'release']) {
  router.post('/jobs/:id/' + action, asyncHandler(async (req, res) => {
    const projectId = positiveInt(req.params.id, 0, Number.MAX_SAFE_INTEGER);
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [[project]] = await connection.query(`SELECT parse_status AS parseStatus, extracting_claim_hash AS claimHash,
        (extracting_since >= NOW() - INTERVAL 30 MINUTE) AS leaseActive FROM plc_projects WHERE id=? AND status='active' FOR UPDATE`, [projectId]);
      if (!project) throw new ApiError(404, '解析任务不存在');
      assertClaim(project, req.get('x-program-claim-token'));
      if (action === 'heartbeat') await connection.query('UPDATE plc_projects SET extracting_since=NOW() WHERE id=?', [projectId]);
      else await connection.query(`UPDATE plc_projects SET parse_status='requires_extractor', extracting_since=NULL, extracting_claim_hash=NULL WHERE id=?`, [projectId]);
      await connection.commit();
      res.json({success:true});
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
  }));
}

router.post('/jobs/:id/result', (req, res, next) => upload(req, res, error => error ? next(new ApiError(400, error.message)) : next()), asyncHandler(async (req, res) => {
  const projectId = positiveInt(req.params.id, 0, Number.MAX_SAFE_INTEGER);
  if (!req.file) throw new ApiError(400, '缺少 .plcai 解析结果');
  const parsed = parsePlcFile(req.file.buffer, req.file.originalname);
  if (!parsed.items.length) throw new ApiError(400, '解析结果中没有程序条目');
  const connection = await pool.getConnection();
  const storedFilename = `${Date.now()}-${crypto.randomBytes(12).toString('hex')}.plcai`;
  const target = path.join(config.plc.uploadDir, storedFilename);
  const sha256 = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
  let obsoleteFiles = [];
  try {
    await connection.beginTransaction();
    const [projects] = await connection.query(`SELECT id,parse_status AS parseStatus,extracting_claim_hash AS claimHash,
      (extracting_since >= NOW() - INTERVAL 30 MINUTE) AS leaseActive FROM plc_projects
      WHERE id=? AND status='active' AND program_family='siemens_tia' FOR UPDATE`, [projectId]);
    if (!projects.length) throw new ApiError(404, '解析任务不存在');
    assertClaim(projects[0], req.get('x-program-claim-token'), false);
    if (projects[0].parseStatus === 'extracting') assertClaim(projects[0], req.get('x-program-claim-token'));
    const [[existingResult]] = await connection.query(
      "SELECT id FROM plc_project_files WHERE project_id=? AND file_type='.plcai' AND sha256=? LIMIT 1",
      [projectId, sha256]
    );
    if (existingResult) {
      // 认领后重复提交：本次内容与已入库结果一致，按实际解析结果恢复项目状态。
      if (projects[0].parseStatus === 'extracting') {
        await connection.query(`UPDATE plc_projects SET parse_status=?, extracting_since=NULL WHERE id=?`,
          [parsed.warnings?.length ? 'partial' : 'ready', projectId]);
      }
      await connection.commit();
      res.json({ success: true, msg: '该解析结果已接收，未重复写入', data: { projectId: String(projectId), duplicate: true } });
      return;
    }
    assertClaim(projects[0], req.get('x-program-claim-token'));
    if (projects[0].parseStatus !== 'extracting') {
      throw new ApiError(409, '该项目已完成解析，请在页面新建项目后再导入新版本');
    }
    const [oldResults] = await connection.query(
      "SELECT stored_filename AS storedFilename FROM plc_project_files WHERE project_id=? AND file_type='.plcai' FOR UPDATE",
      [projectId]
    );
    obsoleteFiles = oldResults.map(item => item.storedFilename).filter(Boolean);
    await fs.promises.mkdir(config.plc.uploadDir, { recursive: true });
    await fs.promises.writeFile(target, req.file.buffer, { flag: 'wx' });
    await connection.query('DELETE FROM plc_analysis_runs WHERE project_id=?', [projectId]);
    await connection.query('DELETE FROM plc_program_items WHERE project_id=?', [projectId]);
    await connection.query("DELETE FROM plc_project_files WHERE project_id=? AND file_type='.plcai'", [projectId]);
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
    await connection.query(`UPDATE plc_projects SET parse_status=?,parse_message=?,extracting_since=NULL,
      cpu_model=COALESCE(NULLIF(?,''),cpu_model),platform_metadata=?,
      item_count=?,block_count=?,tag_count=?,io_count=?,alarm_count=?,protected_count=? WHERE id=?`,
      [parseStatus, parseMessage, String(projectMetadata.cpuModel || '').slice(0, 120) || null,
        JSON.stringify(projectMetadata), parsed.items.length, count('block'), count('tag'), count('io'),
        count('alarm'), protectedCount, projectId]);
    await connection.commit();
    for (const filename of obsoleteFiles) {
      const fullPath = path.resolve(config.plc.uploadDir, filename);
      if (path.dirname(fullPath) === path.resolve(config.plc.uploadDir)) await fs.promises.unlink(fullPath).catch(() => {});
    }
    res.json({ success: true, data: { projectId: String(projectId), itemCount: parsed.items.length } });
  } catch (error) {
    await connection.rollback();
    await fs.promises.unlink(target).catch(() => {});
    throw error;
  } finally { connection.release(); }
}));

module.exports = router;
