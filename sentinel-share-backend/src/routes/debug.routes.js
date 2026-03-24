'use strict';

const express = require('express');
const router = express.Router();

// 의도적 SSRF 취약 엔드포인트 — IMDSv1/v2 차이 시뮬레이션용
// URL 검증 없이 서버 측에서 요청을 그대로 전달 (취약 동작 의도적 구현)
router.post('/api/debug/fetch-url', async (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'url required' });
  }
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
    const text = await response.text();
    return res.status(response.status).type('text/plain').send(text);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
