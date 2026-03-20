import { NextResponse } from 'next/server';
import https from 'node:https';
import http from 'node:http';

// 진단용 엔드포인트 — Wazuh 연결 상태 및 실제 응답 구조 확인
// GET /api/analysis/wazuh-debug

const INSECURE = process.env.WAZUH_INSECURE === 'true';

function wazuhRequest(
  url: string,
  options: { method?: string; headers?: Record<string, string> },
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
      res.on('end', () => {
        resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf-8') });
      });
    });

    req.on('error', reject);
    req.setTimeout(8000, () => req.destroy(new Error('timeout')));
    req.end();
  });
}

export async function GET() {
  const wazuhApiUrl = process.env.WAZUH_API_URL;
  const result: Record<string, unknown> = {
    config: {
      WAZUH_API_URL: wazuhApiUrl ?? '(not set)',
      WAZUH_API_USER: process.env.WAZUH_API_USER ?? '(not set)',
      WAZUH_INSECURE: process.env.WAZUH_INSECURE ?? '(not set)',
      WAZUH_API_PASSWORD: process.env.WAZUH_API_PASSWORD ? '(set)' : '(not set)',
    },
  };

  if (!wazuhApiUrl) {
    return NextResponse.json({ ...result, error: 'WAZUH_API_URL not configured' }, { status: 503 });
  }

  // ── Step 1: Auth ─────────────────────────────────────
  let token: string | null = null;
  try {
    const authResp = await wazuhRequest(`${wazuhApiUrl}/security/user/authenticate`, {
      method: 'POST',
      headers: {
        Authorization:
          'Basic ' +
          Buffer.from(
            `${process.env.WAZUH_API_USER ?? 'wazuh'}:${process.env.WAZUH_API_PASSWORD ?? ''}`,
          ).toString('base64'),
        'Content-Type': 'application/json',
      },
    });

    result.auth = { status: authResp.status, rawBody: authResp.body.slice(0, 500) };

    if (authResp.status >= 200 && authResp.status < 300) {
      const parsed = JSON.parse(authResp.body) as { data?: { token?: string } };
      token = parsed.data?.token ?? null;
      result.auth = { ...result.auth as object, tokenObtained: !!token };
    }
  } catch (e) {
    result.auth = { error: (e as Error).message };
    return NextResponse.json(result, { status: 200 });
  }

  if (!token) {
    return NextResponse.json({ ...result, error: 'No token' }, { status: 200 });
  }

  // ── Step 2: /alerts without any filters (raw) ────────
  try {
    const alertsResp = await wazuhRequest(`${wazuhApiUrl}/alerts?limit=5`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    let parsedAlerts: unknown = null;
    try { parsedAlerts = JSON.parse(alertsResp.body); } catch { /* raw only */ }

    result.alerts_raw = {
      status: alertsResp.status,
      rawBody: alertsResp.body.slice(0, 2000),
      parsed: parsedAlerts,
    };
  } catch (e) {
    result.alerts_raw = { error: (e as Error).message };
  }

  // ── Step 3: /agents (에이전트 이름 확인) ──────────────
  try {
    const agentsResp = await wazuhRequest(`${wazuhApiUrl}/agents?limit=20`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    let parsedAgents: unknown = null;
    try { parsedAgents = JSON.parse(agentsResp.body); } catch { /* raw only */ }

    result.agents = {
      status: agentsResp.status,
      parsed: parsedAgents,
    };
  } catch (e) {
    result.agents = { error: (e as Error).message };
  }

  return NextResponse.json(result, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
