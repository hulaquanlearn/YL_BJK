const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { previewDocument, extractDocumentText, informationPreview } = require('../src/document-service');
const { stripActiveHtml } = require('../src/office-preview');
const { sandboxCommand } = require('../src/document-sandbox');
const { EventEmitter } = require('events');
const childProcess = require('child_process');

test('Linux external converters are isolated from network and business filesystem', () => {
  const command = sandboxCommand('/usr/bin/soffice', ['--headless'], '/tmp/document-job', 'linux');
  assert.equal(command.binary, 'bwrap');
  assert.ok(command.args.includes('--unshare-all'));
  assert.ok(command.args.includes('--new-session'));
  assert.ok(command.args.includes('--die-with-parent'));
  assert.equal(command.args[command.args.indexOf('--bind') + 1], '/tmp/document-job');
  assert.deepEqual(command.args.slice(-3), ['--', '/usr/bin/soffice', '--headless']);
  assert.ok(!command.args.includes('--share-net'));
  assert.ok(!command.args.includes('/opt/spare-parts'));
  assert.ok(!command.args.includes('/home'));
});

test('UTF-16 Chinese document extracts intact text', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'document-encoding-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'unicode.txt');
  await fs.writeFile(file, Buffer.concat([Buffer.from([255, 254]), Buffer.from('设备温度异常', 'utf16le')]));
  assert.equal(await extractDocumentText(file, 'unicode.txt'), '设备温度异常');
});

test('HTML sanitizer removes scripts, event attributes and remote images', () => {
  const html = stripActiveHtml('<script>secret()</script><img src=https://evil.test/x onerror=alert(1)><p onclick="go()">正文</p><img src="data:image/svg+xml;base64,AAAA">');
  assert.doesNotMatch(html, /secret|evil\.test|onerror|onclick|image\/svg/);
  assert.match(html, /正文/);
});
test('unsupported format information preview never claims successful document rendering', () => {
  const preview = informationPreview('<bad>.dwg', 10, '仅文件信息');
  assert.equal(preview.mode, 'metadata');
  assert.match(preview.body, /&lt;bad&gt;/);
});
test('text files support bounded safe preview and extraction while PDF remains native', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'document-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, '中文.txt');
  await fs.writeFile(file, '<script>alert(1)</script>故障说明');
  const preview = await previewDocument(file, '中文.txt');
  assert.equal(preview.mode, 'text');
  assert.match(preview.body, /&lt;script&gt;/);
  assert.equal((await extractDocumentText(file, '中文.txt', 8)).length, 8);
  assert.equal((await previewDocument(file, 'document.pdf')).contentType, 'application/pdf');
  assert.equal((await previewDocument(file, 'document.dwg')).mode, 'metadata');
});
test('Office worker PDF result is cached and returned without changing the source', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'document-conversion-success-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'source.rtf'), source = '{\\rtf1\\ansi Isolated conversion fixture}';
  await fs.writeFile(file, source);
  let receivedJob, disconnected = false;
  // Isolate the IPC boundary so this success-path check needs no host Office installation.
  const fork = t.mock.method(childProcess, 'fork', () => {
    const worker = new EventEmitter();
    worker.send = job => {
      receivedJob = job;
      const output = path.join(job.directory, 'document.pdf');
      fs.writeFile(output, '%PDF-1.4\nIsolated worker result\n%%EOF\n').then(() => worker.emit('message', {
        filePath: output, contentType: 'application/pdf', mode: 'converted-pdf', notice: 'Isolated worker result'
      }), error => worker.emit('error', error));
    };
    worker.disconnect = () => { disconnected = true; };
    return worker;
  });
  const modulePath = require.resolve('../src/document-service'), originalModule = require.cache[modulePath];
  let isolated;
  try { delete require.cache[modulePath]; isolated = require(modulePath); }
  finally { fork.mock.restore(); require.cache[modulePath] = originalModule; }
  const preview = await isolated.previewDocument(file, 'source.rtf');
  if (preview.filePath) t.after(() => fs.rm(preview.filePath, { force: true }));
  assert.equal(preview.mode, 'converted-pdf');
  assert.equal(preview.contentType, 'application/pdf');
  assert.notEqual(preview.filePath, file);
  assert.match(await fs.readFile(preview.filePath, 'utf8'), /^%PDF-/);
  assert.equal(await fs.readFile(file, 'utf8'), source);
  assert.equal(receivedJob.action, 'preview'); assert.equal(receivedJob.extension, '.rtf');
  assert.equal(disconnected, true);
});
test('missing Office converter and invalid legacy content report an explicit compatibility failure', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'document-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const previous = process.env.LIBREOFFICE_BIN;
  process.env.LIBREOFFICE_BIN = path.join(directory, 'deliberately-missing-office-converter');
  t.after(() => { if (previous === undefined) delete process.env.LIBREOFFICE_BIN; else process.env.LIBREOFFICE_BIN = previous; });
  const file = path.join(directory, 'broken.doc'); await fs.writeFile(file, 'not an office file');
  const preview = await previewDocument(file, 'broken.doc');
  assert.equal(preview.mode, 'metadata'); assert.match(preview.notice, /未能完整预览/);
});
