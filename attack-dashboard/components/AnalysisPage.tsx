'use client';

import { useState } from 'react';
import type { AnalysisSession, SessionMeta, WorkspaceMode } from '@/types';
import { SessionList } from './SessionList';
import { AiAnalysisPanel } from './AiAnalysisPanel';

interface Props {
  mode: WorkspaceMode;
}

export function AnalysisPage({ mode }: Props) {
  const [selectedMeta, setSelectedMeta] = useState<SessionMeta | null>(null);
  const [session, setSession] = useState<AnalysisSession | null>(null);
  const [loadingSession, setLoadingSession] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [showRawLog, setShowRawLog] = useState(false);

  const handleSelectMeta = async (meta: SessionMeta) => {
    if (meta.sessionId === selectedMeta?.sessionId) return;
    setSelectedMeta(meta);
    setSession(null);
    setSessionError(null);
    setLoadingSession(true);
    setShowRawLog(false);

    try {
      const res = await fetch(
        `/api/analysis/${meta.sessionId}?key=${encodeURIComponent(meta.s3Key)}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as AnalysisSession;
      setSession(data);
    } catch (e) {
      setSessionError(e instanceof Error ? e.message : '세션 로드 실패');
    } finally {
      setLoadingSession(false);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
      {/* Left: session list */}
      <aside className="lg:sticky lg:top-6">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">저장된 세션</div>
          </div>
          <SessionList mode={mode} selectedId={selectedMeta?.sessionId ?? null} onSelect={handleSelectMeta} />
        </div>
      </aside>

      {/* Right: detail + AI analysis */}
      <section>
        {!selectedMeta && (
          <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white py-20 text-center shadow-sm">
            <p className="text-3xl">📋</p>
            <p className="mt-3 text-sm font-medium text-slate-600">세션을 선택하세요</p>
            <p className="mt-1 text-xs text-slate-400">
              좌측 목록에서 분석할 공격 세션을 선택하면 AI 분석을 시작할 수 있습니다
            </p>
          </div>
        )}

        {selectedMeta && loadingSession && (
          <div className="flex flex-col gap-4">
            <div className="h-32 animate-pulse rounded-xl bg-slate-100" />
            <div className="h-64 animate-pulse rounded-xl bg-slate-100" />
          </div>
        )}

        {selectedMeta && sessionError && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700">
            <p>세션을 불러오지 못했습니다: {sessionError}</p>
          </div>
        )}

        {session && selectedMeta && (
          <div className="flex flex-col gap-4">
            {/* Session header */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">{session.scenarioTitle}</h2>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span>{new Date(session.timestamp).toLocaleString('ko-KR')}</span>
                    <span>·</span>
                    <span className={`rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase ${
                      session.mode === 'auto'
                        ? 'border-violet-200 bg-violet-50 text-violet-600'
                        : 'border-sky-200 bg-sky-50 text-sky-600'
                    }`}>
                      {session.mode}
                    </span>
                    <span>·</span>
                    <span className="font-mono text-slate-400">ID: {session.sessionId.slice(0, 8)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* AI Analysis Panel */}
            <AiAnalysisPanel session={session} s3Key={selectedMeta.s3Key} />

            {/* Raw log (collapsible) */}
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <button
                onClick={() => setShowRawLog((v) => !v)}
                className="flex w-full items-center justify-between px-4 py-3 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                <span>원본 요청 로그 ({session.vulnResults.length + session.secureResults.length}건)</span>
                <span className="text-slate-400">{showRawLog ? '▲ 접기' : '▼ 펼치기'}</span>
              </button>

              {showRawLog && (
                <div className="border-t border-slate-200 p-4">
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div>
                      <div className="mb-2 text-xs font-semibold text-red-600">취약 환경 ({session.vulnResults.length})</div>
                      <div className="max-h-64 overflow-y-auto font-mono text-[10px]">
                        {session.vulnResults.map((r, i) => (
                          <div key={i} className={`border-b border-slate-100 py-1 ${r.blocked ? 'text-emerald-700' : 'text-slate-600'}`}>
                            #{r.attempt} {r.status} {r.latency}ms {r.blocked ? '[BLOCKED]' : ''} {r.label ?? ''}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="mb-2 text-xs font-semibold text-emerald-600">보안 환경 ({session.secureResults.length})</div>
                      <div className="max-h-64 overflow-y-auto font-mono text-[10px]">
                        {session.secureResults.map((r, i) => (
                          <div key={i} className={`border-b border-slate-100 py-1 ${r.blocked ? 'text-emerald-700' : 'text-slate-600'}`}>
                            #{r.attempt} {r.status} {r.latency}ms {r.blocked ? '[BLOCKED]' : ''} {r.label ?? ''}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
