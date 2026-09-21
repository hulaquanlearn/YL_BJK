const ALLOWED_EXTENSIONS = new Set([
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.txt', '.md', '.csv', '.png', '.jpg', '.jpeg', '.gif', '.webp',
  '.odt', '.ods', '.odp', '.rtf', '.bmp', '.tif', '.tiff', '.svg',
  '.mp4', '.webm', '.mov', '.mp3', '.wav', '.ogg', '.m4a',
  '.json', '.xml', '.yaml', '.yml', '.log', '.ini', '.scl', '.st', '.awl', '.mod',
  '.zip', '.7z', '.rar', '.dwg', '.dxf', '.step', '.stp', '.iges', '.igs', '.stl', '.glb', '.gltf'
]);

function cleanText(value, maxLength = 1000) {
  return String(value ?? '').trim().replace(/\u0000/g, '').slice(0, maxLength);
}

function normalizeTags(value) {
  const raw = Array.isArray(value) ? value.join(',') : String(value ?? '');
  return [...new Set(raw.split(/[,，;；\s]+/).map(item => cleanText(item, 30)).filter(Boolean))]
    .slice(0, 12)
    .join(',');
}

function safeExtension(filename, pathModule = require('path')) {
  const extension = pathModule.extname(String(filename || '')).toLowerCase();
  return ALLOWED_EXTENSIONS.has(extension) ? extension : '';
}

function normalizeUploadFilename(value) {
  const original = String(value || '').normalize('NFC');
  if (!original) return '';
  const repaired = Buffer.from(original, 'latin1').toString('utf8').normalize('NFC');
  const originalCjk = (original.match(/[\u3400-\u9fff]/g) || []).length;
  const repairedCjk = (repaired.match(/[\u3400-\u9fff]/g) || []).length;
  const replacementCount = (repaired.match(/\uFFFD/g) || []).length;
  const mojibakeHints = (original.match(/[ÃÂæåçéèäöü]/g) || []).length;
  if (!replacementCount && repairedCjk > originalCjk && (mojibakeHints || originalCjk === 0)) return repaired;
  return original;
}

function knowledgePayload(body = {}) {
  const entryType = body.entryType === 'fault' ? 'fault' : 'document';
  return {
    entryType,
    title: cleanText(body.title, 200),
    category: cleanText(body.category, 80),
    processStage: cleanText(body.processStage, 80),
    equipmentName: cleanText(body.equipmentName, 150),
    summary: cleanText(body.summary, 1000),
    faultSymptom: cleanText(body.faultSymptom, 4000),
    faultCause: cleanText(body.faultCause, 4000),
    solution: cleanText(body.solution, 20000),
    preventiveAction: cleanText(body.preventiveAction, 4000),
    contentText: cleanText(body.contentText, 50000),
    tags: normalizeTags(body.tags)
  };
}

module.exports = { ALLOWED_EXTENSIONS, cleanText, normalizeTags, safeExtension, normalizeUploadFilename, knowledgePayload };
