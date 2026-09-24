const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const config = require('./config');
const { ApiError } = require('./utils');
const { assertAssetScope, withPartAssetWrite } = require('./part-asset-permissions');

const normalize = value => String(value || '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fields = 'id,name,keywords,model_url AS modelUrl';
const regularFile = filename => { try { return fs.statSync(filename).isFile(); } catch { return false; } };

function modelFileAvailable(modelUrl) {
  const url = String(modelUrl || '');
  if (/^\/uploads\/part-models\/[a-zA-Z0-9_.-]+\.glb$/.test(url)) {
    return regularFile(path.join(config.parts.modelDir, path.basename(url)));
  }
  if (!/^\/models\/(?:categories|reference-20260904)\/[a-zA-Z0-9_-]+\.glb$/.test(url)) return false;
  const roots = process.env.MODEL_ASSETS_DIR ? [path.resolve(process.env.MODEL_ASSETS_DIR)] : [
    path.resolve(__dirname, '../../web/dist'),
    path.resolve(__dirname, '../../spare-parts-web-release/public')
  ];
  return roots.some(root => regularFile(path.join(root, url.slice(1))));
}

function modelTerms(model) {
  return [...new Set([model.name, ...String(model.name || '').split(/[/、]/), ...String(model.keywords || '').split(/[,，;；\n]/)]
    .map(normalize).filter(term => term.length >= 2))];
}

function containsTerm(text, term) {
  if (/[\u3400-\u9fff]/.test(term)) return text.includes(term);
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, 'i').test(text);
}

function shapeReview(partText, modelName) {
  const risks = [
    [/钢丝绳/, /电缆|电线/, '钢丝绳与电缆形状不同'],
    [/滤袋|布筒/, /滤网|筛网|筛片/, '滤袋与滤网形状不同'],
    [/爆破片/, /阀/, '爆破片不能直接使用阀门模型'],
    [/纠偏装置|液压缸/, /气缸/, '液压或纠偏总成需核对实际形状'],
    [/带座轴承|轴承座|轴承单元|\buc[pft]\d/i, /轴承/, '带座轴承或轴承座需核对总成形状']
  ];
  for (const [partRule, modelRule, reason] of risks) {
    if (partRule.test(partText) && modelRule.test(modelName) && !partRule.test(modelName)) return reason;
  }
  return '';
}

// Electrical motor protection is not a motor assembly, even when a broad alias matches.
function incompatibleModel(partText, model) {
  const text = normalize(partText);
  const name = normalize(model.name);
  const url = String(model.modelUrl || '');
  const protection = /电机保护|马达保护|断路器|接触器|热继电器|\bgv[23][a-z0-9-]*|motor\s*(?:protection|protector|circuit\s*breaker)/i;
  const motorAsset = /\/(?:motor|gearmotor|gear-motor|reducer-motor)\.glb$/i.test(url);
  const motorName = /电机|马达|减速机|\bmotor\b|gearmotor/i.test(name) && !protection.test(name);
  const threePole = /3\s*p|三极|三相/i.test(name) || /\/circuit-breaker-3p\.glb$/i.test(url);
  const otherPoles = /\b[124]\s*p\b|[124]极|单极|二极|四极|单相/i.test(text);
  const specialBreaker = /电机保护|马达保护|塑壳|框架|\bgv[23][a-z0-9-]*|\bmccb\b/i.test(text);
  return (protection.test(text) && (motorAsset || motorName)) || (threePole && (otherPoles || specialBreaker));
}

