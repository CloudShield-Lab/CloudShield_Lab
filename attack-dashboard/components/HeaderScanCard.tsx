'use client';

import { useCallback, useRef, useState } from 'react';
import { useArchitectureVisualization } from '@/hooks/useArchitectureVisualization';
import type { AttackEvent, AttackPhase, AttackResult, SessionMetrics, WorkspaceMode } from '@/types';

function computeMetrics(results: AttackResult[]): SessionMetrics {
  const total = results.length;
  const blocked = results.filter((r) => r.blocked).length;
  const avgLatency = total > 0 ? Math.round(results.reduce((sum, r) => sum + r.latency, 0) / total) : 0;
  return { blocked, total, avgLatency };
}

const PRESET_ORIGINS = [
  'https://evil.com',
  'https://attacker.io',
  'https://malicious-site.net',
  'null',
];

interface CorsResult {
  status: number;
  latency: number;
  acaoHeader: string | null;
  acacHeader: string | null;
  corsAccepted: boolean;
  wafBlocked: boolean;
  attackOrigin: string;
}

interface CorsEvent {
  type: string;
  env?: string;
  status?: number;
  latency?: number;
  acaoHeader?: string | null;
  acacHeader?: string | null;
  corsAccepted?: boolean;
  wafBlocked?: boolean;
  attackOrigin?: string;
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

export function HeaderScanCard({ index, title, description, vulnNote, awsNote, mode }: Props) {
  const { startScenario, handleAttackEvent, resetScenario } = useArchitectureVisualization();
  const [phase, setPhase] = useState<AttackPhase>('idle');
  const [origin, setOrigin] = useState('https://evil.com');
  const [vulnResult, setVulnResult] = useState<CorsResult | null>(null);
  const [awsResult, setAwsResult] = useState<CorsResult | null>(null);
  const [savedToast, setSavedToast] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const localVulnRef = useRef<CorsResult | null>(null);
  const localAwsRef = useRef<CorsResult | null>(null);

  const startAttack = useCallback(() => {
    if (phase === 'running') return;
    const startTime = new Date().toISOString();
    startScenario('header-scan');
    setPhase('running');
    setVulnResult(null);
    setAwsResult(null);
    localVulnRef.current = null;
    localAwsRef.current = null;

    const doSave = (localVuln: CorsResult | null, localAws: CorsResult | null) => {
      void (async () => {
        try {
          const toResult = (r: CorsResult | null, attempt: number): AttackResult => ({
            attempt,
            status: r?.status ?? 0,
            latency: r?.latency ?? 0,
            blocked: !(r?.corsAccepted ?? false),
            label: r ? (r.corsAccepted ? `CORS ACCEPTED — ${r.attackOrigin}` : 'CORS BLOCKED') : undefined,
          });
          const vulnResults: AttackResult[] = localVuln ? [toResult(localVuln, 1)] : [];
          const secureResults: AttackResult[] = localAws ? [toResult(localAws, 1)] : [];
          const sessionId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
          await fetch('/api/analysis/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId,
              startTime,
              timestamp: new Date().toISOString(),
              mode,
              scenario: 'header-scan',
              scenarioTitle: title,
              vulnResults,
              secureResults,
              stages: [],
              metrics: { vuln: computeMetrics(vulnResults), secure: computeMetrics(secureResults) },
            }),
          });
          setSavedToast(true);
          setTimeout(() => setSavedToast(false), 3000);
        } catch {}
      })();
    };

    const encodedOrigin = encodeURIComponent(origin);
    const es = new EventSource(`/api/attack/header-scan?mode=${mode}&origin=${encodedOrigin}`);
    esRef.current = es;

