'use client';

import { useCallback, useRef, useState } from 'react';
import { useArchitectureVisualization } from '@/hooks/useArchitectureVisualization';
import type { AttackEvent, AttackPhase, AttackResult, SessionMetrics, WorkspaceMode } from '@/types';

function computeMetrics(results: AttackResult[]): SessionMetrics {
  const total = results.length;
  const blocked = results.filter((r) => r.blocked).length;
  const avgLatency =
    total > 0 ? Math.round(results.reduce((sum, r) => sum + r.latency, 0) / total) : 0;
  return { blocked, total, avgLatency };
}

// 백엔드 RCE_ATTEMPTS 순서와 동일 (표시용)
const PRESET_LABELS = [
  { label: 'JNDI LDAP', header: 'User-Agent' },
  { label: 'JNDI RMI', header: 'User-Agent' },
  { label: 'JNDI DNS', header: 'X-Forwarded-For' },
  { label: 'JNDI 난독화', header: 'Referer' },
  { label: 'AWS Metadata', header: 'X-Api-Version' },
  { label: 'Env 탈취', header: 'User-Agent' },
];

interface RceResult {
  attempt: number;
  status: number;
  latency: number;
  blocked: boolean;
  headerName: string;
  payload: string;
  error?: string;
}

interface RceEvent {
  type: string;
  env?: string;
  attempt?: number;
  status?: number;
  latency?: number;
  blocked?: boolean;
  headerName?: string;
  payload?: string;
  error?: string;
  message?: string;
}

interface Props {
  index: number;
  title: string;
  description: string;
  vulnNote: string;
  awsNote: string;
  mode: WorkspaceMode;
}

export function RceInjectionCard({ index, title, description, vulnNote, awsNote, mode }: Props) {
  const { startScenario, handleAttackEvent, resetScenario } = useArchitectureVisualization();
  const [phase, setPhase] = useState<AttackPhase>('idle');
  const [vulnResults, setVulnResults] = useState<RceResult[]>([]);
  const [awsResults, setAwsResults] = useState<RceResult[]>([]);
  const [savedToast, setSavedToast] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const localVulnRef = useRef<RceResult[]>([]);
  const localAwsRef = useRef<RceResult[]>([]);

  const startAttack = useCallback(() => {
    if (phase === 'running') return;
    const startTime = new Date().toISOString();
    startScenario('rce-injection');
    setPhase('running');
    setVulnResults([]);
    setAwsResults([]);
    localVulnRef.current = [];
    localAwsRef.current = [];

    const doSave = (localVuln: RceResult[], localAws: RceResult[]) => {
      void (async () => {
        try {
          const toAttackResult = (r: RceResult): AttackResult => ({
            attempt: r.attempt,
            status: r.status,
            latency: r.latency,
            blocked: r.blocked,
            label: r.blocked ? `WAF BLOCKED — ${r.headerName}` : `REACHED APP — ${r.headerName}`,
          });
          const vulnAttackResults = localVuln.map(toAttackResult);
          const secureAttackResults = localAws.map(toAttackResult);
          const sessionId =
            typeof crypto !== 'undefined' && crypto.randomUUID
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
          await fetch('/api/analysis/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId,
              startTime,
              timestamp: new Date().toISOString(),
              mode,
              scenario: 'rce-injection',
              scenarioTitle: title,
              vulnResults: vulnAttackResults,
              secureResults: secureAttackResults,
              stages: [],
              metrics: {
                vuln: computeMetrics(vulnAttackResults),
                secure: computeMetrics(secureAttackResults),
              },
            }),
          });
          setSavedToast(true);
          setTimeout(() => setSavedToast(false), 3000);
        } catch {}
      })();
    };

    // header/payload 파라미터 없이 호출 → 백엔드에서 6개 프리셋 전체 자동 실행
    const es = new EventSource(`/api/attack/rce-injection?mode=${mode}`);
    esRef.current = es;

    es.onmessage = (msg) => {
      let event: RceEvent;
      try {
        event = JSON.parse(msg.data);
      } catch {
        return;
      }

      handleAttackEvent('rce-injection', event as unknown as AttackEvent);

      if (event.type === 'rce_result') {
        const result: RceResult = {
          attempt: event.attempt ?? 0,
          status: event.status ?? 0,
          latency: event.latency ?? 0,
          blocked: event.blocked ?? false,
          headerName: event.headerName ?? '',
          payload: event.payload ?? '',
          error: event.error,
        };
        if (event.env === 'vulnerable') {
          setVulnResults((prev) => [...prev, result]);
          localVulnRef.current = [...localVulnRef.current, result];
        } else {
          setAwsResults((prev) => [...prev, result]);
          localAwsRef.current = [...localAwsRef.current, result];
        }
      } else if (event.type === 'complete') {
        setPhase('complete');
        doSave(localVulnRef.current, localAwsRef.current);
        es.close();
      } else if (event.type === 'error') {
        setPhase('error');
        es.close();
      }
    };

    es.onerror = () => {
      setPhase('complete');
      doSave(localVulnRef.current, localAwsRef.current);
      es.close();
    };
  }, [handleAttackEvent, mode, phase, startScenario, title]);

  const reset = useCallback(() => {
    esRef.current?.close();
    resetScenario();
    setPhase('idle');
    setVulnResults([]);
    setAwsResults([]);
  }, [resetScenario]);

  return (
    <>
      {savedToast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-xl border border-emerald-300 bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg">
          ✓ 세션이 저장되었습니다
        </div>
      )}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_14px_36px_rgba(15,23,42,0.05)]">
        {/* 헤더 */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 font-mono text-xs text-slate-500">
              {index}
            </span>
            <div>
              <h2 className="font-semibold tracking-wide text-slate-900">{title}</h2>
              <p className="mt-0.5 text-sm text-slate-500">{description}</p>
            </div>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            {phase !== 'idle' && (
              <button
                onClick={reset}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-800"
              >
                초기화
              </button>
            )}
            <button
              onClick={startAttack}
              disabled={phase === 'running'}
              className={`rounded-lg border px-4 py-1.5 text-xs font-semibold transition-colors ${
                phase === 'running'
                  ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                  : 'border-red-500 bg-red-500 text-white hover:bg-red-600 disabled:opacity-50'
              }`}
            >
              {phase === 'running' ? (
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-yellow-400" />
                  공격 중
                </span>
              ) : phase === 'complete' ? (
                '다시 공격'
              ) : (
                '공격 실행'
              )}
            </button>
          </div>
        </div>

        {/* 프리셋 목록 (표시 전용) */}
        <div className="border-b border-slate-200 bg-slate-50 px-6 py-3">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            실행 대상 — 6개 JNDI 프리셋 자동 순차 실행
          </div>
          <div className="flex flex-wrap gap-1.5">
            {PRESET_LABELS.map((p, i) => (
              <span
                key={p.label}
                className="rounded-md border border-slate-200 bg-white px-2.5 py-1 font-mono text-[11px] text-slate-500"
              >
                {i + 1}. {p.label}
                <span className="ml-1 text-slate-400">({p.header})</span>
              </span>
            ))}
          </div>
        </div>

        {/* 결과 비교 */}
        <div className="grid grid-cols-1 divide-y divide-slate-200 lg:grid-cols-2 lg:divide-x lg:divide-y-0">
          <RceResultPanel
            label="취약 환경"
            badge="WAF 없음"
            note={vulnNote}
            results={vulnResults}
            phase={phase}
            isVuln={true}
          />
          <RceResultPanel
            label="보안 환경"
            badge="WAF KnownBadInputs"
            note={awsNote}
            results={awsResults}
            phase={phase}
            isVuln={false}
          />
        </div>

        {phase === 'idle' && (
          <div className="border-t border-slate-200 p-4 text-center text-xs text-slate-400">
            공격 실행을 클릭하면 6개 JNDI 프리셋이 자동으로 순차 실행됩니다. 취약 환경은 앱 도달, 보안 환경은 WAF 차단됩니다.
          </div>
        )}
      </section>
    </>
  );
}

