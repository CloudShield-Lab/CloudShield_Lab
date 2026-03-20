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
  cfErrorPage: boolean;
}

async function scanHeaders(baseUrl: string): Promise<ScanResult> {
  const start = Date.now();
  try {
    const res = await fetch(`${baseUrl}/api/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(8000),
    });
    const latency = Date.now() - start;
    const headers: Record<string, string> = {};
    res.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });

    // CloudFront custom_error_response: 백엔드 오류 → S3 에러 페이지(text/html) 감지.
    // API 엔드포인트는 항상 application/json 반환 — text/html이면 CF/S3 인프라 응답.
    const isHtmlResponse = (headers['content-type'] || '').includes('text/html');
    if (isHtmlResponse) {
      return { status: res.status, latency, headers, dangerousFound: [], cfErrorPage: true };
    }

    const dangerousFound = DANGEROUS_HEADERS.filter((h) => headers[h] !== undefined);
    return { status: res.status, latency, headers, dangerousFound, cfErrorPage: false };
  } catch {
    // Fallback: try root path
    try {
      const res2 = await fetch(`${baseUrl}/`, {
        method: 'GET',
        signal: AbortSignal.timeout(8000),
      });
      const latency2 = Date.now() - start;
      const headers: Record<string, string> = {};
      res2.headers.forEach((value, key) => {
        headers[key.toLowerCase()] = value;
      });
      const isHtmlFallback = (headers['content-type'] || '').includes('text/html');
      if (isHtmlFallback) {
        return { status: res2.status, latency: latency2, headers, dangerousFound: [], cfErrorPage: true };
      }
      const dangerousFound = DANGEROUS_HEADERS.filter((h) => headers[h] !== undefined);
      return { status: res2.status, latency: latency2, headers, dangerousFound, cfErrorPage: false };
    } catch {
      return { status: 0, latency: Date.now() - start, headers: {}, dangerousFound: [], cfErrorPage: false };
    }
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

      await send({ type: 'stage', env: 'vulnerable', attempt: 1, stage: 'attacker', status: 'reached', title: '헤더 스캔 시작', description: `취약 환경(${VULNERABLE_URL})에 GET 요청을 전송하여 응답 헤더를 수집합니다.`, severity: 'critical' });
      await sleep(STAGE_STEP_MS);
      await send({ type: 'stage', env: 'aws', attempt: 1, stage: 'attacker', status: 'reached', title: '헤더 스캔 시작', description: `보안 환경(${AWS_URL || 'NOT CONFIGURED'})에 GET 요청을 전송하여 응답 헤더를 수집합니다.`, severity: 'critical' });
      await sleep(STAGE_STEP_MS);
      await send({ type: 'stage', env: 'aws', attempt: 1, stage: 'cloudfront', status: 'passed', title: 'CloudFront 경유', description: '보안 환경 요청은 CloudFront 엣지를 통과하며 헤더가 변환됩니다.', severity: 'info' });
      await sleep(STAGE_STEP_MS);

      const [vulnScan, awsScan] = await Promise.all([
        scanHeaders(VULNERABLE_URL),
        AWS_URL
          ? scanHeaders(AWS_URL)
          : Promise.resolve({ status: -1, latency: 0, headers: {} as Record<string, string>, dangerousFound: [], cfErrorPage: false }),
      ]);

      await send({ type: 'stage', env: 'vulnerable', attempt: 1, stage: 'ecs', status: vulnScan.status > 0 ? 'reached' : 'failed', title: 'EC2 응답 수신', description: `HTTP ${vulnScan.status} — ${vulnScan.latency}ms`, severity: 'warning' });
      await sleep(STAGE_STEP_MS);
      if (AWS_URL) {
        // CF 에러 페이지 응답은 백엔드에 도달하지 못한 것으로 처리
        const awsEcsStatus = awsScan.cfErrorPage ? 'failed' : (awsScan.status > 0 ? 'reached' : 'failed');
        const awsEcsTitle = awsScan.cfErrorPage ? 'CF 오류 페이지 반환' : 'EC2 응답 수신';
        const awsEcsDesc = awsScan.cfErrorPage
          ? 'CloudFront가 백엔드 대신 S3 오류 페이지를 반환했습니다. 백엔드 앱 헤더를 수집할 수 없습니다.'
          : `HTTP ${awsScan.status} — ${awsScan.latency}ms`;
        await send({ type: 'stage', env: 'aws', attempt: 1, stage: 'ecs', status: awsEcsStatus, title: awsEcsTitle, description: awsEcsDesc, severity: 'warning' });
        await sleep(STAGE_STEP_MS);
      }

      await send({
        type: 'headers',
        env: 'vulnerable',
        headers: vulnScan.headers,
        dangerousFound: vulnScan.dangerousFound,
        status: vulnScan.status,
        latency: vulnScan.latency,
        cfErrorPage: vulnScan.cfErrorPage,
      });

      await send({
        type: 'headers',
        env: 'aws',
        headers: awsScan.headers,
        dangerousFound: awsScan.dangerousFound,
        status: awsScan.status,
        latency: awsScan.latency,
        cfErrorPage: awsScan.cfErrorPage,
      });

      // Also emit result events so AttackCard stats work if used
      await send({ type: 'result', env: 'vulnerable', attempt: 1, status: vulnScan.status, latency: vulnScan.latency, blocked: false, label: `${vulnScan.dangerousFound.length} DANGEROUS HEADERS` });
      await send({ type: 'result', env: 'aws', attempt: 1, status: awsScan.status, latency: awsScan.latency, blocked: false, label: `${awsScan.dangerousFound.length} DANGEROUS HEADERS` });

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
