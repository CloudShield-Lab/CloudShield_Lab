'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AttackCard } from '@/components/AttackCard';
import { BruteforceAttackCard } from '@/components/BruteforceAttackCard';
import { HeaderScanCard } from '@/components/HeaderScanCard';
import { S3ExfiltrationCard } from '@/components/S3ExfiltrationCard';
import { ArchitectureVisualizationProvider } from '@/hooks/useArchitectureVisualization';
import { getAttackScenarioConfig } from '@/lib/attack-scenarios';
import type { AttackEndpoint, DashboardConfig, WorkspaceMode } from '@/types';
import { AttackVisualizationPanel } from './AttackVisualizationPanel';

export function AttackScenarioContent({
  scenario,
  mode,
}: {
  scenario: AttackEndpoint;
  mode: WorkspaceMode;
}) {
  const config = getAttackScenarioConfig(scenario);
  const [dashConfig, setDashConfig] = useState<DashboardConfig | null>(null);

  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then(setDashConfig)
      .catch(() => {});
  }, []);

  if (!config) {
    return null;
  }

  const autoNotDeployed =
    mode === 'auto' &&
    dashConfig !== null &&
    !dashConfig.autoVulnerable.configured &&
    !dashConfig.autoAws.configured;

  return (
    <ArchitectureVisualizationProvider>
      <div className="space-y-6">
        {/* 자동 배포 미완료 배너 */}
        {autoNotDeployed && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-5 py-4">
            <p className="text-sm font-semibold text-amber-900">
              자동 배포 인프라가 아직 구성되지 않았습니다.
            </p>
            <p className="mt-1 text-xs text-amber-700">
              공격 시뮬레이션을 실행하려면 먼저{' '}
              <Link href="/auto" className="font-semibold underline hover:text-amber-900">
                자동 환경 구축
              </Link>{' '}
              페이지에서 인프라를 배포해 주세요.
            </p>
          </div>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_14px_36px_rgba(15,23,42,0.05)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="mb-3 flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-slate-50 font-mono text-xs text-slate-500">
                  {config.index}
                </span>
                <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 font-mono text-[11px] tracking-[0.18em] text-sky-700">
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

        {scenario === 'bruteforce' ? (
          <BruteforceAttackCard
            index={config.index}
            title={config.title}
            description={config.description}
            totalRequests={config.totalRequests}
            vulnNote={config.vulnNote}
            awsNote={config.awsNote}
            mode={mode}
          />
        ) : scenario === 's3-access' ? (
          <S3ExfiltrationCard
            index={config.index}
            title={config.title}
            description={config.description}
            vulnNote={config.vulnNote}
            awsNote={config.awsNote}
            mode={mode}
          />
        ) : scenario === 'header-scan' ? (
          <HeaderScanCard
            index={config.index}
            title={config.title}
            description={config.description}
            vulnNote={config.vulnNote}
            awsNote={config.awsNote}
            mode={mode}
          />
        ) : (
          <AttackCard
            index={config.index}
            title={config.title}
            description={config.description}
            endpoint={config.key}
            totalRequests={config.totalRequests}
            attackParams={config.attackParams}
            vulnNote={config.vulnNote}
            awsNote={config.awsNote}
            mode={mode}
          />
        )}

        <AttackVisualizationPanel />
      </div>
    </ArchitectureVisualizationProvider>
  );
}
