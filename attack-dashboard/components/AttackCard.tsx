'use client';

import { useCallback, useRef, useState } from 'react';
import { useArchitectureVisualization } from '@/hooks/useArchitectureVisualization';
import type { AttackEndpoint, AttackEvent, AttackPhase, AttackResult } from '@/types';
import { MetricsPanel } from './MetricsPanel';
import { RequestLog } from './RequestLog';

interface Props {
  index: number;
  title: string;
  description: string;
  endpoint: AttackEndpoint;
  totalRequests: number;
  attackParams?: string;
  vulnNote: string;
  awsNote: string;
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
}: Props) {
  const { startScenario, handleAttackEvent, resetScenario } = useArchitectureVisualization();
  const [phase, setPhase] = useState<AttackPhase>('idle');
  const [vulnResults, setVulnResults] = useState<AttackResult[]>([]);
  const [awsResults, setAwsResults] = useState<AttackResult[]>([]);
  const esRef = useRef<EventSource | null>(null);

  const startAttack = useCallback(() => {
    if (phase === 'running') return;

    startScenario(endpoint);
    setPhase('running');
    setVulnResults([]);
    setAwsResults([]);

    const query = attackParams ? `?${attackParams}` : '';
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
        };

        if (event.env === 'vulnerable') {
          setVulnResults((prev) => [...prev, result]);
        } else {
          setAwsResults((prev) => [...prev, result]);
        }
      } else if (event.type === 'complete') {
        setPhase('complete');
        es.close();
      } else if (event.type === 'error') {
        setPhase('error');
        es.close();
      }
    };

    es.onerror = () => {
      setPhase('complete');
      es.close();
    };
  }, [attackParams, endpoint, handleAttackEvent, phase, startScenario]);

  const reset = useCallback(() => {
    esRef.current?.close();
    resetScenario();
    setPhase('idle');
    setVulnResults([]);
    setAwsResults([]);
  }, [resetScenario]);

  const buttonClass =
    phase === 'idle'
      ? 'border-red-500 bg-red-500 text-white hover:bg-red-600'
      : phase === 'running'
        ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
        : 'border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200';

  return (
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
  );
}
