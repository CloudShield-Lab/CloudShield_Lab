'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { attackScenarioConfigs, defaultAttackScenario } from '@/lib/attack-scenarios';

type WorkspaceMode = 'manual' | 'auto';

const workspaceMeta = {
  manual: {
    title: '수동 배포 Workspace',
    description:
      'Infrastructure Guide를 따라 실습용 AWS 환경을 직접 구성하고, 같은 공간에서 공격 시뮬레이션으로 결과를 비교합니다.',
    setupLabel: '수동 환경 구축',
    setupHref: '/manual',
    attackHref: `/manual/attack/${defaultAttackScenario}`,
    accent: 'from-red-50 via-white to-slate-50',
    badge: 'MANUAL',
    setupDescription: 'Infrastructure Guide 기반으로 AWS 환경을 직접 단계별 구성합니다.',
  },
  auto: {
    title: '자동 배포 Workspace',
    description:
      'Terraform 기반 인프라 자동 배포를 실행하고, 이어서 동일한 공격 시나리오를 통해 보호 효과를 비교합니다.',
    setupLabel: '자동 환경 구축',
    setupHref: '/auto',
    attackHref: `/auto/attack/${defaultAttackScenario}`,
    accent: 'from-emerald-50 via-white to-slate-50',
    badge: 'AUTO',
    setupDescription: 'Terraform으로 실습용 AWS 환경을 자동 배포하거나 삭제합니다.',
  },
} as const;

export function WorkspaceShell({
  mode,
  children,
}: {
  mode: WorkspaceMode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const meta = workspaceMeta[mode];
  const rootPath = `/${mode}`;
  const attackRoot = `${rootPath}/attack`;
  const isAttackPage = pathname.startsWith(attackRoot);
  const setupActive = pathname.startsWith(rootPath) && !isAttackPage;

  return (
    <div className="w-full py-6 pr-4 sm:pr-6 lg:pr-8">
      <div className="grid gap-5 lg:grid-cols-[252px_minmax(0,1fr)] lg:items-start">
        <aside className="lg:sticky lg:top-6">
          <div className="rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
            <div className="space-y-2">
              <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                Workspace
              </div>
              <Link
                href={meta.setupHref}
                className={`block rounded-xl border px-4 py-3 transition-colors ${
                  setupActive
                    ? 'border-slate-300 bg-slate-50 text-slate-900'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'
                }`}
              >
                <div className="text-[13px] font-medium">{meta.setupLabel}</div>
                <div className="mt-1 text-[11px] text-slate-500">{meta.setupDescription}</div>
              </Link>
            </div>

            <div className="mt-6 space-y-2">
              <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                Attack Simulator
              </div>
              {attackScenarioConfigs.map((scenario) => {
                const href = `${attackRoot}/${scenario.key}`;
                const active = pathname === href;

                return (
                  <Link
                    key={scenario.key}
                    href={href}
                    className={`block rounded-xl border px-4 py-3 transition-colors ${
                      active
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-slate-50 font-mono text-[11px] text-slate-500">
                        {scenario.index}
                      </span>
                      <span className="text-[13px] font-medium">{scenario.shortTitle}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </aside>

        <section className={`overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br ${meta.accent} shadow-[0_18px_50px_rgba(15,23,42,0.06)]`}>
          <div className="border-b border-slate-200 px-6 py-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1 font-mono text-[11px] tracking-[0.22em] text-slate-600">
                    {meta.badge}
                  </span>
                  <Link href="/" className="text-sm text-slate-500 transition-colors hover:text-slate-700">
                    시작 화면으로 돌아가기
                  </Link>
                </div>
                <div>
                  <h1 className="text-2xl font-semibold text-slate-900">{meta.title}</h1>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">{meta.description}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Link
                  href={meta.setupHref}
                  className={`rounded-xl border px-4 py-2 text-sm transition-colors ${
                    setupActive
                      ? 'border-slate-300 bg-white text-slate-900'
                      : 'border-slate-200 bg-white/80 text-slate-600 hover:border-slate-300 hover:text-slate-900'
                  }`}
                >
                  {meta.setupLabel}
                </Link>
                <Link
                  href={meta.attackHref}
                  className={`rounded-xl border px-4 py-2 text-sm transition-colors ${
                    isAttackPage
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 bg-white/80 text-slate-600 hover:border-slate-300 hover:text-slate-900'
                  }`}
                >
                  Attack Simulator
                </Link>
              </div>
            </div>
          </div>

          <div className="p-4 lg:p-6">{children}</div>
        </section>
      </div>
    </div>
  );
}
