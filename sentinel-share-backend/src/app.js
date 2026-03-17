'use strict';

// Validate env at startup — fail fast before accepting connections
require('./config/env');

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const env = require('./config/env');
const { log } = require('./config/logger');
const { apiLimiter } = require('./middleware/rateLimiter');

const authRoutes = require('./routes/auth.routes');
const filesRoutes = require('./routes/files.routes');
const sharedRoutes = require('./routes/shared.routes');

const app = express();

// --- Security headers ---
app.use(helmet());

// --- CORS ---
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || env.CORS_ORIGIN.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    methods: ['GET', 'POST', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);

// --- HTTP access log ---
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    log('info', 'HTTP_ACCESS', {
      ip: req.ip, method: req.method, path: req.path,
      status: res.statusCode, latency_ms: Date.now() - start,
    });
  });
  next();
});

// --- Body parsers ---
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// --- Global rate limit ---
app.use(apiLimiter);

// --- Health check (ECS uses this via Service Connect or a custom check) ---
app.get('/health', (_req, res) => res.status(200).json({ status: 'ok' }));

// --- Routes ---
app.use('/api/auth', authRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/shared', sharedRoutes);

// --- 404 ---
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// --- Global error handler ---
app.use((err, req, res, _next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'File too large' });
  }
  const status = err.statusCode || err.status || 500;
  if (status === 500) {
    log('error', 'SERVER_ERROR', {
      ip: req.ip, method: req.method, path: req.path,
      status: 500, error_message: err.message,
    });
  }
  const message =
    env.NODE_ENV === 'production' && status === 500 ? 'Internal server error' : err.message;
  res.status(status).json({ error: message });
});

const PORT = env.PORT;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[SentinelShare] Backend running on port ${PORT} (${env.NODE_ENV})`);
});

module.exports = app;
