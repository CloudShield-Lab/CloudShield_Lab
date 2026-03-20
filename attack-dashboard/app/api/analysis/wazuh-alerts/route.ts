import { NextRequest, NextResponse } from 'next/server';
import { fetchWazuhAlerts } from '@/lib/wazuh';

// GET /api/analysis/wazuh-alerts?env=vulnerable&from=ISO&to=ISO
export async function GET(request: NextRequest) {
  const wazuhApiUrl = process.env.WAZUH_API_URL;
  if (!wazuhApiUrl) {
    return NextResponse.json(
      { error: 'Wazuh API not configured (WAZUH_API_URL missing)' },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const env = url.searchParams.get('env') ?? undefined;
  const from = url.searchParams.get('from') ?? new Date(Date.now() - 3600_000).toISOString();
  const to = url.searchParams.get('to') ?? new Date().toISOString();

  try {
    const alerts = await fetchWazuhAlerts({ from, to, envFilter: env });
    return NextResponse.json(alerts, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 503 });
  }
}
