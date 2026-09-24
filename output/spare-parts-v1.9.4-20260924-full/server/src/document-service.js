const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { fork, execFile } = require('child_process');
const { sandboxCommand } = require('./document-sandbox');

const OFFICE = new Set(['.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.odt', '.ods', '.odp', '.rtf']);
const NATIVE = { '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4' };
const TEXT = new Set(['.txt', '.md', '.csv', '.json', '.xml', '.yaml', '.yml', '.log', '.ini', '.scl', '.st', '.awl', '.mod', '.svg', '.dxf', '.step', '.stp', '.iges', '.igs', '.gltf']);
const CACHE_ROOT = path.resolve(process.env.DOCUMENT_CACHE_DIR || path.join(os.tmpdir(), 'spare-parts-document-cache'));
const MAX_SIZE = Math.min(500 * 1024 * 1024, Math.max(1024 * 1024, Number(process.env.DOCUMENT_MAX_BYTES) || 500 * 1024 * 1024));
const TIMEOUT = Math.min(300000, Math.max(10000, Number(process.env.DOCUMENT_TIMEOUT_MS) || 120000));
const MAX_PARALLEL = Math.min(4, Math.max(1, Number(process.env.DOCUMENT_CONCURRENCY) || 1));
const pending = new Map();
const queue = [];
let running = 0;
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function informationPreview(filename, size, message, text = '') {
  return { contentType: 'text/html; charset=utf-8', mode: text ? 'text' : 'metadata', notice: message,
    body: `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>body{font:15px/1.8 Arial,sans-serif;padding:24px;color:#334155}pre{white-space:pre-wrap;overflow-wrap:anywhere}.notice{background:#fff7df;padding:12px}</style><h2>${escapeHtml(filename)}</h2><p>${(size / 1024).toFixed(1)} KB</p><p class="notice">${escapeHtml(message)}</p><pre>${escapeHtml(text)}</pre></html>` };
}

async function boundedText(filePath, maxLength) {
  const handle = await fs.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(Math.min(4 * maxLength, 2 * 1024 * 1024));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const bytes = buffer.subarray(0, bytesRead);
    let encoding = 'utf-8';
    if (bytes[0] === 0xff && bytes[1] === 0xfe) encoding = 'utf-16le';
    else if (bytes[0] === 0xfe && bytes[1] === 0xff) encoding = 'utf-16be';
    let text = new TextDecoder(encoding).decode(bytes);
    if (text.includes('\uFFFD') && encoding === 'utf-8') {
      const chinese = new TextDecoder('gb18030').decode(bytes);
      if ((chinese.match(/\uFFFD/g) || []).length < (text.match(/\uFFFD/g) || []).length) text = chinese;
    }
    return text.replace(/\u0000/g, '').slice(0, maxLength);
  } finally { await handle.close(); }
}

function drain() {
  while (running < MAX_PARALLEL && queue.length) {
    const item = queue.shift(); running++;
    item.run().then(item.resolve, item.reject).finally(() => { running--; drain(); });
  }
}

function isolatedWork(job) {
  return new Promise((resolve, reject) => {
    // Deliberately do not pass DB passwords, tokens, NODE_OPTIONS or the API .env to parsers.
    const env = Object.fromEntries(['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'LANG', 'LC_ALL'].filter(k => process.env[k]).map(k => [k, process.env[k]]));
    const child = fork(path.join(__dirname, 'document-worker.js'), [], {
      env, cwd: job.directory, execArgv: ['--max-old-space-size=384'],
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'], windowsHide: true, detached: process.platform !== 'win32'
    });
    let settled = false;
    function stop() {
      if (!child.pid) return;
      if (process.platform === 'win32') execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }, () => {});
      else { try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); } }
    }
    const finish = (error, result) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      if (error) { stop(); reject(error); } else { child.disconnect(); resolve(result); }
    };
    const timer = setTimeout(() => finish(new Error('附件处理超时，请缩小文件或联系管理员检查转换服务')), TIMEOUT);
    child.on('error', () => finish(new Error('附件转换进程无法启动')));
    child.on('exit', code => { if (!settled) finish(new Error(`附件转换进程异常结束 (${code})`)); });
    child.on('message', message => message.error ? finish(new Error(message.error)) : finish(null, message));
    child.send(job);
  });
}

