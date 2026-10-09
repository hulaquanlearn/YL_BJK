const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
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
const { requireAuth, requireAssetAuth, assertAuthConfig } = require('./auth');
const { privateResponse, createAccessLimits } = require('./data-protection');
const { enforceReadOnly } = require('./workshop-scope');

assertAuthConfig();

const app = express();
app.set('trust proxy', 'loopback');
app.use(helmet());
app.use(cors({ origin: false }));
app.use(privateResponse);
const accessLimits = createAccessLimits();
app.use(accessLimits.ip);
// Inspection reports can contain 200 reviewed, long text entries. Keep the larger
// JSON limit scoped to this authenticated feature instead of raising every API route.
app.use('/api/inspection-notices', requireAuth, express.json({ limit: '4mb' }));
app.use(express.json({ limit: '1mb' }));
app.use(express.text({ type: 'text/plain', limit: '8kb' }));
// All uploaded and bundled model/reference assets require a live session.
// No business directory is publicly mapped, including the packaged reference photos.
app.use('/uploads', requireAssetAuth, accessLimits.asset);
const privateStatic = { index:false, dotfiles:'deny', cacheControl:false, etag:false, lastModified:false };
app.use('/uploads/part-images', express.static(config.parts.uploadDir, privateStatic));
app.use('/uploads/part-models', express.static(config.parts.modelDir, privateStatic));
const modelRoots = process.env.MODEL_ASSETS_DIR ? [path.resolve(process.env.MODEL_ASSETS_DIR)]
  : [path.resolve(__dirname, '../../web/dist'), path.resolve(__dirname, '../../spare-parts-web-release/public')];
app.use('/models', requireAssetAuth, accessLimits.asset,
  ...modelRoots.map(root => express.static(path.join(root, 'models'), privateStatic)));

app.get('/api/health', async (_req, res) => {
  try {
    await checkDatabase();
    res.json({ success: true, service: 'spare-parts-api', database: 'connected' });
  } catch (error) {
    res.status(503).json({ success: false, service: 'spare-parts-api', database: 'unavailable' });
  }
});

app.use('/api/auth', authRouter);
// Temporarily retired, including agent callbacks and both Siemens/ABB analysis.
// Keep historical program records and uploads for a possible future restoration.
app.use(['/api/plc', '/api/program-agent'], (_req, res) => {
  res.status(410).json({ success: false, msg: 'PLC 和 ABB 程序分析功能已停用' });
});
// 已下线的采购/供应商旧地址在认证前直接返回410，让旧客户端获得稳定、明确的停用状态。
app.use(['/api/suppliers', '/api/suppliers/*', '/api/procurement-orders', '/api/procurement-orders/*'], (_req, res) => {
  res.status(410).json({ success: false, msg: '采购与供应商功能已停用' });
});
app.use('/api', requireAuth);
app.use('/api', accessLimits.account, accessLimits.hourly);
app.use('/api', (req, res, next) => /\/(download|preview|import-template|export)$/.test(req.path)
  ? accessLimits.download(req, res, next) : next());
// Separate scoped workflow: assigned staff can write their own work records only.
// Inventory's viewer restrictions remain unchanged.
app.use('/api/work', require('./routes/work'));
app.use('/api/inspection-notices', require('./routes/inspection-notices'));
app.use('/api', enforceReadOnly);
app.use('/api/users', usersRouter);
app.use('/api', partsRouter);
app.use('/api', inventoryRouter);
app.use('/api', warehouseLayoutRouter);
app.use('/api', operationsRouter);
app.use('/api', knowledgeRouter);
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
  const stopScoring = require('./work-score-scheduler').startScheduler({
    pool: require('./db').pool,
    generate: require('./routes/work').generateSuggestion
  });
  const server = app.listen(config.port, '127.0.0.1', () => {
    console.log(`Spare parts API listening on 127.0.0.1:${config.port}`);
  });
  server.on('close', stopScoring);
  return server;
}

if (require.main === module) {
  start().catch(error => {
    console.error('Startup failed:', error);
    process.exitCode = 1;
  });
}

module.exports = app;
module.exports.start = start;