function buildMatchPlan(parts, models, available = modelFileAvailable) {
  const catalog = models.map(model => ({ ...model, terms: modelTerms(model), available: available(model.modelUrl) }));
  const revision = hash(catalog.map(model => [model.id, model.name, model.keywords || '', model.modelUrl, model.available]).sort((a,b)=>Number(a[0])-Number(b[0])));
  return parts.map(part => {
    const text = normalize(`${part.name || ''} ${part.spec || ''}`);
    const fingerprint = hash([revision, part.id, part.name, part.spec || '', part.categoryModelId || null]);
    const base = { partId:Number(part.id), code:part.code, name:part.name, spec:part.spec || '', fingerprint, candidates:[] };
    if (part.categoryModelId) return { ...base, status:'linked', reason:'已有人工关联，保持不变' };
    if (part.editable === false) return { ...base, status:'readonly', reason:'当前账号不可修改此物料' };
    let candidates = catalog.map(model => {
      if (incompatibleModel(text, model)) return null;
      const matched = model.terms.filter(term => containsTerm(text, term)).sort((a,b)=>b.length-a.length);
      if (!matched.length) return null;
      return { id:Number(model.id), name:model.name, modelUrl:model.modelUrl, matched, available:model.available, reviewReason:shapeReview(text, model.name) };
    }).filter(Boolean);
    // A specific phrase takes precedence over an alias contained in that phrase.
    // Equally strong or unrelated hits remain visible for human review.
    candidates = candidates.filter(candidate => !candidates.some(other => other !== candidate
      && !other.reviewReason && other.available
      && candidate.matched.every(term => other.matched.some(specific => specific.length > term.length && specific.includes(term)))));
    candidates.sort((a,b)=>b.matched[0].length-a.matched[0].length || a.id-b.id);
    const status = !candidates.length ? 'unmatched' : candidates.every(c=>!c.available) ? 'unavailable'
      : candidates.length === 1 && !candidates[0].reviewReason && candidates[0].available ? 'ready' : 'review';
    const reason = status === 'unmatched' ? '未找到适合的类别，请补充模型或匹配词'
      : status === 'unavailable' ? '候选模型文件不可用，请先补齐资源'
      : status === 'review' ? (candidates.find(c=>c.reviewReason)?.reviewReason || '存在多个候选，请核对后选择')
      : `命中：${candidates[0].matched.join('、')}`;
    return { ...base, candidates, status, reason };
  });
}

function validateIds(ids) {
  if (!Array.isArray(ids) || !ids.length || ids.length > 500) throw new ApiError(400, '每批请选择1至500种物料');
  const values = ids.map(Number);
  if (values.some(id=>!Number.isSafeInteger(id)||id<1) || new Set(values).size !== values.length) throw new ApiError(400, '物料ID无效或重复');
  return values.sort((a,b)=>a-b);
}

async function readParts(db, ids, user) {
  const [rows] = await db.query(`SELECT p.id,p.code,p.name,p.spec,p.category_model_id AS categoryModelId,
    (SELECT GROUP_CONCAT(DISTINCT COALESCE(i.workshop_code,'raw_grain')) FROM inventory i
     WHERE i.part_id=p.id AND COALESCE(i.active,1)=1) AS workshopCodes
    FROM parts p WHERE p.id IN (${ids.map(()=>'?').join(',')}) AND COALESCE(p.active,1)=1 ORDER BY p.id`, ids);
  if (rows.length !== ids.length) throw new ApiError(409, '部分物料已停用或不存在，请刷新后重试');
  return rows.map(row => {
    const workshops = String(row.workshopCodes || '').split(',').filter(Boolean);
    let editable = true;
    try { assertAssetScope(user, workshops); }
    catch (error) { if (error.status !== 403) throw error; editable = false; }
    return { ...row, editable };
  });
}

async function previewMatches(pool, user, partIds, available = modelFileAvailable) {
  const ids = validateIds(partIds);
  const [models] = await pool.query(`SELECT ${fields} FROM part_category_models WHERE active=1 ORDER BY id`);
  return buildMatchPlan(await readParts(pool, ids, user), models, available);
}

async function applyMatches(pool, user, items, available = modelFileAvailable) {
  const ids = validateIds(Array.isArray(items) ? items.map(item=>item?.partId) : null);
  if (items.some(item=>!Number.isSafeInteger(Number(item.categoryModelId)) || Number(item.categoryModelId)<1 || !/^[a-f0-9]{64}$/.test(String(item.fingerprint)))) {
    throw new ApiError(400, '匹配结果无效，请重新预览');
  }
  let models;
  return withPartAssetWrite(pool, user, ids, async connection => {
    const plans = buildMatchPlan(await readParts(connection, ids, user), models, available);
    for (const item of items) {
      const plan = plans.find(plan=>plan.partId===Number(item.partId));
      if (plan.fingerprint !== item.fingerprint || !['ready','review'].includes(plan.status)
        || !plan.candidates.some(candidate=>candidate.id===Number(item.categoryModelId)&&candidate.available)) {
        throw new ApiError(409, '物料、匹配词或模型已变化，本批未关联，请重新预览');
      }
    }
    for (const item of [...items].sort((a,b)=>Number(a.partId)-Number(b.partId))) {
      const [result] = await connection.query('UPDATE parts SET category_model_id=? WHERE id=? AND category_model_id IS NULL AND COALESCE(active,1)=1', [Number(item.categoryModelId), Number(item.partId)]);
      if (result.affectedRows !== 1) throw new ApiError(409, '物料已被其他人关联，本批未修改，请重新预览');
    }
    return { affected:items.length };
  }, async connection => {
    [models] = await connection.query(`SELECT ${fields} FROM part_category_models WHERE active=1 ORDER BY id FOR UPDATE`);
  });
}

module.exports = { buildMatchPlan, modelFileAvailable, previewMatches, applyMatches };
