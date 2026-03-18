'use client';

import { STAGE_LABELS } from '@/lib/attack-simulation';
import type { AttackSimulationEvent } from '@/types';

const severityTone = {
  info: 'border-sky-900/60 bg-sky-950/20 text-sky-200',
  warning: 'border-amber-900/60 bg-amber-950/20 text-amber-200',
  critical: 'border-rose-900/60 bg-rose-950/20 text-rose-200',
  success: 'border-emerald-900/60 bg-emerald-950/20 text-emerald-200',
};

interface Props {
  events: AttackSimulationEvent[];
  compact?: boolean;
}

export function EventTimeline({ events, compact = false }: Props) {
  return (
    <section className={`rounded-2xl border border-slate-800 bg-slate-950 ${compact ? 'p-3' : 'p-5'}`}>
      <div className={`flex items-center justify-between ${compact ? 'mb-3' : 'mb-4'}`}>
        <div>
          <h2 className="text-lg font-semibold text-slate-100">이벤트 타임라인</h2>
          <p className="text-sm text-slate-500">추후 SSE/WebSocket으로 교체할 수 있도록 mock 이벤트를 순서대로 재생합니다.</p>
        </div>
        <span className="font-mono text-xs text-slate-500">{events.length}개 이벤트</span>
      </div>

      <div className={`${compact ? 'max-h-[26vh] space-y-2' : 'max-h-[420px] space-y-3'} overflow-y-auto pr-1`}>
        {events.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-800 px-4 py-8 text-center text-sm text-slate-500">
            시뮬레이션을 시작하면 타임라인이 채워집니다.
          </div>
        ) : (
          events.map((event) => (
            <article key={event.id} className={`rounded-xl border border-slate-800 bg-slate-900/70 ${compact ? 'p-3' : 'p-4'}`}>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-slate-500">{event.timestampLabel}</span>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] ${severityTone[event.severity]}`}
                >
                  {event.severity}
                </span>
                <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-slate-400">
                  {event.env}
                </span>
                <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-slate-400">
                  {STAGE_LABELS[event.stage]}
                </span>
              </div>
              <div className={`${compact ? 'text-xs' : 'text-sm'} font-medium text-slate-100`}>{event.title}</div>
              <div className={`mt-1 ${compact ? 'text-xs' : 'text-sm'} text-slate-400`}>{event.description}</div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
