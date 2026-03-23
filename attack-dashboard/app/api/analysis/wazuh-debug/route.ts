import { NextResponse } from 'next/server';
import https from 'node:https';
import http from 'node:http';

// 진단용 엔드포인트 — Wazuh Indexer(OpenSearch) 연결 상태 확인
// GET /api/analysis/wazuh-debug

const INSECURE = process.env.WAZUH_INSECURE === 'true';

function request(
  url: string,
  options: { method?: string; headers?: Record<string, string>; body?: string },
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const lib = isHttps ? https : http;

    const reqOptions: https.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: options.method ?? 'GET',
      headers: options.headers ?? {},
      ...(isHttps ? { rejectUnauthorized: !INSECURE } : {}),
    };

    const req = lib.request(reqOptions, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () =>
        resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf-8') }),
      );
    });

    req.on('error', reject);
    req.setTimeout(8000, () => req.destroy(new Error('timeout')));
    if (options.body) req.write(options.body);
    req.end();
  });
}

function getIndexerUrl() {
  if (process.env.WAZUH_INDEXER_URL) return process.env.WAZUH_INDEXER_URL;
  const apiUrl = process.env.WAZUH_API_URL;
  return apiUrl ? apiUrl.replace(':55000', ':9200') : null;
}

export async function GET() {
  const indexerUrl = getIndexerUrl();
  const user = process.env.WAZUH_INDEXER_USER ?? 'admin';
  const pass = process.env.WAZUH_INDEXER_PASSWORD ?? '';

  const result: Record<string, unknown> = {
    config: {
      WAZUH_API_URL: process.env.WAZUH_API_URL ?? '(not set)',
      indexerUrl: indexerUrl ?? '(derived from WAZUH_API_URL, not set)',
      WAZUH_INDEXER_USER: user,
      WAZUH_INDEXER_PASSWORD: pass ? '(set)' : '(NOT SET)',
      WAZUH_INSECURE: process.env.WAZUH_INSECURE ?? '(not set)',
    },
  };

  if (!indexerUrl) {
    return NextResponse.json({ ...result, error: 'Cannot derive Indexer URL' }, { status: 503 });
  }

  const auth = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');

  // ── Step 1: Indexer health ──────────────────────────
  try {
    const health = await request(`${indexerUrl}/_cluster/health`, {
      headers: { Authorization: auth },
    });
    result.cluster_health = { status: health.status, body: health.body.slice(0, 500) };
  } catch (e) {
    result.cluster_health = { error: (e as Error).message };
    return NextResponse.json(result);
  }

  // ── Step 2: List alert indices ──────────────────────
  try {
    const indices = await request(`${indexerUrl}/_cat/indices/wazuh-alerts-*?h=index,docs.count&format=json`, {
      headers: { Authorization: auth },
    });
    result.alert_indices = { status: indices.status, body: indices.body.slice(0, 1000) };
  } catch (e) {
    result.alert_indices = { error: (e as Error).message };
  }

  // ── Step 3: 최근 30분 알림 (시간 필터만, 에이전트 무관) ──
  const now = new Date();
  const from30m = new Date(now.getTime() - 30 * 60_000).toISOString();
  try {
    const recentQuery = JSON.stringify({
      size: 5,
      _source: ['timestamp', 'rule.level', 'rule.description', 'agent.name'],
      query: { range: { timestamp: { gte: from30m, lte: now.toISOString() } } },
      sort: [{ timestamp: { order: 'desc' } }],
    });
    const recent = await request(`${indexerUrl}/wazuh-alerts-4.x-*/_search`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: recentQuery,
    });
    let parsed: unknown = null;
    try { parsed = JSON.parse(recent.body); } catch { /* raw only */ }
    result.recent_30m = { status: recent.status, from: from30m, parsed };
  } catch (e) {
    result.recent_30m = { error: (e as Error).message };
  }

  // ── Step 4: agent.name.keyword 와일드카드 테스트 ───────
  try {
    const agentQuery = JSON.stringify({
      size: 3,
      _source: ['timestamp', 'rule.level', 'rule.description', 'agent.name'],
      query: { wildcard: { 'agent.name.keyword': '*vul*' } },
      sort: [{ timestamp: { order: 'desc' } }],
    });
    const agentTest = await request(`${indexerUrl}/wazuh-alerts-4.x-*/_search`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: agentQuery,
    });
    let parsed: unknown = null;
    try { parsed = JSON.parse(agentTest.body); } catch { /* raw only */ }
    result.agent_wildcard_test = { status: agentTest.status, parsed };
  } catch (e) {
    result.agent_wildcard_test = { error: (e as Error).message };
  }

  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
