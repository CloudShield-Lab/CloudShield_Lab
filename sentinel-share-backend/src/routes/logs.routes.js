'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();

// GET /api/logs?from=ISO&to=ISO
// Returns raw HTTP request strings logged during the given time window.
// Used by attack-dashboard for AI post-analysis.
router.get('/', (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) {
    return res.status(400).json({ error: 'from and to query params required (ISO 8601)' });
  }

  const logDir = process.env.LOG_DIR || '/opt/app/logs';
  const logFile = path.join(logDir, 'app.log');

  if (!fs.existsSync(logFile)) {
    return res.json({ logs: [], count: 0 });
  }

  const content = fs.readFileSync(logFile, 'utf-8');
  const logs = [];

  for (const line of content.split('\n')) {
    if (!line) continue;
    try {
      const entry = JSON.parse(line);
      if (
        entry.event === 'HTTP_ACCESS' &&
        entry.raw &&
        entry.timestamp >= from &&
        entry.timestamp <= to &&
        !entry.raw.startsWith('GET /health') &&
        !entry.raw.startsWith('GET /api/logs')
      ) {
        logs.push(entry.raw);
      }
    } catch {
      // skip malformed lines
    }
  }

  return res.json({ logs, count: logs.length });
});

module.exports = router;
