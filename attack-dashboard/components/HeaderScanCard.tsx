'use client';

import { useCallback, useRef, useState } from 'react';
import type { AttackPhase, AttackResult, SessionMetrics, WorkspaceMode } from '@/types';

function computeMetrics(results: AttackResult[]): SessionMetrics {
  const total = results.length;
  const blocked = results.filter((r) => r.blocked).length;
  const avgLatency = total > 0 ? Math.round(results.reduce((sum, r) => sum + r.latency, 0) / total) : 0;
  return { blocked, total, avgLatency };
}

const DANGEROUS_HEADERS = ['x-powered-by', 'server', 'via', 'x-aspnet-version', 'x-aspnetmvc-version', 'x-runtime', 'x-generator', 'x-version'];
const SECURITY_HEADERS = ['strict-transport-security', 'x-content-type-options', 'x-frame-options', 'x-xss-protection', 'content-security-policy'];

interface ScanResult {
  headers: Record<string, string>;
  dangerousFound: string[];
  status: number;
  latency: number;
}

interface HeaderScanEvent {
  type: string;
  env?: string;
  headers?: Record<string, string>;
  dangerousFound?: string[];
  status?: number;
  latency?: number;
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
  const [phase, setPhase] = useState<AttackPhase>('idle');
  const [vulnScan, setVulnScan] = useState<ScanResult | null>(null);
  const [awsScan, setAwsScan] = useState<ScanResult | null>(null);
  const [savedToast, setSavedToast] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const localVulnRef = useRef<ScanResult | null>(null);
  const localAwsRef = useRef<ScanResult | null>(null);

