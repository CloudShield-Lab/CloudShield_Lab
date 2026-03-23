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

const BOT_PATHS = [
  { label: 'Admin Probe', path: '/admin' },
  { label: 'WordPress Login Probe', path: '/wp-login.php' },
  { label: 'Env File Probe', path: '/.env' },
  { label: 'phpMyAdmin Probe', path: '/phpmyadmin' },
  { label: 'Server Status Probe', path: '/server-status' },
  { label: 'Hidden Config Probe', path: '/config.bak' },
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

async function scanPath(baseUrl: string, scanPathValue: string, attempt: number, label: string) {
  const start = Date.now();
  try {
    const res = await fetch(`${baseUrl}${scanPathValue}`, {
      method: 'GET',
      headers: {
        'User-Agent': 'SentinelShare-BotScanner/1.0',
        Accept: '*/*',
      },
      signal: AbortSignal.timeout(8000),
    });

    const latency = Date.now() - start;
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    const isJson = hasJsonContentType(res);
    const isHtmlFallback = res.status === 200 && contentType.includes('text/html') && !isJson;
    const edgeFiltered = isHtmlFallback || res.status === 403;

    let discovery: string | undefined;
    if (!edgeFiltered && res.status === 200) {
      try {
        const body = await res.text();
        discovery = body.slice(0, 300);
      } catch {}
    }

    return {
      attempt,
      status: edgeFiltered ? 403 : res.status,
      latency,
      blocked: edgeFiltered,
      label: edgeFiltered ? `${label} EDGE FILTERED` : `${label} ORIGIN REACHED`,
      ...(discovery !== undefined && { discovery }),
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

      for (let i = 0; i < BOT_PATHS.length; i++) {
        const attempt = i + 1;
        const target = BOT_PATHS[i];

        const [vulnResult, awsResult] = await Promise.all([
          scanPath(VULNERABLE_URL, target.path, attempt, target.label),
          AWS_URL
            ? scanPath(AWS_URL, target.path, attempt, target.label)
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
          '스캐닝 요청 유입',
          `${target.path} 탐색 요청이 취약 환경으로 유입되었습니다.`,
          'critical',
        );
        await sendStageWithDelay(
          sendStage,
          'vulnerable',
          attempt,
          'ecs',
          vulnResult.status > 0 ? 'reached' : 'failed',
          vulnResult.status > 0 ? 'EC2 도달' : 'EC2 도달 실패',
          `취약 환경은 ${target.path} 요청을 원본 서버까지 전달합니다.`,
          vulnResult.status > 0 ? 'critical' : 'warning',
        );
        await sendStageWithDelay(
          sendStage,
          'vulnerable',
          attempt,
          'app',
          vulnResult.status > 0 ? 'passed' : 'failed',
          vulnResult.status > 0 ? '앱 계층 404 처리' : '원본 도달 실패',
          vulnResult.status > 0
            ? `${target.path} 요청이 원본 애플리케이션까지 도달해 직접 처리되었습니다.`
            : '요청이 원본에 도달하지 못했습니다.',
          vulnResult.status > 0 ? 'warning' : 'warning',
        );

        await sendStageWithDelay(
          sendStage,
          'aws',
          attempt,
          'attacker',
          'reached',
          '스캐닝 요청 유입',
          `${target.path} 탐색 요청이 보안 환경으로도 유입되었습니다.`,
          'critical',
        );
        await sendStageWithDelay(
          sendStage,
          'aws',
          attempt,
          'cloudfront',
          'passed',
          'CloudFront 수신',
          `${target.path} 요청이 CloudFront를 통해 WAF 검사 단계로 전달됩니다.`,
          'info',
        );
        await sendStageWithDelay(
          sendStage,
          'aws',
          attempt,
          'waf',
          awsResult.blocked ? 'blocked' : 'passed',
          awsResult.blocked ? 'WAF 차단' : 'WAF 통과',
          awsResult.blocked
            ? `WAF가 ${target.path} 탐색 패턴을 탐지하여 차단했습니다.`
            : `${target.path} 요청이 WAF 규칙을 통과했습니다.`,
          awsResult.blocked ? 'success' : 'info',
        );

        if (!awsResult.blocked && awsResult.status > 0) {
          await sendStageWithDelay(
            sendStage,
            'aws',
            attempt,
            'ecs',
            'reached',
            'EC2 도달',
            'WAF에서 걸러지지 않은 요청이 원본 서버까지 도달했습니다.',
            'warning',
          );
          await sendStageWithDelay(
            sendStage,
            'aws',
            attempt,
            'app',
            'passed',
            '앱 계층 처리',
            '원본 애플리케이션이 탐색 요청을 처리했습니다.',
            'warning',
          );
        }

        await send({ type: 'result', env: 'vulnerable', ...vulnResult });
        await send({ type: 'result', env: 'aws', ...awsResult });
        await sleep(220);
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
