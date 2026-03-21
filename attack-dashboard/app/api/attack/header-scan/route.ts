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

const STAGE_STEP_MS = 200;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export interface CorsResult {
  status: number;
  latency: number;
  // CORS 핵심 헤더
  acaoHeader: string | null;   // Access-Control-Allow-Origin
  acacHeader: string | null;   // Access-Control-Allow-Credentials
  // 판정
  corsAccepted: boolean;       // 요청한 origin이 허용됐는지
  wafBlocked: boolean;         // WAF/CF가 HTML로 변환했는지
}

async function probeCors(baseUrl: string, attackOrigin: string): Promise<CorsResult> {
  const start = Date.now();
  try {
    const res = await fetch(`${baseUrl}/api/health`, {
      method: 'GET',
      headers: { Origin: attackOrigin },
      signal: AbortSignal.timeout(8000),
    });
    const latency = Date.now() - start;

    const contentType = res.headers.get('content-type') || '';
    // CloudFront custom_error_response: WAF 또는 CORS 오류 → 200+HTML 변환 감지
    if (contentType.includes('text/html')) {
      return { status: res.status, latency, acaoHeader: null, acacHeader: null, corsAccepted: false, wafBlocked: true };
    }

    const acaoHeader = res.headers.get('access-control-allow-origin');
    const acacHeader = res.headers.get('access-control-allow-credentials');
    // origin이 반영됐거나 '*'이면 허용된 것
    const corsAccepted = acaoHeader === attackOrigin || acaoHeader === '*';

    return { status: res.status, latency, acaoHeader, acacHeader, corsAccepted, wafBlocked: false };
  } catch {
    return { status: 0, latency: Date.now() - start, acaoHeader: null, acacHeader: null, corsAccepted: false, wafBlocked: false };
  }
}

export async function GET(request: NextRequest) {
  const searchParams = new URL(request.url).searchParams;
  const mode = searchParams.get('mode') === 'auto' ? 'auto' : 'manual';
  const attackOrigin = searchParams.get('origin') || 'https://evil.com';

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

  (async () => {
    try {
      await send({ type: 'start' });

      // 공격 시작 stage
      await send({ type: 'stage', env: 'vulnerable', attempt: 1, stage: 'attacker', status: 'reached',
        title: 'CORS 공격 시작',
        description: `Origin: ${attackOrigin} 헤더로 취약 환경에 요청합니다.`,
        severity: 'critical' });
      await sleep(STAGE_STEP_MS);
      await send({ type: 'stage', env: 'aws', attempt: 1, stage: 'attacker', status: 'reached',
        title: 'CORS 공격 시작',
        description: `동일한 Origin: ${attackOrigin} 헤더로 보안 환경에도 요청합니다.`,
        severity: 'critical' });
      await sleep(STAGE_STEP_MS);
      await send({ type: 'stage', env: 'aws', attempt: 1, stage: 'cloudfront', status: 'passed',
        title: 'CloudFront 경유',
        description: '요청이 CloudFront를 통해 전달됩니다.',
        severity: 'info' });
      await sleep(STAGE_STEP_MS);
      await send({ type: 'stage', env: 'aws', attempt: 1, stage: 'waf', status: 'passed',
        title: 'WAF 통과',
        description: 'CORS 요청은 WAF 차단 대상이 아닙니다.',
        severity: 'info' });
      await sleep(STAGE_STEP_MS);

      // 병렬 요청
      const [vulnResult, awsResult] = await Promise.all([
        probeCors(VULNERABLE_URL, attackOrigin),
        AWS_URL
          ? probeCors(AWS_URL, attackOrigin)
          : Promise.resolve({ status: -1, latency: 0, acaoHeader: null, acacHeader: null, corsAccepted: false, wafBlocked: false }),
      ]);

      // 취약 환경 stage
      await send({ type: 'stage', env: 'vulnerable', attempt: 1, stage: 'ecs', status: 'reached',
        title: 'EC2 도달',
        description: `HTTP ${vulnResult.status} — CORS 정책 평가 중`,
        severity: 'warning' });
      await sleep(STAGE_STEP_MS);
      await send({ type: 'stage', env: 'vulnerable', attempt: 1, stage: 'app', status: vulnResult.corsAccepted ? 'passed' : 'blocked',
        title: vulnResult.corsAccepted ? 'CORS 허용 — Origin 반영됨' : 'CORS 차단',
        description: vulnResult.corsAccepted
          ? `CORS_ORIGIN=* 설정으로 ${attackOrigin} 허용. Access-Control-Allow-Origin: ${vulnResult.acaoHeader}`
          : `Origin이 허용 목록에 없어 차단됐습니다.`,
        severity: vulnResult.corsAccepted ? 'critical' : 'success' });
      await sleep(STAGE_STEP_MS);

      // 보안 환경 stage
      if (AWS_URL) {
        await send({ type: 'stage', env: 'aws', attempt: 1, stage: 'ecs', status: 'reached',
          title: 'EC2 도달',
          description: `HTTP ${awsResult.status} — CORS 정책 평가 중`,
          severity: 'warning' });
        await sleep(STAGE_STEP_MS);
        await send({ type: 'stage', env: 'aws', attempt: 1, stage: 'app', status: awsResult.corsAccepted ? 'passed' : 'blocked',
          title: awsResult.corsAccepted ? 'CORS 허용' : 'CORS 차단 — Origin 불일치',
          description: awsResult.corsAccepted
            ? `예상치 못한 CORS 허용: ${awsResult.acaoHeader}`
            : `허용된 Origin은 CloudFront 도메인뿐입니다. ${attackOrigin} 차단됨.`,
          severity: awsResult.corsAccepted ? 'critical' : 'success' });
        await sleep(STAGE_STEP_MS);
      }

      await send({ type: 'cors_result', env: 'vulnerable', ...vulnResult, attackOrigin });
      await send({ type: 'cors_result', env: 'aws', ...awsResult, attackOrigin });

      await send({ type: 'result', env: 'vulnerable', attempt: 1,
        status: vulnResult.status, latency: vulnResult.latency,
        blocked: !vulnResult.corsAccepted,
        label: vulnResult.corsAccepted ? `CORS ACCEPTED — ${attackOrigin}` : 'CORS BLOCKED' });
      await send({ type: 'result', env: 'aws', attempt: 1,
        status: awsResult.status, latency: awsResult.latency,
        blocked: !awsResult.corsAccepted,
        label: awsResult.corsAccepted ? `CORS ACCEPTED — ${attackOrigin}` : 'CORS BLOCKED' });

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
