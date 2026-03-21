'use strict';

const express = require('express');
const router = express.Router();

// Mock vulnerable endpoints exposed without authentication.
// These simulate misconfigured or accidentally exposed paths
// that a bot scanner would discover on an unprotected server.

router.get('/admin', (_req, res) => {
  res.json({
    panel: 'SentinelShare Admin',
    version: '1.4.2',
    node_env: 'production',
    db_status: 'connected',
    storage: 's3://sentinelshare-files-prod-833453046706',
    users: [
      { id: 1, email: 'admin@sentinelshare.internal', role: 'admin', last_login: '2026-03-21T04:12:33Z' },
      { id: 2, email: 'victim@demo.com', role: 'user', last_login: '2026-03-20T18:45:01Z' },
    ],
  });
});

router.get('/wp-login.php', (_req, res) => {
  res.json({
    cms: 'WordPress 6.4.2',
    login_endpoint: '/wp-login.php',
    xmlrpc: 'enabled',
    admin_user: 'admin',
    theme: 'twentytwentyfour',
    plugins: ['contact-form-7', 'woocommerce', 'wp-file-manager'],
  });
});

router.get('/.env', (_req, res) => {
  res.type('text/plain').send(
    [
      'NODE_ENV=production',
      'PORT=3000',
      '',
      'DB_HOST=127.0.0.1',
      'DB_PORT=5432',
      'DB_NAME=sentinelshare',
      'DB_USER=postgres',
      'DB_PASSWORD=Pr0d_P@ssw0rd_2024!',
      '',
      'JWT_SECRET=hs256_jwt_s3cr3t_k3y_n0t_r0tat3d',
      'JWT_EXPIRES_IN=7d',
      '',
      'AWS_REGION=ap-northeast-2',
      'S3_BUCKET_NAME=sentinelshare-files-prod-833453046706',
      'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE',
      'AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    ].join('\n'),
  );
});

router.get('/phpmyadmin', (_req, res) => {
  res.json({
    panel: 'phpMyAdmin 5.2.1',
    server: '127.0.0.1:5432',
    current_user: 'postgres@localhost',
    databases: ['sentinelshare', 'information_schema', 'postgres', 'pg_catalog'],
    tables: {
      sentinelshare: ['users', 'files', 'shared_links'],
    },
  });
});

router.get('/server-status', (_req, res) => {
  res.json({
    hostname: 'ip-10-1-100-42.ap-northeast-2.compute.internal',
    internal_ip: '10.1.100.42',
    region: 'ap-northeast-2',
    uptime: '14d 3h 22m',
    load_avg: [0.12, 0.08, 0.05],
    node_version: 'v20.11.0',
    connections: { active: 3, idle: 12, total: 15 },
    memory_mb: { used: 312, total: 1024 },
  });
});

router.get('/config.bak', (_req, res) => {
  res.json({
    database: {
      host: '127.0.0.1',
      port: 5432,
      name: 'sentinelshare',
      user: 'postgres',
      password: 'Pr0d_P@ssw0rd_2024!',
    },
    jwt: {
      secret: 'hs256_jwt_s3cr3t_k3y_n0t_r0tat3d',
      expires_in: '7d',
    },
    s3: {
      bucket: 'sentinelshare-files-prod-833453046706',
      region: 'ap-northeast-2',
      access_key_id: 'AKIAIOSFODNN7EXAMPLE',
    },
  });
});

module.exports = router;
