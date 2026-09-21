'use strict';
const { createHash } = require('node:crypto');
const keys = ['proximity-sensor','circuit-breaker-3p','deep-groove-bearing','spherical-roller-bearing','pneumatic-solenoid-valve','flanged-gate-valve','gearmotor'];
const oldPaths = new Set(['bearing','circuit-breaker','valve','sensor'].map(name => `/models/categories/${name}.glb`));
const base = '/models/reference-20260904/';

function classifyPart(part) {
  const text = `${part.name || ''} ${part.spec || ''}`.normalize('NFKC').toLowerCase();
  // Accessories are not the complete item shown in the supplied photo.
  if (/轴承座|带座.*轴承|带.*座.*轴承|轴承单元|法兰轴承|接近开关支架|传感器支架|维修包|修理包|线圈组件|阀芯|阀体组件|电机风扇|电机端盖|电机保护器|安装附件/.test(text)) return null;
  if (/深沟球轴承|deep\s*groove.*bearing/.test(text)) return 'deep-groove-bearing';
  if (/调心滚子轴承|spherical\s*roller.*bearing/.test(text)) return 'spherical-roller-bearing';
  if (/接近开关|接近传感器|proximity\s*(switch|sensor)/.test(text) && !/方形|方型|槽型|光电/.test(text)) return 'proximity-sensor';
  if (/断路器|空气开关|空开|\bmcb\b|circuit\s*breaker/.test(text)) {
    // The photo is a three-pole miniature breaker, not a motor protector/MCCB.
    if (/电机保护|马达保护|塑壳|框架|\bmccb\b|\bgv[23]/.test(text)) return null;
    if (/单极|二极|四极|单相|\b[124]\s*p\b|[124]极/.test(text)) return null;
    return /三极|三相|3\s*p\b|3极/.test(text) ? 'circuit-breaker-3p' : null;
  }
  if (/电磁阀|solenoid\s*valve/.test(text)) return /气动|换向|[345]v[12]\d{2}|vuvs|sy[3579]\d{3}/.test(text) ? 'pneumatic-solenoid-valve' : null;
  if (/闸阀|gate\s*valve/.test(text) && /法兰|flang|\bz4[15]/.test(text)) return 'flanged-gate-valve';
  if (/减速电机|减速马达|蜗轮.*减速机|蜗杆.*减速机|\bnmrv\b|gear\s*motor/.test(text)) return 'gearmotor';
  return null;
}

function planAssociations(parts, categories, manifest) {
  const catalog = new Map(manifest.models.map(m => [m.key, m]));
  const byId = new Map(categories.map(c => [String(c.id), c]));
  return parts.map(p => {
    const key = classifyPart(p), target = catalog.get(key), current = byId.get(String(p.category_model_id));
    const before = { category_model_id: p.category_model_id || null, model_url: p.model_url || null, image_url: p.image_url || null };
    if (!target) return { id:p.id,code:p.code,name:p.name,key:null,before,bindModel:false,inheritCategoryImage:false,reason:'未可靠识别具体类别，保留原关联，人工核对' };
    const existing = referenceCategory(categories, target);
    const categoryName = existing?.name || `${target.name} · 参考图20260904`;
    const conflict = categories.find(c => c.name === categoryName && (c.model_url !== base + target.model || !c.built_in || !c.active));
    if(conflict) throw new Error(`类别名称已被修改或占用，请人工核对：${categoryName}`);
    const legacy = current && current.built_in && current.active && oldPaths.has(current.model_url);
    const currentIsReference = current && current.built_in && current.active && current.model_url === base + target.model;
    // A dedicated part model and a category resource can coexist. Linking the
    // category supplies its reference image/front metadata without replacing
    // the dedicated GLB selected by an administrator.
    const bindModel = !current || !current.active || legacy;
    const categoryImageUrl = (bindModel || currentIsReference)
      ? base + target.image
      : (current?.image_url || null);
    const inheritCategoryImage = !p.image_url && Boolean(categoryImageUrl);
    return {id:p.id,code:p.code,name:p.name,key,categoryName,before,bindModel:Boolean(bindModel),inheritCategoryImage,
      reason: bindModel
        ? (p.model_url ? '关联参考类别图片与方向；保留已有专用模型' : '关联参考类别；仅替换空关联或旧内置通用模型')
        : (currentIsReference ? '参考类别已关联；保留当前设置' : '保留用户选择的类别关联'),
      modelUrl:base+target.model,categoryImageUrl,frontRotationY:Number(target.frontRotationY)||0};
  });
}
function referenceCategory(categories, target) {
  const matches = categories.filter(c => c.model_url === base + target.model && c.built_in && c.active);
  if (matches.length > 1) throw new Error(`参考模型存在重复类别，请人工核对：${target.name}`);
  return matches[0] || null;
}
const planDigest = rows => createHash('sha256').update(JSON.stringify(rows)).digest('hex');
module.exports = {keys,base,classifyPart,planAssociations,planDigest,referenceCategory};
