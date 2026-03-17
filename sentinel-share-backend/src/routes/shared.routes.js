'use strict';

const { Router } = require('express');
const { param } = require('express-validator');
const { validateRequest } = require('../middleware/validateRequest');
const FilesService = require('../services/files.service');

const router = Router();

// No authentication required — validated by token + expiry check in service
router.get(
  '/:token/download',
  [param('token').isHexadecimal().isLength({ min: 64, max: 64 }), validateRequest],
  async (req, res) => {
    try {
      const result = await FilesService.getSharedDownloadUrl(req.params.token, req.ip);
      return res.status(200).json(result);
    } catch (err) {
      return res.status(err.statusCode || 500).json({ error: err.message });
    }
  }
);

module.exports = router;
