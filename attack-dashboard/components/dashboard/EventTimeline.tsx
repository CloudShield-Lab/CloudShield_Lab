'use client';

import { STAGE_LABELS } from '@/lib/attack-simulation';
import type { AttackSimulationEvent } from '@/types';

const severityTone = {
  info: 'border-sky-200 bg-sky-50 text-sky-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-700',
  critical: 'border-rose-200 bg-rose-50 text-rose-700',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
};

interface Props {
  events: AttackSimulationEvent[];
  compact?: boolean;
  title?: string;
}

export function EventTimeline({ events, compact = false, title = '이벤트 타임라인' }: Props) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white ${compact ? 'p-3' : 'p-5'} shadow-[0_14px_36px_rgba(15,23,42,0.05)]`}>
      <div className={`flex items-center justify-between ${compact ? 'mb-3' : 'mb-4'}`}>
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <p className="text-sm text-slate-500">공격 진행 중 생성된 이벤트를 시간 순서대로 보여줍니다.</p>
        </div>
        <span className="font-mono text-xs text-slate-500">{events.length}개 이벤트</span>
      </div>

      <div className={`${compact ? 'max-h-[26vh] space-y-2' : 'max-h-[420px] space-y-3'} overflow-y-auto pr-1`}>
        {events.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
            시뮬레이션을 시작하면 타임라인이 채워집니다.
          </div>
        ) : (
          events.map((event) => (
            <article key={event.id} className={`rounded-xl border border-slate-200 bg-slate-50 ${compact ? 'p-3' : 'p-4'}`}>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-slate-500">{event.timestampLabel}</span>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] ${severityTone[event.severity]}`}
                >
                  {event.severity}
                </span>
                <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-slate-500">
                  {event.env}
                </span>
                <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-slate-500">
                  {STAGE_LABELS[event.stage]}
                </span>
              </div>
              <div className={`${compact ? 'text-xs' : 'text-sm'} font-medium text-slate-900`}>{event.title}</div>
              <div className={`mt-1 ${compact ? 'text-xs' : 'text-sm'} text-slate-600`}>{event.description}</div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
