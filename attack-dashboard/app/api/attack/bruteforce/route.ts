import { NextRequest } from 'next/server';
import { DEFAULT_CREDENTIALS, type Credential } from '@/lib/default-credentials';
import { normalizeApiBaseUrl } from '@/lib/url-utils';

export const dynamic = 'force-dynamic';

const URL_MAP = {
  manual: {
    vulnerable: normalizeApiBaseUrl(process.env.VULNERABLE_API_URL || 'http://localhost:3000'),
    aws: normalizeApiBaseUrl(process.env.AWS_API_URL || ''),
  },
  auto: {
    vulnerable: normalizeApiBaseUrl(process.env.AUTO_VULNERABLE_API_URL || ''),
    aws: normalizeApiBaseUrl(process.env.AUTO_AWS_API_URL || ''),
  },
};

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

async function tryLogin(baseUrl: string, email: string, password: string, attempt: number) {
  const start = Date.now();
  try {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(6000),
    });
    const latency = Date.now() - start;

    // CloudFront custom_error_response: WAF 403 → 200 + text/html (SPA index.html)
    // Content-Type이 JSON이 아닌 200은 실제 로그인 성공이 아닌 CF 리다이렉트로 판정
    const isJson = (res.headers.get('content-type') || '').includes('application/json');
    const effectiveStatus = (res.status === 200 && !isJson) ? 403 : res.status;

    const blocked = effectiveStatus === 429 || effectiveStatus === 403;
    const label = blocked
      ? effectiveStatus === 429 ? 'RATE LIMITED' : 'WAF BLOCKED'
      : effectiveStatus === 401
        ? 'REACHED (wrong pw)'
        : effectiveStatus === 200
          ? 'LOGIN SUCCESS'
          : `HTTP ${effectiveStatus}`;
    return { attempt, status: effectiveStatus, latency, blocked, label, email, password };
  } catch {
    return {
      attempt,
      status: 0,
      latency: Date.now() - start,
      blocked: false,
      label: 'CONNECTION ERROR',
      error: 'timeout_or_refused',
      email,
      password,
    };
  }
}

export async function POST(request: NextRequest) {
  let credentials: Credential[] = DEFAULT_CREDENTIALS;
  let mode: 'manual' | 'auto' = 'manual';
  try {
    const body = await request.json();
    if (Array.isArray(body.credentials) && body.credentials.length > 0) {
      credentials = body.credentials;
    }
    if (body.mode === 'auto') mode = 'auto';
  } catch {
    // body 없거나 파싱 실패 시 기본값 사용
  }

  const VULNERABLE_URL = URL_MAP[mode].vulnerable || 'http://localhost:3000';
  const AWS_URL = URL_MAP[mode].aws;

  const count = Math.min(credentials.length, 120);

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
        const { email, password } = credentials[i];

        const [vulnResult, awsResult] = await Promise.all([
          tryLogin(VULNERABLE_URL, email, password, attempt),
          AWS_URL
            ? tryLogin(AWS_URL, email, password, attempt)
            : Promise.resolve({
                attempt,
                status: -1,
                latency: 0,
                blocked: false,
                label: 'AWS URL NOT CONFIGURED',
                email,
                password,
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
