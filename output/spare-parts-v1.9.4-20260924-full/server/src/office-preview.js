const officeParser = require('officeparser');
const WordExtractor = require('word-extractor');
const XLSX = require('xlsx');
const sanitizeHtml = require('sanitize-html');

const OFFICE_PREVIEW_EXTENSIONS = new Set(['.docx', '.xlsx', '.pptx']);
const LEGACY_OFFICE_PREVIEW_EXTENSIONS = new Set(['.doc', '.xls', '.ppt']);

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

function textDocument(title, text, notice = '') {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>body{max-width:1100px;margin:0 auto;padding:28px;color:#1f2937;background:#fff;font:15px/1.8 Arial,"Microsoft YaHei",sans-serif}.notice{margin-bottom:18px;padding:10px 14px;border-radius:8px;color:#8a5a00;background:#fff7df}pre{white-space:pre-wrap;word-break:break-word;font:inherit}</style></head><body>${notice ? `<div class="notice">${escapeHtml(notice)}</div>` : ''}<pre>${escapeHtml(text || '文件中没有提取到可显示的文字内容。')}</pre></body></html>`;
}

function stripActiveHtml(value) {
  const clean = sanitizeHtml(String(value || ''), {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img']),
    allowedAttributes: { '*': ['class'], td: ['colspan', 'rowspan'], th: ['colspan', 'rowspan'], img: ['src', 'alt', 'width', 'height'] },
    allowedSchemes: ['data'],
    allowedSchemesByTag: { img: ['data'] },
    exclusiveFilter: frame => frame.tag === 'img' && !/^data:image\/(png|jpe?g|gif|webp);base64,/i.test(frame.attribs.src || '')
  });
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>body{padding:24px;margin:auto;max-width:1400px;font:15px/1.7 Arial,"Microsoft YaHei",sans-serif;color:#1f2937}img{max-width:100%;height:auto}table{border-collapse:collapse}td,th{border:1px solid #ddd;padding:6px}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style></head><body>${clean}</body></html>`;
}

async function parseOffice(filePath, extension) {
  if (!OFFICE_PREVIEW_EXTENSIONS.has(extension)) throw new Error('unsupported office preview format');
  return officeParser.parseOffice(filePath, {
    fileType: extension.slice(1),
    extractAttachments: true,
    ocr: false,
    decompressionLimits: {
      maxUncompressedBytes: 256 * 1024 * 1024,
      maxZipEntries: 10000,
      maxTableCells: 500000
    }
  });
}

async function renderOfficeHtml(filePath, extension) {
  const ast = await parseOffice(filePath, extension);
  const { value } = await ast.to('html', {
    includeFormatting: true,
    includeImages: true,
    includeCharts: true,
    generateIds: false,
    htmlConfig: {
      standalone: true,
      customCss: 'body{margin:0 auto;padding:24px;max-width:1200px;background:#fff;color:#1f2937;font-family:Arial,"Microsoft YaHei",sans-serif}table{max-width:100%;overflow:auto}img{max-width:100%;height:auto}'
    }
  });
  return stripActiveHtml(value);
}

async function extractOfficeText(filePath, extension, maxLength = 100000) {
  const ast = await parseOffice(filePath, extension);
  const { value } = await ast.to('text');
  return String(value || '').replace(/\u0000/g, '').trim().slice(0, maxLength);
}

function extractPowerPointText(buffer) {
  const cfb = XLSX.CFB.read(buffer, { type: 'buffer' });
  const entry = XLSX.CFB.find(cfb, 'PowerPoint Document') || XLSX.CFB.find(cfb, '/PowerPoint Document');
  const stream = entry?.content;
  if (!stream) return '';
  const found = [];
  function visit(start, end, depth = 0) {
    if (depth > 32) return;
    let offset = start;
    while (offset + 8 <= end) {
      const options = stream.readUInt16LE(offset);
      const recordType = stream.readUInt16LE(offset + 2);
      const length = stream.readUInt32LE(offset + 4);
      const dataStart = offset + 8;
      const dataEnd = Math.min(dataStart + length, end);
      if (dataEnd < dataStart || dataEnd > stream.length) break;
      const recordVersion = options & 0x000f;
      if (recordVersion === 0x000f) visit(dataStart, dataEnd, depth + 1);
      else if (recordType === 4000 && length >= 2) found.push(stream.subarray(dataStart, dataEnd).toString('utf16le'));
      else if (recordType === 4008 && length) found.push(stream.subarray(dataStart, dataEnd).toString('latin1'));
      offset = dataStart + length;
    }
  }
  visit(0, stream.length);
  return found.map(value => value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim()).filter(Boolean).join('\n\n');
}

async function renderLegacyOfficeHtml(filePath, extension, filename = '') {
  if (extension === '.doc') {
    const document = await new WordExtractor().extract(filePath);
    return textDocument(filename, [document.getBody(), document.getFootnotes(), document.getEndnotes()].filter(Boolean).join('\n\n'), '旧版 Word 在线预览以文字内容为主，复杂版式、图片和页眉页脚可能与原文件不同。');
  }
  if (extension === '.xls') {
    const workbook = XLSX.readFile(filePath, { cellDates: true, cellFormula: true });
    const sections = workbook.SheetNames.map(name => `<section><h2>${escapeHtml(name)}</h2>${XLSX.utils.sheet_to_html(workbook.Sheets[name], { editable: false })}</section>`).join('');
    return stripActiveHtml(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtml(filename)}</title><style>body{margin:0 auto;padding:24px;max-width:1400px;font-family:Arial,"Microsoft YaHei",sans-serif}table{border-collapse:collapse;max-width:100%;overflow:auto}td,th{padding:6px 9px;border:1px solid #d8dee8}h2{margin-top:26px}</style></head><body>${sections}</body></html>`);
  }
  if (extension === '.ppt') {
    const text = extractPowerPointText(require('fs').readFileSync(filePath));
    return textDocument(filename, text, '旧版 PowerPoint 在线预览以提取出的幻灯片文字为主，动画、图片和原始排版不会完整还原。');
  }
  throw new Error('unsupported legacy office preview format');
}

async function extractLegacyOfficeText(filePath, extension, maxLength = 100000) {
  let text = '';
  if (extension === '.doc') {
    const document = await new WordExtractor().extract(filePath);
    text = [document.getBody(), document.getFootnotes(), document.getEndnotes()].filter(Boolean).join('\n\n');
  } else if (extension === '.xls') {
    const workbook = XLSX.readFile(filePath, { cellDates: true, cellFormula: true });
    text = workbook.SheetNames.map(name => {
      const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[name], { blankrows: false });
      return `工作表：${name}\n${csv}`;
    }).join('\n\n');
  } else if (extension === '.ppt') {
    text = extractPowerPointText(require('fs').readFileSync(filePath));
  } else {
    throw new Error('unsupported legacy office text format');
  }
  return String(text || '').replace(/\u0000/g, '').trim().slice(0, maxLength);
}

module.exports = {
  OFFICE_PREVIEW_EXTENSIONS,
  LEGACY_OFFICE_PREVIEW_EXTENSIONS,
  renderOfficeHtml,
  renderLegacyOfficeHtml,
  extractOfficeText,
  extractLegacyOfficeText,
  stripActiveHtml,
  extractPowerPointText
};
