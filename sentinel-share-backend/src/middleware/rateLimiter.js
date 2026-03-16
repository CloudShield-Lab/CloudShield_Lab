'use strict';

const rateLimit = require('express-rate-limit');
const { log } = require('../config/logger');

/**
 * General API limiter applied globally.
 * 200 requests per minute per IP.
 *
 * 브루트포스 방어는 앱 코드가 아닌 AWS WAF에서 담당한다.
 * 로컬(취약 환경)에서는 WAF가 없으므로 rate limit이 없는 상태가 된다.
 * → 동일한 코드베이스로 인프라 보호 효과를 시연하기 위한 의도적 설계.
 */
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
  handler(req, res, next, options) {
    log('warn', 'RATE_LIMIT_TRIGGERED', {
      ip: req.ip, method: req.method, path: req.path, status: 429,
    });
    res.status(options.statusCode).json(options.message);
  },
});

module.exports = { apiLimiter };