  const startScan = useCallback(() => {
    if (phase === 'running') return;
    const startTime = new Date().toISOString();
    setPhase('running');
    setVulnScan(null);
    setAwsScan(null);
    localVulnRef.current = null;
    localAwsRef.current = null;

    const doSave = (localVuln: ScanResult | null, localAws: ScanResult | null) => {
      void (async () => {
        try {
          const toResult = (scan: ScanResult | null, attempt: number): AttackResult => ({
            attempt,
            status: scan?.status ?? 0,
            latency: scan?.latency ?? 0,
            blocked: false,
            label: scan ? `${Object.keys(scan.headers).length} headers` : undefined,
          });
          const vulnResults: AttackResult[] = localVuln ? [toResult(localVuln, 1)] : [];
          const secureResults: AttackResult[] = localAws ? [toResult(localAws, 1)] : [];
          const sessionId = crypto.randomUUID();
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

    const es = new EventSource(`/api/attack/header-scan?mode=${mode}`);
    esRef.current = es;

    es.onmessage = (msg) => {
      let event: HeaderScanEvent;
      try {
        event = JSON.parse(msg.data);
      } catch {
        return;
      }

      if (event.type === 'headers' && event.headers !== undefined) {
        const result: ScanResult = {
          headers: event.headers,
          dangerousFound: event.dangerousFound || [],
          status: event.status ?? 0,
          latency: event.latency ?? 0,
        };
        if (event.env === 'vulnerable') {
          setVulnScan(result);
          localVulnRef.current = result;
        } else {
          setAwsScan(result);
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
  }, [mode, phase, title]);

  const reset = useCallback(() => {
    esRef.current?.close();
    setPhase('idle');
    setVulnScan(null);
    setAwsScan(null);
  }, []);

  const buttonClass =
    phase === 'idle'
      ? 'border-red-500 bg-red-500 text-white hover:bg-red-600'
      : phase === 'running'
        ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
        : 'border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200';

  // Collect all unique header names from both scans
  const allHeaderNames = Array.from(
    new Set([
      ...Object.keys(vulnScan?.headers ?? {}),
      ...Object.keys(awsScan?.headers ?? {}),
    ]),
  ).sort();

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
            onClick={startScan}
            disabled={phase === 'running'}
            className={`rounded-lg border px-4 py-1.5 text-xs font-semibold transition-colors ${buttonClass}`}
          >
            {phase === 'idle' && '스캔 실행'}
            {phase === 'running' && (
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-yellow-500" />
                스캔 중
              </span>
            )}
            {phase === 'complete' && '다시 스캔'}
            {phase === 'error' && '오류 발생'}
          </button>
        </div>
      </div>

      {/* Notes */}
      <div className="grid grid-cols-1 divide-slate-200 lg:grid-cols-2 lg:divide-x">
        <div className="space-y-2 p-4">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-red-500" />
            <span className="text-xs font-semibold uppercase tracking-wider text-red-600">취약 환경</span>
            <span className="ml-1 font-mono text-xs text-slate-400">No Protection</span>
          </div>
          <p className="min-h-[44px] text-xs leading-5 text-slate-500">{vulnNote}</p>
          {vulnScan && (
            <div className="flex gap-3 font-mono text-xs text-slate-500">
              <span>HTTP {vulnScan.status}</span>
              <span>{vulnScan.latency}ms</span>
              {vulnScan.dangerousFound.length > 0 && (
                <span className="font-semibold text-red-600">⚠ {vulnScan.dangerousFound.length}개 위험 헤더 노출</span>
              )}
            </div>
          )}
        </div>
        <div className="space-y-2 border-t border-slate-200 p-4 lg:border-t-0">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600">보안 환경</span>
            <span className="ml-1 font-mono text-xs text-slate-400">WAF + CloudFront</span>
          </div>
          <p className="min-h-[44px] text-xs leading-5 text-slate-500">{awsNote}</p>
          {awsScan && (
            <div className="flex gap-3 font-mono text-xs text-slate-500">
              <span>HTTP {awsScan.status === -1 ? 'N/A' : awsScan.status}</span>
              <span>{awsScan.status === -1 ? '-' : `${awsScan.latency}ms`}</span>
              {awsScan.dangerousFound.length === 0 && awsScan.status !== -1 && (
                <span className="font-semibold text-emerald-600">✓ 위험 헤더 없음</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Comparison table */}
      {(vulnScan || awsScan) && allHeaderNames.length > 0 && (
        <div className="border-t border-slate-200 p-4">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">헤더 비교</div>
          <div className="overflow-x-auto">
            <table className="w-full font-mono text-xs">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="pb-2 text-left font-medium text-slate-500">헤더명</th>
                  <th className="pb-2 pl-4 text-left font-medium text-red-500">취약 환경</th>
                  <th className="pb-2 pl-4 text-left font-medium text-emerald-600">보안 환경</th>
                </tr>
              </thead>
              <tbody>
                {allHeaderNames.map((name) => {
                  const isDangerous = DANGEROUS_HEADERS.includes(name);
                  const isSecurity = SECURITY_HEADERS.includes(name);
                  const vulnVal = vulnScan?.headers[name];
                  const awsVal = awsScan?.headers[name];

                  return (
                    <tr key={name} className="border-b border-slate-100">
                      <td className={`py-1.5 pr-4 ${isDangerous ? 'font-semibold text-slate-700' : 'text-slate-500'}`}>
                        {name}
                        {isDangerous && <span className="ml-1.5 text-red-400">⚠</span>}
                        {isSecurity && <span className="ml-1.5 text-emerald-500">✓</span>}
                      </td>
                      <td className="py-1.5 pl-4">
                        {vulnVal !== undefined ? (
                          <span className={isDangerous ? 'font-semibold text-red-600' : 'text-slate-600'}>
                            {vulnVal}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="py-1.5 pl-4">
                        {awsScan?.status === -1 ? (
                          <span className="text-slate-300">미설정</span>
                        ) : awsVal !== undefined ? (
                          <span className={isSecurity ? 'font-semibold text-emerald-600' : isDangerous ? 'text-amber-600' : 'text-slate-600'}>
                            {awsVal}
                          </span>
                        ) : (
                          <span className={isDangerous ? 'font-semibold text-emerald-600' : 'text-slate-300'}>
                            {isDangerous ? '제거됨' : '—'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-400">
            <span><span className="text-red-400">⚠</span> 위험 헤더 (기술 스택 노출)</span>
            <span><span className="text-emerald-500">✓</span> 보안 헤더</span>
          </div>
        </div>
      )}

      {phase === 'idle' && (
        <div className="border-t border-slate-200 p-4 text-center text-xs text-slate-400">
          스캔 실행 버튼을 클릭하면 양 환경의 HTTP 응답 헤더를 수집하여 비교합니다.
        </div>
      )}
    </section>
    </>
  );
}
