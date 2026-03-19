'use client';

import { useState } from 'react';
import { ListOrdered, Network } from 'lucide-react';
import { ArchitectureGraph } from '@/components/architecture/ArchitectureGraph';
import { AttackPathChart } from '@/components/dashboard/AttackPathChart';
import { EventTimeline } from '@/components/dashboard/EventTimeline';
import { useArchitectureVisualization } from '@/hooks/useArchitectureVisualization';

const phaseLabel = {
  idle: '대기',
  running: '실행 중',
  complete: '완료',
  error: '오류',
} as const;

type VisualizationTab = 'architecture' | 'timeline';

export function AttackVisualizationPanel() {
  const [activeTab, setActiveTab] = useState<VisualizationTab>('architecture');
  const { phase, timeline, nodeStates } = useArchitectureVisualization();
  const lastVulnerableEvent = [...timeline].reverse().find((event) => event.env === 'vulnerable');
  const lastSecureEvent = [...timeline].reverse().find((event) => event.env === 'secure');

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_14px_36px_rgba(15,23,42,0.05)]">
      <div className="mb-5 flex flex-col gap-3 border-b border-slate-200 pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">시각화 패널</h2>
          <p className="mt-1 text-sm leading-6 text-slate-700">
            공격 진행 상태를 아키텍처 흐름과 타임라인 기준으로 나눠 확인할 수 있습니다.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              onClick={() => setActiveTab('architecture')}
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                activeTab === 'architecture'
                  ? 'border border-emerald-200 bg-white text-emerald-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Network className="h-4 w-4" />
              아키텍처
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('timeline')}
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                activeTab === 'timeline'
                  ? 'border border-sky-200 bg-white text-sky-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ListOrdered className="h-4 w-4" />
              타임라인
            </button>
          </div>

          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 font-mono text-[11px] tracking-[0.18em] text-emerald-700">
            {phaseLabel[phase]}
          </span>
        </div>
      </div>

      {activeTab === 'architecture' ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <ArchitectureGraph env="vulnerable" nodes={nodeStates.vulnerable} lastEvent={lastVulnerableEvent} />
          <ArchitectureGraph env="secure" nodes={nodeStates.secure} lastEvent={lastSecureEvent} />
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
          <AttackPathChart nodeStates={nodeStates} />
          <EventTimeline events={timeline} />
        </div>
      )}
    </section>
  );
}
