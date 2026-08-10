const express = require('express')
const http = require('http')
const path = require('path')

const app = express()
const PORT = Number(process.env.PORT) || 8503
const API_TARGET = new URL(process.env.API_TARGET || 'http://127.0.0.1:3000')

app.disable('x-powered-by')

app.use('/api', (req, res) => {
  const options = {
    hostname: API_TARGET.hostname,
    port: API_TARGET.port || 80,
    path: req.originalUrl,
    method: req.method,
    headers: { ...req.headers, host: API_TARGET.host },
    timeout: 35000
  }

  const proxy = http.request(options, proxyRes => {
    res.writeHead(proxyRes.statusCode || 502, proxyRes.headers)
    proxyRes.pipe(res)
  })
  proxy.on('timeout', () => proxy.destroy(new Error('API请求超时')))
  proxy.on('error', error => {
    console.error('API proxy error:', error.message)
    if (!res.headersSent) res.status(502).json({ success: false, msg: '后端服务暂不可用' })
  })
  req.pipe(proxy)
})

app.use(express.static(path.join(__dirname, 'dist'), {
  maxAge: '7d',
  etag: true,
  index: false
}))

app.get('/{*splat}', (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache')
  res.sendFile(path.join(__dirname, 'dist', 'index.html'))
})

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Spare parts web listening on http://127.0.0.1:${PORT}`)
})
