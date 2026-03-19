import { NextRequest } from 'next/server';
import { normalizeApiBaseUrl } from '@/lib/url-utils';
import { getTerraformOutputs } from '@/lib/terraform-state';

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

const STAGE_STEP_MS = 120;

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

async function floodRequest(baseUrl: string, attempt: number) {
  const start = Date.now();
  try {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'flood@test.com', password: 'x' }),
      signal: AbortSignal.timeout(5000),
    });
    const latency = Date.now() - start;
    // CloudFront custom_error_response: WAF 403 → 200 + text/html 감지
    const isJson = (res.headers.get('content-type') || '').includes('application/json');
    const effectiveStatus = (res.status === 200 && !isJson) ? 403 : res.status;

    const blocked = effectiveStatus === 429 || effectiveStatus === 403;
    const label = blocked
      ? effectiveStatus === 429 ? 'RATE LIMITED' : 'WAF BLOCKED'
      : effectiveStatus === 200 || effectiveStatus === 401
        ? 'REACHED'
        : `HTTP ${effectiveStatus}`;
    return { attempt, status: effectiveStatus, latency, blocked, label };
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
  const count = Math.min(parseInt(url.searchParams.get('count') || '200'), 250);
  const mode = url.searchParams.get('mode') === 'auto' ? 'auto' : 'manual';
  let vulnUrl = URL_MAP[mode].vulnerable;
  let awsUrl = URL_MAP[mode].aws;

  if (mode === 'auto' && (!vulnUrl || !awsUrl)) {
    const tf = await getTerraformOutputs();
    if (!vulnUrl) vulnUrl = tf.vulnerable?.backendUrl || '';
    if (!awsUrl) awsUrl = tf.secure?.backendUrl || '';
  }

  const VULNERABLE_URL = vulnUrl || 'http://localhost:3000';
  const AWS_URL = awsUrl;

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
        const [vulnResult, awsResult] = await Promise.all([
          floodRequest(VULNERABLE_URL, attempt),
          AWS_URL
            ? floodRequest(AWS_URL, attempt)
            : Promise.resolve({
                attempt,
                status: -1,
                latency: 0,
                blocked: false,
                label: 'AWS URL NOT CONFIGURED',
              }),
        ]);

        await sendStageWithDelay(sendStage, 'vulnerable', attempt, 'attacker', 'reached', '공격 유입', '반복 요청이 취약 환경으로 유입되었습니다.', 'critical');
        await sendStageWithDelay(sendStage, 'vulnerable', attempt, 'ecs', vulnResult.status > 0 ? 'reached' : 'failed', vulnResult.status > 0 ? 'EC2 도달' : 'EC2 도달 실패', '취약 환경은 반복 요청이 호스트 계층까지 누적됩니다.', vulnResult.status > 0 ? 'critical' : 'warning');
        await sendStageWithDelay(sendStage, 'vulnerable', attempt, 'app', vulnResult.status > 0 ? 'passed' : 'failed', 'Service Logic 처리', vulnResult.label || '취약 환경 서비스가 반복 요청을 처리했습니다.', 'warning');

        await sendStageWithDelay(sendStage, 'aws', attempt, 'attacker', 'reached', '공격 유입', '동일한 반복 요청이 보안 환경으로 유입되었습니다.', 'critical');
        await sendStageWithDelay(sendStage, 'aws', attempt, 'cloudfront', 'passed', 'CloudFront 전달', '보안 환경은 엣지 계층에서 요청을 먼저 처리합니다.', 'info');
        if (awsResult.blocked) {
          await sendStageWithDelay(sendStage, 'aws', attempt, 'waf', 'blocked', 'WAF 차단', awsResult.label || '반복 요청이 WAF에서 차단되었습니다.', 'success');
        } else {
          await sendStageWithDelay(sendStage, 'aws', attempt, 'waf', 'passed', 'WAF 통과', '일부 요청은 WAF 정책을 통과했습니다.', 'warning');
          if (awsResult.status > 0) {
            await sendStageWithDelay(sendStage, 'aws', attempt, 'ecs', 'reached', 'EC2 도달', '차단되지 않은 요청이 호스트 계층에 도달했습니다.', 'warning');
            await sendStageWithDelay(sendStage, 'aws', attempt, 'app', 'passed', 'Service Logic 처리', awsResult.label || '보안 환경 서비스가 일부 요청을 처리했습니다.', 'warning');
          }
        }

        await send({ type: 'result', env: 'vulnerable', ...vulnResult });
        await send({ type: 'result', env: 'aws', ...awsResult });
        await sleep(200);
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
