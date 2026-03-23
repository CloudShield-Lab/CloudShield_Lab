'use strict';

require('dotenv').config();

const required = [
  'JWT_SECRET',
  'DB_HOST',
  'DB_NAME',
  'DB_USER',
  'DB_PASSWORD',
  'S3_BUCKET_NAME',
  'AWS_REGION',
];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

module.exports = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '3000', 10),

  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '1h',

  DB_HOST: process.env.DB_HOST,
  DB_PORT: parseInt(process.env.DB_PORT || '5432', 10),
  DB_NAME: process.env.DB_NAME,
  DB_USER: process.env.DB_USER,
  DB_PASSWORD: process.env.DB_PASSWORD,

  AWS_REGION: process.env.AWS_REGION,
  S3_BUCKET_NAME: process.env.S3_BUCKET_NAME,
  S3_SERVER_SIDE_ENCRYPTION: process.env.S3_SERVER_SIDE_ENCRYPTION || '',
  S3_SSE_KMS_KEY_ID: process.env.S3_SSE_KMS_KEY_ID || '',
  PRESIGNED_URL_TTL: parseInt(process.env.PRESIGNED_URL_TTL || '300', 10),

  MAX_FILE_SIZE_BYTES:
    parseInt(process.env.MAX_FILE_SIZE_MB || '100', 10) * 1024 * 1024,

  ALLOWED_MIME_TYPES: (
    process.env.ALLOWED_MIME_TYPES ||
    'image/jpeg,image/png,image/gif,image/webp,application/pdf,text/plain,application/zip'
  ).split(','),

  CORS_ORIGIN: (
    process.env.CORS_ORIGIN ||
    (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3001')
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
};
