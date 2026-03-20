import { NextRequest, NextResponse } from 'next/server';
import { saveSession } from '@/lib/analysis-storage';
import { normalizeApiBaseUrl } from '@/lib/url-utils';
import type { AnalysisSession } from '@/types';

async function fetchRawLogs(baseUrl: string, from: string, to: string): Promise<string[]> {
  try {
    const url = `${normalizeApiBaseUrl(baseUrl)}/api/logs?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return [];
    const data = (await res.json()) as { logs?: string[] };
    return data.logs ?? [];
  } catch {
    return [];
  }
}

export async function POST(request: NextRequest) {
  let session: AnalysisSession;
  try {
    session = (await request.json()) as AnalysisSession;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!session.sessionId || !session.scenario || !session.mode) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  if (session.startTime) {
    const bufferMs = 30_000;
    const toTime = new Date(new Date(session.timestamp).getTime() + bufferMs).toISOString();

    const isAuto = session.mode === 'auto';
    const vulnUrl = isAuto ? process.env.AUTO_VULNERABLE_API_URL : process.env.VULNERABLE_API_URL;
    const secureUrl = isAuto ? process.env.AUTO_AWS_API_URL : process.env.AWS_API_URL;

    const [vulnLogs, secureLogs] = await Promise.all([
      vulnUrl ? fetchRawLogs(vulnUrl, session.startTime, toTime) : Promise.resolve([]),
      secureUrl ? fetchRawLogs(secureUrl, session.startTime, toTime) : Promise.resolve([]),
    ]);

    session.rawLogs = { vulnerable: vulnLogs, secure: secureLogs };
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