    es.onmessage = (msg) => {
      let event: CorsEvent;
      try { event = JSON.parse(msg.data); } catch { return; }

      handleAttackEvent('header-scan', event as unknown as AttackEvent);

      if (event.type === 'cors_result') {
        const result: CorsResult = {
          status: event.status ?? 0,
          latency: event.latency ?? 0,
          acaoHeader: event.acaoHeader ?? null,
          acacHeader: event.acacHeader ?? null,
          corsAccepted: event.corsAccepted ?? false,
          wafBlocked: event.wafBlocked ?? false,
          attackOrigin: event.attackOrigin ?? origin,
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
  }, [handleAttackEvent, mode, origin, phase, startScenario, title]);

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
        {/* Header */}
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
              <button onClick={reset} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-800">
                초기화
              </button>
            )}
          </div>
        </div>

        {/* Origin 입력 */}
        <div className="border-b border-slate-200 bg-slate-50 px-6 py-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">공격 Origin 설정</div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
              disabled={phase === 'running'}
              placeholder="https://evil.com"
              className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-mono text-sm text-slate-800 focus:border-slate-400 focus:outline-none disabled:opacity-50"
            />
            <div className="flex flex-wrap gap-1.5">
              {PRESET_ORIGINS.map((preset) => (
                <button
                  key={preset}
                  onClick={() => setOrigin(preset)}
                  disabled={phase === 'running'}
                  className={`rounded-md border px-2.5 py-1 font-mono text-[11px] transition-colors disabled:opacity-40 ${
                    origin === preset
                      ? 'border-red-300 bg-red-50 text-red-700'
                      : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
            <button
              onClick={startAttack}
              disabled={phase === 'running' || !origin}
              className={`rounded-lg border px-4 py-1.5 text-xs font-semibold transition-colors ${
                phase === 'running'
                  ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                  : 'border-red-500 bg-red-500 text-white hover:bg-red-600 disabled:opacity-50'
              }`}
            >
              {phase === 'running' ? (
                <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-yellow-400" />공격 중</span>
              ) : phase === 'complete' ? '다시 공격' : '공격 실행'}
            </button>
          </div>
        </div>

        {/* 결과 비교 */}
        <div className="grid grid-cols-1 divide-y divide-slate-200 lg:grid-cols-2 lg:divide-x lg:divide-y-0">
          {/* 취약 환경 */}
          <CorsResultPanel
            label="취약 환경"
            badge="CORS_ORIGIN=*"
            note={vulnNote}
            result={vulnResult}
            phase={phase}
            expectedAccepted={true}
          />
          {/* 보안 환경 */}
          <CorsResultPanel
            label="보안 환경"
            badge="CloudFront 도메인만 허용"
            note={awsNote}
            result={awsResult}
            phase={phase}
            expectedAccepted={false}
          />
        </div>

        {phase === 'idle' && (
          <div className="border-t border-slate-200 p-4 text-center text-xs text-slate-400">
            공격할 Origin을 입력하고 공격 실행 버튼을 클릭하세요. 취약 환경은 허용, 보안 환경은 차단됩니다.
          </div>
        )}
      </section>
    </>
  );
}

function CorsResultPanel({
  label, badge, note, result, phase, expectedAccepted,
}: {
  label: string;
  badge: string;
  note: string;
  result: CorsResult | null;
  phase: AttackPhase;
  expectedAccepted: boolean;
}) {
  const isVuln = expectedAccepted;

  return (
    <div className="space-y-3 p-5">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${isVuln ? 'bg-red-500' : 'bg-emerald-500'}`} />
        <span className={`text-xs font-semibold uppercase tracking-wider ${isVuln ? 'text-red-600' : 'text-emerald-600'}`}>
          {label}
        </span>
        <span className="ml-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[10px] text-slate-500">
          {badge}
        </span>
      </div>
      <p className="text-xs leading-5 text-slate-500">{note}</p>

      {/* 결과 대형 인디케이터 */}
      {result ? (
        <div className="space-y-3">
          {result.corsAccepted ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">⚠</span>
                <span className="text-sm font-bold text-red-700">CORS 허용됨</span>
                <span className="ml-auto font-mono text-xs text-red-500">{result.latency}ms</span>
              </div>
              <p className="mt-1 text-xs text-red-600">
                브라우저가 <span className="font-mono font-semibold">{result.attackOrigin}</span>에서의 크로스 오리진 요청을 허용합니다.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">✓</span>
                <span className="text-sm font-bold text-emerald-700">CORS 차단됨</span>
                <span className="ml-auto font-mono text-xs text-emerald-600">{result.latency}ms</span>
              </div>
              <p className="mt-1 text-xs text-emerald-700">
                <span className="font-mono font-semibold">{result.attackOrigin}</span>은 허용된 Origin이 아닙니다.
              </p>
            </div>
          )}

          {/* CORS 헤더 상세 */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">응답 CORS 헤더</div>
            <CorsHeaderRow
              name="Access-Control-Allow-Origin"
              value={result.acaoHeader}
              dangerous={result.corsAccepted}
            />
            <CorsHeaderRow
              name="Access-Control-Allow-Credentials"
              value={result.acacHeader}
              dangerous={result.acacHeader === 'true' && result.corsAccepted}
            />
            <div className="mt-2 border-t border-slate-200 pt-2 text-slate-400">
              <span>HTTP {result.status === -1 ? 'N/A' : result.status}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className={`rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-xs text-slate-400 ${phase === 'running' ? 'animate-pulse' : ''}`}>
          {phase === 'running' ? '요청 중...' : '공격을 실행하면 결과가 표시됩니다.'}
        </div>
      )}
    </div>
  );
}

function CorsHeaderRow({ name, value, dangerous }: { name: string; value: string | null; dangerous: boolean }) {
  return (
    <div className="flex items-start gap-2 py-0.5">
      <span className="min-w-0 shrink-0 text-slate-500">{name}:</span>
      {value !== null ? (
        <span className={`break-all ${dangerous ? 'font-semibold text-red-600' : 'text-emerald-600'}`}>
          {value}
        </span>
      ) : (
        <span className="text-slate-300">(없음 — 차단됨)</span>
      )}
    </div>
  );
}
