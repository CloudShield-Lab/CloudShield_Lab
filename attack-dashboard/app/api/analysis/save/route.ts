import { NextRequest, NextResponse } from 'next/server';
import { saveSession } from '@/lib/analysis-storage';
import { fetchWazuhAlerts } from '@/lib/wazuh';
import type { AnalysisSession } from '@/types';

export async function POST(request: NextRequest) {
  if (!process.env.ANALYSIS_S3_BUCKET && !process.env.AWS_REGION) {
    // Allow even without explicit ANALYSIS_S3_BUCKET (uses default tfstate bucket)
  }

  let session: AnalysisSession;
  try {
    session = (await request.json()) as AnalysisSession;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!session.sessionId || !session.scenario || !session.mode) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  if (session.startTime && !session.wazuhAlerts) {
    const bufferMs = 30_000;
    const toTime = new Date(new Date(session.timestamp).getTime() + bufferMs).toISOString();
    const [vulnAlerts, secureAlerts] = await Promise.all([
      fetchWazuhAlerts({ from: session.startTime, to: toTime, envFilter: 'vul' }),
      fetchWazuhAlerts({ from: session.startTime, to: toTime, envFilter: 'sec' }),
    ]);
    session.wazuhAlerts = [...vulnAlerts, ...secureAlerts];
  }

  try {
    const s3Key = await saveSession(session);
    return NextResponse.json({ sessionId: session.sessionId, s3Key });
  } catch (e) {
    // S3 unavailable (e.g. local dev without credentials) → non-fatal
    console.warn('[analysis/save] S3 unavailable (local dev?):', (e as Error).message);
    return NextResponse.json({ sessionId: session.sessionId, s3Key: null, warn: 'S3 unavailable' });
  }
}
