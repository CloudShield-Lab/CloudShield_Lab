import { NextRequest, NextResponse } from 'next/server';
import { saveSession } from '@/lib/analysis-storage';
import { getTerraformOutputs } from '@/lib/terraform-state';
import { normalizeApiBaseUrl } from '@/lib/url-utils';
import type { AnalysisSession } from '@/types';

async function fetchRawLogs(baseUrl: string, from: string, to: string): Promise<string[]> {
  try {
    const url = `${normalizeApiBaseUrl(baseUrl)}/api/logs?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return [];
    // CloudFront custom_error_response: WAF 403 → 200+HTML 변환 오탐 방지
    const isJson = (res.headers.get('content-type') || '').includes('application/json');
    if (!isJson) return [];
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
    let vulnUrl = isAuto ? process.env.AUTO_VULNERABLE_API_URL : process.env.VULNERABLE_API_URL;
    let secureUrl = isAuto ? process.env.AUTO_AWS_API_URL : process.env.AWS_API_URL;

    // Auto mode: fall back to tfstate if env vars are not set (same as /api/config)
    if (isAuto && (!vulnUrl || !secureUrl)) {
      try {
        const tf = await getTerraformOutputs();
        if (!vulnUrl && tf.vulnerable?.backendUrl) vulnUrl = tf.vulnerable.backendUrl;
        if (!secureUrl && tf.secure?.backendUrl) secureUrl = tf.secure.backendUrl;
      } catch {
        // ignore tfstate failure
      }
    }

    // 10초 버퍼: EC2 클럭이 attack-dashboard보다 느릴 경우 첫 요청 로그가 startTime 이전으로 기록됨
    const fromTime = new Date(new Date(session.startTime).getTime() - 10_000).toISOString();
    const [vulnLogs, secureLogs] = await Promise.all([
      vulnUrl ? fetchRawLogs(vulnUrl, fromTime, toTime) : Promise.resolve([]),
      secureUrl ? fetchRawLogs(secureUrl, fromTime, toTime) : Promise.resolve([]),
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
