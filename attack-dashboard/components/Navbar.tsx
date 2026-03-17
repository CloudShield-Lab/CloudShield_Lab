'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  { href: '/', label: 'Attack Simulator', badge: 'LIVE' },
  { href: '/guide', label: 'Infrastructure Guide', badge: 'GUIDE' },
];

export function Navbar() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <header className="relative overflow-hidden border-b border-slate-800 bg-[#0d1117]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(248,113,113,0.14),_transparent_38%),radial-gradient(circle_at_top_right,_rgba(16,185,129,0.12),_transparent_34%)]" />

      <div className="relative mx-auto flex max-w-7xl flex-col gap-4 px-6 py-5">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="font-mono text-[2rem] font-bold leading-none tracking-tight">
                <span className="text-emerald-400">CloudShield</span>
                <span className="text-slate-500"> Lab</span>
              </div>
              <span className="rounded-md border border-red-900 bg-red-950/70 px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.22em] text-red-300">
                Attack Simulator
              </span>
            </div>
            <p className="text-sm text-slate-500">
              동일한 애플리케이션 코드, 인프라 보호 여부만 다른 환경
            </p>
          </div>

          <div className="grid gap-2 sm:min-w-[300px]">
            <div className="flex items-center gap-3 rounded-xl border border-red-900/50 bg-gradient-to-r from-red-950/40 to-transparent px-3 py-2">
              <span className="h-3 w-3 rounded-[4px] border border-red-700 bg-red-600/80" />
              <div className="text-xs leading-tight">
                <div className="font-mono text-red-300">취약 환경</div>
                <div className="text-slate-500">No WAF</div>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-emerald-900/50 bg-gradient-to-r from-emerald-950/35 to-transparent px-3 py-2">
              <span className="h-3 w-3 rounded-[4px] border border-emerald-700 bg-emerald-600/80" />
              <div className="text-xs leading-tight">
                <div className="font-mono text-emerald-300">보안 환경</div>
                <div className="text-slate-500">AWS WAF + CloudFront</div>
              </div>
            </div>
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
                    ? 'border-slate-700 bg-slate-950 text-slate-100'
                    : 'border-transparent text-slate-500 hover:text-slate-300'
                }`}
              >
                <span className={active ? 'text-emerald-300' : ''}>{tab.label}</span>
                <span
                  className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] ${
                    active
                      ? tab.badge === 'LIVE'
                        ? 'bg-emerald-950/80 text-emerald-300'
                        : 'bg-slate-800 text-slate-400'
                      : 'bg-slate-800 text-slate-500'
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
