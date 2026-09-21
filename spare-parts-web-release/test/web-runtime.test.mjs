import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import http from 'node:http'
const require = createRequire(import.meta.url)
const { createWebApp } = require('../server.js')
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)))
const close = server => new Promise(resolve => { server.close(resolve); server.closeAllConnections() })
test('web runtime fails early with the exact deployment target when dist is missing', () => {
  assert.throws(() => createWebApp({ distDir: path.join(os.tmpdir(), 'missing-dist-8492749183') }), /web-dist\/.*web\/dist\//)
})
test('web runtime serves navigation, protects accidentally copied private files and proxies authenticated assets', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'web-runtime-test-'))
  await fs.writeFile(path.join(directory, 'index.html'), '<h1>fixture</h1>')
  for (const name of ['.env','backup.sql','app.js.map']) await fs.writeFile(path.join(directory,name),'must not be served')
  let forwarded
  const backend = http.createServer((req, res) => { forwarded=req.headers; res.setHeader('Content-Type', 'model/gltf-binary'); res.setHeader('Cache-Control','private, no-store'); res.statusCode=req.url.includes('missing')?404:200; res.end(req.url) })
  const target = await listen(backend)
  const server = http.createServer(createWebApp({ distDir: directory, apiTarget: target }))
  const base = await listen(server)
  t.after(async () => { await close(server); await close(backend); await fs.rm(directory, { recursive: true, force: true }) })
  const page = await fetch(base + '/inventory', { headers: { Accept: 'text/html' } })
  assert.equal(page.status, 200); assert.match(await page.text(), /fixture/)
  assert.match(page.headers.get('content-security-policy'), /connect-src 'self'/)
  assert.match(page.headers.get('x-robots-tag'), /noindex/)
  assert.equal(page.headers.get('referrer-policy'),'no-referrer')
  assert.match(await (await fetch(base+'/robots.txt')).text(), /Disallow: \//)
  for (const url of ['/models/missing.glb', '/assets/missing.js', '/uploads/private.doc','/.env','/backup.sql','/app.js.map','/.git/config','/server/package.json','/%2Eenv']) assert.equal((await fetch(base + url)).status, 404,url)
  const asset = await fetch(base + '/uploads/part-models/a.glb',{headers:{Authorization:'Bearer fixture',Cookie:'spare_parts_asset_session=fixture'}})
  assert.equal(asset.headers.get('content-type'), 'model/gltf-binary')
  assert.equal(await asset.text(), '/uploads/part-models/a.glb')
  assert.equal(forwarded.authorization,'Bearer fixture')
  assert.equal(forwarded.cookie,'spare_parts_asset_session=fixture')
  assert.match(asset.headers.get('cache-control'),/no-store/)
})
