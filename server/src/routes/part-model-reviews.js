'use strict';
const express = require('express');
const { asyncHandler, ApiError } = require('../utils');
const { requireAnyWorkshopEditor } = require('../workshop-scope');
const reviews = require('../model-reviews');
function createRouter(pool, options = {}) {
 const router = express.Router();
 router.use((req, _res, next) => req.user ? next() : next(new ApiError(401, '请先登录')));
 router.get('/part-models/:id/review', asyncHandler(async (req, res) => res.json({ success: true, data: await reviews.detail(pool, req.user, req.params.id, options) })));
 router.post('/part-models/:id/reviews', requireAnyWorkshopEditor, asyncHandler(async (req, res) => res.status(201).json({ success: true, data: await reviews.submit(pool, req.user, req.params.id, req.body, options) })));
 return router;
}
module.exports = { createRouter };
