'use client';

import { STAGE_LABELS } from '@/lib/attack-simulation';
import type { ArchitectureEnvironment, ArchitectureSummary } from '@/types';

const envTone: Record<ArchitectureEnvironment, string> = {
  vulnerable: 'border-red-900/60 bg-red-950/20',
  secure: 'border-emerald-900/60 bg-emerald-950/20',
};

const envTitle: Record<ArchitectureEnvironment, string> = {
  vulnerable: '취약 환경',
  secure: '보안 환경',
};

interface Props {
  summaries: Record<ArchitectureEnvironment, ArchitectureSummary>;
}

export function ComparisonSummary({ summaries }: Props) {
  const vulnerableDepth = STAGE_LABELS[summaries.vulnerable.deepestStage];
  const secureDepth = STAGE_LABELS[summaries.secure.deepestStage];

  return (
    <section className="grid gap-4 lg:grid-cols-[1.2fr_1.2fr_1fr]">
      {(['vulnerable', 'secure'] as ArchitectureEnvironment[]).map((env) => {
        const summary = summaries[env];

        return (
          <article key={env} className={`rounded-2xl border p-5 ${envTone[env]}`}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-100">{envTitle[env]}</h2>
              <span className="font-mono text-xs text-slate-400">{summary.totalEvents}개 이벤트</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3">
                <div className="text-xs text-slate-500">최대 도달 stage</div>
                <div className="mt-2 text-sm font-semibold text-slate-100">
                  {STAGE_LABELS[summary.deepestStage]}
                </div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3">
                <div className="text-xs text-slate-500">차단 지점</div>
                <div className="mt-2 text-sm font-semibold text-slate-100">
                  {summary.blockedStage ? STAGE_LABELS[summary.blockedStage] : '차단 없음'}
                </div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3">
                <div className="text-xs text-slate-500">영향 신호</div>
                <div className="mt-2 text-sm font-semibold text-slate-100">
                  {summary.successEvents > 0 ? '민감 경로 도달' : '통제됨'}
                </div>
              </div>
            </div>
          </article>
        );
      })}

      <article className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
        <h2 className="mb-4 text-lg font-semibold text-slate-100">비교 요약</h2>
        <div className="space-y-3 text-sm text-slate-400">
          <p>
            취약 환경은 <span className="text-red-300">{vulnerableDepth}</span>까지 도달하고,
            보안 환경은 <span className="text-emerald-300">{secureDepth}</span> 지점에서 흐름이 멈춥니다.
          </p>
          <p>
            보안 환경 그래프에서는 차단된 stage를 직접 강조해 어떤 제어가 효과적이었는지 즉시 식별할 수 있습니다.
          </p>
        </div>
      </article>
    </section>
  );
}
