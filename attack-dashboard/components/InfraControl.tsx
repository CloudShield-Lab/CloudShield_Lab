'use client';

import { useState, useRef, useCallback } from 'react';

type Environment = 'vulnerable' | 'secure';
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

export function InfraControl() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [selectedEnv, setSelectedEnv] = useState<Environment>('vulnerable');
  const [selectedAction, setSelectedAction] = useState<Action>('apply');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const appendLog = useCallback((entry: LogEntry) => {
    setLogs((prev) => [...prev, entry]);
    setTimeout(() => {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 50);
  }, []);

  const startDeploy = useCallback(() => {
    if (phase !== 'idle') return;

    setPhase('running');
    setLogs([]);
    setResultUrl(null);

    const es = new EventSource(
      `/api/infra/deploy?env=${selectedEnv}&action=${selectedAction}`
    );
    esRef.current = es;

    es.onmessage = (e) => {
      let event: LogEntry;
      try {
        event = JSON.parse(e.data);
      } catch {
        return;
      }

      appendLog(event);

      if (event.type === 'complete' || event.type === 'timeout') {
        setPhase(event.type === 'complete' && event.success ? 'complete' : 'error');
        if (event.html_url) setResultUrl(event.html_url);
        es.close();
      } else if (event.type === 'error') {
        setPhase('error');
        es.close();
      }
    };

    es.onerror = () => {
      setPhase('error');
      es.close();
    };
  }, [phase, selectedEnv, selectedAction, appendLog]);

  const reset = useCallback(() => {
    esRef.current?.close();
    setPhase('idle');
    setLogs([]);
    setResultUrl(null);
  }, []);

  const actionLabel = selectedAction === 'apply' ? '배포 (Apply)' : '삭제 (Destroy)';
  const actionColor = selectedAction === 'apply' ? 'emerald' : 'red';

  return (
    <div className="rounded-xl border border-slate-800 bg-[#0d1117] overflow-hidden">
      {/* 헤더 */}
      <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <span className="flex-shrink-0 w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-mono text-slate-400">
            ⚙
          </span>
          <div>
            <h2 className="text-slate-100 font-semibold tracking-wide">인프라 자동 배포/삭제</h2>
            <p className="text-slate-500 text-sm mt-0.5">
              Terraform으로 취약/보안 환경을 한 번에 배포하거나 삭제합니다.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {phase !== 'idle' && (
            <button
              onClick={reset}
              className="px-3 py-1.5 rounded-lg text-xs border border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600 transition-colors"
            >
              초기화
            </button>
          )}
        </div>
      </div>

      {/* 컨트롤 패널 */}
      <div className="p-6 space-y-4">
        <div className="flex flex-wrap gap-4">
          {/* 환경 선택 */}
          <div className="space-y-1.5">
            <label className="text-xs text-slate-500 uppercase tracking-wider font-medium">환경</label>
            <div className="flex gap-2">
              {(['vulnerable', 'secure'] as Environment[]).map((env) => (
                <button
                  key={env}
                  onClick={() => phase === 'idle' && setSelectedEnv(env)}
                  disabled={phase !== 'idle'}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                    selectedEnv === env
                      ? env === 'vulnerable'
                        ? 'bg-red-900/50 border-red-700 text-red-300'
                        : 'bg-emerald-900/50 border-emerald-700 text-emerald-300'
                      : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-600'
                  } ${phase !== 'idle' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  {env === 'vulnerable' ? '취약 환경' : '보안 환경'}
                </button>
              ))}
            </div>
          </div>

          {/* 액션 선택 */}
          <div className="space-y-1.5">
            <label className="text-xs text-slate-500 uppercase tracking-wider font-medium">액션</label>
            <div className="flex gap-2">
              {(['apply', 'destroy'] as Action[]).map((action) => (
                <button
                  key={action}
                  onClick={() => phase === 'idle' && setSelectedAction(action)}
                  disabled={phase !== 'idle'}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                    selectedAction === action
                      ? action === 'apply'
                        ? 'bg-emerald-900/50 border-emerald-700 text-emerald-300'
                        : 'bg-red-900/50 border-red-700 text-red-300'
                      : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-600'
                  } ${phase !== 'idle' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  {action === 'apply' ? '▲ Apply (배포)' : '▼ Destroy (삭제)'}
                </button>
              ))}
            </div>
          </div>

          {/* 실행 버튼 */}
          <div className="space-y-1.5">
            <label className="text-xs text-slate-500 uppercase tracking-wider font-medium invisible">실행</label>
            <button
              onClick={startDeploy}
              disabled={phase !== 'idle'}
              className={`px-5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                phase === 'idle'
                  ? selectedAction === 'apply'
                    ? 'bg-emerald-700 hover:bg-emerald-600 border-emerald-600 text-white cursor-pointer'
                    : 'bg-red-700 hover:bg-red-600 border-red-600 text-white cursor-pointer'
                  : 'bg-slate-800 border-slate-700 text-slate-500 cursor-not-allowed'
              }`}
            >
              {phase === 'idle' && `▶ ${actionLabel}`}
              {phase === 'running' && (
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-pulse" />
                  실행 중...
                </span>
              )}
              {phase === 'complete' && '✓ 완료'}
              {phase === 'error' && '✗ 오류'}
            </button>
          </div>
        </div>

        {/* 경고 메시지 */}
        {selectedAction === 'destroy' && phase === 'idle' && (
          <div className="rounded-lg border border-red-900/50 bg-red-950/20 px-4 py-2.5 text-xs text-red-300/80 flex items-start gap-2">
            <span className="flex-shrink-0 mt-0.5">⚠</span>
            <span>
              Destroy를 실행하면 선택한 환경의 <strong>모든 AWS 리소스가 삭제</strong>됩니다.
              EC2, S3 버킷(파일 포함), EIP, VPC 등이 제거됩니다.
            </span>
          </div>
        )}

        {/* 로그 패널 */}
        {logs.length > 0 && (
          <div className="rounded-lg bg-slate-900 border border-slate-800 p-4 font-mono text-xs space-y-1 max-h-64 overflow-y-auto">
            {logs.map((log, i) => (
              <div
                key={i}
                className={
                  log.type === 'error'
                    ? 'text-red-400'
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
            <span className="text-slate-500">GitHub Actions 실행 결과:</span>
            <a
              href={resultUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 underline"
            >
              {resultUrl}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
