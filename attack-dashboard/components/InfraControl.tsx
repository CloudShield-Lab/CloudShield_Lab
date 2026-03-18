'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { TerraformOutputs } from '@/lib/terraform-state';

type Action = 'apply' | 'destroy';
type Phase = 'idle' | 'running' | 'complete' | 'error';

interface LogEntry {
  type: string;
  message: string;
  status?: string;
  conclusion?: string | null;
  html_url?: string;
  success?: boolean;
}

interface EnvState {
  phase: Phase;
  action: Action;
  logs: LogEntry[];
  resultUrl: string | null;
  vpcReady: boolean;
}

const initialEnvState = (): EnvState => ({
  phase: 'idle',
  action: 'apply',
  logs: [],
  resultUrl: null,
  vpcReady: false,
});

export function InfraControl() {
  const [vulnerable, setVulnerable] = useState<EnvState>(initialEnvState());
  const [secure, setSecure] = useState<EnvState>(initialEnvState());
  const [tfOutputs, setTfOutputs] = useState<TerraformOutputs | null>(null);
  const [loadingOutputs, setLoadingOutputs] = useState(false);

  const vulnEsRef = useRef<EventSource | null>(null);
  const secureEsRef = useRef<EventSource | null>(null);
  const vulnLogsEndRef = useRef<HTMLDivElement>(null);
  const secureLogsEndRef = useRef<HTMLDivElement>(null);

  const setEnvState = useCallback(
    (env: 'vulnerable' | 'secure', updater: (prev: EnvState) => EnvState) => {
      if (env === 'vulnerable') setVulnerable(updater);
      else setSecure(updater);
    },
    []
  );

  const appendLog = useCallback(
    (env: 'vulnerable' | 'secure', entry: LogEntry) => {
      setEnvState(env, (prev) => ({ ...prev, logs: [...prev.logs, entry] }));
      setTimeout(() => {
        if (env === 'vulnerable') vulnLogsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        else secureLogsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 50);
    },
    [setEnvState]
  );

  const startDeploy = useCallback(
    (env: 'vulnerable' | 'secure') => {
      const state = env === 'vulnerable' ? vulnerable : secure;
      if (state.phase !== 'idle') return;

      const { action } = state;
      const esRef = env === 'vulnerable' ? vulnEsRef : secureEsRef;

      setEnvState(env, (prev) => ({
        ...prev,
        phase: 'running',
        logs: [],
        resultUrl: null,
        vpcReady: false,
      }));

      const es = new EventSource(`/api/infra/deploy?env=${env}&action=${action}`);
      esRef.current = es;

      es.onmessage = (e) => {
        let event: LogEntry;
        try {
          event = JSON.parse(e.data);
        } catch {
          return;
        }

        if (event.type === 'vpc_ready') {
          setEnvState(env, (prev) => ({ ...prev, vpcReady: true }));
        }

        appendLog(env, event);

        if (event.type === 'complete' || event.type === 'timeout') {
          const success = event.type === 'complete' && event.success;
          setEnvState(env, (prev) => ({
            ...prev,
            phase: success ? 'complete' : 'error',
            resultUrl: event.html_url ?? prev.resultUrl,
          }));
          es.close();
        } else if (event.type === 'error') {
          setEnvState(env, (prev) => ({ ...prev, phase: 'error' }));
          es.close();
        }
      };

      es.onerror = () => {
        setEnvState(env, (prev) => ({ ...prev, phase: 'error' }));
        es.close();
      };
    },
    [appendLog, secure, setEnvState, vulnerable]
  );

  const reset = useCallback(
    (env: 'vulnerable' | 'secure') => {
      const esRef = env === 'vulnerable' ? vulnEsRef : secureEsRef;
      esRef.current?.close();
      setEnvState(env, () => initialEnvState());
    },
    [setEnvState]
  );

  const setAction = useCallback(
    (env: 'vulnerable' | 'secure', action: Action) => {
      setEnvState(env, (prev) => (prev.phase === 'idle' ? { ...prev, action } : prev));
    },
    [setEnvState]
  );

  // 어느 한 환경이라도 완료되면 tfstate 재조회
  useEffect(() => {
    if (vulnerable.phase !== 'complete') return;
    setLoadingOutputs(true);
    fetch('/api/terraform-outputs', { method: 'POST' })
      .then((r) => r.json())
      .then((data: TerraformOutputs) => setTfOutputs(data))
      .catch(() => {})
      .finally(() => setLoadingOutputs(false));
  }, [vulnerable.phase]);

  useEffect(() => {
    if (secure.phase !== 'complete') return;
    setLoadingOutputs(true);
    fetch('/api/terraform-outputs', { method: 'POST' })
      .then((r) => r.json())
      .then((data: TerraformOutputs) => setTfOutputs(data))
      .catch(() => {})
      .finally(() => setLoadingOutputs(false));
  }, [secure.phase]);

  // 마운트 시 기존 tfstate 확인
  useEffect(() => {
    fetch('/api/terraform-outputs')
      .then((r) => r.json())
      .then((data: TerraformOutputs) => {
        if (data.vulnerable || data.secure) setTfOutputs(data);
      })
      .catch(() => {});
  }, []);

  const vulnApplyLocked =
    secure.phase === 'running' && secure.action === 'apply' && !secure.vpcReady;
  const secureApplyLocked =
    vulnerable.phase === 'running' && vulnerable.action === 'apply' && !vulnerable.vpcReady;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_14px_36px_rgba(15,23,42,0.05)]">
      <div className="flex items-center gap-3 border-b border-slate-200 px-6 py-4">
        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-xs font-mono text-slate-500">
          IaC
        </span>
        <div>
          <h2 className="font-semibold tracking-wide text-slate-900">인프라 자동 배포/삭제</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Terraform으로 취약 환경과 보안 환경을 자동 배포하거나 삭제합니다.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 divide-y divide-slate-200 md:grid-cols-2 md:divide-x md:divide-y-0">
        <EnvPanel
          label="취약 환경"
          env="vulnerable"
          state={vulnerable}
          onStart={() => startDeploy('vulnerable')}
          onReset={() => reset('vulnerable')}
          onSetAction={(a) => setAction('vulnerable', a)}
          logsEndRef={vulnLogsEndRef}
          accentColor="red"
          applyLocked={vulnApplyLocked}
        />
        <EnvPanel
          label="보안 환경"
          env="secure"
          state={secure}
          onStart={() => startDeploy('secure')}
          onReset={() => reset('secure')}
          onSetAction={(a) => setAction('secure', a)}
          logsEndRef={secureLogsEndRef}
          accentColor="emerald"
          applyLocked={secureApplyLocked}
        />
      </div>

      {/* Terraform 출력값 배너 */}
      {(tfOutputs?.vulnerable || tfOutputs?.secure) && (
        <div className="border-t border-slate-200 px-6 py-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              배포된 인프라 주소
            </span>
            {loadingOutputs && (
              <span className="text-xs text-slate-400">불러오는 중...</span>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {tfOutputs.vulnerable && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs">
                <div className="mb-2 font-semibold text-red-700">취약 환경</div>
                <OutputRow label="Backend API" value={tfOutputs.vulnerable.backendUrl} />
                <OutputRow label="Frontend" value={tfOutputs.vulnerable.frontendUrl} />
                <OutputRow label="S3 Bucket" value={tfOutputs.vulnerable.filesBucket} />
              </div>
            )}
            {tfOutputs.secure && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs">
                <div className="mb-2 font-semibold text-emerald-700">보안 환경</div>
                <OutputRow label="Backend API" value={tfOutputs.secure.backendUrl} />
                <OutputRow label="Frontend" value={tfOutputs.secure.frontendUrl} />
                <OutputRow label="S3 Bucket" value={tfOutputs.secure.filesBucket} />
              </div>
            )}
          </div>
          <p className="mt-3 text-xs text-slate-400">
            위 값이{' '}
            <Link href="/auto/attack/bruteforce" className="underline hover:text-slate-600">
              자동 배포 Attack Simulator
            </Link>
            에 자동으로 적용됩니다.
          </p>
        </div>
      )}
    </div>
  );
}

function OutputRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2 py-0.5">
      <span className="w-20 flex-shrink-0 text-slate-500">{label}</span>
      <span className="break-all font-mono text-slate-700">{value}</span>
    </div>
  );
}

interface EnvPanelProps {
  label: string;
  env: 'vulnerable' | 'secure';
  state: EnvState;
  onStart: () => void;
  onReset: () => void;
  onSetAction: (a: Action) => void;
  logsEndRef: React.RefObject<HTMLDivElement>;
  accentColor: 'red' | 'emerald';
  applyLocked: boolean;
}

function EnvPanel({
  label,
  state,
  onStart,
  onReset,
  onSetAction,
  logsEndRef,
  accentColor,
  applyLocked,
}: EnvPanelProps) {
  const { phase, action, logs, resultUrl } = state;
  const isRed = accentColor === 'red';

  const headerBg = isRed
    ? 'bg-red-50 border-b border-red-100'
    : 'bg-emerald-50 border-b border-emerald-100';
  const headerText = isRed ? 'text-red-700' : 'text-emerald-700';
  const dot = isRed ? 'bg-red-500' : 'bg-emerald-500';

  const phaseColor =
    phase === 'complete'
      ? 'text-emerald-700'
      : phase === 'error'
        ? 'text-red-700'
        : phase === 'running'
          ? 'text-amber-700'
          : 'text-slate-500';

  const phaseLabel =
    phase === 'idle'
      ? '대기'
      : phase === 'running'
        ? '실행 중'
        : phase === 'complete'
          ? '완료'
          : '오류';

  const isApplyDisabled = phase !== 'idle' || (action === 'apply' && applyLocked);

  return (
    <div className="flex flex-col">
      <div className={`flex items-center justify-between px-5 py-3 ${headerBg}`}>
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${dot}`} />
          <span className={`text-sm font-semibold ${headerText}`}>{label}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-mono ${phaseColor}`}>{phaseLabel}</span>
          {phase !== 'idle' && (
            <button
              onClick={onReset}
              className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900"
            >
              초기화
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 space-y-4 p-5">
        <div className="space-y-1.5">
          <label className="text-xs font-medium uppercase tracking-wider text-slate-500">Action</label>
          <div className="flex gap-2">
            {(['apply', 'destroy'] as Action[]).map((a) => (
              <button
                key={a}
                onClick={() => onSetAction(a)}
                disabled={phase !== 'idle'}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  action === a
                    ? a === 'apply'
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                      : 'border-red-300 bg-red-50 text-red-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                } ${phase !== 'idle' ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
              >
                {a === 'apply' ? 'Apply' : 'Destroy'}
              </button>
            ))}
          </div>
        </div>

        {action === 'apply' && applyLocked && phase === 'idle' && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
            <span className="mt-0.5 flex-shrink-0">!</span>
            <span>다른 환경의 VPC 생성이 끝나면 이 환경의 배포 버튼이 활성화됩니다.</span>
          </div>
        )}

        <button
          onClick={onStart}
          disabled={isApplyDisabled}
          className={`w-full rounded-lg border py-2 text-xs font-semibold transition-colors ${
            !isApplyDisabled
              ? action === 'apply'
                ? 'border-emerald-500 bg-emerald-500 text-white hover:bg-emerald-600'
                : 'border-red-500 bg-red-500 text-white hover:bg-red-600'
              : 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
          }`}
        >
          {phase === 'idle' && action === 'apply' && applyLocked && 'VPC 생성 대기 중'}
          {phase === 'idle' && !(action === 'apply' && applyLocked) &&
            `${action === 'apply' ? '배포' : '삭제'} 실행`}
          {phase === 'running' && (
            <span className="flex items-center justify-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
              실행 중...
            </span>
          )}
          {phase === 'complete' && '실행 완료'}
          {phase === 'error' && '오류 발생'}
        </button>

        {action === 'destroy' && phase === 'idle' && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700">
            <span className="mt-0.5 flex-shrink-0">!</span>
            <span>
              Destroy를 실행하면 모든 AWS 리소스가 삭제됩니다. EC2, S3 버킷, EIP, VPC 등이 제거됩니다.
            </span>
          </div>
        )}

        {logs.length > 0 && (
          <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs">
            {logs.map((log, i) => (
              <div
                key={i}
                className={
                  log.type === 'error'
                    ? 'text-red-700'
                    : log.type === 'vpc_ready'
                      ? 'text-amber-700'
                      : log.type === 'complete' && log.success
                        ? 'text-emerald-700'
                        : log.type === 'complete'
                          ? 'text-red-700'
                          : log.type === 'status'
                            ? log.conclusion === 'success'
                              ? 'text-emerald-700'
                              : log.conclusion === 'failure'
                                ? 'text-red-700'
                                : 'text-amber-700'
                            : 'text-slate-700'
                }
              >
                {log.type === 'status' ? (
                  <>
                    <span className="text-slate-400">[STATUS] </span>
                    {log.message}
                    {log.html_url && (
                      <a
                        href={log.html_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-2 text-blue-700 underline hover:text-blue-800"
                      >
                        [Actions 보기]
                      </a>
                    )}
                  </>
                ) : (
                  <>
                    <span className="text-slate-400">[{log.type.toUpperCase()}] </span>
                    {log.message}
                  </>
                )}
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        )}

        {resultUrl && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500">Actions:</span>
            <a
              href={resultUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate text-blue-700 underline hover:text-blue-800"
            >
              {resultUrl}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
