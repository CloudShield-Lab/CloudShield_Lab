'use strict';

const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');

const { combine, timestamp, json } = winston.format;

// Remove the empty sentinel message field so output is flat JSON
// matching LOG_FORMAT_SPEC.txt: { timestamp, level, event, ...fields }
const stripSentinel = winston.format((info) => {
  if (info.message === '') delete info.message;
  return info;
});

const fmt = combine(timestamp(), stripSentinel(), json());

const logger = winston.createLogger({
  level: 'info',
  format: fmt,
  transports: [
    new winston.transports.Console(),
    new DailyRotateFile({
      dirname: process.env.LOG_DIR || '/opt/app/logs',
      filename: 'app-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxFiles: '14d',
      auditFile: false,
      createSymlink: true,
      symlinkName: 'app.log',
    }),
  ],
});

// log(level, event, extraFields)
// Produces flat JSON: { timestamp, level, event, ...fields }
function log(level, event, fields = {}) {
  logger[level]('', { event, ...fields });
}

module.exports = { log };
