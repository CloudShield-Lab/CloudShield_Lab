import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

const VULNERABLE_S3_BUCKET = process.env.VULNERABLE_S3_BUCKET || '';
const AWS_S3_BUCKET = process.env.AWS_S3_BUCKET || '';
const AWS_REGION = process.env.AWS_REGION || 'ap-northeast-2';

const ATTACK_PATHS = [
  '',
  'uploads/',
  'uploads/test-document.pdf',
  'uploads/private-report.pdf',
  'uploads/user-data.zip',
];

const STAGE_STEP_MS = 160;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildS3Url(bucket: string): string {
  return `https://${bucket}.s3.${AWS_REGION}.amazonaws.com`;
}

function isSuccessfulS3Reach(status: number) {
  return status > 0 && status !== 403;
}

async function tryS3Access(bucketUrl: string, path: string, attempt: number) {
  const fullUrl = `${bucketUrl}/${path}`;
  const start = Date.now();

  try {
    const res = await fetch(fullUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(6000),
    });

    const latency = Date.now() - start;
    const accessible = res.status === 200;
    const blocked = res.status === 403;
    const label = accessible
      ? path === ''
        ? 'BUCKET LISTED'
        : 'FILE ACCESSIBLE'
      : res.status === 403
        ? 'ACCESS DENIED'
        : res.status === 404
          ? 'NOT FOUND'
          : `HTTP ${res.status}`;

    return {
      attempt,
      status: res.status,
      latency,
      blocked,
      label,
      path: path || '(bucket root)',
    };
  } catch {
    return {
      attempt,
      status: 0,
      latency: Date.now() - start,
      blocked: false,
      label: 'CONNECTION ERROR',
      path: path || '(bucket root)',
      error: 'timeout_or_refused',
    };
  }
}

type StageName = 'attacker' | 'cloudfront' | 'waf' | 'ecs' | 'app' | 's3';
type StageStatus = 'idle' | 'reached' | 'passed' | 'blocked' | 'failed' | 'success';
type StageSeverity = 'info' | 'warning' | 'critical' | 'success';
type StageEnv = 'vulnerable' | 'aws';

async function sendStageWithDelay(
  sendStage: (
    env: StageEnv,
    attempt: number,
    stage: StageName,
    status: StageStatus,
    title: string,
    description: string,
    severity: StageSeverity,
  ) => Promise<void>,
  env: StageEnv,
  attempt: number,
  stage: StageName,
  status: StageStatus,
  title: string,
  description: string,
  severity: StageSeverity,
) {
  await sendStage(env, attempt, stage, status, title, description, severity);
  await sleep(STAGE_STEP_MS);
}

export async function GET(_request: NextRequest) {
  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  const send = async (data: object) => {
    try {
      await writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
    } catch {}
  };

  const sendStage = async (
    env: StageEnv,
    attempt: number,
    stage: StageName,
    status: StageStatus,
    title: string,
    description: string,
    severity: StageSeverity,
  ) => {
    await send({ type: 'stage', env, attempt, stage, status, title, description, severity });
  };

  (async () => {
    try {
      await send({ type: 'start' });

      const vulnerableUrl = VULNERABLE_S3_BUCKET ? buildS3Url(VULNERABLE_S3_BUCKET) : null;
      const secureUrl = AWS_S3_BUCKET ? buildS3Url(AWS_S3_BUCKET) : null;

      for (let i = 0; i < ATTACK_PATHS.length; i++) {
        const attempt = i + 1;
        const path = ATTACK_PATHS[i];

        const [vulnResult, awsResult] = await Promise.all([
          vulnerableUrl
            ? tryS3Access(vulnerableUrl, path, attempt)
            : Promise.resolve({
                attempt,
                status: -1,
                latency: 0,
                blocked: false,
                label: 'VULNERABLE_S3_BUCKET NOT CONFIGURED',
                path: path || '(bucket root)',
              }),
          secureUrl
            ? tryS3Access(secureUrl, path, attempt)
            : Promise.resolve({
                attempt,
                status: -1,
                latency: 0,
                blocked: false,
                label: 'AWS_S3_BUCKET NOT CONFIGURED',
                path: path || '(bucket root)',
              }),
        ]);

        await sendStageWithDelay(
          sendStage,
          'vulnerable',
          attempt,
          'attacker',
          'reached',
          '공격 유입',
          '스토리지 접근 요청이 취약 환경으로 유입되었습니다.',
          'critical',
        );
        await sendStageWithDelay(
          sendStage,
          'vulnerable',
          attempt,
          'ecs',
          'reached',
          'EC2 도달',
          '요청이 취약 환경의 호스트 계층을 통과했습니다.',
          'critical',
        );
        await sendStageWithDelay(
          sendStage,
          'vulnerable',
          attempt,
          'app',
          'passed',
          'Service Logic 경유',
          '스토리지 접근 요청이 서비스 로직을 거칩니다.',
          'warning',
        );
        await sendStageWithDelay(
          sendStage,
          'vulnerable',
          attempt,
          's3',
          isSuccessfulS3Reach(vulnResult.status)
            ? 'success'
            : vulnResult.status === 403
              ? 'failed'
              : 'reached',
          isSuccessfulS3Reach(vulnResult.status) ? 'S3 접근 성공' : 'S3 접근 시도',
          `${vulnResult.path} - ${vulnResult.label}`,
          isSuccessfulS3Reach(vulnResult.status) ? 'critical' : 'warning',
        );

        await sendStageWithDelay(
          sendStage,
          'aws',
          attempt,
          'attacker',
          'reached',
          '공격 유입',
          '동일한 요청이 보안 환경으로도 유입되었습니다.',
          'critical',
        );
        await sendStageWithDelay(
          sendStage,
          'aws',
          attempt,
          'cloudfront',
          'passed',
          'CloudFront 전달',
          '보안 환경은 스토리지 요청을 엣지 계층에서 먼저 처리합니다.',
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
            awsResult.label || 'S3 접근 시도가 WAF 또는 정책에 의해 차단되었습니다.',
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
            '이 요청은 WAF 정책을 통과했습니다.',
            'warning',
          );
          await sendStageWithDelay(
            sendStage,
            'aws',
            attempt,
            'ecs',
            'reached',
            'EC2 도달',
            '차단되지 않은 요청이 호스트 계층에 도달했습니다.',
            'warning',
          );
          await sendStageWithDelay(
            sendStage,
            'aws',
            attempt,
            'app',
            'passed',
            'Service Logic 경유',
            '스토리지 접근 요청이 서비스 로직을 거칩니다.',
            'warning',
          );

          if (isSuccessfulS3Reach(awsResult.status)) {
            await sendStageWithDelay(
              sendStage,
              'aws',
              attempt,
              's3',
              'success',
              'S3 접근 성공',
              `${awsResult.path} - ${awsResult.label}`,
              'critical',
            );
          }
        }

        await send({ type: 'result', env: 'vulnerable', ...vulnResult });
        await send({ type: 'result', env: 'aws', ...awsResult });
        await sleep(600);
      }

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
