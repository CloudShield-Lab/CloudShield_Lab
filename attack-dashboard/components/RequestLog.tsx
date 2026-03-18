'use client';

import { useEffect, useRef } from 'react';
import type { AttackResult, Environment } from '@/types';

interface Props {
  results: AttackResult[];
  env: Environment;
}

function statusColor(status: number, blocked: boolean): string {
  if (blocked) return 'text-emerald-700';
  if (status === 200) return 'text-amber-600';
  if (status === 401) return 'text-orange-600';
  if (status === 403 || status === 429) return 'text-emerald-700';
  if (status <= 0) return 'text-slate-400';
  return 'text-slate-600';
}

function rowBg(blocked: boolean, env: Environment): string {
  if (blocked) return 'border-l-2 border-emerald-400 bg-emerald-50';
  if (env === 'vulnerable') return 'border-l-2 border-red-300 bg-red-50';
  return 'border-l-2 border-emerald-200 bg-emerald-50/45';
}

export function RequestLog({ results, env }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [results.length]);

  if (results.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center font-mono text-sm text-slate-500">
        아직 실행된 요청이 없습니다.
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="h-32 space-y-0.5 overflow-y-auto pr-1">
      {results.map((result, index) => (
        <div
          key={index}
          className={`flex items-center gap-2 rounded-sm px-2 py-[3px] font-mono text-xs ${rowBg(result.blocked, env)}`}
        >
          <span
            className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${
              result.blocked ? 'bg-emerald-500' : env === 'vulnerable' ? 'bg-red-500' : 'bg-emerald-400'
            }`}
          />
          <span className="w-8 flex-shrink-0 text-right text-slate-500">#{result.attempt}</span>
          <span className={`w-10 flex-shrink-0 font-bold ${statusColor(result.status, result.blocked)}`}>
            {result.status > 0 ? result.status : 'ERR'}
          </span>
          <span className="w-14 flex-shrink-0 text-slate-500">
            {result.latency > 0 ? `${result.latency}ms` : '-'}
          </span>
          <span
            className={`flex-1 truncate ${
              result.blocked
                ? 'font-semibold text-emerald-700'
                : env === 'vulnerable'
                  ? 'text-red-600'
                  : 'text-emerald-700'
            }`}
          >
            {result.label || '응답 수신'}
          </span>
        </div>
      ))}
    </div>
  );
}
