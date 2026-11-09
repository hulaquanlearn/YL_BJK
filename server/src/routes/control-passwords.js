const express = require('express');
const { ApiError } = require('../utils');
const { canRead, canManage, createStore } = require('../control-passwords');

function createRouter(store = createStore()) {
  const router = express.Router();
  router.use((req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    if (!req.user) return next(new ApiError(401, '请先登录'));
    if (!canRead(req.user)) return next(new ApiError(403, '仅系统管理员和制曲人员可查看中控密码'));
    next();
  });
  router.get('/', (req, res) => res.json({ success: true, data: { ...store.list(), canManage: canManage(req.user) } }));
  router.get('/:id/secret', (req, res) => res.json({ success: true, data: store.secret(req.params.id) }));
  router.put('/:id', (req, res, next) => {
    if (!canManage(req.user)) return next(new ApiError(403, '仅系统管理员和制曲管理员可维护中控密码'));
    res.json({ success: true, data: store.update(req.params.id, req.body, req.user) });
  });
  return router;
}
module.exports = { createRouter };
