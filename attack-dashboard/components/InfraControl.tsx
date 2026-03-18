'use client';

import { useState, useRef, useCallback } from 'react';

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
}

const initialEnvState = (): EnvState => ({
  phase: 'idle',
  action: 'apply',
  logs: [],
  resultUrl: null,
});

export function InfraControl() {
  const [vulnerable, setVulnerable] = useState<EnvState>(initialEnvState());
  const [secure, setSecure] = useState<EnvState>(initialEnvState());

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

      setEnvState(env, (prev) => ({ ...prev, phase: 'running', logs: [], resultUrl: null }));

      const es = new EventSource(`/api/infra/deploy?env=${env}&action=${action}`);
      esRef.current = es;

      es.onmessage = (e) => {
        let event: LogEntry;
        try {
          event = JSON.parse(e.data);
        } catch {
          return;
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
    [vulnerable, secure, setEnvState, appendLog]
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
        />
      </div>
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
}

function EnvPanel({
  label,
  state,
  onStart,
  onReset,
  onSetAction,
  logsEndRef,
  accentColor,
}: EnvPanelProps) {
  const { phase, action, logs, resultUrl } = state;
  const isRed = accentColor === 'red';

  const headerBg = isRed
    ? 'bg-red-50 border-b border-red-100'
    : 'bg-emerald-50 border-b border-emerald-100';
  const headerText = isRed ? 'text-red-600' : 'text-emerald-600';
  const dot = isRed ? 'bg-red-500' : 'bg-emerald-500';

  const phaseColor =
    phase === 'complete'
      ? 'text-emerald-600'
      : phase === 'error'
        ? 'text-red-600'
        : phase === 'running'
          ? 'text-amber-600'
          : 'text-slate-500';

  const phaseLabel =
    phase === 'idle'
      ? '대기'
      : phase === 'running'
        ? '실행 중'
        : phase === 'complete'
          ? '완료'
          : '오류';

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
              className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-800"
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
                    : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                } ${phase !== 'idle' ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
              >
                {a === 'apply' ? 'Apply' : 'Destroy'}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={onStart}
          disabled={phase !== 'idle'}
          className={`w-full rounded-lg border py-2 text-xs font-semibold transition-colors ${
            phase === 'idle'
              ? action === 'apply'
                ? 'border-emerald-500 bg-emerald-500 text-white hover:bg-emerald-600'
                : 'border-red-500 bg-red-500 text-white hover:bg-red-600'
              : 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
          }`}
        >
          {phase === 'idle' && `${action === 'apply' ? '배포' : '삭제'} 실행`}
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
                    ? 'text-red-600'
                    : log.type === 'complete' && log.success
                      ? 'text-emerald-600'
                      : log.type === 'complete'
                        ? 'text-red-600'
                        : log.type === 'status'
                          ? log.conclusion === 'success'
                            ? 'text-emerald-600'
                            : log.conclusion === 'failure'
                              ? 'text-red-600'
                              : 'text-amber-600'
                          : 'text-slate-600'
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
                        className="ml-2 text-blue-600 underline hover:text-blue-700"
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
              className="truncate text-blue-600 underline hover:text-blue-700"
            >
              {resultUrl}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
