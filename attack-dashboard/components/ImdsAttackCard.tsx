'use client';

import { useCallback, useRef, useState } from 'react';
import { useArchitectureVisualization } from '@/hooks/useArchitectureVisualization';
import type { AttackEvent, AttackPhase, AttackResult, SessionMetrics, WorkspaceMode } from '@/types';
import { MetricsPanel } from './MetricsPanel';
import { RequestLog } from './RequestLog';

function computeMetrics(results: AttackResult[]): SessionMetrics {
  const total = results.length;
  const blocked = results.filter((r) => r.blocked).length;
  const avgLatency =
    total > 0 ? Math.round(results.reduce((sum, r) => sum + r.latency, 0) / total) : 0;
  return { blocked, total, avgLatency };
}

type StepStatus = 'pending' | 'running' | 'success' | 'failed';

interface ImdsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  token: string;
  expiration: string;
}

interface StepState {
  status: StepStatus;
  detail?: string;
  credentials?: ImdsCredentials;
}

const STEP_META = [
  {
    icon: '🔍',
    label: '1단계: SSRF → IMDS 역할명 조회',
    desc: 'POST /api/debug/fetch-url → 백엔드가 http://169.254.169.254/.../iam/security-credentials/ 내부 조회',
  },
  {
    icon: '🔑',
    label: '2단계: IAM 자격증명 탈취',
    desc: '백엔드가 /iam/security-credentials/{role} 조회 → AccessKeyId, SecretAccessKey, Token 반환',
  },
];

const EMPTY_STEPS: StepState[] = [{ status: 'pending' }, { status: 'pending' }];

interface Props {
  index: number;
  title: string;
  description: string;
  vulnNote: string;
  awsNote: string;
  mode: WorkspaceMode;
}

