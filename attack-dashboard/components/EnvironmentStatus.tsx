'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import type { DashboardConfig } from '@/types';

export function EnvironmentStatus() {
  const pathname = usePathname();
  const [config, setConfig] = useState<DashboardConfig | null>(null);

  useEffect(() => {
    if (pathname === '/') return;

    fetch('/api/config')
      .then((response) => response.json())
      .then(setConfig)
      .catch(() => {});
  }, [pathname]);

  if (pathname === '/') {
    return null;
  }

  return (
    <div className="border-b border-slate-200 bg-white/90 px-6 py-3">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 text-xs font-mono text-slate-600">
        {config ? (
          <>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
              <span>취약 환경</span>
              <span className="font-semibold text-red-600">{config.vulnerable.url}</span>
              <span className="rounded border border-red-200 bg-red-50 px-2 py-0.5 text-red-600">
                LOCAL / NO PROTECTION
              </span>
            </div>

            <span className="text-slate-300">|</span>

            <div className="flex items-center gap-2">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  config.aws.configured ? 'bg-emerald-500' : 'bg-slate-400'
                }`}
              />
              <span>AWS 환경</span>
              {config.aws.configured ? (
                <span className="font-semibold text-emerald-600">{config.aws.url}</span>
              ) : (
                <>
                  <span className="text-slate-500">미설정</span>
                  <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-500">
                    .env.local에 AWS_API_URL 추가 필요
                  </span>
                </>
              )}
            </div>
          </>
        ) : (
          <span className="text-slate-500">환경 설정 정보를 불러오는 중입니다...</span>
        )}
      </div>
    </div>
  );
}
