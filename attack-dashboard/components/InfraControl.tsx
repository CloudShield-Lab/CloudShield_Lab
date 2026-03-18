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

      setEnvState(env, (prev) => ({ ...prev, phase: 'running', logs: [], resultUrl: null, vpcReady: false }));

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

  // apply 중이고 VPC 생성 완료 전이면 상대 패널의 apply를 잠금
  // destroy는 제한 없음
  const vulnApplyLocked =
    secure.phase === 'running' && secure.action === 'apply' && !secure.vpcReady;
  const secureApplyLocked =
    vulnerable.phase === 'running' && vulnerable.action === 'apply' && !vulnerable.vpcReady;

  return (
    <div className="rounded-xl border border-slate-800 bg-[#0d1117] overflow-hidden">
      {/* 헤더 */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-800">
        <span className="flex-shrink-0 w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-mono text-slate-400">
          ⚙
        </span>
        <div>
          <h2 className="text-slate-100 font-semibold tracking-wide">인프라 자동 배포/삭제</h2>
          <p className="text-slate-500 text-sm mt-0.5">
            Terraform으로 취약/보안 환경을 독립적으로 배포하거나 삭제합니다.
          </p>
        </div>
      </div>

      {/* 두 환경 나란히 */}
      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-800">
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
    ? 'bg-red-950/30 border-b border-red-900/40'
    : 'bg-emerald-950/30 border-b border-emerald-900/40';
  const headerText = isRed ? 'text-red-300' : 'text-emerald-300';
  const dot = isRed ? 'bg-red-500' : 'bg-emerald-500';

  const phaseColor =
    phase === 'complete'
      ? 'text-emerald-400'
      : phase === 'error'
      ? 'text-red-400'
      : phase === 'running'
      ? 'text-yellow-400'
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
      {/* 환경 헤더 */}
      <div className={`flex items-center justify-between px-5 py-3 ${headerBg}`}>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${dot}`} />
          <span className={`text-sm font-semibold ${headerText}`}>{label}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-mono ${phaseColor}`}>{phaseLabel}</span>
          {phase !== 'idle' && (
            <button
              onClick={onReset}
              className="px-2 py-1 rounded text-xs border border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600 transition-colors"
            >
              초기화
            </button>
          )}
        </div>
      </div>

      {/* 컨트롤 */}
      <div className="p-5 space-y-4 flex-1">
        {/* 액션 선택 */}
        <div className="space-y-1.5">
          <label className="text-xs text-slate-500 uppercase tracking-wider font-medium">액션</label>
          <div className="flex gap-2">
            {(['apply', 'destroy'] as Action[]).map((a) => (
              <button
                key={a}
                onClick={() => onSetAction(a)}
                disabled={phase !== 'idle'}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                  action === a
                    ? a === 'apply'
                      ? 'bg-emerald-900/50 border-emerald-700 text-emerald-300'
                      : 'bg-red-900/50 border-red-700 text-red-300'
                    : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-600'
                } ${phase !== 'idle' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                {a === 'apply' ? '▲ Apply (배포)' : '▼ Destroy (삭제)'}
              </button>
            ))}
          </div>
        </div>

        {/* VPC 대기 안내 */}
        {action === 'apply' && applyLocked && phase === 'idle' && (
          <div className="rounded-lg border border-yellow-900/50 bg-yellow-950/20 px-4 py-2.5 text-xs text-yellow-300/80 flex items-start gap-2">
            <span className="flex-shrink-0 mt-0.5">⏳</span>
            <span>
              다른 환경 배포 중 — <strong>VPC 생성 완료</strong> 후 자동으로 활성화됩니다.
            </span>
          </div>
        )}

        {/* 실행 버튼 */}
        <button
          onClick={onStart}
          disabled={isApplyDisabled}
          className={`w-full py-2 rounded-lg text-xs font-semibold border transition-colors ${
            !isApplyDisabled
              ? action === 'apply'
                ? 'bg-emerald-700 hover:bg-emerald-600 border-emerald-600 text-white cursor-pointer'
                : 'bg-red-700 hover:bg-red-600 border-red-600 text-white cursor-pointer'
              : 'bg-slate-800 border-slate-700 text-slate-500 cursor-not-allowed'
          }`}
        >
          {phase === 'idle' && action === 'apply' && applyLocked && (
            <span className="flex items-center justify-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-yellow-500 rounded-full animate-pulse" />
              VPC 생성 대기 중...
            </span>
          )}
          {phase === 'idle' && !(action === 'apply' && applyLocked) &&
            `▶ ${action === 'apply' ? '배포 (Apply)' : '삭제 (Destroy)'}`}
          {phase === 'running' && (
            <span className="flex items-center justify-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-pulse" />
              실행 중...
            </span>
          )}
          {phase === 'complete' && '✓ 완료'}
          {phase === 'error' && '✗ 오류'}
        </button>

        {/* destroy 경고 */}
        {action === 'destroy' && phase === 'idle' && (
          <div className="rounded-lg border border-red-900/50 bg-red-950/20 px-4 py-2.5 text-xs text-red-300/80 flex items-start gap-2">
            <span className="flex-shrink-0 mt-0.5">⚠</span>
            <span>
              Destroy를 실행하면 <strong>모든 AWS 리소스가 삭제</strong>됩니다.
              EC2, S3 버킷(파일 포함), EIP, VPC 등이 제거됩니다.
            </span>
          </div>
        )}

        {/* 로그 패널 */}
        {logs.length > 0 && (
          <div className="rounded-lg bg-slate-900 border border-slate-800 p-3 font-mono text-xs space-y-1 max-h-56 overflow-y-auto">
            {logs.map((log, i) => (
              <div
                key={i}
                className={
                  log.type === 'error'
                    ? 'text-red-400'
                    : log.type === 'vpc_ready'
                    ? 'text-yellow-300'
                    : log.type === 'complete' && log.success
                    ? 'text-emerald-400'
                    : log.type === 'complete'
                    ? 'text-red-400'
                    : log.type === 'status'
                    ? log.conclusion === 'success'
                      ? 'text-emerald-400'
                      : log.conclusion === 'failure'
                      ? 'text-red-400'
                      : 'text-yellow-400'
                    : 'text-slate-400'
                }
              >
                {log.type === 'status' ? (
                  <>
                    <span className="text-slate-600">[STATUS] </span>
                    {log.message}
                    {log.html_url && (
                      <a
                        href={log.html_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-2 text-blue-400 hover:text-blue-300 underline"
                      >
                        [Actions 보기]
                      </a>
                    )}
                  </>
                ) : (
                  <>
                    <span className="text-slate-600">[{log.type.toUpperCase()}] </span>
                    {log.message}
                  </>
                )}
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        )}

        {/* 결과 링크 */}
        {resultUrl && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500">Actions:</span>
            <a
              href={resultUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 underline truncate"
            >
              {resultUrl}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
