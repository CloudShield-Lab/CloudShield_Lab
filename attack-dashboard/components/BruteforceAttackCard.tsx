'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useArchitectureVisualization } from '@/hooks/useArchitectureVisualization';
import { DEFAULT_CREDENTIALS, type Credential } from '@/lib/default-credentials';
import type { AttackEvent, AttackPhase, AttackResult, SessionMetrics, WorkspaceMode } from '@/types';
import { CredentialEditor } from './CredentialEditor';
import { MetricsPanel } from './MetricsPanel';
import { RequestLog } from './RequestLog';

function computeMetrics(results: AttackResult[]): SessionMetrics {
  const total = results.length;
  const blocked = results.filter((r) => r.blocked).length;
  const avgLatency = total > 0 ? Math.round(results.reduce((sum, r) => sum + r.latency, 0) / total) : 0;
  return { blocked, total, avgLatency };
}

interface Props {
  index: number;
  title: string;
  description: string;
  totalRequests: number;
  vulnNote: string;
  awsNote: string;
  mode: WorkspaceMode;
}

export function BruteforceAttackCard({
  index,
  title,
  description,
  totalRequests,
  vulnNote,
  awsNote,
  mode,
}: Props) {
  const { startScenario, handleAttackEvent, resetScenario } = useArchitectureVisualization();
  const [phase, setPhase] = useState<AttackPhase>('idle');
  const [vulnResults, setVulnResults] = useState<AttackResult[]>([]);
  const [awsResults, setAwsResults] = useState<AttackResult[]>([]);
  const [credentials, setCredentials] = useState<Credential[]>(DEFAULT_CREDENTIALS);
  const [capturedAccounts, setCapturedAccounts] = useState<Credential[]>([]);
  const [vulnFrontendUrl, setVulnFrontendUrl] = useState('');
  const [savedToast, setSavedToast] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((data) => {
        const url =
          mode === 'auto'
            ? data?.autoVulnerable?.frontendUrl
            : data?.vulnerable?.frontendUrl;
        if (url) setVulnFrontendUrl(url);
      })
      .catch(() => {});
  }, [mode]);

  const startAttack = useCallback(async () => {
    if (phase === 'running') return;

    const startTime = new Date().toISOString();
    startScenario('bruteforce');
    setPhase('running');
    setVulnResults([]);
    setAwsResults([]);
    setCapturedAccounts([]);

    const controller = new AbortController();
    abortRef.current = controller;

    const localVulnResults: AttackResult[] = [];
    const localAwsResults: AttackResult[] = [];

    const doSave = () => {
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
              scenario: 'bruteforce',
              scenarioTitle: title,
              vulnResults: localVulnResults,
              secureResults: localAwsResults,
              stages: [],
              metrics: {
                vuln: computeMetrics(localVulnResults),
                secure: computeMetrics(localAwsResults),
              },
            }),
          });
          setSavedToast(true);
          setTimeout(() => setSavedToast(false), 3000);
        } catch {}
      })();
    };

    try {
      const response = await fetch('/api/attack/bruteforce', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credentials, mode }),
        signal: controller.signal,
      });

      if (!response.body) {
        setPhase('error');
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith('data:')) continue;
          const jsonStr = line.slice(5).trim();
          let event: AttackEvent & { email?: string; password?: string };
          try {
            event = JSON.parse(jsonStr);
          } catch {
            continue;
          }

          handleAttackEvent('bruteforce', event);

          if (event.type === 'result') {
            const result: AttackResult = {
              attempt: event.attempt,
              status: event.status,
              latency: event.latency,
              blocked: event.blocked,
              label: event.label,
              error: event.error,
            };

            if (event.env === 'vulnerable') {
              setVulnResults((prev) => [...prev, result]);
              localVulnResults.push(result);
              if (event.status === 200 && event.email && event.password) {
                setCapturedAccounts((prev) => {
                  const next = [...prev, { email: event.email!, password: event.password! }];
                  try {
                    localStorage.setItem('sentinelshare_captured_accounts', JSON.stringify(next));
                  } catch {}
                  return next;
                });
              }
            } else {
              setAwsResults((prev) => [...prev, result]);
              localAwsResults.push(result);
            }
          } else if (event.type === 'complete') {
            setPhase('complete');
            doSave();
            return;
          } else if (event.type === 'error') {
            setPhase('error');
            return;
          }
        }
      }

      setPhase('complete');
      doSave();
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') return;
      setPhase('error');
    }
  }, [credentials, handleAttackEvent, mode, phase, startScenario, title]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    resetScenario();
    setPhase('idle');
    setVulnResults([]);
    setAwsResults([]);
    setCapturedAccounts([]);
    setCredentials(DEFAULT_CREDENTIALS);
    try { localStorage.removeItem('sentinelshare_captured_accounts'); } catch {}
  }, [resetScenario]);

  const buttonClass =
    phase === 'idle'
      ? 'border-red-500 bg-red-500 text-white hover:bg-red-600'
      : phase === 'running'
        ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
        : 'border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200';

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

      {/* 크리덴셜 편집기 */}
      <div className="border-b border-slate-200 px-6 py-3">
        <CredentialEditor
          credentials={credentials}
          onChange={setCredentials}
          disabled={phase === 'running'}
        />
      </div>

      {/* 계정 탈취 배너 */}
      {capturedAccounts.length > 0 && (
        <div className="mx-6 mt-4 rounded-xl border border-red-300 bg-red-50 p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-red-900">
              ⚠️ 계정 탈취 성공 ({capturedAccounts.length}건)
            </p>
            {vulnFrontendUrl && (
              <a
                href={`${vulnFrontendUrl}/login`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-shrink-0 rounded-lg border border-red-400 bg-red-100 px-3 py-1.5 text-xs font-semibold text-red-800 transition-colors hover:bg-red-200"
              >
                취약 서버 접속하러 가보기 →
              </a>
            )}
          </div>
          <div className="space-y-1">
            {capturedAccounts.map((acc, i) => (
              <p key={i} className="font-mono text-xs text-red-700">
                #{i + 1}&nbsp;&nbsp;ID: {acc.email}&nbsp;&nbsp;/&nbsp;&nbsp;PW: {acc.password}
              </p>
            ))}
          </div>
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
          <p className="text-xs text-slate-500">{vulnNote}</p>
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
          <p className="text-xs text-slate-500">{awsNote}</p>
          <RequestLog results={awsResults} env="aws" />
          <MetricsPanel
            results={awsResults}
            phase={phase}
            env="aws"
            totalPlanned={totalRequests}
          />
        </div>
      </div>
    </section>
    </>
  );
}
