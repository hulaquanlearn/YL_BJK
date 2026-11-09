'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const config = require('./config');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const inside = (root, file) => file === root || file.startsWith(root + path.sep);

function createAssetReader({ modelDir = config.parts.modelDir, imageDir = config.parts.uploadDir, staticRoots = process.env.MODEL_ASSETS_DIR ? [path.resolve(process.env.MODEL_ASSETS_DIR)] : [path.resolve(__dirname, '../../web/dist'), path.resolve(__dirname, '../../spare-parts-web-release/public')], fileSystem = fs } = {}) {
 const cache = new Map();
 function locations(url, kind) {
  if (typeof url !== 'string' || !url.startsWith('/') || url.startsWith('//') || /[?#%\\\0]/.test(url)) return [];
  const extension = kind === 'model' ? /\.glb$/i : /\.(png|jpe?g|webp|gif|bmp)$/i;
  if (!extension.test(url)) return [];
  let candidates = [];
  if (kind === 'model' && /^\/uploads\/part-models\/[^/]+$/.test(url)) candidates = [{ root: modelDir, relative: url.slice('/uploads/part-models/'.length) }];
  else if (kind === 'image' && /^\/uploads\/part-images\/(?:categories\/)?[^/]+$/.test(url)) candidates = [{ root: imageDir, relative: url.slice('/uploads/part-images/'.length) }];
  else if (url.startsWith('/models/')) candidates = staticRoots.map(root => ({ root, relative: url.slice(1) }));
  return candidates.map(({ root, relative }) => ({ root: path.resolve(root), file: path.resolve(root, relative) })).filter(({ root, file }) => inside(root, file) && !url.split('/').some(segment => segment === '.' || segment === '..'));
 }
 async function read(url, kind, { force = false } = {}) {
  const unavailable = reason => ({ url: url || '', sha256: null, available: false, reason });
  if (!url) return unavailable('尚未配置' + (kind === 'model' ? '模型文件' : '对照图片'));
  const candidates = locations(url, kind); if (!candidates.length) return unavailable('资源不是可核验的本地文件地址');
  for (const candidate of candidates) {
   try {
    const realRoot = await fileSystem.realpath(candidate.root), realFile = await fileSystem.realpath(candidate.file);
    if (!inside(realRoot, realFile)) return unavailable('资源路径超出授权目录');
    const stat = await fileSystem.stat(realFile), limit = kind === 'model' ? 50 * 1024 * 1024 : 50 * 1024 * 1024;
    if (!stat.isFile() || stat.size > limit || stat.size < 1) return unavailable('资源文件为空、类型无效或超过核对大小限制');
    const stamp = [stat.size, stat.mtimeMs, stat.ctimeMs].join(':'), cached = cache.get(realFile);
    if (!force && cached?.stamp === stamp && cached.kind === kind) return { ...cached.value };
    const bytes = await fileSystem.readFile(realFile), after = await fileSystem.stat(realFile);
    if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || after.ctimeMs !== stat.ctimeMs || bytes.length !== stat.size) return unavailable('资源正在变化，请刷新后重新核对');
    if (kind === 'model' && (bytes.length < 20 || bytes.toString('ascii', 0, 4) !== 'glTF' || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length)) return unavailable('模型不是完整有效的GLB 2.0文件');
    const value = { url, sha256: hash(bytes), available: true, bytes: bytes.length, reason: '' };
    cache.set(realFile, { stamp, kind, value }); if (cache.size > 1000) cache.delete(cache.keys().next().value);
    return { ...value };
   } catch (error) { if (['ENOENT', 'ENOTDIR'].includes(error.code)) continue; return unavailable('资源文件暂不可读取，请刷新后重试'); }
  }
  return unavailable('资源文件不存在');
 }
 return { read, locations };
}
module.exports = { hash, inside, createAssetReader, defaultReader: createAssetReader() };
