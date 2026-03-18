'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  { href: '/', label: '시작 화면', badge: 'HOME' },
  { href: '/manual', label: '수동 배포', badge: 'MANUAL' },
  { href: '/auto', label: '자동 배포', badge: 'AUTO' },
];

export function Navbar() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <header className="relative overflow-hidden border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(248,113,113,0.12),_transparent_35%),radial-gradient(circle_at_top_right,_rgba(16,185,129,0.1),_transparent_32%)]" />

      <div className="relative mx-auto flex max-w-7xl flex-col gap-4 px-6 py-5">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Link href="/" className="font-mono text-[2rem] font-bold leading-none tracking-tight">
                <span className="text-emerald-600">CloudShield</span>
                <span className="text-slate-500"> Lab</span>
              </Link>
              <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.22em] text-slate-600">
                AWS Security Simulator
              </span>
            </div>
            <p className="text-sm text-slate-500">
              수동 배포와 자동 배포 환경을 준비한 뒤 동일한 공격 흐름을 비교하는 실습형 대시보드
            </p>
          </div>
        </div>

        <div className="flex gap-2 -mb-5">
          {tabs.map((tab) => {
            const active = isActive(tab.href);

            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex items-center gap-2 rounded-t-xl border border-b-0 px-4 py-2.5 text-sm transition-colors ${
                  active
                    ? 'border-slate-200 bg-slate-50 text-slate-900'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <span className={active ? 'text-emerald-600' : ''}>{tab.label}</span>
                <span
                  className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] ${
                    active
                      ? tab.badge === 'AUTO'
                        ? 'bg-emerald-100 text-emerald-700'
                        : tab.badge === 'MANUAL'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-slate-100 text-slate-600'
                      : 'bg-slate-100 text-slate-500'
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
