import { NextRequest } from 'next/server';
import { normalizeApiBaseUrl } from '@/lib/url-utils';
import { getTerraformOutputs } from '@/lib/terraform-state';

export const dynamic = 'force-dynamic';

const DEFAULT_VICTIM_EMAIL = 'victim@demo.com';
const DEFAULT_VICTIM_PASSWORD = 'Demo1234!';
const STAGE_STEP_MS = 180;

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

interface FileItem {
  id: string;
  original_name?: string;
  [key: string]: unknown;
}

interface ChainState {
  token: string | null;
  files: FileItem[];
  presignedUrl: string | null;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function hasJsonContentType(res: Response) {
  return (res.headers.get('content-type') || '').includes('application/json');
}

async function performLogin(baseUrl: string, attempt: number, email: string, password: string) {
  const start = Date.now();
  try {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(8000),
    });
    const latency = Date.now() - start;
    // CloudFront custom_error_response: WAF 403 → 200 + text/html 감지
    const effectiveStatus = res.status === 200 && !hasJsonContentType(res) ? 403 : res.status;

    if (effectiveStatus === 200) {
      const data = await res.json();
      return { attempt, status: 200, latency, blocked: false, label: 'LOGIN SUCCESS', token: data.token as string };
    }
    const label = effectiveStatus === 403 ? 'WAF BLOCKED' : `LOGIN FAILED (${effectiveStatus})`;
    return { attempt, status: effectiveStatus, latency, blocked: effectiveStatus === 403, label, token: null };
  } catch {
    return { attempt, status: 0, latency: Date.now() - start, blocked: false, label: 'CONNECTION ERROR', token: null };
  }
}

