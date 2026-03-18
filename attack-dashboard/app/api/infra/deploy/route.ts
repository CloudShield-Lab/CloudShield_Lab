import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

const GITHUB_OWNER = process.env.GITHUB_OWNER || 'your-github-username';
const GITHUB_REPO = process.env.GITHUB_REPO || 'SentinelShare';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';

type Environment = 'vulnerable' | 'secure';
type Action = 'apply' | 'destroy';

async function triggerWorkflow(env: Environment, action: Action): Promise<{ ok: boolean; error?: string }> {
  if (!GITHUB_TOKEN) {
    return { ok: false, error: 'GITHUB_TOKEN 환경변수가 설정되지 않았습니다.' };
  }

  const workflow = env === 'vulnerable' ? 'terraform-vulnerable.yml' : 'terraform-secure.yml';
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${workflow}/dispatches`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      ref: 'dev',
      inputs: { action },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: `GitHub API ${res.status}: ${text}` };
  }

  return { ok: true };
}

async function getLatestRunStatus(env: Environment): Promise<{ status: string; conclusion: string | null; html_url: string } | null> {
  if (!GITHUB_TOKEN) return null;

  const workflow = env === 'vulnerable' ? 'terraform-vulnerable.yml' : 'terraform-secure.yml';
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${workflow}/runs?per_page=1`;

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!res.ok) return null;

    const data = await res.json();
    const run = data.workflow_runs?.[0];
    if (!run) return null;

    return {
      status: run.status,
      conclusion: run.conclusion,
      html_url: run.html_url,
    };
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const env = (searchParams.get('env') || 'vulnerable') as Environment;
  const action = (searchParams.get('action') || 'apply') as Action;

  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  const send = async (data: object) => {
    try {
      await writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
    } catch {
      // 클라이언트 연결 끊김
    }
  };

  (async () => {
    try {
      await send({ type: 'log', message: `[${env.toUpperCase()}] Terraform ${action} 시작...` });
      await send({ type: 'log', message: `GitHub Actions 워크플로우 트리거 중...` });

      const trigger = await triggerWorkflow(env, action);

      if (!trigger.ok) {
        await send({ type: 'error', message: trigger.error || '워크플로우 트리거 실패' });
        return;
      }

      await send({ type: 'log', message: `워크플로우 트리거 완료. GitHub Actions 실행 대기 중...` });

      // 워크플로우 큐잉 대기
      await new Promise((r) => setTimeout(r, 3000));

      // 최대 10분간 상태 폴링
      const maxAttempts = 60;
      for (let i = 0; i < maxAttempts; i++) {
        const runStatus = await getLatestRunStatus(env);

        if (!runStatus) {
          await send({ type: 'log', message: `상태 조회 중... (${i + 1}/${maxAttempts})` });
        } else {
          const statusMsg = runStatus.conclusion
            ? `상태: ${runStatus.status} / 결과: ${runStatus.conclusion}`
            : `상태: ${runStatus.status} (실행 중...)`;

          await send({
            type: 'status',
            status: runStatus.status,
            conclusion: runStatus.conclusion,
            html_url: runStatus.html_url,
            message: statusMsg,
          });

          if (runStatus.status === 'completed') {
            const success = runStatus.conclusion === 'success';
            await send({
              type: 'complete',
              success,
              message: success
                ? `Terraform ${action} 완료! 상세: ${runStatus.html_url}`
                : `Terraform ${action} 실패. 상세: ${runStatus.html_url}`,
              html_url: runStatus.html_url,
            });
            return;
          }
        }

        await new Promise((r) => setTimeout(r, 10000)); // 10초 간격
      }

      await send({
        type: 'timeout',
        message: '타임아웃: 워크플로우가 10분 이내에 완료되지 않았습니다. GitHub Actions에서 직접 확인하세요.',
      });
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
