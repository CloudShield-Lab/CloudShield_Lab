import { NextRequest, NextResponse } from 'next/server';
import { listSessions } from '@/lib/analysis-storage';
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
