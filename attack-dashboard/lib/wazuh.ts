import https from 'node:https';
import http from 'node:http';
import type { WazuhAlert } from '@/types';

const MAX_ALERTS = 50;
const INSECURE = process.env.WAZUH_INSECURE === 'true';

// Wazuh Manager REST API (port 55000) has no /alerts query endpoint.
// Alerts are indexed in Wazuh Indexer (OpenSearch, port 9200) — query via OpenSearch DSL.
function wazuhRequest(
  url: string,
  options: { method?: string; headers?: Record<string, string>; body?: string },
): Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }> {
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
          status,
          json: () => {
            try {
              return Promise.resolve(JSON.parse(body));
            } catch {
              return Promise.reject(new Error(`Invalid JSON: ${body.slice(0, 200)}`));
            }
          },
        });
      });
    });

    req.on('error', reject);
    req.setTimeout(10000, () => req.destroy(new Error('Wazuh request timeout')));

    if (options.body) req.write(options.body);
    req.end();
  });
}

function getIndexerUrl(): string | null {
  if (process.env.WAZUH_INDEXER_URL) return process.env.WAZUH_INDEXER_URL;
  // Derive from WAZUH_API_URL: replace Manager port 55000 → Indexer port 9200
  const apiUrl = process.env.WAZUH_API_URL;
  if (!apiUrl) return null;
  return apiUrl.replace(':55000', ':9200');
}

interface OpenSearchHit {
  _source: {
    timestamp?: string;
    rule?: { id?: string; level?: number; description?: string };
    agent?: { name?: string };
    full_log?: string;
  };
}

export async function fetchWazuhAlerts(options: {
  from: string;
  to: string;
  envFilter?: string;
}): Promise<WazuhAlert[]> {
  const indexerUrl = getIndexerUrl();
  if (!indexerUrl) return [];

  const user = process.env.WAZUH_INDEXER_USER ?? 'admin';
  const pass = process.env.WAZUH_INDEXER_PASSWORD ?? '';
  if (!pass) {
    console.warn('[wazuh] WAZUH_INDEXER_PASSWORD not set');
    return [];
  }

  const basicAuth = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');

  // Build OpenSearch DSL query
  const mustFilters: unknown[] = [
    { range: { timestamp: { gte: options.from, lte: options.to } } },
  ];
  if (options.envFilter) {
    mustFilters.push({ wildcard: { 'agent.name': `*${options.envFilter}*` } });
  }

  const query = {
    size: MAX_ALERTS,
    _source: ['timestamp', 'rule.id', 'rule.level', 'rule.description', 'agent.name', 'full_log'],
    query: { bool: { filter: mustFilters } },
    sort: [{ 'rule.level': { order: 'desc' } }],
  };

  try {
    const res = await wazuhRequest(`${indexerUrl}/wazuh-alerts-4.x-*/_search`, {
      method: 'POST',
      headers: {
        Authorization: basicAuth,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(query),
    });

    if (!res.ok) {
      console.warn('[wazuh] indexer query failed, status:', res.status);
      return [];
    }

    const data = (await res.json()) as { hits?: { hits?: OpenSearchHit[] } };
    const hits = data.hits?.hits ?? [];

    return hits
      .map((h) => ({
        id: `${h._source.agent?.name ?? 'unknown'}-${h._source.timestamp ?? ''}`,
        timestamp: h._source.timestamp ?? '',
        rule: {
          id: h._source.rule?.id ?? '',
          level: h._source.rule?.level ?? 0,
          description: h._source.rule?.description ?? '',
        },
        agent: { name: h._source.agent?.name ?? 'unknown' },
        full_log: h._source.full_log,
      }))
      .filter((a) => a.timestamp);
  } catch (e) {
    console.warn('[wazuh] fetchWazuhAlerts failed:', (e as Error).message);
    return [];
  }
}
