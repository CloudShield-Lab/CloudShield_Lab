import { NextRequest } from 'next/server';
import { normalizeApiBaseUrl } from '@/lib/url-utils';
import { getTerraformOutputs } from '@/lib/terraform-state';

export const dynamic = 'force-dynamic';

const URL_MAP = {
  manual: {
    vulnerable: normalizeApiBaseUrl(
      process.env.VULNERABLE_ORIGIN_API_URL ||
        process.env.VULNERABLE_API_URL ||
        'http://localhost:3000',
    ),
    aws: normalizeApiBaseUrl(process.env.AWS_ORIGIN_API_URL || ''),
  },
  auto: {
    vulnerable: normalizeApiBaseUrl(process.env.AUTO_VULNERABLE_ORIGIN_API_URL || ''),
    aws: normalizeApiBaseUrl(process.env.AUTO_AWS_ORIGIN_API_URL || ''),
  },
};

const STAGE_STEP_MS = 150;

type Env = 'vulnerable' | 'aws';
type StageName = 'attacker' | 'cloudfront' | 'waf' | 'ecs' | 'app' | 's3';
type StageStatus = 'idle' | 'reached' | 'passed' | 'blocked' | 'failed' | 'success';
type Severity = 'info' | 'warning' | 'critical' | 'success';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildOriginUrl(elasticIp?: string) {
  return elasticIp ? normalizeApiBaseUrl(`http://${elasticIp}:3000`) : '';
}

function hasJsonContentType(res: Response) {
  return (res.headers.get('content-type') || '').includes('application/json');
}

function isOriginReachable(status: number) {
  return status > 0 && status !== 403 && status !== 429;
}

async function probeOrigin(baseUrl: string, envLabel: string) {
  if (!baseUrl) {
    return {
      status: -1,
      latency: 0,
      blocked: false,
      label: `${envLabel} ORIGIN URL NOT CONFIGURED`,
      error: 'origin_url_not_configured',
      url: '',
    };
  }

  const healthUrl = `${baseUrl}/health`;
  const start = Date.now();

  try {
    const res = await fetch(healthUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(8000),
    });
    const latency = Date.now() - start;
    const effectiveStatus = res.status === 200 && !hasJsonContentType(res) ? 403 : res.status;
    const reachable = isOriginReachable(effectiveStatus);
    const blocked = !reachable;

    return {
      status: effectiveStatus,
      latency,
      blocked,
      label: reachable
        ? `${envLabel} ORIGIN REACHED`
        : effectiveStatus === 403
          ? `${envLabel} DIRECT ACCESS BLOCKED`
          : `HTTP ${effectiveStatus}`,
      url: healthUrl,
    };
  } catch {
    return {
      status: 0,
      latency: Date.now() - start,
      blocked: true,
      label: `${envLabel} CONNECTION FAILED`,
      error: 'timeout_or_refused',
      url: healthUrl,
    };
  }
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

