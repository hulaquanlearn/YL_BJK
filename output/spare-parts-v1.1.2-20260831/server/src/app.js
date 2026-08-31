const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');
const { checkDatabase, ensureSchema } = require('./db');
const partsRouter = require('./routes/parts');
const inventoryRouter = require('./routes/inventory');
const aiRouter = require('./routes/ai');
const authRouter = require('./routes/auth');
const usersRouter = require('./routes/users');
const warehouseLayoutRouter = require('./routes/warehouse-layout');
const operationsRouter = require('./routes/operations');
const knowledgeRouter = require('./routes/knowledge');
const plcRouter = require('./routes/plc');
const plcAgentRouter = require('./routes/plc-agent');
const { requireAuth, assertAuthConfig } = require('./auth');

assertAuthConfig();

const app = express();
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: false }));
app.use(express.json({ limit: '1mb' }));
app.use(express.text({ type: 'text/plain', limit: '8kb' }));
// Only part preview assets are public. Knowledge and PLC source files must go
// through their authenticated download routes and must never be exposed by a
// broad static directory mapping.
app.use('/uploads/part-images', express.static(config.parts.uploadDir));
// Reusable display-only geometry is public so Three.js can load it directly.
// Knowledge attachments and industrial-program sources stay authenticated.
app.use('/uploads/part-models', express.static(config.parts.modelDir));
app.use(rateLimit({ windowMs: 60 * 1000, limit: 180, standardHeaders: true, legacyHeaders: false }));

app.get('/api/health', async (_req, res) => {
  try {
    await checkDatabase();
    res.json({ success: true, service: 'spare-parts-api', database: 'connected' });
  } catch (error) {
    res.status(503).json({ success: false, service: 'spare-parts-api', database: 'unavailable' });
  }
});

app.use('/api/auth', authRouter);
app.use('/api/program-agent', plcAgentRouter);
// 已下线的采购/供应商旧地址在认证前直接返回410，让旧客户端获得稳定、明确的停用状态。
app.use(['/api/suppliers', '/api/suppliers/*', '/api/procurement-orders', '/api/procurement-orders/*'], (_req, res) => {
  res.status(410).json({ success: false, msg: '采购与供应商功能已停用' });
});
app.use('/api', requireAuth);
app.use('/api/users', usersRouter);
app.use('/api', partsRouter);
app.use('/api', inventoryRouter);
app.use('/api', warehouseLayoutRouter);
app.use('/api', operationsRouter);
app.use('/api', knowledgeRouter);
app.use('/api', plcRouter);
app.use('/api', aiRouter);

app.use((_req, res) => {
  res.status(404).json({ success: false, msg: '接口不存在' });
});

app.use((error, _req, res, _next) => {
  const operationalStatus = Number(error.status);
  const status = operationalStatus || 500;
  const errorId = status >= 500 ? crypto.randomUUID() : undefined;
  if (status >= 500) console.error(`[${errorId}]`, error);
  res.status(status).json({
    success: false,
    msg: operationalStatus ? error.message : `服务器内部错误（错误编号：${errorId}）`,
    errorId,
    // 行号、字段、原因和建议属于可安全返回的业务校验信息；内部异常细节不对外暴露。
    details: operationalStatus ? error.details : (config.env === 'development' ? error.details : undefined)
  });
});

async function start() {
  // Do not report the PM2 process as healthy when the database or an
  // incremental schema repair failed. Finish all required checks first.
  await checkDatabase();
  console.log('MySQL connected');
  await ensureSchema();
  console.log('Schema check complete');
  return app.listen(config.port, '127.0.0.1', () => {
    console.log(`Spare parts API listening on 127.0.0.1:${config.port}`);
  });
}

if (require.main === module) {
  start().catch(error => {
    console.error('Startup failed:', error);
    process.exitCode = 1;
  });
}

module.exports = app;
module.exports.start = start;
