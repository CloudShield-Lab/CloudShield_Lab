import { NextRequest } from 'next/server';
import { analyzeAttackSession } from '@/lib/bedrock';
import { getSessionById, getSessionByKey } from '@/lib/analysis-storage';
import type { AnalysisSession } from '@/types';

export async function POST(request: NextRequest) {
  let body: {
    sessionId?: string;
    s3Key?: string;
    session?: AnalysisSession;
    lang?: 'ko' | 'en';
  };

  try {
    body = await request.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const lang = body.lang === 'en' ? 'en' : 'ko';

  let session: AnalysisSession | null = null;
  try {
    if (body.session) {
      session = body.session;
    } else if (body.s3Key) {
      session = await getSessionByKey(decodeURIComponent(body.s3Key));
    } else if (body.sessionId) {
      session = await getSessionById(body.sessionId);
    }
  } catch (e) {
    console.error('[analysis/analyze] fetch session error:', e);
    return new Response('Failed to load session', { status: 503 });
  }

  if (!session) {
    return new Response('Session not found', { status: 404 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of analyzeAttackSession(session!, lang)) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'chunk', text: chunk })}\n\n`),
          );
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'error', message: msg })}\n\n`),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
