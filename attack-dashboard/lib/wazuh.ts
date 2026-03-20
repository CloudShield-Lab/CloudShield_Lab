import https from 'node:https';
import http from 'node:http';
import type { WazuhAlert } from '@/types';

const MAX_ALERTS = 50;
const INSECURE = process.env.WAZUH_INSECURE === 'true';

// Next.js 15 uses undici-based fetch which ignores NODE_TLS_REJECT_UNAUTHORIZED.
// Use node:https directly so rejectUnauthorized: false is respected.
function wazuhRequest(
  url: string,
  options: { method?: string; headers?: Record<string, string>; body?: string },
): Promise<{ ok: boolean; json: () => Promise<unknown> }> {
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
        const body = Buffer.concat(chunks).toString('utf-8');
        const status = res.statusCode ?? 0;
        resolve({
          ok: status >= 200 && status < 300,
          json: () => {
            try {
              return Promise.resolve(JSON.parse(body));
            } catch {
              return Promise.reject(new Error(`Invalid JSON: ${body.slice(0, 100)}`));
            }
          },
        });
      });
    });

    req.on('error', reject);
    req.setTimeout(8000, () => req.destroy(new Error('Wazuh request timeout')));

    if (options.body) req.write(options.body);
    req.end();
  });
}

export async function fetchWazuhAlerts(options: {
  from: string;
  to: string;
  envFilter?: string;
}): Promise<WazuhAlert[]> {
  const wazuhApiUrl = process.env.WAZUH_API_URL;
  if (!wazuhApiUrl) return [];

  try {
    // Authenticate
    const authRes = await wazuhRequest(`${wazuhApiUrl}/security/user/authenticate`, {
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

    if (!authRes.ok) {
      console.warn('[wazuh] auth failed');
      return [];
    }

    const token = ((await authRes.json()) as { data?: { token?: string } }).data?.token;
    if (!token) {
      console.warn('[wazuh] no token in auth response');
      return [];
    }

    // Query alerts
    const params = new URLSearchParams({ limit: '100' });
    params.set('timestamp', `>${options.from}`);
    if (options.envFilter) params.set('q', `agent.name~${options.envFilter}`);

    const alertsRes = await wazuhRequest(`${wazuhApiUrl}/alerts?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!alertsRes.ok) {
      console.warn('[wazuh] alerts query failed');
      return [];
    }

    const data = (await alertsRes.json()) as { data?: { affected_items?: WazuhAlert[] } };
    const alerts = data.data?.affected_items ?? [];

    return alerts
      .filter((a) => a.timestamp >= options.from && a.timestamp <= options.to)
      .sort((a, b) => b.rule.level - a.rule.level)
      .slice(0, MAX_ALERTS);
  } catch (e) {
    console.warn('[wazuh] fetchWazuhAlerts failed:', (e as Error).message);
    return [];
  }
}