export function ImdsAttackCard({ index, title, description, vulnNote, awsNote, mode }: Props) {
  const { startScenario, handleAttackEvent, resetScenario } = useArchitectureVisualization();
  const [phase, setPhase] = useState<AttackPhase>('idle');
  const [steps, setSteps] = useState<StepState[]>(EMPTY_STEPS);
  const [vulnResults, setVulnResults] = useState<AttackResult[]>([]);
  const [awsResults, setAwsResults] = useState<AttackResult[]>([]);
  const [savedToast, setSavedToast] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const localVulnRef = useRef<AttackResult[]>([]);
  const localAwsRef = useRef<AttackResult[]>([]);

  const updateStep = useCallback((stepIndex: number, update: Partial<StepState>) => {
    setSteps((prev) => {
      const next = [...prev];
      next[stepIndex] = { ...next[stepIndex], ...update };
      return next;
    });
  }, []);

  const startAttack = useCallback(() => {
    if (phase === 'running') return;

    const startTime = new Date().toISOString();
    startScenario('imds-ssrf');
    setPhase('running');
    setVulnResults([]);
    setAwsResults([]);
    localVulnRef.current = [];
    localAwsRef.current = [];
    setSteps(EMPTY_STEPS);

    const doSave = (localVuln: AttackResult[], localAws: AttackResult[]) => {
      void (async () => {
        try {
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
              scenario: 'imds-ssrf',
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

    const es = new EventSource(`/api/attack/imds-ssrf?mode=${mode}`);
    esRef.current = es;

    es.onmessage = (msg) => {
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(msg.data as string);
      } catch {
        return;
      }

      handleAttackEvent('imds-ssrf', event as unknown as AttackEvent);

      if (event.type === 'chain_step') {
        const stepIdx = (event.step as number) - 1;
        updateStep(stepIdx, {
          status: event.status as StepStatus,
          detail: (event.detail as string) || undefined,
          credentials: (event.credentials as ImdsCredentials) || undefined,
        });
      } else if (event.type === 'result') {
        const result: AttackResult = {
          attempt: event.attempt as number,
          status: event.status as number,
          latency: event.latency as number,
          blocked: event.blocked as boolean,
          label: event.label as string | undefined,
        };
        if (event.env === 'vulnerable') {
          setVulnResults((prev) => [...prev, result]);
          localVulnRef.current.push(result);
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
  }, [handleAttackEvent, mode, phase, startScenario, title, updateStep]);

  const reset = useCallback(() => {
    esRef.current?.close();
    resetScenario();
    setPhase('idle');
    setVulnResults([]);
    setAwsResults([]);
    setSteps(EMPTY_STEPS);
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
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-yellow-500" />
                  실행 중
                </span>
              )}
              {phase === 'complete' && '다시 실행'}
              {phase === 'error' && '오류 발생'}
            </button>
          </div>
        </div>

        {/* WAF 미탐지 경고 배너 */}
        <div className="border-b border-amber-200 bg-amber-50 px-6 py-3">
          <p className="text-xs font-semibold text-amber-800">
            WAF는 이 공격을 차단하지 못합니다
          </p>
          <p className="mt-0.5 text-xs text-amber-700">
            SSRF 요청은 정상 POST와 구별이 불가능합니다. 방어는 EC2 메타데이터 서비스 설정(IMDSv2)에서만 이루어집니다.
          </p>
        </div>

        {/* 2-step attack chain (취약 환경) */}
        <div className="border-b border-slate-200 px-6 py-5">
          <div className="mb-4 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-red-500" />
            <span className="text-xs font-semibold uppercase tracking-wider text-red-600">
              취약 환경 — 공격 체인
            </span>
            <span className="ml-1 font-mono text-xs text-slate-400">IMDSv1 (http_tokens=optional)</span>
          </div>

          <div>
            {STEP_META.map((meta, i) => {
              const step = steps[i];
              const isLast = i === STEP_META.length - 1;

              const circleClass =
                step.status === 'success'
                  ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                  : step.status === 'failed'
                    ? 'border-red-400 bg-red-50 text-red-700'
                    : step.status === 'running'
                      ? 'border-yellow-400 bg-yellow-50 text-yellow-700'
                      : 'border-slate-200 bg-slate-50 text-slate-400';

              const labelClass =
                step.status === 'success'
                  ? 'text-emerald-700'
                  : step.status === 'failed'
                    ? 'text-red-700'
                    : step.status === 'running'
                      ? 'text-yellow-700'
                      : 'text-slate-400';

              const lineClass =
                step.status === 'success'
                  ? 'bg-emerald-200'
                  : step.status === 'failed'
                    ? 'bg-red-200'
                    : 'bg-slate-200';

              return (
                <div key={i} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div
                      className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border-2 text-sm transition-all ${circleClass}`}
                    >
                      {step.status === 'success'
                        ? '✓'
                        : step.status === 'failed'
                          ? '✗'
                          : step.status === 'running'
                            ? <span className="h-2 w-2 animate-pulse rounded-full bg-yellow-400" />
                            : meta.icon}
                    </div>
                    {!isLast && <div className={`mt-0.5 h-8 w-0.5 ${lineClass}`} />}
                  </div>

                  <div className={`min-w-0 ${isLast ? 'pb-0' : 'pb-6'}`}>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-semibold ${labelClass}`}>{meta.label}</span>
                      {step.status === 'running' && (
                        <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-medium text-yellow-700">
                          실행 중...
                        </span>
                      )}
                      {step.status === 'success' && (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                          성공
                        </span>
                      )}
                      {step.status === 'failed' && (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">
                          실패
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-400">{meta.desc}</p>
                    {step.detail && (
                      <p className="mt-1 font-mono text-xs text-slate-600">{step.detail}</p>
                    )}

                    {/* 2단계 성공: 자격증명 노출 박스 */}
                    {i === 1 && step.status === 'success' && step.credentials && (
                      <div className="mt-3 rounded-lg border border-red-300 bg-red-50 p-3">
                        <div className="mb-2 flex items-center gap-2">
                          <span className="text-xs font-bold text-red-700">⚠ IAM 자격증명 노출</span>
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-600">
                            AWS 계정 권한 탈취
                          </span>
                        </div>
                        <div className="space-y-1 font-mono text-[11px]">
                          <div className="flex gap-2">
                            <span className="w-28 flex-shrink-0 text-slate-500">AccessKeyId</span>
                            <span className="text-red-700">{step.credentials.accessKeyId}</span>
                          </div>
                          <div className="flex gap-2">
                            <span className="w-28 flex-shrink-0 text-slate-500">SecretAccessKey</span>
                            <span className="text-red-700">{step.credentials.secretAccessKey}</span>
                          </div>
                          <div className="flex gap-2">
                            <span className="w-28 flex-shrink-0 text-slate-500">Token</span>
                            <span className="truncate text-red-700">{step.credentials.token}</span>
                          </div>
                          {step.credentials.expiration && (
                            <div className="flex gap-2">
                              <span className="w-28 flex-shrink-0 text-slate-500">Expiration</span>
                              <span className="text-slate-600">{step.credentials.expiration}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Metrics comparison */}
        <div className="grid grid-cols-1 divide-slate-200 lg:grid-cols-2 lg:divide-x">
          <div className="space-y-3 p-4">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              <span className="text-xs font-semibold uppercase tracking-wider text-red-600">
                취약 환경
              </span>
              <span className="ml-1 font-mono text-xs text-slate-400">IMDSv1</span>
            </div>
            <p className="min-h-[44px] text-xs leading-5 text-slate-500">{vulnNote}</p>
            <RequestLog results={vulnResults} env="vulnerable" />
            <MetricsPanel results={vulnResults} phase={phase} env="vulnerable" totalPlanned={2} />
          </div>
          <div className="space-y-3 border-t border-slate-200 p-4 lg:border-t-0">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600">
                보안 환경
              </span>
              <span className="ml-1 font-mono text-xs text-slate-400">IMDSv2</span>
            </div>
            <p className="min-h-[44px] text-xs leading-5 text-slate-500">{awsNote}</p>
            <RequestLog results={awsResults} env="aws" />
            <MetricsPanel results={awsResults} phase={phase} env="aws" totalPlanned={2} />
          </div>
        </div>

        {phase === 'idle' && (
          <div className="border-t border-slate-200 p-4 text-center text-xs text-slate-400">
            공격 실행 버튼을 클릭하면 SSRF로 백엔드를 경유해 IMDS에서 IAM 자격증명 탈취를 시도합니다.
          </div>
        )}
      </section>
    </>
  );
}
