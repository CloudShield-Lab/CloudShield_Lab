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

// WAF SuspiciousPathScanRule 대상 경로 — 보안 환경에서 차단됨
const SCAN_PATH = '/server-status';

const DANGEROUS_HEADERS = ['x-powered-by', 'server', 'via', 'x-aspnet-version', 'x-aspnetmvc-version', 'x-runtime', 'x-generator', 'x-version'];
const STAGE_STEP_MS = 200;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

interface ScanResult {
  status: number;
  latency: number;
  headers: Record<string, string>;
  dangerousFound: string[];
  wafBlocked: boolean;
}

async function scanHeaders(baseUrl: string): Promise<ScanResult> {
  const start = Date.now();
  try {
    const res = await fetch(`${baseUrl}${SCAN_PATH}`, {
      method: 'GET',
      signal: AbortSignal.timeout(8000),
    });
    const latency = Date.now() - start;
    const headers: Record<string, string> = {};
    res.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });

    // CloudFront custom_error_response: WAF 403 → 200+text/html 변환 감지.
    // WAF가 /server-status 경로를 차단하면 CF가 HTML 에러 페이지로 변환해 반환.
    const isHtmlResponse = (headers['content-type'] || '').includes('text/html');
    if (isHtmlResponse) {
      return { status: res.status, latency, headers: {}, dangerousFound: [], wafBlocked: true };
    }

    const dangerousFound = DANGEROUS_HEADERS.filter((h) => headers[h] !== undefined);
    return { status: res.status, latency, headers, dangerousFound, wafBlocked: false };
  } catch {
    return { status: 0, latency: Date.now() - start, headers: {}, dangerousFound: [], wafBlocked: false };
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

  (async () => {
    try {
      await send({ type: 'start' });

      await send({ type: 'stage', env: 'vulnerable', attempt: 1, stage: 'attacker', status: 'reached', title: '헤더 스캔 시작', description: `취약 환경에 GET ${SCAN_PATH} 요청 — 서버 기술 스택 정보를 수집합니다.`, severity: 'critical' });
      await sleep(STAGE_STEP_MS);
      await send({ type: 'stage', env: 'aws', attempt: 1, stage: 'attacker', status: 'reached', title: '헤더 스캔 시작', description: `보안 환경에 동일한 GET ${SCAN_PATH} 요청을 시도합니다.`, severity: 'critical' });
      await sleep(STAGE_STEP_MS);
      await send({ type: 'stage', env: 'aws', attempt: 1, stage: 'cloudfront', status: 'passed', title: 'CloudFront 경유', description: '요청이 CloudFront 엣지를 통과합니다.', severity: 'info' });
      await sleep(STAGE_STEP_MS);

      const [vulnScan, awsScan] = await Promise.all([
        scanHeaders(VULNERABLE_URL),
        AWS_URL
          ? scanHeaders(AWS_URL)
          : Promise.resolve({ status: -1, latency: 0, headers: {} as Record<string, string>, dangerousFound: [], wafBlocked: false }),
      ]);

      // 취약 환경: WAF 없음 — 백엔드 직접 도달
      await send({ type: 'stage', env: 'vulnerable', attempt: 1, stage: 'ecs', status: vulnScan.status > 0 ? 'reached' : 'failed', title: 'EC2 직접 도달', description: `HTTP ${vulnScan.status} — WAF 없이 백엔드에 직접 도달했습니다.`, severity: 'critical' });
      await sleep(STAGE_STEP_MS);
      if (vulnScan.status > 0) {
        await send({ type: 'stage', env: 'vulnerable', attempt: 1, stage: 'app', status: 'passed', title: '서버 정보 노출', description: `위험 헤더 ${vulnScan.dangerousFound.length}개 수집 완료 — 기술 스택 식별됨`, severity: 'critical' });
        await sleep(STAGE_STEP_MS);
      }

      // 보안 환경: WAF가 경로 차단 여부에 따라 분기
      if (AWS_URL) {
        if (awsScan.wafBlocked) {
          await send({ type: 'stage', env: 'aws', attempt: 1, stage: 'waf', status: 'blocked', title: 'WAF 경로 차단', description: `WAF SuspiciousPathScanRule이 ${SCAN_PATH} 경로를 차단했습니다. 백엔드에 도달하지 못했습니다.`, severity: 'success' });
        } else {
          await send({ type: 'stage', env: 'aws', attempt: 1, stage: 'waf', status: 'passed', title: 'WAF 통과', description: '요청이 WAF를 통과했습니다.', severity: 'warning' });
          await sleep(STAGE_STEP_MS);
          await send({ type: 'stage', env: 'aws', attempt: 1, stage: 'ecs', status: awsScan.status > 0 ? 'reached' : 'failed', title: 'EC2 응답 수신', description: `HTTP ${awsScan.status} — ${awsScan.latency}ms`, severity: 'warning' });
        }
        await sleep(STAGE_STEP_MS);
      }

      await send({
        type: 'headers',
        env: 'vulnerable',
        headers: vulnScan.headers,
        dangerousFound: vulnScan.dangerousFound,
        status: vulnScan.status,
        latency: vulnScan.latency,
        wafBlocked: vulnScan.wafBlocked,
      });

      await send({
        type: 'headers',
        env: 'aws',
        headers: awsScan.headers,
        dangerousFound: awsScan.dangerousFound,
        status: awsScan.status,
        latency: awsScan.latency,
        wafBlocked: awsScan.wafBlocked,
      });

      await send({ type: 'result', env: 'vulnerable', attempt: 1, status: vulnScan.status, latency: vulnScan.latency, blocked: false, label: vulnScan.dangerousFound.length > 0 ? `${vulnScan.dangerousFound.length} DANGEROUS HEADERS EXPOSED` : 'NO DANGEROUS HEADERS' });
      await send({ type: 'result', env: 'aws', attempt: 1, status: awsScan.status, latency: awsScan.latency, blocked: awsScan.wafBlocked, label: awsScan.wafBlocked ? 'WAF BLOCKED — PATH SCAN DENIED' : `${awsScan.dangerousFound.length} DANGEROUS HEADERS` });

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
