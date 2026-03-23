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

const STAGE_STEP_MS = 140;

const PATTERN_ATTEMPTS = [
  { label: 'SQLI OR 1=1', query: `' OR 1=1 --` },
  { label: 'XSS Script Tag', query: `<script>alert(1)</script>` },
  { label: 'XSS javascript URI', query: `javascript:alert(1)` },
  { label: 'SQLI UNION SELECT', query: `UNION SELECT password FROM users` },
  { label: 'XSS Img onerror', query: `<img src=x onerror=alert(1)>` },
  { label: 'SQLI DROP TABLE', query: `DROP TABLE users;` },
];

type Env = 'vulnerable' | 'aws';
type StageName = 'attacker' | 'cloudfront' | 'waf' | 'ecs' | 'app' | 's3';
type StageStatus = 'idle' | 'reached' | 'passed' | 'blocked' | 'failed' | 'success';
type Severity = 'info' | 'warning' | 'critical' | 'success';

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function hasJsonContentType(res: Response) {
  return (res.headers.get('content-type') || '').includes('application/json');
}

async function sendStageWithDelay(
  sendStage: (
    env: Env,
    attempt: number,
    stage: StageName,
    status: StageStatus,
    title: string,
    description: string,
    severity: Severity,
  ) => Promise<void>,
  env: Env,
  attempt: number,
  stage: StageName,
  status: StageStatus,
  title: string,
  description: string,
  severity: Severity,
) {
  await sendStage(env, attempt, stage, status, title, description, severity);
  await sleep(STAGE_STEP_MS);
}

async function sendPatternRequest(baseUrl: string, query: string, attempt: number, label: string) {
  const start = Date.now();
  try {
    // 페이로드를 email 필드에 삽입 — db.query($1)로 전달되며 XSS는 에러 메시지에 반사됨
    const res = await fetch(new URL('/api/auth/login', baseUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: query,
        password: 'test',
      }),
      signal: AbortSignal.timeout(8000),
    });

    const latency = Date.now() - start;
    const effectiveStatus = res.status === 200 && !hasJsonContentType(res) ? 403 : res.status;
    const blocked = effectiveStatus === 403 || effectiveStatus === 429;

    return {
      attempt,
      status: effectiveStatus,
      latency,
      blocked,
      label: blocked ? `${label} BLOCKED` : `${label} REACHED APP`,
    };
  } catch {
    return {
      attempt,
      status: 0,
      latency: Date.now() - start,
      blocked: false,
      label: `${label} CONNECTION ERROR`,
      error: 'connection_refused',
    };
  }
}

export async function GET(request: NextRequest) {
  const searchParams = new URL(request.url).searchParams;
  const mode = searchParams.get('mode') === 'auto' ? 'auto' : 'manual';
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
    env: Env,
    attempt: number,
    stage: StageName,
    status: StageStatus,
    title: string,
    description: string,
    severity: Severity,
  ) => {
    await send({ type: 'stage', env, attempt, stage, status, title, description, severity });
  };

  (async () => {
    try {
      await send({ type: 'start' });

      for (let i = 0; i < PATTERN_ATTEMPTS.length; i++) {
        const attempt = i + 1;
        const pattern = PATTERN_ATTEMPTS[i];
        const [vulnResult, awsResult] = await Promise.all([
          sendPatternRequest(VULNERABLE_URL, pattern.query, attempt, pattern.label),
          AWS_URL
            ? sendPatternRequest(AWS_URL, pattern.query, attempt, pattern.label)
            : Promise.resolve({
                attempt,
                status: -1,
                latency: 0,
                blocked: false,
                label: 'AWS URL NOT CONFIGURED',
              }),
        ]);

        await sendStageWithDelay(
          sendStage,
          'vulnerable',
          attempt,
          'attacker',
          'reached',
          '악성 패턴 전송',
          `${pattern.label} 패턴이 포함된 요청이 취약 환경으로 유입되었습니다.`,
          'critical',
        );
        await sendStageWithDelay(
          sendStage,
          'vulnerable',
          attempt,
          'ecs',
          vulnResult.status > 0 ? 'reached' : 'failed',
          vulnResult.status > 0 ? 'EC2 도달' : 'EC2 도달 실패',
          `취약 환경은 ${pattern.label} 요청을 호스트 계층까지 전달합니다.`,
          vulnResult.status > 0 ? 'critical' : 'warning',
        );
        await sendStageWithDelay(
          sendStage,
          'vulnerable',
          attempt,
          'app',
          vulnResult.status > 0 ? 'passed' : 'failed',
          vulnResult.status > 0 ? 'Service Logic 처리' : 'Service Logic 도달 실패',
          vulnResult.status > 0
            ? `${pattern.label} 요청이 애플리케이션 계층에서 직접 처리되었습니다.`
            : '요청이 애플리케이션에 도달하지 못했습니다.',
          vulnResult.status > 0 ? 'warning' : 'warning',
        );

        await sendStageWithDelay(
          sendStage,
          'aws',
          attempt,
          'attacker',
          'reached',
          '악성 패턴 전송',
          `${pattern.label} 패턴이 포함된 요청이 보안 환경으로도 유입되었습니다.`,
          'critical',
        );
        await sendStageWithDelay(
          sendStage,
          'aws',
          attempt,
          'cloudfront',
          'passed',
          'CloudFront 전달',
          '보안 환경은 요청을 엣지 계층에서 먼저 수신합니다.',
          'info',
        );

        if (awsResult.blocked) {
          await sendStageWithDelay(
            sendStage,
            'aws',
            attempt,
            'waf',
            'blocked',
            'WAF 차단',
            `${pattern.label} 요청이 WAF 규칙에 의해 차단되었습니다.`,
            'success',
          );
        } else {
          await sendStageWithDelay(
            sendStage,
            'aws',
            attempt,
            'waf',
            'passed',
            'WAF 통과',
            `${pattern.label} 요청이 WAF를 통과했습니다.`,
            'warning',
          );
          if (awsResult.status > 0) {
            await sendStageWithDelay(
              sendStage,
              'aws',
              attempt,
              'ecs',
              'reached',
              'EC2 도달',
              '차단되지 않은 요청이 EC2 계층에 도달했습니다.',
              'warning',
            );
            await sendStageWithDelay(
              sendStage,
              'aws',
              attempt,
              'app',
              'passed',
              'Service Logic 처리',
              '차단되지 않은 요청이 서비스 로직까지 전달되었습니다.',
              'warning',
            );
          }
        }

        await send({ type: 'result', env: 'vulnerable', ...vulnResult });
        await send({ type: 'result', env: 'aws', ...awsResult });
        await sleep(240);
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
