import type { WazuhAlert } from '@/types';

const MAX_ALERTS = 20;

export async function fetchWazuhAlerts(options: {
  from: string;
  to: string;
  envFilter?: string;
}): Promise<WazuhAlert[]> {
  const wazuhApiUrl = process.env.WAZUH_API_URL;
  if (!wazuhApiUrl) return [];

  try {
    const authRes = await fetch(`${wazuhApiUrl}/security/user/authenticate`, {
      method: 'POST',
      headers: {
        Authorization:
          'Basic ' +
          Buffer.from(
            `${process.env.WAZUH_API_USER ?? 'wazuh'}:${process.env.WAZUH_API_PASSWORD ?? ''}`,
          ).toString('base64'),
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!authRes.ok) return [];

    const token = ((await authRes.json()) as { data?: { token?: string } }).data?.token;
    if (!token) return [];

    const params = new URLSearchParams({ limit: '100' });
    params.set('timestamp', `>${options.from}`);
    if (options.envFilter) params.set('q', `agent.name~${options.envFilter}`);

    const alertsRes = await fetch(`${wazuhApiUrl}/alerts?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!alertsRes.ok) return [];

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
