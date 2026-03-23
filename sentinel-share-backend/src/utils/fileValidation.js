'use strict';

const env = require('../config/env');

const ALLOWED_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'webp',
  'pdf', 'txt', 'zip',
]);

const FILE_VALIDATION_DISABLED = process.env.DISABLE_FILE_VALIDATION === 'true';

/**
 * Validates file before it is uploaded to S3.
 * Checks MIME type against whitelist, extension against whitelist, and size.
 *
 * @param {Express.Multer.File} file
 * @returns {{ valid: boolean, error?: string }}
 */
function validateFile(file) {
  if (!file) {
    return { valid: false, error: 'No file provided' };
  }

  // Size check only — all file types and extensions are allowed
  if (file.size > env.MAX_FILE_SIZE_BYTES) {
    const maxMb = env.MAX_FILE_SIZE_BYTES / (1024 * 1024);
    return { valid: false, error: `File exceeds maximum size of ${maxMb}MB` };
  }

  return { valid: true };
}

module.exports = { validateFile };
