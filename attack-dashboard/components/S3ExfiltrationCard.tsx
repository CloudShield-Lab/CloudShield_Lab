'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AttackPhase, AttackResult, SessionMetrics, WorkspaceMode } from '@/types';
import { MetricsPanel } from './MetricsPanel';
import { RequestLog } from './RequestLog';

function computeMetrics(results: AttackResult[]): SessionMetrics {
  const total = results.length;
  const blocked = results.filter((r) => r.blocked).length;
  const avgLatency = total > 0 ? Math.round(results.reduce((sum, r) => sum + r.latency, 0) / total) : 0;
  return { blocked, total, avgLatency };
}

type StepStatus = 'pending' | 'running' | 'success' | 'failed';

interface DirectFile {
  fileName: string;
  directUrl: string;
}

interface StepState {
  status: StepStatus;
  detail?: string;
  directFiles?: DirectFile[];
}

const STEP_META = [
  { icon: '🔐', label: '1단계: 로그인', desc: '탈취한 자격증명으로 취약 서버에 로그인 → JWT 획득' },
  { icon: '📁', label: '2단계: 파일 목록 조회', desc: 'Bearer JWT로 /api/files 접근 → 업로드된 파일 확인' },
  { icon: '🔗', label: '3단계: Presigned URL 획득', desc: '/api/files/:id/download → S3 서명 다운로드 URL 발급' },
  { icon: '🚨', label: '4단계: 서명 제거 후 직접 접근', desc: 'URL에서 ?X-Amz-* 파라미터 제거 → S3 퍼블릭 버킷 여부 확인' },
];

const EMPTY_STEPS: StepState[] = [
  { status: 'pending' },
  { status: 'pending' },
  { status: 'pending' },
  { status: 'pending' },
];

interface Props {
  index: number;
  title: string;
  description: string;
  vulnNote: string;
  awsNote: string;
  mode: WorkspaceMode;
}

