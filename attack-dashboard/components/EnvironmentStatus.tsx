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

  const isAuto = pathname.startsWith('/auto/') || pathname === '/auto';
  const vulnConfig = isAuto ? config?.autoVulnerable : config?.vulnerable;
  const secureConfig = isAuto ? config?.autoAws : config?.aws;

  return (
    <div className="border-b border-slate-200 bg-white/90 px-6 py-3">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 text-xs font-mono text-slate-600">
        {config ? (
          <>
            <div className="flex items-center gap-2">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  vulnConfig?.configured ? 'bg-red-500' : 'bg-slate-400'
                }`}
              />
              <span>취약 환경</span>
              {vulnConfig?.configured ? (
                <span className="font-semibold text-red-600">{vulnConfig.url}</span>
              ) : (
                <>
                  <span className="text-slate-500">미설정</span>
                  {isAuto && (
                    <span className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-600">
                      자동 배포 필요
                    </span>
                  )}
                </>
              )}
              {vulnConfig?.configured && (
                <span className="rounded border border-red-200 bg-red-50 px-2 py-0.5 text-red-600">
                  {isAuto ? 'AUTO / NO PROTECTION' : 'MANUAL / NO PROTECTION'}
                </span>
              )}
            </div>

            <span className="text-slate-300">|</span>

            <div className="flex items-center gap-2">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  secureConfig?.configured ? 'bg-emerald-500' : 'bg-slate-400'
                }`}
              />
              <span>보안 환경</span>
              {secureConfig?.configured ? (
                <>
                  <span className="font-semibold text-emerald-600">{secureConfig.url}</span>
                  <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-600">
                    WAF + CloudFront
                  </span>
                </>
              ) : (
                <>
                  <span className="text-slate-500">미설정</span>
                  {isAuto ? (
                    <span className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-600">
                      자동 배포 필요
                    </span>
                  ) : (
                    <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-500">
                      .env.local에 AWS_API_URL 추가 필요
                    </span>
                  )}
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
