const crypto = require('crypto');
const { ApiError } = require('./utils');

function claimHash(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function assertClaim(project, token, requireActive = true) {
  const expected = String(project.claimHash || '');
  const actual = claimHash(token);
  if (String(token || '').length < 32 || expected.length !== actual.length ||
      !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual))) {
    throw new ApiError(409, '任务已由其他节点领取，请停止本次结果提交');
  }
  if (requireActive && (project.parseStatus !== 'extracting' || !Number(project.leaseActive))) {
    throw new ApiError(409, '解析任务租约已失效，请重新领取');
  }
}

function excludedJobIds(value) {
  if (!value) return [];
  const ids = String(value).split(',');
  if (ids.length > 100 || ids.some(id => !/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) < 1)) {
    throw new ApiError(400, '无效的任务排除列表');
  }
  return [...new Set(ids.map(Number))];
}

module.exports = { claimHash, assertClaim, excludedJobIds };
