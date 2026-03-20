'use client';

import { ChevronDown, ChevronUp, Network, ScrollText } from 'lucide-react';
import { useState } from 'react';
import { ArchitectureGraph } from '@/components/architecture/ArchitectureGraph';
import { useArchitectureVisualization } from '@/hooks/useArchitectureVisualization';
import { EventTimeline } from './EventTimeline';

const phaseLabel = {
  idle: '대기',
  running: '실행 중',
  complete: '완료',
  error: '오류',
};

type PanelTab = 'architecture' | 'timeline';

export function ArchitectureComparisonDashboard() {
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState<PanelTab>('architecture');
  const { scenario, scenarioKey, phase, timeline, nodeStates } = useArchitectureVisualization();

  const lastVulnerableEvent = [...timeline].reverse().find((event) => event.env === 'vulnerable');
  const lastSecureEvent = [...timeline].reverse().find((event) => event.env === 'secure');

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50">
      <section className="pointer-events-auto w-full overflow-hidden border-t border-slate-700 bg-slate-950/95 backdrop-blur">
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className={`w-full px-4 py-2 transition hover:bg-slate-900 sm:px-6 ${
            expanded ? 'flex items-center justify-between gap-3 text-left' : 'grid place-items-center text-center'
          }`}
        >
          {expanded ? (
            <>
              <div className="flex min-w-0 items-center gap-2">
                <span className="text-[11px] font-medium tracking-[0.18em] text-slate-300">시각화 패널</span>
                <span className="rounded-full border border-emerald-900/60 bg-emerald-950/20 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-emerald-300">
                  {phaseLabel[phase]}
                </span>
                <span className="truncate text-sm font-semibold text-slate-100">{scenario.name}</span>
              </div>
              <ChevronDown className="h-4 w-4 flex-shrink-0 text-slate-400" />
            </>
          ) : (
            <div className="flex items-center justify-center gap-2">
              <span className="text-[11px] font-medium tracking-[0.18em] text-slate-300">시각화 패널</span>
              <span className="rounded-full border border-emerald-900/60 bg-emerald-950/20 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-emerald-300">
                {phaseLabel[phase]}
              </span>
              <ChevronUp className="h-4 w-4 text-slate-400" />
            </div>
          )}
        </button>

        {expanded ? (
          <>
            <div className="flex flex-wrap justify-center gap-1.5 border-t border-slate-800 px-4 py-1.5 sm:px-6">
              <button
                type="button"
                onClick={() => setTab('architecture')}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition ${
                  tab === 'architecture'
                    ? 'border-emerald-700 bg-emerald-950/30 text-emerald-300'
                    : 'border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                }`}
              >
                <Network className="h-3.5 w-3.5" />
                아키텍처
              </button>
              <button
                type="button"
                onClick={() => setTab('timeline')}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition ${
                  tab === 'timeline'
                    ? 'border-emerald-700 bg-emerald-950/30 text-emerald-300'
                    : 'border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                }`}
              >
                <ScrollText className="h-3.5 w-3.5" />
                타임라인
              </button>
            </div>

            <div className="max-h-[40vh] overflow-y-auto px-4 pb-2 pt-1.5 sm:px-6">
              {tab === 'architecture' ? (
                <section className="grid gap-2 xl:grid-cols-2">
                  <ArchitectureGraph
                    env="vulnerable"
                    nodes={nodeStates.vulnerable}
                    lastEvent={lastVulnerableEvent}
                    scenarioKey={scenarioKey}
                  />
                  <ArchitectureGraph
                    env="secure"
                    nodes={nodeStates.secure}
                    lastEvent={lastSecureEvent}
                    scenarioKey={scenarioKey}
                  />
                </section>
              ) : (
                <EventTimeline events={timeline} compact />
              )}
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}
