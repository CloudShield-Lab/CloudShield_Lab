import { NextRequest, NextResponse } from 'next/server';
import { getSessionById, getSessionByKey } from '@/lib/analysis-storage';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const url = new URL(request.url);
  const s3Key = url.searchParams.get('key');

  try {
    const session = s3Key
      ? await getSessionByKey(decodeURIComponent(s3Key))
      : await getSessionById(sessionId);

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }
    return NextResponse.json(session);
  } catch (e) {
    console.error('[analysis/[sessionId]] error:', e);
    return NextResponse.json({ error: 'Failed to fetch session' }, { status: 503 });
  }
}
