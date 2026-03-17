'use strict';

const multer = require('multer');
const { body, param } = require('express-validator');
const { validateRequest } = require('../middleware/validateRequest');
const FilesService = require('../services/files.service');
const env = require('../config/env');

// Store file in memory — Fargate has no persistent disk.
// The buffer is passed directly to S3.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_FILE_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (env.ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type not allowed: ${file.mimetype}`));
    }
  },
});

const shareValidation = [
  param('id').isUUID().withMessage('Invalid file ID'),
  body('expiresInHours')
    .optional()
    .isInt({ min: 1, max: 168 })
    .withMessage('expiresInHours must be between 1 and 168'),
  validateRequest,
];

async function uploadFile(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file attached' });
    }
    const record = await FilesService.uploadFile({
      file: req.file,
      ownerId: req.user.id,
      ip: req.ip,
    });
    return res.status(201).json({ file: record });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
}

async function listFiles(req, res) {
  try {
    const files = await FilesService.listFiles(req.user.id);
    return res.status(200).json({ files });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function downloadFile(req, res) {
  try {
    const result = await FilesService.getDownloadUrl(req.params.id, req.user.id, req.ip);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
}

async function deleteFile(req, res) {
  try {
    const result = await FilesService.deleteFile(req.params.id, req.user.id, req.ip);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
}

async function shareFile(req, res) {
  try {
    const expiresInHours = req.body.expiresInHours || 24;
    const link = await FilesService.createShareLink({
      fileId: req.params.id,
      ownerId: req.user.id,
      expiresInHours,
      ip: req.ip,
    });
    return res.status(201).json({ shareLink: link });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
}

module.exports = {
  upload,
  uploadFile,
  listFiles,
  downloadFile,
  deleteFile,
  shareFile,
  shareValidation,
};