function RceResultPanel({
  label,
  badge,
  note,
  results,
  phase,
  isVuln,
}: {
  label: string;
  badge: string;
  note: string;
  results: RceResult[];
  phase: AttackPhase;
  isVuln: boolean;
}) {
  const blockedCount = results.filter((r) => r.blocked).length;
  const reachedCount = results.filter((r) => !r.blocked && r.status > 0).length;

  return (
    <div className="space-y-3 p-5">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${isVuln ? 'bg-red-500' : 'bg-emerald-500'}`} />
        <span
          className={`text-xs font-semibold uppercase tracking-wider ${isVuln ? 'text-red-600' : 'text-emerald-600'}`}
        >
          {label}
        </span>
        <span className="ml-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[10px] text-slate-500">
          {badge}
        </span>
      </div>
      <p className="text-xs leading-5 text-slate-500">{note}</p>

      {results.length > 0 ? (
        <div className="space-y-2">
          {/* 완료 요약 */}
          {phase === 'complete' && (
            <div
              className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
                isVuln
                  ? 'border-red-200 bg-red-50 text-red-700'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-700'
              }`}
            >
              {isVuln
                ? `${reachedCount}개 페이로드 앱 도달 — Log4j 취약 버전이라면 RCE 위험`
                : `${blockedCount} / 6 WAF 차단됨`}
            </div>
          )}
          {/* 개별 결과 목록 */}
          <div className="space-y-1.5">
            {results.map((r) => (
              <div
                key={r.attempt}
                className={`flex items-start gap-2 rounded-lg border px-3 py-2 ${
                  r.blocked
                    ? 'border-emerald-200 bg-emerald-50'
                    : r.status <= 0
                      ? 'border-slate-200 bg-slate-50'
                      : 'border-red-200 bg-red-50'
                }`}
              >
                <span className="mt-0.5 flex-shrink-0 font-mono text-[10px] text-slate-400">
                  #{r.attempt}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs font-semibold ${
                        r.blocked
                          ? 'text-emerald-700'
                          : r.status > 0
                            ? 'text-red-700'
                            : 'text-slate-500'
                      }`}
                    >
                      {r.blocked ? 'BLOCKED' : r.status > 0 ? 'REACHED' : 'ERROR'}
                    </span>
                    <span className="font-mono text-[10px] text-slate-400">
                      {r.headerName} · {r.latency}ms
                    </span>
                  </div>
                  <code
                    className={`mt-0.5 block truncate font-mono text-[10px] ${
                      r.blocked ? 'text-emerald-600' : 'text-red-600'
                    }`}
                  >
                    {r.payload}
                  </code>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div
          className={`rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-xs text-slate-400 ${
            phase === 'running' ? 'animate-pulse' : ''
          }`}
        >
          {phase === 'running' ? '공격 중...' : '공격을 실행하면 결과가 표시됩니다.'}
        </div>
      )}
    </div>
  );
}
