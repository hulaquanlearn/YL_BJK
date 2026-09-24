const express = require('express')
const http = require('http')
const https = require('https')
const path = require('path')
const fs = require('fs')

function createWebApp({ distDir = path.join(__dirname, 'dist'), apiTarget = process.env.API_TARGET || 'http://127.0.0.1:3000' } = {}) {
  const indexFile = path.join(path.resolve(distDir), 'index.html')
  if (!fs.existsSync(indexFile)) throw new Error(`缺少前端入口 ${indexFile}。请将部署包 web-dist/ 的内容放入 web/dist/，不要铺到 web/ 根目录。`)
  const target = new URL(apiTarget)
  if (!['http:', 'https:'].includes(target.protocol)) throw new Error('API_TARGET must use http or https')
  const transport = target.protocol === 'https:' ? https : http
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', 'loopback')
  app.use((_req, res, next) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'SAMEORIGIN')
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; media-src 'self' blob:; frame-src 'self' blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'")
    next()
  })
  app.get('/robots.txt', (_req, res) => res.type('text/plain').send('User-agent: *\nDisallow: /\n'))
  // Fail closed even if a deployment accidentally copies private files into dist.
  app.use((req, res, next) => {
    let pathname
    try { pathname = decodeURIComponent(req.path) } catch { return res.sendStatus(400) }
    if (/(?:^|\/)\.[^/]|^\/(?:server|src|data|backups?|output|node_modules)(?:\/|$)|\.(?:map|sql|log|bak|backup|sqlite3?|db|zip|gz|tgz|env|vue|ts)$/i.test(pathname)) return res.sendStatus(404)
    next()
  })
  const proxyRequest = (req, res) => {
    const proxy = transport.request({
      hostname: target.hostname, port: target.port || (target.protocol === 'https:' ? 443 : 80),
      path: req.originalUrl, method: req.method, headers: { ...req.headers, host: target.host, 'x-forwarded-for': req.ip },
      timeout: Math.min(1800000, Math.max(35000, Number(process.env.API_PROXY_TIMEOUT_MS) || 300000))
    }, upstream => { res.writeHead(upstream.statusCode || 502, upstream.headers); upstream.pipe(res) })
    proxy.on('timeout', () => proxy.destroy(new Error('upstream timeout')))
    proxy.on('error', () => { if (!res.headersSent) res.status(502).json({ success: false, msg: '后端服务暂不可用或处理超时' }); else res.destroy() })
    req.on('aborted', () => proxy.destroy())
    res.on('close', () => { if (!res.writableEnded) proxy.destroy() })
    req.pipe(proxy)
  }
  app.use(['/api', '/models', '/uploads/part-images', '/uploads/part-models'], proxyRequest)
  app.use('/uploads', (_req, res) => res.sendStatus(404))
  app.use(express.static(path.resolve(distDir), {
    maxAge: '7d', etag: true, index: false, dotfiles: 'deny',
    setHeaders: (res, file) => {
      res.setHeader('X-Content-Type-Options', 'nosniff')
      if (file.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache')
    }
  }))
  app.get('/{*splat}', (req, res) => {
    if (path.extname(req.path) || /^\/(assets|models)(\/|$)/.test(req.path) || !req.accepts('html')) return res.sendStatus(404)
    res.setHeader('Cache-Control', 'no-cache')
    res.sendFile(indexFile)
  })
  return app
}

if (require.main === module) {
  try {
    const port = Number(process.env.PORT) || 8503
    createWebApp().listen(port, '127.0.0.1', () => console.log(`Spare parts web listening on http://127.0.0.1:${port}`))
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
module.exports = { createWebApp }
