import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

const VULNERABLE_URL = process.env.VULNERABLE_API_URL || 'http://localhost:3000';
const AWS_URL = process.env.AWS_API_URL || '';

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

const STAGE_STEP_MS = 140;

async function sendStageWithDelay(
  sendStage: (
    env: 'vulnerable' | 'aws',
    attempt: number,
    stage: 'attacker' | 'cloudfront' | 'waf' | 'ecs' | 'app' | 's3',
    status: 'idle' | 'reached' | 'passed' | 'blocked' | 'failed' | 'success',
    title: string,
    description: string,
    severity: 'info' | 'warning' | 'critical' | 'success',
  ) => Promise<void>,
  env: 'vulnerable' | 'aws',
  attempt: number,
  stage: 'attacker' | 'cloudfront' | 'waf' | 'ecs' | 'app' | 's3',
  status: 'idle' | 'reached' | 'passed' | 'blocked' | 'failed' | 'success',
  title: string,
  description: string,
  severity: 'info' | 'warning' | 'critical' | 'success',
) {
  await sendStage(env, attempt, stage, status, title, description, severity);
  await sleep(STAGE_STEP_MS);
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
    } catch {}
  };

  const sendStage = async (
    env: 'vulnerable' | 'aws',
    attempt: number,
    stage: 'attacker' | 'cloudfront' | 'waf' | 'ecs' | 'app' | 's3',
    status: 'idle' | 'reached' | 'passed' | 'blocked' | 'failed' | 'success',
    title: string,
    description: string,
    severity: 'info' | 'warning' | 'critical' | 'success',
  ) => {
    await send({ type: 'stage', env, attempt, stage, status, title, description, severity });
  };

  (async () => {
    try {
      await send({ type: 'start' });

      for (let i = 0; i < count; i++) {
        const attempt = i + 1;
        const password = PASSWORDS[i % PASSWORDS.length];

        const [vulnResult, awsResult] = await Promise.all([
          tryLogin(VULNERABLE_URL, password, attempt),
          AWS_URL
            ? tryLogin(AWS_URL, password, attempt)
            : Promise.resolve({
                attempt,
                status: -1,
                latency: 0,
                blocked: false,
                label: 'AWS URL NOT CONFIGURED',
              }),
        ]);

        await sendStageWithDelay(sendStage, 'vulnerable', attempt, 'attacker', 'reached', '공격 유입', '로그인 시도가 취약 환경으로 유입되었습니다.', 'critical');
        await sendStageWithDelay(sendStage, 'vulnerable', attempt, 'ecs', vulnResult.status > 0 ? 'reached' : 'failed', vulnResult.status > 0 ? 'EC2 도달' : 'EC2 도달 실패', '취약 환경은 요청이 호스트 계층까지 도달합니다.', vulnResult.status > 0 ? 'critical' : 'warning');
        await sendStageWithDelay(sendStage, 'vulnerable', attempt, 'app', vulnResult.status === 200 ? 'success' : vulnResult.status > 0 ? 'passed' : 'failed', vulnResult.status === 200 ? '로그인 성공' : 'Service Logic 처리', vulnResult.label || '취약 환경에서 서비스 로직이 요청을 처리했습니다.', vulnResult.status === 200 ? 'critical' : 'warning');

        await sendStageWithDelay(sendStage, 'aws', attempt, 'attacker', 'reached', '공격 유입', '동일한 요청이 보안 환경으로도 유입되었습니다.', 'critical');
        await sendStageWithDelay(sendStage, 'aws', attempt, 'cloudfront', 'passed', 'CloudFront 전달', '보안 환경은 요청을 엣지 계층에서 먼저 처리합니다.', 'info');
        if (awsResult.blocked) {
          await sendStageWithDelay(sendStage, 'aws', attempt, 'waf', 'blocked', 'WAF 차단', awsResult.label || '보안 환경의 WAF가 로그인 폭주를 차단했습니다.', 'success');
        } else {
          await sendStageWithDelay(sendStage, 'aws', attempt, 'waf', 'passed', 'WAF 통과', '이 요청은 WAF 정책을 통과했습니다.', 'warning');
          if (awsResult.status > 0) {
            await sendStageWithDelay(sendStage, 'aws', attempt, 'ecs', 'reached', 'EC2 도달', '차단되지 않은 요청이 호스트 계층에 도달했습니다.', 'warning');
            await sendStageWithDelay(sendStage, 'aws', attempt, 'app', awsResult.status === 200 ? 'success' : 'passed', awsResult.status === 200 ? '로그인 성공' : 'Service Logic 처리', awsResult.label || '보안 환경의 서비스 로직이 요청을 처리했습니다.', awsResult.status === 200 ? 'critical' : 'warning');
          }
        }

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
      Connection: 'keep-alive',
    },
  });
}