async function getFileList(baseUrl: string, token: string, attempt: number) {
  const start = Date.now();
  try {
    const res = await fetch(`${baseUrl}/api/files`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    const latency = Date.now() - start;
    const effectiveStatus = res.status === 200 && !hasJsonContentType(res) ? 403 : res.status;

    if (effectiveStatus === 200) {
      const data = await res.json();
      const files: FileItem[] = data.files || [];
      return { attempt, status: 200, latency, blocked: false, label: `${files.length} FILES FOUND`, files };
    }
    return { attempt, status: effectiveStatus, latency, blocked: false, label: `FILES LIST FAILED (${effectiveStatus})`, files: [] };
  } catch {
    return { attempt, status: 0, latency: Date.now() - start, blocked: false, label: 'CONNECTION ERROR', files: [] };
  }
}

async function getPresignedUrl(baseUrl: string, fileId: string, token: string, attempt: number) {
  const start = Date.now();
  try {
    const res = await fetch(`${baseUrl}/api/files/${fileId}/download`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    const latency = Date.now() - start;
    const effectiveStatus = res.status === 200 && !hasJsonContentType(res) ? 403 : res.status;

    if (effectiveStatus === 200) {
      const data = await res.json();
      return { attempt, status: 200, latency, blocked: false, label: 'PRESIGNED URL OBTAINED', presignedUrl: data.url as string };
    }
    return { attempt, status: effectiveStatus, latency, blocked: false, label: `DOWNLOAD FAILED (${effectiveStatus})`, presignedUrl: null };
  } catch {
    return { attempt, status: 0, latency: Date.now() - start, blocked: false, label: 'CONNECTION ERROR', presignedUrl: null };
  }
}

async function directS3Access(presignedUrl: string, attempt: number) {
  const start = Date.now();
  try {
    const urlObj = new URL(presignedUrl);
    urlObj.search = '';
    const directUrl = urlObj.toString();

    const res = await fetch(directUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(8000),
    });
    const latency = Date.now() - start;
    const blocked = res.status === 403;
    const label = res.status === 200 ? 'DIRECT ACCESS SUCCESS' : res.status === 403 ? 'ACCESS DENIED (403)' : `HTTP ${res.status}`;
    return { attempt, status: res.status, latency, blocked, label, url: res.status === 200 ? directUrl : undefined };
  } catch {
    return { attempt, status: 0, latency: Date.now() - start, blocked: false, label: 'CONNECTION ERROR', url: undefined };
  }
}

export async function GET(request: NextRequest) {
  const searchParams = new URL(request.url).searchParams;
  const mode = searchParams.get('mode') === 'auto' ? 'auto' : 'manual';
  // 시나리오 1에서 탈취한 계정을 query param으로 받아 사용; 없으면 기본 victim 계정
  const VICTIM_EMAIL = searchParams.get('email') || DEFAULT_VICTIM_EMAIL;
  const VICTIM_PASSWORD = searchParams.get('password') || DEFAULT_VICTIM_PASSWORD;
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

      const vulnState: ChainState = { token: null, files: [], presignedUrl: null };
      const awsState: ChainState = { token: null, files: [], presignedUrl: null };

      // ─── Step 1: Login ───────────────────────────────────────────────
      const attempt1 = 1;
      await send({ type: 'chain_step', step: 1, status: 'running' });
      await sendStage('vulnerable', attempt1, 'attacker', 'reached', '공격 유입', `${VICTIM_EMAIL} 계정으로 취약 환경에 로그인을 시도합니다.`, 'critical');
      await sendStage('aws', attempt1, 'attacker', 'reached', '공격 유입', `동일 계정으로 보안 환경에도 로그인을 시도합니다.`, 'critical');
      await sendStage('aws', attempt1, 'cloudfront', 'passed', 'CloudFront 전달', '로그인 요청이 엣지 계층을 통과합니다.', 'info');
      await sendStage('aws', attempt1, 'waf', 'passed', 'WAF 통과', '정상 로그인 요청은 WAF 정책을 통과합니다.', 'warning');

      const [vulnLogin, awsLogin] = await Promise.all([
        performLogin(VULNERABLE_URL, attempt1, VICTIM_EMAIL, VICTIM_PASSWORD),
        AWS_URL
          ? performLogin(AWS_URL, attempt1, VICTIM_EMAIL, VICTIM_PASSWORD)
          : Promise.resolve({ attempt: attempt1, status: -1, latency: 0, blocked: false, label: 'AWS URL NOT CONFIGURED', token: null }),
      ]);

      vulnState.token = vulnLogin.token;
      awsState.token = awsLogin.token;

      await sendStage('vulnerable', attempt1, 'ecs', vulnLogin.status > 0 ? 'reached' : 'failed', 'EC2 도달', '취약 환경 서버에 도달했습니다.', vulnLogin.status > 0 ? 'critical' : 'warning');
      await sendStage('vulnerable', attempt1, 'app', vulnLogin.status === 200 ? 'passed' : 'failed', vulnLogin.status === 200 ? 'JWT 발급 완료' : '로그인 실패', vulnLogin.status === 200 ? `${VICTIM_EMAIL} 계정 인증 성공 — JWT 획득` : '자격증명 불일치', vulnLogin.status === 200 ? 'critical' : 'warning');
      await sendStage('aws', attempt1, 'ecs', awsLogin.status > 0 ? 'reached' : 'failed', 'EC2 도달', '보안 환경 서버에 도달했습니다.', 'warning');
      await sendStage('aws', attempt1, 'app', awsLogin.status === 200 ? 'passed' : 'failed', awsLogin.status === 200 ? 'JWT 발급 완료' : '로그인 실패', awsLogin.status === 200 ? `${VICTIM_EMAIL} 계정 인증 성공 — JWT 획득` : '자격증명 불일치', 'warning');

      await send({ type: 'result', env: 'vulnerable', attempt: vulnLogin.attempt, status: vulnLogin.status, latency: vulnLogin.latency, blocked: vulnLogin.blocked, label: vulnLogin.label });
      await send({ type: 'result', env: 'aws', attempt: awsLogin.attempt, status: awsLogin.status, latency: awsLogin.latency, blocked: awsLogin.blocked, label: awsLogin.label });
      await send({
        type: 'chain_step', step: 1,
        status: vulnLogin.status === 200 ? 'success' : 'failed',
        detail: vulnLogin.status === 200 ? `JWT 획득 완료 (${VICTIM_EMAIL})` : `로그인 실패 (HTTP ${vulnLogin.status})`,
      });
      await sleep(500);

      // ─── Step 2: File list ───────────────────────────────────────────
      const attempt2 = 2;
      await send({ type: 'chain_step', step: 2, status: 'running' });
      const [vulnFiles, awsFiles] = await Promise.all([
        vulnState.token
          ? getFileList(VULNERABLE_URL, vulnState.token, attempt2)
          : Promise.resolve({ attempt: attempt2, status: 0, latency: 0, blocked: false, label: 'NO TOKEN — LOGIN FAILED', files: [] }),
        AWS_URL && awsState.token
          ? getFileList(AWS_URL, awsState.token, attempt2)
          : Promise.resolve({ attempt: attempt2, status: -1, latency: 0, blocked: false, label: 'SKIPPED', files: [] }),
      ]);

      vulnState.files = vulnFiles.files;
      awsState.files = awsFiles.files;

      await sendStage('vulnerable', attempt2, 'app', vulnFiles.status === 200 ? 'passed' : 'failed', '파일 목록 조회', `취약 환경에서 파일 목록 API를 호출합니다. (JWT Bearer 사용)`, 'warning');
      await sendStage('aws', attempt2, 'app', awsFiles.status === 200 ? 'passed' : 'failed', '파일 목록 조회', `보안 환경에서 파일 목록 API를 호출합니다. (JWT Bearer 사용)`, 'warning');

      await send({ type: 'result', env: 'vulnerable', attempt: vulnFiles.attempt, status: vulnFiles.status, latency: vulnFiles.latency, blocked: vulnFiles.blocked, label: vulnFiles.label });
      await send({ type: 'result', env: 'aws', attempt: awsFiles.attempt, status: awsFiles.status, latency: awsFiles.latency, blocked: awsFiles.blocked, label: awsFiles.label });
      await send({
        type: 'chain_step', step: 2,
        status: vulnFiles.status === 200 ? 'success' : 'failed',
        detail: vulnFiles.status === 200
          ? vulnFiles.files.map((f) => f.original_name || f.id).join(', ') || '(파일 없음)'
          : `파일 목록 조회 실패 (HTTP ${vulnFiles.status})`,
      });
      await sleep(500);

      // ─── Step 3: Get presigned download URL ──────────────────────────
      const attempt3 = 3;
      await send({ type: 'chain_step', step: 3, status: 'running' });
      const vulnFile = vulnState.files[0];
      const awsFile = awsState.files[0];

      const [vulnDownload, awsDownload] = await Promise.all([
        vulnState.token && vulnFile
          ? getPresignedUrl(VULNERABLE_URL, vulnFile.id, vulnState.token, attempt3)
          : Promise.resolve({ attempt: attempt3, status: 0, latency: 0, blocked: false, label: 'NO FILES FOUND', presignedUrl: null }),
        AWS_URL && awsState.token && awsFile
          ? getPresignedUrl(AWS_URL, awsFile.id, awsState.token, attempt3)
          : Promise.resolve({ attempt: attempt3, status: -1, latency: 0, blocked: false, label: 'SKIPPED', presignedUrl: null }),
      ]);

      vulnState.presignedUrl = vulnDownload.presignedUrl;
      awsState.presignedUrl = awsDownload.presignedUrl;

      await sendStage('vulnerable', attempt3, 'app', vulnDownload.status === 200 ? 'passed' : 'failed', 'Presigned URL 요청', 'Bearer JWT로 /api/files/:id/download 호출 — 서명된 S3 URL 발급', 'warning');
      await sendStage('vulnerable', attempt3, 's3', vulnDownload.status === 200 ? 'passed' : 'failed', vulnDownload.status === 200 ? 'Presigned URL 발급됨' : 'URL 발급 실패', vulnDownload.status === 200 ? '취약 환경 S3에서 5분 유효 presigned URL이 반환되었습니다.' : '발급 실패', vulnDownload.status === 200 ? 'warning' : 'warning');
      await sendStage('aws', attempt3, 'app', awsDownload.status === 200 ? 'passed' : 'failed', 'Presigned URL 요청', 'Bearer JWT로 /api/files/:id/download 호출 — 서명된 S3 URL 발급', 'warning');
      await sendStage('aws', attempt3, 's3', awsDownload.status === 200 ? 'passed' : 'failed', awsDownload.status === 200 ? 'Presigned URL 발급됨' : 'URL 발급 실패', awsDownload.status === 200 ? '보안 환경 S3에서 5분 유효 presigned URL이 반환되었습니다.' : '발급 실패', 'warning');

      await send({ type: 'result', env: 'vulnerable', attempt: vulnDownload.attempt, status: vulnDownload.status, latency: vulnDownload.latency, blocked: vulnDownload.blocked, label: vulnDownload.label });
      await send({ type: 'result', env: 'aws', attempt: awsDownload.attempt, status: awsDownload.status, latency: awsDownload.latency, blocked: awsDownload.blocked, label: awsDownload.label });
      await send({
        type: 'chain_step', step: 3,
        status: vulnDownload.status === 200 ? 'success' : 'failed',
        detail: vulnDownload.status === 200
          ? `파일: ${vulnFile ? (vulnFile.original_name || vulnFile.id) : '알 수 없음'} — 서명 URL 획득`
          : `Presigned URL 발급 실패 (HTTP ${vulnDownload.status})`,
      });
      await sleep(500);

      // ─── Step 4: Direct S3 access (signature stripped) ───────────────
      const attempt4 = 4;
      await send({ type: 'chain_step', step: 4, status: 'running' });
      const [vulnDirect, awsDirect] = await Promise.all([
        vulnState.presignedUrl
          ? directS3Access(vulnState.presignedUrl, attempt4)
          : Promise.resolve({ attempt: attempt4, status: 0, latency: 0, blocked: false, label: 'NO PRESIGNED URL', url: undefined }),
        awsState.presignedUrl
          ? directS3Access(awsState.presignedUrl, attempt4)
          : Promise.resolve({ attempt: attempt4, status: -1, latency: 0, blocked: false, label: 'SKIPPED', url: undefined }),
      ]);

      await sendStage('vulnerable', attempt4, 's3', vulnDirect.status === 200 ? 'success' : 'failed', '서명 제거 후 직접 접근', vulnDirect.status === 200 ? '⚠ 서명 없이 S3 직접 접근 성공 — 버킷이 퍼블릭 상태입니다.' : '직접 접근 실패', vulnDirect.status === 200 ? 'critical' : 'warning');
      await sendStage('aws', attempt4, 's3', awsDirect.blocked ? 'blocked' : awsDirect.status === 200 ? 'success' : 'failed', awsDirect.blocked ? 'S3 직접 접근 차단' : '직접 접근 시도', awsDirect.blocked ? '프라이빗 버킷 — 서명 없는 접근이 차단되었습니다.' : awsDirect.status === 200 ? '보안 환경에서 직접 접근이 허용되었습니다.' : '직접 접근 실패', awsDirect.blocked ? 'success' : 'critical');

      await send({ type: 'result', env: 'vulnerable', attempt: vulnDirect.attempt, status: vulnDirect.status, latency: vulnDirect.latency, blocked: vulnDirect.blocked, label: vulnDirect.label, url: vulnDirect.url });
      await send({ type: 'result', env: 'aws', attempt: awsDirect.attempt, status: awsDirect.status, latency: awsDirect.latency, blocked: awsDirect.blocked, label: awsDirect.label, url: awsDirect.url });
      await send({
        type: 'chain_step', step: 4,
        status: vulnDirect.status === 200 ? 'success' : 'failed',
        directUrl: vulnDirect.url || null,
        detail: vulnDirect.status === 200
          ? '⚠ 서명 없이 S3 직접 접근 성공 — 버킷이 퍼블릭 상태'
          : `직접 접근 차단 (HTTP ${vulnDirect.status})`,
      });

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
