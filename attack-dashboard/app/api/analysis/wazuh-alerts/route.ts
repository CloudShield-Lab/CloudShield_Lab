import { NextRequest, NextResponse } from 'next/server';
import type { WazuhAlert } from '@/types';

// Phase 3: Wazuh API 연동
// ECS 환경변수: WAZUH_API_URL, WAZUH_API_USER, WAZUH_API_PASSWORD
export async function GET(request: NextRequest) {
  const wazuhApiUrl = process.env.WAZUH_API_URL;
  if (!wazuhApiUrl) {
    return NextResponse.json(
      { error: 'Wazuh API not configured (WAZUH_API_URL missing)' },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const env = url.searchParams.get('env') ?? 'vulnerable';
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');

  try {
    // Authenticate with Wazuh API
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
    });

    if (!authRes.ok) {
      return NextResponse.json({ error: 'Wazuh authentication failed' }, { status: 502 });
    }

    const authData = (await authRes.json()) as { data?: { token?: string } };
    const token = authData.data?.token;
    if (!token) {
      return NextResponse.json({ error: 'No token from Wazuh' }, { status: 502 });
    }

    // Query alerts
    const params = new URLSearchParams({ limit: '100' });
    if (from) params.set('timestamp', `>${from}`);
    if (env) params.set('q', `agent.name~${env}`);

    const alertsRes = await fetch(`${wazuhApiUrl}/alerts?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!alertsRes.ok) {
      return NextResponse.json({ error: `Wazuh alerts error: ${alertsRes.status}` }, { status: 502 });
    }

    const alertsData = (await alertsRes.json()) as { data?: { affected_items?: WazuhAlert[] } };
    const alerts = alertsData.data?.affected_items ?? [];

    // Filter by time range if provided
    const filtered = alerts.filter((a) => {
      if (from && a.timestamp < from) return false;
      if (to && a.timestamp > to) return false;
      return true;
    });

    return NextResponse.json(filtered);
  } catch (e) {
    console.error('[analysis/wazuh-alerts] error:', e);
    return NextResponse.json({ error: 'Failed to fetch Wazuh alerts' }, { status: 503 });
  }
}
