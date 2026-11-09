const { ApiError } = require('./utils');
const FAMILIES = ['轴承与轴承座','气动元件','电气与供电','传动与减速机','密封件','输送与制作件','其他备件'];
const KINDS = ['说明书','尺寸图','接线图','选型手册','产品数据表','研究整理'];
const VERIFICATIONS = ['source_checked','partial','conflicting','unverified'];
const text = (value, max) => String(value ?? '').replace(/\u0000/g,'').trim().slice(0,max);

function referenceMetadata(value, { strict = false } = {}) {
  try {
    const raw = typeof value === 'string' ? JSON.parse(value) : value;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const sourceUrl = text(raw.sourceUrl,1500);
    if (sourceUrl) {
      const url = new URL(sourceUrl);
      if (!['https:','http:'].includes(url.protocol) || url.username || url.password) throw Error('来源地址必须是普通 HTTP/HTTPS 链接');
    }
    return {
      schema:1,
      applicability:raw.applicability==='workshop' ? 'workshop' : 'shared',
      family:FAMILIES.includes(raw.family) ? raw.family : '其他备件',
      documentKind:KINDS.includes(raw.documentKind) ? raw.documentKind : '产品数据表',
      manufacturer:text(raw.manufacturer,100),
      models:[...new Set((Array.isArray(raw.models) ? raw.models : String(raw.models || '').split(/[,，;；\n]+/)).map(v=>text(v,100)).filter(Boolean))].slice(0,80),
      sourceUrl,
      documentVersion:text(raw.documentVersion,160),
      sourcePages:text(raw.sourcePages,160),
      verification:VERIFICATIONS.includes(raw.verification) ? raw.verification : 'unverified',
      verifiedScope:text(raw.verifiedScope,2000),
      limitations:text(raw.limitations,2000),
      fileSha256:/^[a-f0-9]{64}$/.test(raw.fileSha256 || '') ? raw.fileSha256 : ''
    };
  } catch(error) {
    if (strict) throw new ApiError(400,error.message.startsWith('来源地址') ? error.message : '备件资料来源信息格式无效');
    return null;
  }
}

function referenceSearchText(meta) {
  if (!meta) return '';
  return ['备件资料库',`类别：${meta.family} / ${meta.documentKind}`,`厂家：${meta.manufacturer}`,`适用型号：${meta.models.join('、')}`,
    `资料版本：${meta.documentVersion}`,`来源页：${meta.sourcePages}`,`资料核实状态：${meta.verification}`,
    meta.verifiedScope ? `已核实范围：${meta.verifiedScope}` : '',meta.limitations ? `未核实或冲突：${meta.limitations}` : '',
    meta.sourceUrl ? `原始来源：${meta.sourceUrl}` : ''].filter(Boolean).join('\n');
}

async function metadataWithFileHash(meta,filePath,previous) {
  if(!meta)return null;
  let digest=referenceMetadata(previous)?.fileSha256 || '';
  if(filePath){
    const hash=require('crypto').createHash('sha256');
    for await(const chunk of require('fs').createReadStream(filePath))hash.update(chunk);
    digest=hash.digest('hex');
  }
  return JSON.stringify({...meta,fileSha256:digest});
}

module.exports={FAMILIES,KINDS,VERIFICATIONS,referenceMetadata,referenceSearchText,metadataWithFileHash};
