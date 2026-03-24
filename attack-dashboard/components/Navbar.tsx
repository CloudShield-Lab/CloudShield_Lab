'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  {
    href: '/',
    label: '시작 화면',
    badge: 'HOME',
    activeTone: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    badgeTone: 'bg-emerald-100 text-emerald-700',
  },
  {
    href: '/manual',
    label: '수동 배포',
    badge: 'MANUAL',
    activeTone: 'border-sky-200 bg-sky-50 text-sky-800',
    badgeTone: 'bg-sky-100 text-sky-700',
  },
  {
    href: '/auto',
    label: '자동 배포',
    badge: 'AUTO',
    activeTone: 'border-violet-200 bg-violet-50 text-violet-800',
    badgeTone: 'bg-violet-100 text-violet-700',
  },
] as const;

export function Navbar() {
  const pathname = usePathname();

  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  return (
    <header className="relative overflow-hidden border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.08),_transparent_35%),radial-gradient(circle_at_top_right,_rgba(125,211,252,0.12),_transparent_22%),radial-gradient(circle_at_84%_16%,_rgba(168,85,247,0.12),_transparent_30%)]" />

      <div className="relative mx-auto flex max-w-7xl flex-col gap-4 px-6 py-5">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Link href="/" className="font-mono text-[2rem] font-bold leading-none tracking-tight">
                <span className="text-emerald-600">CloudShield</span>
                <span className="text-slate-900"> Lab</span>
              </Link>
              <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.22em] text-slate-700">
                AWS Security Simulator
              </span>
            </div>
            <p className="text-sm leading-6 text-slate-800">
              수동 배포와 자동 배포 환경을 준비한 뒤, 동일한 공격 흐름을 비교하는 실습형 대시보드입니다.
            </p>
          </div>
        </div>

        <div className="-mb-5 flex gap-2">
          {tabs.map((tab) => {
            const active = isActive(tab.href);

            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex items-center gap-2 rounded-t-xl border border-b-0 px-4 py-2.5 text-sm font-medium transition-colors ${
                  active ? tab.activeTone : 'border-transparent text-slate-800 hover:text-slate-950'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] ${
                    active ? tab.badgeTone : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {tab.badge}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </header>
  );
}
