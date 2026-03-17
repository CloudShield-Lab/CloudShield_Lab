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
    <header className="border-b border-slate-800 bg-[#0d1117] relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-r from-red-950/20 via-transparent to-emerald-950/20 pointer-events-none" />

      <div className="relative max-w-6xl mx-auto px-6">
        {/* 상단 로고 + 범례 */}
        <div className="flex items-center justify-between py-4">
          <div>
            <div className="flex items-center gap-3 mb-0.5">
              <div className="flex items-center gap-1">
                <span className="text-emerald-400 font-bold text-lg font-mono">CloudShield</span>
                <span className="text-slate-500 font-bold text-lg font-mono">Lab</span>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] bg-red-950 text-red-400 border border-red-900 font-mono uppercase tracking-widest">
                Attack Simulator
              </span>
            </div>
            <p className="text-slate-500 text-sm">
              동일한 애플리케이션 코드 — 인프라 보호 여부만 다릅니다
            </p>
          </div>

          <div className="hidden md:flex flex-col gap-1.5 text-xs font-mono">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-sm bg-red-900 border border-red-700" />
              <span className="text-slate-500">취약 — No WAF</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-sm bg-emerald-900 border border-emerald-700" />
              <span className="text-slate-500">보안 — AWS WAF + CloudFront</span>
            </div>
          </div>
        </div>

        {/* 탭 네비게이션 */}
        <div className="flex gap-1 -mb-px">
          {tabs.map((tab) => {
            const active = isActive(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  active
                    ? 'border-emerald-500 text-emerald-400'
                    : 'border-transparent text-slate-500 hover:text-slate-300 hover:border-slate-600'
                }`}
              >
                {tab.label}
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono tracking-widest ${
                    active
                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-900'
                      : 'bg-slate-800 text-slate-600 border border-slate-700'
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
