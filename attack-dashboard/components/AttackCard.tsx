'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useArchitectureVisualization } from '@/hooks/useArchitectureVisualization';
import type { AttackEndpoint, AttackEvent, AttackPhase, AttackResult, SessionMetrics, WorkspaceMode } from '@/types';
import { MetricsPanel } from './MetricsPanel';
import { RequestLog } from './RequestLog';

function computeMetrics(results: AttackResult[]): SessionMetrics {
  const total = results.length;
  const blocked = results.filter((r) => r.blocked).length;
  const avgLatency = total > 0 ? Math.round(results.reduce((sum, r) => sum + r.latency, 0) / total) : 0;
  return { blocked, total, avgLatency };
}

interface CapturedCredential {
  email: string;
  password: string;
}

interface Props {
  index: number;
  title: string;
  description: string;
  endpoint: AttackEndpoint;
  totalRequests: number;
  attackParams?: string;
  vulnNote: string;
  awsNote: string;
  mode: WorkspaceMode;
}

export function AttackCard({
  index,
  title,
  description,
  endpoint,
  totalRequests,
  attackParams = '',
  vulnNote,
  awsNote,
  mode,
}: Props) {
  const { startScenario, handleAttackEvent, resetScenario } = useArchitectureVisualization();
  const [phase, setPhase] = useState<AttackPhase>('idle');
  const [vulnResults, setVulnResults] = useState<AttackResult[]>([]);
  const [awsResults, setAwsResults] = useState<AttackResult[]>([]);
  const [vulnDirectUrl, setVulnDirectUrl] = useState<string | null>(null);
  const [stolenCredential, setStolenCredential] = useState<CapturedCredential | null>(null);
  const [savedToast, setSavedToast] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const localVulnRef = useRef<AttackResult[]>([]);
  const localAwsRef = useRef<AttackResult[]>([]);

  // s3-access 시나리오: 1번에서 탈취한 계정을 localStorage에서 읽어옴
  useEffect(() => {
    if (endpoint !== 's3-access') return;
    try {
      const raw = localStorage.getItem('sentinelshare_captured_accounts');
      if (raw) {
        const accounts: CapturedCredential[] = JSON.parse(raw);
        if (accounts.length > 0) setStolenCredential(accounts[0]);
      }
    } catch {}
  }, [endpoint]);

  const startAttack = useCallback(() => {
    if (phase === 'running') return;

    const startTime = new Date().toISOString();
    startScenario(endpoint);
    setPhase('running');
    setVulnResults([]);
    setAwsResults([]);
    setVulnDirectUrl(null);
    localVulnRef.current = [];
    localAwsRef.current = [];

    const doSave = (localVuln: AttackResult[], localAws: AttackResult[]) => {
      void (async () => {
        try {
          const sessionId = crypto.randomUUID();
          await fetch('/api/analysis/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId,
              startTime,
              timestamp: new Date().toISOString(),
              mode,
              scenario: endpoint,
              scenarioTitle: title,
              vulnResults: localVuln,
              secureResults: localAws,
              stages: [],
              metrics: {
                vuln: computeMetrics(localVuln),
                secure: computeMetrics(localAws),
              },
            }),
          });
          setSavedToast(true);
          setTimeout(() => setSavedToast(false), 3000);
        } catch {}
      })();
    };

    const modeParam = `mode=${mode}`;
    let extraParams = attackParams ? `${attackParams}&${modeParam}` : modeParam;
    if (endpoint === 's3-access' && stolenCredential) {
      extraParams += `&email=${encodeURIComponent(stolenCredential.email)}&password=${encodeURIComponent(stolenCredential.password)}`;
    }
    const query = `?${extraParams}`;
    const es = new EventSource(`/api/attack/${endpoint}${query}`);
    esRef.current = es;

    es.onmessage = (eventMessage) => {
      let event: AttackEvent;
      try {
        event = JSON.parse(eventMessage.data);
      } catch {
        return;
      }

      handleAttackEvent(endpoint, event);

      if (event.type === 'result') {
        const result: AttackResult = {
          attempt: event.attempt,
          status: event.status,
          latency: event.latency,
          blocked: event.blocked,
          label: event.label,
          error: event.error,
          url: event.url,
        };

        if (event.env === 'vulnerable') {
          setVulnResults((prev) => [...prev, result]);
          localVulnRef.current.push(result);
          if (event.url) setVulnDirectUrl(event.url);
        } else {
          setAwsResults((prev) => [...prev, result]);
          localAwsRef.current.push(result);
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
  }, [attackParams, endpoint, handleAttackEvent, mode, phase, startScenario, stolenCredential, title]);

  const reset = useCallback(() => {
    esRef.current?.close();
    resetScenario();
    setPhase('idle');
    setVulnResults([]);
    setAwsResults([]);
    setVulnDirectUrl(null);
  }, [resetScenario]);

  // Server reach rate chart (for ratelimit) — 10개 요청 단위로 서버 도달률(%) 계산
  const REACH_WINDOW = 10;
  const reachRateData = useMemo(() => {
    if (endpoint !== 'ratelimit') return [];
    const maxLen = Math.max(vulnResults.length, awsResults.length);
    const windows = Math.ceil(maxLen / REACH_WINDOW);
    return Array.from({ length: windows }, (_, wi) => {
      const start = wi * REACH_WINDOW;
      const end = start + REACH_WINDOW;
      const vulnSlice = vulnResults.slice(start, end);
      const awsSlice = awsResults.slice(start, end);
      const reachRate = (slice: AttackResult[]) =>
        slice.length > 0 ? Math.round((slice.filter((r) => !r.blocked).length / slice.length) * 100) : null;
      return {
        req: end,
        '취약 (서버 도달)': reachRate(vulnSlice),
        '보안 (WAF 차단)': awsSlice.length > 0 ? Math.round((awsSlice.filter((r) => r.blocked).length / awsSlice.length) * 100) : null,
      };
    });
  }, [endpoint, vulnResults, awsResults]);

  const buttonClass =
    phase === 'idle'
      ? 'border-red-500 bg-red-500 text-white hover:bg-red-600'
      : phase === 'running'
        ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
        : 'border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200';

  const showReachChart = endpoint === 'ratelimit' && reachRateData.length > 0;

  return (
    <>
    {savedToast && (
      <div className="fixed bottom-6 right-6 z-50 rounded-xl border border-emerald-300 bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg">
        ✓ 세션이 저장되었습니다
      </div>
    )}
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_14px_36px_rgba(15,23,42,0.05)]">
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
            className={`rounded-lg border px-4 py-1.5 text-xs font-semibold transition-colors ${buttonClass}`}
          >
            {phase === 'idle' && '공격 실행'}
            {phase === 'running' && (
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-yellow-500" />
                실행 중
              </span>
            )}
            {phase === 'complete' && '다시 실행'}
            {phase === 'error' && '오류 발생'}
          </button>
        </div>
      </div>

      {/* 시나리오 1에서 탈취한 계정 연동 배너 */}
      {endpoint === 's3-access' && (
        <div className={`flex items-center gap-3 border-b px-6 py-2.5 text-xs ${stolenCredential ? 'border-red-200 bg-red-50' : 'border-slate-100 bg-slate-50'}`}>
          {stolenCredential ? (
            <>
              <span className="font-semibold text-red-700">🔗 시나리오 1 연동</span>
              <span className="text-red-600">
                브루트포스에서 탈취한 계정 사용 중:
              </span>
              <code className="rounded bg-red-100 px-1.5 py-0.5 font-mono text-red-800">
                {stolenCredential.email}
              </code>
            </>
          ) : (
            <>
              <span className="text-slate-400">시나리오 1 미실행</span>
              <span className="text-slate-400">—</span>
              <span className="text-slate-500">기본 계정(victim@demo.com)으로 실행합니다. 먼저 브루트포스를 실행하면 탈취 계정이 자동 연동됩니다.</span>
            </>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 divide-slate-200 lg:grid-cols-2 lg:divide-x">
        <div className="space-y-3 p-4">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-red-500" />
            <span className="text-xs font-semibold uppercase tracking-wider text-red-600">
              취약 환경
            </span>
            <span className="ml-1 font-mono text-xs text-slate-400">No Protection</span>
          </div>
          <p className="min-h-[44px] text-xs leading-5 text-slate-500">{vulnNote}</p>

          {/* S3 직접 접근 URL 배너 */}
          {endpoint === 's3-access' && vulnDirectUrl && (
            <a
              href={vulnDirectUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100"
            >
              <span>⚠</span>
              <span>직접 접근 가능 — 클릭하여 파일 확인</span>
              <span className="ml-auto font-normal text-red-400 underline">열기 →</span>
            </a>
          )}

          <RequestLog results={vulnResults} env="vulnerable" />
          <MetricsPanel
            results={vulnResults}
            phase={phase}
            env="vulnerable"
            totalPlanned={totalRequests}
          />
        </div>

        <div className="space-y-3 border-t border-slate-200 p-4 lg:border-t-0">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600">
              보안 환경
            </span>
            <span className="ml-1 font-mono text-xs text-slate-400">WAF + CloudFront</span>
          </div>
          <p className="min-h-[44px] text-xs leading-5 text-slate-500">{awsNote}</p>
          <RequestLog results={awsResults} env="aws" />
          <MetricsPanel
            results={awsResults}
            phase={phase}
            env="aws"
            totalPlanned={totalRequests}
          />
        </div>
      </div>

      {/* Server reach rate chart for ratelimit */}
      {showReachChart && (
        <div className="border-t border-slate-200 p-4">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
            서버 도달률 vs WAF 차단율 (10개 요청 단위, %)
          </div>
          <p className="mb-3 text-xs text-slate-400">
            취약 환경은 요청이 그대로 서버에 도달, 보안 환경은 WAF가 엣지에서 차단합니다.
          </p>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={reachRateData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="vulnGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="secureGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="req"
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                tickLine={false}
                label={{ value: '요청 번호', position: 'insideBottom', offset: -2, fontSize: 10, fill: '#94a3b8' }}
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                tickLine={false}
                unit="%"
                domain={[0, 100]}
              />
              <Tooltip
                contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
                formatter={(value) => [`${value}%`]}
              />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
              <Area
                type="monotone"
                dataKey="취약 (서버 도달)"
                stroke="#ef4444"
                strokeWidth={1.5}
                fill="url(#vulnGrad)"
                dot={false}
                isAnimationActive={false}
                connectNulls={false}
              />
              <Area
                type="monotone"
                dataKey="보안 (WAF 차단)"
                stroke="#10b981"
                strokeWidth={1.5}
                fill="url(#secureGrad)"
                dot={false}
                isAnimationActive={false}
                connectNulls={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
    </>
  );
}