export async function GET(request: NextRequest) {
  const searchParams = new URL(request.url).searchParams;
  const mode = searchParams.get('mode') === 'auto' ? 'auto' : 'manual';
  let vulnerableOriginUrl = URL_MAP[mode].vulnerable;
  let awsOriginUrl = URL_MAP[mode].aws;

  if (mode === 'auto' && (!vulnerableOriginUrl || !awsOriginUrl)) {
    const tf = await getTerraformOutputs();
    if (!vulnerableOriginUrl) {
      vulnerableOriginUrl = buildOriginUrl(tf.vulnerable?.elasticIp);
    }
    if (!awsOriginUrl) {
      awsOriginUrl = buildOriginUrl(tf.secure?.elasticIp);
    }
  }

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

      const attempt = 1;
      const [vulnerableResult, awsResult] = await Promise.all([
        probeOrigin(vulnerableOriginUrl, 'VULNERABLE'),
        probeOrigin(awsOriginUrl, 'SECURE'),
      ]);

      await sendStageWithDelay(
        sendStage,
        'vulnerable',
        attempt,
        'attacker',
        'reached',
        '정상 경로 우회',
        `CloudFront 같은 정상 진입 경로를 거치지 않고 원본 주소(${vulnerableOriginUrl || 'NOT CONFIGURED'})로 직접 요청을 보냈습니다.`,
        'critical',
      );

      if (isOriginReachable(vulnerableResult.status)) {
        await sendStageWithDelay(
          sendStage,
          'vulnerable',
          attempt,
          'ecs',
          'reached',
          'Origin EC2 직접 응답',
          `원본 EC2가 직접 HTTP ${vulnerableResult.status} 응답을 반환했습니다.`,
          'critical',
        );
        await sendStageWithDelay(
          sendStage,
          'vulnerable',
          attempt,
          'app',
          'success',
          'Service Logic 도달',
          '보호 장비를 우회한 요청이 서비스 로직까지 이어지는 흐름을 확인했습니다.',
          'critical',
        );
      } else {
        await sendStageWithDelay(
          sendStage,
          'vulnerable',
          attempt,
          'ecs',
          vulnerableResult.blocked ? 'blocked' : 'failed',
          vulnerableResult.blocked ? 'Origin 접근 차단' : 'Origin 접근 실패',
          vulnerableResult.error === 'origin_url_not_configured'
            ? '취약 환경 origin URL이 설정되지 않아 직접 접근을 확인할 수 없습니다.'
            : vulnerableResult.error === 'timeout_or_refused'
              ? '원본 응답이 돌아오지 않아 직접 접근 여부를 확인하지 못했습니다.'
              : `원본이 HTTP ${vulnerableResult.status} 상태로 응답했습니다.`,
          'warning',
        );
      }

      await sendStageWithDelay(
        sendStage,
        'aws',
        attempt,
        'attacker',
        'reached',
        '정상 경로 우회',
        `CloudFront를 우회하고 원본 주소(${awsOriginUrl || 'NOT CONFIGURED'})로 직접 요청을 보냈습니다.`,
        'critical',
      );

      if (isOriginReachable(awsResult.status)) {
        await sendStageWithDelay(
          sendStage,
          'aws',
          attempt,
          'ecs',
          'reached',
          'Origin EC2 직접 응답',
          `보안 환경 원본이 HTTP ${awsResult.status}로 직접 응답했습니다.`,
          'warning',
        );
        await sendStageWithDelay(
          sendStage,
          'aws',
          attempt,
          'app',
          'passed',
          'Service Logic 도달',
          '보안 환경에서도 원본에 직접 접근이 가능해 보호 계층 우회가 발생했습니다.',
          'warning',
        );
      } else {
        await sendStageWithDelay(
          sendStage,
          'aws',
          attempt,
          'ecs',
          awsResult.status === 403 || awsResult.blocked ? 'blocked' : 'failed',
          awsResult.status === 403 ? 'Origin 직접 접근 차단' : 'Origin 직접 접근 실패',
          awsResult.error === 'origin_url_not_configured'
            ? '수동 보안 환경 origin URL이 설정되지 않았습니다. AWS_ORIGIN_API_URL을 추가하면 직접 비교할 수 있습니다.'
            : awsResult.error === 'timeout_or_refused'
              ? '직접 접근이 타임아웃 또는 연결 거부로 끝나 원본이 외부에 노출되지 않았음을 보여줍니다.'
              : `원본이 HTTP ${awsResult.status}로 요청을 거부했습니다.`,
          'success',
        );
      }

      await send({
        type: 'result',
        env: 'vulnerable',
        attempt,
        status: vulnerableResult.status,
        latency: vulnerableResult.latency,
        blocked: vulnerableResult.blocked,
        label: vulnerableResult.label,
        error: vulnerableResult.error,
        url: vulnerableResult.url,
      });

      await send({
        type: 'result',
        env: 'aws',
        attempt,
        status: awsResult.status,
        latency: awsResult.latency,
        blocked: awsResult.blocked,
        label: awsResult.label,
        error: awsResult.error,
        url: awsResult.url,
      });

      await send({ type: 'complete' });
    } catch (error) {
      await send({ type: 'error', message: String(error) });
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
