import { NextRequest, NextResponse } from 'next/server';
import { listSessions, deleteSessions } from '@/lib/analysis-storage';
import type { WorkspaceMode } from '@/types';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const modeParam = url.searchParams.get('mode');
  const mode = modeParam === 'auto' || modeParam === 'manual' ? (modeParam as WorkspaceMode) : undefined;
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 100);

  try {
    const sessions = await listSessions(mode, limit);
    return NextResponse.json(sessions);
  } catch (e) {
    // S3 unavailable (e.g. local dev without credentials) → return empty list
    console.warn('[analysis/sessions] S3 unavailable, returning empty list:', (e as Error).message);
    return NextResponse.json([]);
  }
}

export async function DELETE(request: NextRequest) {
  let body: { keys: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!Array.isArray(body.keys) || body.keys.length === 0) {
    return NextResponse.json({ error: 'keys array required' }, { status: 400 });
  }

  try {
    await deleteSessions(body.keys);
    return NextResponse.json({ deleted: body.keys.length });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