export function S3ExfiltrationCard({ index, title, description, vulnNote, awsNote, mode }: Props) {
  const [phase, setPhase] = useState<AttackPhase>('idle');
  const [email, setEmail] = useState('victim@demo.com');
  const [password, setPassword] = useState('Demo1234!');
  const [linkedFromScenario1, setLinkedFromScenario1] = useState(false);
  const [steps, setSteps] = useState<StepState[]>(EMPTY_STEPS);
  const [vulnResults, setVulnResults] = useState<AttackResult[]>([]);
  const [awsResults, setAwsResults] = useState<AttackResult[]>([]);
  const [savedToast, setSavedToast] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const localVulnRef = useRef<AttackResult[]>([]);
  const localAwsRef = useRef<AttackResult[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('sentinelshare_captured_accounts');
      if (raw) {
        const accounts = JSON.parse(raw) as { email: string; password: string }[];
        if (accounts.length > 0) {
          setEmail(accounts[0].email);
          setPassword(accounts[0].password);
          setLinkedFromScenario1(true);
        }
      }
    } catch {}
  }, []);

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
    setPhase('running');
    setVulnResults([]);
    setAwsResults([]);
    localVulnRef.current = [];
    localAwsRef.current = [];
    setSteps(EMPTY_STEPS);

    const doSave = (localVuln: AttackResult[], localAws: AttackResult[]) => {
      void (async () => {
        try {
          const sessionId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
          await fetch('/api/analysis/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId,
              startTime,
              timestamp: new Date().toISOString(),
              mode,
              scenario: 's3-access',
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

    const query = `?mode=${mode}&email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`;
    const es = new EventSource(`/api/attack/s3-access${query}`);
    esRef.current = es;

    es.onmessage = (msg) => {
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(msg.data as string);
      } catch {
        return;
      }

      if (event.type === 'chain_step') {
        const stepIdx = (event.step as number) - 1;
        updateStep(stepIdx, {
          status: event.status as StepStatus,
          detail: (event.detail as string) || undefined,
          directFiles: (event.directFiles as DirectFile[]) || undefined,
        });
      } else if (event.type === 'result') {
        const result: AttackResult = {
          attempt: event.attempt as number,
          status: event.status as number,
          latency: event.latency as number,
          blocked: event.blocked as boolean,
          label: event.label as string | undefined,
          error: event.error as string | undefined,
          url: event.url as string | undefined,
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
  }, [email, mode, password, phase, title, updateStep]);

  const reset = useCallback(() => {
    esRef.current?.close();
    setPhase('idle');
    setVulnResults([]);
    setAwsResults([]);
    setSteps(EMPTY_STEPS);
  }, []);

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
                  <span className="h-1.5 w-1.5 rounded-full bg-yellow-500" />
                  실행 중
                </span>
              )}
              {phase === 'complete' && '다시 실행'}
              {phase === 'error' && '오류 발생'}
            </button>
          </div>
        </div>

        {/* Credential input */}
        <div
          className={`flex flex-wrap items-center gap-3 border-b px-6 py-3 ${linkedFromScenario1 ? 'border-red-200 bg-red-50' : 'border-slate-100 bg-slate-50'}`}
        >
          {linkedFromScenario1 && (
            <span className="flex-shrink-0 rounded-full border border-red-300 bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">
              🔗 시나리오 1 연동
            </span>
          )}
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-500">이메일</label>
            <input
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={phase === 'running'}
              className="rounded border border-slate-200 bg-white px-2 py-1 font-mono text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-300 disabled:opacity-60"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-500">비밀번호</label>
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={phase === 'running'}
              className="rounded border border-slate-200 bg-white px-2 py-1 font-mono text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-300 disabled:opacity-60"
            />
          </div>
        </div>

        {/* 4-step attack chain */}
        <div className="border-b border-slate-200 px-6 py-5">
          <div className="mb-4 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-red-500" />
            <span className="text-xs font-semibold uppercase tracking-wider text-red-600">취약 환경 — 공격 체인</span>
            <span className="ml-1 font-mono text-xs text-slate-400">No Protection</span>
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
                  {/* Timeline */}
                  <div className="flex flex-col items-center">
                    <div
                      className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border-2 text-sm transition-all ${circleClass}`}
                    >
                      {step.status === 'success'
                        ? '✓'
                        : step.status === 'failed'
                          ? '✗'
                          : step.status === 'running'
                            ? <span className="h-2 w-2 rounded-full bg-yellow-400 animate-pulse" />
                            : meta.icon}
                    </div>
                    {!isLast && <div className={`mt-0.5 h-8 w-0.5 ${lineClass}`} />}
                  </div>

                  {/* Content */}
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

                    {/* Step 4 success: danger banners (one per file) */}
                    {i === 3 && step.status === 'success' && step.directFiles && step.directFiles.length > 0 && (
                      <div className="mt-2 space-y-1.5">
                        {step.directFiles.map((file, fi) => (
                          <a
                            key={fi}
                            href={file.directUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100"
                          >
                            <span>⚠</span>
                            <span className="min-w-0 truncate">{file.fileName}</span>
                            <span className="ml-auto flex-shrink-0 font-normal text-red-400 underline">열기 →</span>
                          </a>
                        ))}
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
              <span className="text-xs font-semibold uppercase tracking-wider text-red-600">취약 환경</span>
              <span className="ml-1 font-mono text-xs text-slate-400">No Protection</span>
            </div>
            <p className="min-h-[44px] text-xs leading-5 text-slate-500">{vulnNote}</p>
            <RequestLog results={vulnResults} env="vulnerable" />
            <MetricsPanel results={vulnResults} phase={phase} env="vulnerable" totalPlanned={4} />
          </div>
          <div className="space-y-3 border-t border-slate-200 p-4 lg:border-t-0">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600">보안 환경</span>
              <span className="ml-1 font-mono text-xs text-slate-400">WAF + CloudFront</span>
            </div>
            <p className="min-h-[44px] text-xs leading-5 text-slate-500">{awsNote}</p>
            <RequestLog results={awsResults} env="aws" />
            <MetricsPanel results={awsResults} phase={phase} env="aws" totalPlanned={4} />
          </div>
        </div>

        {phase === 'idle' && (
          <div className="border-t border-slate-200 p-4 text-center text-xs text-slate-400">
            공격 실행 버튼을 클릭하면 자격증명으로 취약 서버에 로그인하고 단계별로 데이터를 탈취합니다.
          </div>
        )}
      </section>
    </>
  );
}
