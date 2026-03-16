import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

const VULNERABLE_URL = process.env.VULNERABLE_API_URL || 'http://localhost:3000';
const AWS_URL = process.env.AWS_API_URL || '';

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function floodRequest(baseUrl: string, attempt: number) {
  const start = Date.now();
  try {
    // /api/auth/login 엔드포인트에 대량 요청 — CloudFront 경유 가능, WAF 볼륨 공격 시연
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'flood@test.com', password: 'x' }),
      signal: AbortSignal.timeout(5000),
    });
    const latency = Date.now() - start;
    const blocked = res.status === 429 || res.status === 403;
    const label = blocked
      ? res.status === 429 ? 'RATE LIMITED' : 'WAF BLOCKED'
      : res.status === 200 || res.status === 401
      ? 'REACHED'
      : `HTTP ${res.status}`;
    return { attempt, status: res.status, latency, blocked, label };
  } catch {
    return {
      attempt,
      status: 0,
      latency: Date.now() - start,
      blocked: true,
      label: 'BLOCKED (TCP)',
      error: 'connection_refused',
    };
  }
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const count = Math.min(parseInt(url.searchParams.get('count') || '100'), 120);

  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  const send = async (data: object) => {
    try {
      await writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
    } catch {
      // 클라이언트 연결 끊김
    }
  };

  (async () => {
    try {
      await send({ type: 'start' });

      for (let i = 0; i < count; i++) {
        const [vulnResult, awsResult] = await Promise.all([
          floodRequest(VULNERABLE_URL, i + 1),
          AWS_URL
            ? floodRequest(AWS_URL, i + 1)
            : Promise.resolve({
                attempt: i + 1,
                status: -1,
                latency: 0,
                blocked: false,
                label: 'AWS URL 미설정',
              }),
        ]);

        await send({ type: 'result', env: 'vulnerable', ...vulnResult });
        await send({ type: 'result', env: 'aws', ...awsResult });

        await sleep(500);
      }

      await send({ type: 'complete' });
    } catch (e) {
      await send({ type: 'error', message: String(e) });
    } finally {
      writer.close();
    }
  })();

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
