const rateLimit = require('express-rate-limit');

function privateResponse(_req, res, next) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
}

function createAccessLimits({ ip = 1200, account = 180, hourly = 2400, asset = 600, download = 30, logger = console.warn } = {}) {
  const make = (scope, limit, windowMs, byAccount = false) => rateLimit({
    windowMs, limit, standardHeaders: true, legacyHeaders: false,
    ...(byAccount ? { keyGenerator: req => String(req.user.id) } : {}),
    handler(req, res, _next, options) {
      // Never log tokens, query strings, questions, document contents or passwords.
      logger(JSON.stringify({event:'access_rate_limited',scope,userId:req.user?.id||null,ip:req.ip,method:req.method,path:req.path}));
      res.status(options.statusCode).json({success:false,msg:'访问过于频繁，请稍后重试'});
    }
  });
  return {
    ip: make('ip', ip, 60000),
    account: make('account', account, 60000, true),
    hourly: make('account_hour', hourly, 3600000, true),
    asset: make('asset', asset, 60000, true),
    download: make('download', download, 60000, true)
  };
}

module.exports = { privateResponse, createAccessLimits };
