'use client';

import type { AttackPhase, AttackResult, Environment } from '@/types';

interface Props {
  results: AttackResult[];
  phase: AttackPhase;
  env: Environment;
  totalPlanned: number;
}

export function MetricsPanel({ results, phase, env, totalPlanned }: Props) {
  const total = results.length;
  const blocked = results.filter((result) => result.blocked).length;
  const reached = total - blocked;
  const blockRate = total > 0 ? Math.round((blocked / total) * 100) : 0;
  const reachRate = total > 0 ? Math.round((reached / total) * 100) : 0;
  const avgLatency =
    total > 0 ? Math.round(results.reduce((sum, result) => sum + result.latency, 0) / total) : 0;
  const firstBlocked = results.find((result) => result.blocked)?.attempt ?? null;
  const progress = totalPlanned > 0 ? (total / totalPlanned) * 100 : 0;
  const isVulnerable = env === 'vulnerable';

  return (
    <div className="space-y-3 border-t border-slate-200 pt-3">
      <div>
        <div className="mb-1 flex justify-between font-mono text-xs text-slate-500">
          <span>
            {total} / {totalPlanned} 요청
          </span>
          <span>
            {phase === 'running' && '실행 중'}
            {phase === 'complete' && <span className="text-slate-600">완료</span>}
            {phase === 'idle' && <span className="text-slate-500">대기 중</span>}
            {phase === 'error' && <span className="text-red-600">오류</span>}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              isVulnerable ? 'bg-red-500' : 'bg-emerald-500'
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div
          className={`rounded-lg border p-3 ${
            blocked > 0 ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'
          }`}
        >
          <div className="mb-1 text-xs text-slate-500">차단 수</div>
          <div className={`font-mono text-2xl font-bold ${blocked > 0 ? 'text-emerald-700' : 'text-slate-500'}`}>
            {blocked}
          </div>
          <div className="text-xs text-slate-500">{blockRate}%</div>
        </div>

        <div
          className={`rounded-lg border p-3 ${
            reached > 0 && isVulnerable ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-slate-50'
          }`}
        >
          <div className="mb-1 text-xs text-slate-500">도달 수</div>
          <div
            className={`font-mono text-2xl font-bold ${
              reached > 0 && isVulnerable ? 'text-red-600' : 'text-slate-600'
            }`}
          >
            {reached}
          </div>
          <div className="text-xs text-slate-500">{reachRate}%</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 font-mono text-xs">
        <div className="flex justify-between border-b border-slate-200 py-1">
          <span className="text-slate-500">평균 지연</span>
          <span className="text-slate-600">{avgLatency > 0 ? `${avgLatency}ms` : '-'}</span>
        </div>
        <div className="flex justify-between border-b border-slate-200 py-1">
          <span className="text-slate-500">첫 차단 시점</span>
          <span className={firstBlocked !== null ? 'text-emerald-700' : 'text-slate-500'}>
            {firstBlocked !== null ? `#${firstBlocked}` : '없음'}
          </span>
        </div>
      </div>

      {phase === 'complete' && (
        <div
          className={`rounded-lg border px-3 py-2 font-mono text-xs ${
            isVulnerable
              ? reached > 0
                ? 'border-red-200 bg-red-50 text-red-700'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : blocked > 0
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-amber-200 bg-amber-50 text-amber-700'
          }`}
        >
          {isVulnerable
            ? reached > 0
              ? `${reached}건이 애플리케이션 계층까지 도달했습니다. 보호 제어가 부족한 상태입니다.`
              : '도달 요청이 거의 없어 비교 대상이 제한적인 상태입니다.'
            : blocked > 0
              ? `${blocked}건이 앞단에서 차단되었습니다. 보호 계층이 먼저 동작했습니다.`
              : '보안 환경이지만 명확한 차단 이벤트가 보이지 않았습니다.'}
        </div>
      )}
    </div>
  );
}
