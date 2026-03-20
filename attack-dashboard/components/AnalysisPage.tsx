'use client';

import { useState } from 'react';
import type { AnalysisSession, SessionMeta, WazuhAlert, WorkspaceMode } from '@/types';
import { SessionList } from './SessionList';
import { AiAnalysisPanel } from './AiAnalysisPanel';

interface Props {
  mode: WorkspaceMode;
}

const LEVEL_COLORS: Record<string, string> = {
  low: 'border-slate-200 bg-slate-50 text-slate-600',
  medium: 'border-amber-200 bg-amber-50 text-amber-700',
  high: 'border-orange-200 bg-orange-50 text-orange-700',
  critical: 'border-red-200 bg-red-50 text-red-700',
};

function wazuhLevelClass(level: number) {
  if (level >= 12) return LEVEL_COLORS.critical;
  if (level >= 8) return LEVEL_COLORS.high;
  if (level >= 4) return LEVEL_COLORS.medium;
  return LEVEL_COLORS.low;
}

function WazuhAlertRow({ alert }: { alert: WazuhAlert }) {
  const [expanded, setExpanded] = useState(false);
  const levelClass = wazuhLevelClass(alert.rule.level);
  const isVuln = alert.agent.name.toLowerCase().includes('vul');

  return (
    <div className={`rounded-lg border px-3 py-2 ${levelClass}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded border px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider">
              Lv {alert.rule.level}
            </span>
            <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-medium ${
              isVuln ? 'border-red-200 bg-red-50 text-red-600' : 'border-emerald-200 bg-emerald-50 text-emerald-600'
            }`}>
              {isVuln ? '취약' : '보안'}
            </span>
            <span className="font-mono text-[9px] text-slate-400">{alert.agent.name}</span>
          </div>
          <p className="mt-1 text-[11px] font-medium leading-snug">{alert.rule.description}</p>
          <p className="mt-0.5 font-mono text-[9px] opacity-60">
            {new Date(alert.timestamp).toLocaleString('ko-KR')} · rule {alert.rule.id}
          </p>
        </div>
        {alert.full_log && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex-shrink-0 text-[9px] text-slate-400 underline"
          >
            {expanded ? '접기' : '로그'}
          </button>
        )}
      </div>
      {expanded && alert.full_log && (
        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded bg-slate-900 p-2 font-mono text-[9px] leading-4 text-slate-100">
          {alert.full_log}
        </pre>
      )}
    </div>
  );
}

export function AnalysisPage({ mode }: Props) {
  const [selectedMeta, setSelectedMeta] = useState<SessionMeta | null>(null);
  const [session, setSession] = useState<AnalysisSession | null>(null);
  const [loadingSession, setLoadingSession] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [showRawLog, setShowRawLog] = useState(false);
  const [showWazuh, setShowWazuh] = useState(false);
  const [wazuhFilter, setWazuhFilter] = useState<'all' | 'vulnerable' | 'secure'>('all');

  const handleSelectMeta = async (meta: SessionMeta) => {
    if (meta.sessionId === selectedMeta?.sessionId) return;
    setSelectedMeta(meta);
    setSession(null);
    setSessionError(null);
    setLoadingSession(true);
    setShowRawLog(false);
    setShowWazuh(false);
    setWazuhFilter('all');

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

  const handleDeleted = (deletedIds: string[]) => {
    if (selectedMeta && deletedIds.includes(selectedMeta.sessionId)) {
      setSelectedMeta(null);
      setSession(null);
    }
  };

  const filteredWazuhAlerts = (alerts: WazuhAlert[]): WazuhAlert[] => {
    if (wazuhFilter === 'all') return alerts;
    const isVuln = wazuhFilter === 'vulnerable';
    return alerts.filter((a) => {
      const nameIsVuln = a.agent.name.toLowerCase().includes('vul');
      return isVuln ? nameIsVuln : !nameIsVuln;
    });
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
      {/* Left: session list */}
      <aside className="lg:sticky lg:top-6">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <SessionList
            mode={mode}
            selectedId={selectedMeta?.sessionId ?? null}
            onSelect={handleSelectMeta}
            onDeleted={handleDeleted}
          />
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
                    {session.wazuhAlerts && session.wazuhAlerts.length > 0 && (
                      <>
                        <span>·</span>
                        <span className="rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 font-mono text-[10px] text-orange-600">
                          Wazuh {session.wazuhAlerts.length}건
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* AI Analysis Panel */}
            <AiAnalysisPanel session={session} s3Key={selectedMeta.s3Key} />

            {/* Wazuh HIDS 알림 */}
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <button
                onClick={() => setShowWazuh((v) => !v)}
                className="flex w-full items-center justify-between px-4 py-3 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                <div className="flex items-center gap-2">
                  <span>Wazuh HIDS 알림</span>
                  {session.wazuhAlerts === undefined ? (
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[9px] text-slate-400">
                      데이터 없음
                    </span>
                  ) : (
                    <span className={`rounded-full border px-2 py-0.5 text-[9px] font-medium ${
                      session.wazuhAlerts.length > 0
                        ? 'border-orange-200 bg-orange-50 text-orange-600'
                        : 'border-slate-200 bg-slate-50 text-slate-400'
                    }`}>
                      {session.wazuhAlerts.length}건
                    </span>
                  )}
                </div>
                <span className="text-slate-400">{showWazuh ? '▲ 접기' : '▼ 펼치기'}</span>
              </button>

              {showWazuh && (
                <div className="border-t border-slate-200 p-4">
                  {session.wazuhAlerts === undefined ? (
                    <p className="py-4 text-center text-xs text-slate-400">
                      이 세션은 Wazuh 연동 전 저장된 세션입니다. 새 공격을 실행하면 HIDS 데이터가 포함됩니다.
                    </p>
                  ) : session.wazuhAlerts.length === 0 ? (
                    <p className="py-4 text-center text-xs text-slate-400">
                      공격 시간대에 수집된 Wazuh 알림이 없습니다.
                    </p>
                  ) : (
                    <>
                      {/* 필터 탭 */}
                      <div className="mb-3 flex gap-1.5">
                        {(['all', 'vulnerable', 'secure'] as const).map((f) => (
                          <button
                            key={f}
                            onClick={() => setWazuhFilter(f)}
                            className={`rounded-lg border px-2.5 py-1 text-[10px] font-medium transition-colors ${
                              wazuhFilter === f
                                ? f === 'vulnerable'
                                  ? 'border-red-300 bg-red-50 text-red-600'
                                  : f === 'secure'
                                  ? 'border-emerald-300 bg-emerald-50 text-emerald-600'
                                  : 'border-violet-300 bg-violet-50 text-violet-600'
                                : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                            }`}
                          >
                            {f === 'all' ? `전체 ${session.wazuhAlerts!.length}` : f === 'vulnerable' ? `취약 환경` : '보안 환경'}
                          </button>
                        ))}
                      </div>

                      {/* 알림 목록 */}
                      <div className="flex max-h-96 flex-col gap-2 overflow-y-auto">
                        {filteredWazuhAlerts(session.wazuhAlerts).map((alert, i) => (
                          <WazuhAlertRow key={`${alert.id}-${i}`} alert={alert} />
                        ))}
                        {filteredWazuhAlerts(session.wazuhAlerts).length === 0 && (
                          <p className="py-4 text-center text-xs text-slate-400">해당 환경의 알림이 없습니다.</p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

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
