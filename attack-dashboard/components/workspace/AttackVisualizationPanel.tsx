'use client';

import { ArchitectureGraph } from '@/components/architecture/ArchitectureGraph';
import { EventTimeline } from '@/components/dashboard/EventTimeline';
import { AttackPathChart } from '@/components/dashboard/AttackPathChart';
import { useArchitectureVisualization } from '@/hooks/useArchitectureVisualization';

const phaseLabel = {
  idle: '대기',
  running: '실행 중',
  complete: '완료',
  error: '오류',
} as const;

export function AttackVisualizationPanel() {
  const { scenario, phase, timeline, nodeStates } = useArchitectureVisualization();
  const lastVulnerableEvent = [...timeline].reverse().find((event) => event.env === 'vulnerable');
  const lastSecureEvent = [...timeline].reverse().find((event) => event.env === 'secure');

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_14px_36px_rgba(15,23,42,0.05)]">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">시각화 패널</h2>
          <p className="mt-1 text-sm text-slate-500">
            현재 실행 중인 공격이 취약 환경과 보안 환경에서 어디까지 도달하는지 흐름으로 확인합니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 font-mono text-[11px] tracking-[0.18em] text-slate-500">
            {scenario.name}
          </span>
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 font-mono text-[11px] tracking-[0.18em] text-emerald-700">
            {phaseLabel[phase]}
          </span>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ArchitectureGraph env="vulnerable" nodes={nodeStates.vulnerable} lastEvent={lastVulnerableEvent} />
        <ArchitectureGraph env="secure" nodes={nodeStates.secure} lastEvent={lastSecureEvent} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <AttackPathChart nodeStates={nodeStates} />
        <EventTimeline events={timeline} />
      </div>
    </section>
  );
}