async function documentJob(fullPath, filename, action, maxLength) {
  const source = path.resolve(fullPath), stat = await fs.stat(source);
  if (!stat.isFile() || stat.size > MAX_SIZE) throw new Error('文件超出当前在线处理上限，请联系管理员');
  const extension = path.extname(filename).toLowerCase();
  const key = crypto.createHash('sha256').update(`${source}:${stat.size}:${stat.mtimeMs}:${action}:${maxLength}:v2`).digest('hex');
  const cachedPdf = path.join(CACHE_ROOT, `${key}.pdf`);
  if (action === 'preview') {
    const cached = await fs.stat(cachedPdf).catch(() => null);
    if (cached?.isFile() && Date.now() - cached.mtimeMs < 24 * 60 * 60 * 1000) {
      return { filePath: cachedPdf, contentType: 'application/pdf', mode: 'converted-pdf', notice: '服务器转换为 PDF；字体及复杂效果可能与原件略有差异。' };
    }
  }
  if (pending.has(key)) return pending.get(key);
  if (queue.length >= 8) throw new Error('附件处理队列繁忙，请稍后重试');
  const run = async () => {
    await fs.mkdir(CACHE_ROOT, { recursive: true, mode: 0o700 });
    const directory = await fs.mkdtemp(path.join(CACHE_ROOT, 'job-'));
    const input = path.join(directory, `document${extension}`);
    try {
      await fs.copyFile(source, input);
      const result = await isolatedWork({ action, filePath: input, directory, extension, filename, maxLength,
        binaries: { office: process.env.LIBREOFFICE_BIN || 'soffice', pdf: process.env.PDFTOTEXT_BIN || 'pdftotext', ocr: process.env.TESSERACT_BIN || 'tesseract', raster: process.env.PDFTOPPM_BIN || 'pdftoppm' },
        ocrPages: Math.max(1, Math.min(20, Number(process.env.DOCUMENT_OCR_PAGES) || 5)),
        ocrLanguage: /^[a-z_+]+$/i.test(process.env.DOCUMENT_OCR_LANG || '') ? process.env.DOCUMENT_OCR_LANG : 'chi_sim+eng' });
      if (result.filePath) {
        const target = path.join(CACHE_ROOT, `${key}.pdf`);
        await fs.unlink(target).catch(error => { if (error.code !== 'ENOENT') throw error; });
        await fs.rename(result.filePath, target); result.filePath = target;
        await fs.chmod(target, 0o600);
      }
      return result;
    } finally { await fs.rm(directory, { recursive: true, force: true }); }
  };
  const promise = new Promise((resolve, reject) => { queue.push({ run, resolve, reject }); drain(); });
  pending.set(key, promise);
  try { return await promise; } finally { pending.delete(key); }
}

async function previewDocument(fullPath, filename) {
  const extension = path.extname(filename).toLowerCase(), stat = await fs.stat(fullPath);
  if (NATIVE[extension]) return { filePath: fullPath, contentType: NATIVE[extension], mode: 'native' };
  if (TEXT.has(extension)) return informationPreview(filename, stat.size, '只读文本预览；标记、代码与图纸源文件不会执行。超长内容最多展示前 200000 字符。', await boundedText(fullPath, 200000));
  if (OFFICE.has(extension)) {
    try { return await documentJob(fullPath, filename, 'preview', 100000); }
    catch (error) { return informationPreview(filename, stat.size, `未能完整预览：${error.message}。加密或损坏文件需解除保护或重新导出；可下载原件。`); }
  }
  return informationPreview(filename, stat.size, '已提供文件信息预览。此格式不能直接呈现内容；CAD/专有格式请另附 PDF、图片或开放格式导出件，媒体请转换为 MP4/WebM。原文件仍可下载。');
}

async function extractDocumentText(fullPath, filename, maxLength = 100000) {
  const extension = path.extname(filename).toLowerCase();
  maxLength = Math.max(1, Math.min(200000, Number(maxLength) || 100000));
  if (TEXT.has(extension)) return (await boundedText(fullPath, maxLength)).trim();
  if (OFFICE.has(extension) || extension === '.pdf' || /^\.(png|jpe?g|tiff?|bmp|webp)$/.test(extension)) {
    const result = await documentJob(fullPath, filename, 'text', maxLength);
    return String(result.text || '').replace(/\u0000/g, '').trim().slice(0, maxLength);
  }
  return '';
}

async function getDocumentCapabilities() {
  const check = (binary, args) => new Promise(resolve => execFile(binary, args, { windowsHide: true, timeout: 5000, maxBuffer: 65536 }, error => resolve(!error)));
  const [office, pdfText, imageOcr, pdfRaster] = await Promise.all([
    check(process.env.LIBREOFFICE_BIN || 'soffice', ['--version']),
    check(process.env.PDFTOTEXT_BIN || 'pdftotext', ['-v']), check(process.env.TESSERACT_BIN || 'tesseract', ['--version']),
    check(process.env.PDFTOPPM_BIN || 'pdftoppm', ['-v'])
  ]);
  await fs.mkdir(CACHE_ROOT, { recursive: true, mode: 0o700 });
  const command = sandboxCommand('/usr/bin/true', [], CACHE_ROOT);
  const sandbox = process.platform === 'linux' ? await check(command.binary, command.args) : false;
  return { office, pdfText, imageOcr, pdfRaster, sandbox, platform: process.platform, concurrency: MAX_PARALLEL, queueLength: queue.length, timeoutMs: TIMEOUT, maxBytes: MAX_SIZE };
}

// Cache contents are derived only, never original uploads. Called by maintenance tooling.
async function cleanDocumentCache(maxAgeMs = 24 * 60 * 60 * 1000) {
  await fs.mkdir(CACHE_ROOT, { recursive: true, mode: 0o700 });
  for (const name of await fs.readdir(CACHE_ROOT)) {
    if (!/^[a-f0-9]{64}\.pdf$/.test(name)) continue;
    const file = path.join(CACHE_ROOT, name), stat = await fs.stat(file);
    if (Date.now() - stat.mtimeMs > maxAgeMs) await fs.unlink(file);
  }
}
module.exports = { previewDocument, extractDocumentText, getDocumentCapabilities, cleanDocumentCache, informationPreview, boundedText };
