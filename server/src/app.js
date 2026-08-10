const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const { checkDatabase } = require('./db');
const partsRouter = require('./routes/parts');
const inventoryRouter = require('./routes/inventory');
const aiRouter = require('./routes/ai');
const authRouter = require('./routes/auth');
const usersRouter = require('./routes/users');
const warehouseLayoutRouter = require('./routes/warehouse-layout');
const operationsRouter = require('./routes/operations');
const { requireAuth, assertAuthConfig } = require('./auth');

assertAuthConfig();

const app = express();
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: false }));
app.use(express.json({ limit: '1mb' }));
app.use(express.text({ type: 'text/plain', limit: '8kb' }));
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
app.use('/api', requireAuth);
app.use('/api/users', usersRouter);
app.use('/api', partsRouter);
app.use('/api', inventoryRouter);
app.use('/api', warehouseLayoutRouter);
app.use('/api', operationsRouter);
app.use('/api', aiRouter);

app.use((_req, res) => {
  res.status(404).json({ success: false, msg: '接口不存在' });
});

app.use((error, _req, res, _next) => {
  const operationalStatus = Number(error.status);
  const status = operationalStatus || 500;
  if (status >= 500) console.error(error);
  res.status(status).json({
    success: false,
    msg: operationalStatus ? error.message : '服务器内部错误',
    details: config.env === 'development' ? error.details : undefined
  });
});

app.listen(config.port, '127.0.0.1', async () => {
  console.log(`Spare parts API listening on 127.0.0.1:${config.port}`);
  try {
    await checkDatabase();
    console.log('MySQL connected');
  } catch (error) {
    console.error('MySQL connection failed:', error.message);
  }
});

module.exports = app;
