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
// Daily duty entries can include seven days of notes; keep the larger bound scoped.
app.use('/api/raw-duties', requireAuth, express.json({ limit: '4mb' }));
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
app.use('/api', requireAuth);
app.use('/api', require('./ai-call-audit').auditMiddleware());
app.use('/api', require('./raw-staff-access').enforceRawEmployeeAccess);
app.use('/api', accessLimits.account, accessLimits.hourly);
app.use('/api', (req, res, next) => /\/(download|preview|import-template|export)$/.test(req.path)
  ? accessLimits.download(req, res, next) : next());
// Raw-grain duty and attendance permissions remain separate from inventory access.
app.use('/api/raw-duties', require('./routes/raw-duties').createRouter(require('./raw-duty-store').createStore(require('./db').pool)));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/work-storage', require('./routes/work-storage'));
app.use('/api/data-management', require('./routes/data-management').createRouter());
app.use('/api/robot-program', require('./routes/robot-program').createRouter());
app.use('/api', require('./routes/ai-call-logs').createRouter());
app.use('/api/personal-usage', require('./routes/personal-usage').createRouter());
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
  const server = app.listen(config.port, '127.0.0.1', () => {
    console.log(`Spare parts API listening on 127.0.0.1:${config.port}`);
  });
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
