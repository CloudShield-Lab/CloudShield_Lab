'use strict';

const { Pool } = require('pg');
const env = require('./env');

const pool = new Pool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  database: env.DB_NAME,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  // EC2 co-located PostgreSQL uses self-signed cert — rejectUnauthorized: false
  // DB_SSL=true 로 명시하거나 production 환경일 때만 SSL 활성화
  ssl: (process.env.DB_SSL === 'true' || env.NODE_ENV === 'production')
    ? { rejectUnauthorized: false }
    : false,
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error:', err.message);
});

/**
 * Execute a parameterized query.
 * Always use this instead of pool.query directly to enforce prepared statements.
 */
async function query(text, params) {
  const start = Date.now();
  const result = await pool.query(text, params);
  if (env.NODE_ENV !== 'production') {
    console.debug(`[DB] query: ${text} | duration: ${Date.now() - start}ms`);
  }
  return result;
}

module.exports = { query, pool };
