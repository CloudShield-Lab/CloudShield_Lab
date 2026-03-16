'use strict';

const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { log } = require('../config/logger');

/**
 * Verifies the Bearer JWT token attached to the request.
 * Attaches the decoded payload to req.user on success.
 */
function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    log('warn', 'AUTH_INVALID_TOKEN', { ip: req.ip, method: req.method, path: req.path, status: 401, reason: 'missing_header' });
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    req.user = { id: payload.sub, email: payload.email, role: payload.role };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      log('warn', 'AUTH_INVALID_TOKEN', { ip: req.ip, method: req.method, path: req.path, status: 401, reason: 'token_expired' });
      return res.status(401).json({ error: 'Token expired' });
    }
    log('warn', 'AUTH_INVALID_TOKEN', { ip: req.ip, method: req.method, path: req.path, status: 401, reason: 'invalid_token' });
    return res.status(401).json({ error: 'Invalid token' });
  }
}

module.exports = { authenticate };
