'use client';

import { AttackCard } from '@/components/AttackCard';
import { ArchitectureVisualizationProvider } from '@/hooks/useArchitectureVisualization';
import { getAttackScenarioConfig } from '@/lib/attack-scenarios';
import type { AttackEndpoint } from '@/types';
import { AttackVisualizationPanel } from './AttackVisualizationPanel';

export function AttackScenarioContent({ scenario }: { scenario: AttackEndpoint }) {
  const config = getAttackScenarioConfig(scenario);

  if (!config) {
    return null;
  }

  return (
    <ArchitectureVisualizationProvider>
      <div className="space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_14px_36px_rgba(15,23,42,0.05)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="mb-3 flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-slate-50 font-mono text-xs text-slate-500">
                  {config.index}
                </span>
                <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 font-mono text-[11px] tracking-[0.18em] text-red-600">
                  ATTACK FLOW
                </span>
              </div>
              <h2 className="text-2xl font-semibold text-slate-900">{config.title}</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">{config.description}</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
              실행 버튼을 누르면 하단 시각화 패널이 즉시 갱신됩니다.
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            {config.flowSteps.map((step) => (
              <article key={step.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm font-semibold text-slate-900">{step.title}</div>
                <div className="mt-4 space-y-3 text-sm">
                  <div className="rounded-xl border border-red-200 bg-red-50 p-3">
                    <div className="text-xs font-medium uppercase tracking-[0.18em] text-red-600">취약 환경</div>
                    <p className="mt-2 leading-6 text-slate-600">{step.vulnerable}</p>
                  </div>
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                    <div className="text-xs font-medium uppercase tracking-[0.18em] text-emerald-600">보안 환경</div>
                    <p className="mt-2 leading-6 text-slate-600">{step.secure}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <AttackCard
          index={config.index}
          title={config.title}
          description={config.description}
          endpoint={config.key}
          totalRequests={config.totalRequests}
          attackParams={config.attackParams}
          vulnNote={config.vulnNote}
          awsNote={config.awsNote}
        />

        <AttackVisualizationPanel />
      </div>
    </ArchitectureVisualizationProvider>
  );
}
