// Runs outside the API event loop, with a bounded heap and an outer process deadline.
const fs = require('fs/promises');
const path = require('path');
const { pathToFileURL } = require('url');
const { execFile } = require('child_process');
const office = require('./office-preview');
const { sandboxCommand } = require('./document-sandbox');
const run = (binary, args, job) => new Promise((resolve, reject) => {
  const command = sandboxCommand(binary, args, job.directory);
  execFile(command.binary, command.args, { timeout: 90000, maxBuffer: 1024 * 1024, windowsHide: true }, (error, stdout) => error ? reject(error) : resolve(stdout));
});
async function convertPdf(job) {
  const profile = path.join(job.directory, 'profile');
  await fs.mkdir(path.join(profile, 'user'), { recursive: true });
  await fs.writeFile(path.join(profile, 'user', 'registrymodifications.xcu'), '<?xml version="1.0"?><oor:items xmlns:oor="http://openoffice.org/2001/registry"><item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop></item><item oor:path="/org.openoffice.Office.Calc/Content/Update"><prop oor:name="Link" oor:op="fuse"><value>0</value></prop></item></oor:items>');
  await run(job.binaries.office, [`-env:UserInstallation=${pathToFileURL(profile).href}`, '--headless', '--nologo', '--nodefault', '--norestore', '--convert-to', 'pdf', '--outdir', job.directory, job.filePath], job);
  const pdf = path.join(job.directory, 'document.pdf');
  const handle = await fs.open(pdf, 'r');
  try {
    const head = Buffer.alloc(5); await handle.read(head, 0, 5, 0);
    if (head.toString() !== '%PDF-') throw new Error('invalid converted PDF');
  } finally { await handle.close(); }
  return pdf;
}
async function pdfText(filePath, job) {
  try {
    const destination = path.join(job.directory, 'extracted.txt');
    await run(job.binaries.pdf, ['-enc', 'UTF-8', '-layout', filePath, destination], job);
    const handle = await fs.open(destination, 'r');
    try { const bytes = Buffer.alloc(job.maxLength * 4); const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0); return bytes.subarray(0, bytesRead).toString('utf8').slice(0, job.maxLength); }
    finally { await handle.close(); }
  } catch {
    const ast = await require('officeparser').parseOffice(filePath, { fileType: 'pdf', ocr: false });
    const result = await ast.to('text'); return String(result.value || '').slice(0, job.maxLength);
  }
}
async function processJob(job) {
  if (job.action === 'preview') {
    try { return { filePath: await convertPdf(job), contentType: 'application/pdf', mode: 'converted-pdf', notice: '服务器转换为 PDF；字体及复杂效果可能与原件略有差异。' }; }
    catch {
      let body;
      if (office.OFFICE_PREVIEW_EXTENSIONS.has(job.extension)) body = await office.renderOfficeHtml(job.filePath, job.extension);
      else if (office.LEGACY_OFFICE_PREVIEW_EXTENSIONS.has(job.extension)) body = await office.renderLegacyOfficeHtml(job.filePath, job.extension, job.filename);
      else throw new Error('服务器未安装可用的 LibreOffice 转换器，或文件已加密/损坏');
      if (Buffer.byteLength(body) > 20 * 1024 * 1024) throw new Error('预览内容超过 20 MB 安全上限');
      return { body, contentType: 'text/html; charset=utf-8', mode: 'fallback-html', notice: 'PDF 转换不可用，当前为兼容内容预览，不能完整还原原始图文排版。' };
    }
  }
  let text;
  if (office.OFFICE_PREVIEW_EXTENSIONS.has(job.extension)) text = await office.extractOfficeText(job.filePath, job.extension, job.maxLength);
  else if (office.LEGACY_OFFICE_PREVIEW_EXTENSIONS.has(job.extension)) text = await office.extractLegacyOfficeText(job.filePath, job.extension, job.maxLength);
  else if (job.extension === '.pdf') {
    text = await pdfText(job.filePath, job);
    if (!String(text || '').trim()) {
      const prefix = path.join(job.directory, 'scan');
      await run(job.binaries.raster, ['-f', '1', '-l', String(job.ocrPages), '-scale-to', '1600', '-png', job.filePath, prefix], job);
      const pages = (await fs.readdir(job.directory)).filter(name => /^scan-\d+\.png$/.test(name)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
      const chunks = [];
      for (const [index, name] of pages.entries()) {
        const page = await run(job.binaries.ocr, [path.join(job.directory, name), 'stdout', '-l', job.ocrLanguage], job);
        if (page.trim()) chunks.push(`[OCR 第 ${index + 1} 页]\n${page}`);
        if (chunks.join('\n').length >= job.maxLength) break;
      }
      text = chunks.length ? `[扫描件OCR，仅处理前 ${job.ocrPages} 页范围；文字识别可能有误，需核对原件]\n${chunks.join('\n\n')}` : '';
    }
  }
  else if (/^\.(png|jpe?g|tiff?|bmp|webp)$/.test(job.extension)) {
    try { text = await run(job.binaries.ocr, [job.filePath, 'stdout', '-l', job.ocrLanguage], job); }
    catch { throw new Error('图像 OCR 不可用，请安装 Tesseract 和对应语言包，或手动填写正文'); }
  } else text = await pdfText(await convertPdf(job), job);
  return { text: String(text || '').trim().slice(0, job.maxLength) };
}
process.once('message', async job => {
  try { process.send(await processJob(job)); }
  catch (error) { process.send({ error: /OCR|LibreOffice|上限/.test(error.message) ? error.message : '文件解析失败，可能损坏、加密或内容格式不受支持' }); }
});
process.on('disconnect', () => process.exit(0));
