'use client';

import { useEffect, useState } from 'react';
import type { DashboardConfig } from '@/types';

export function EnvironmentStatus() {
  const [config, setConfig] = useState<DashboardConfig | null>(null);

  useEffect(() => {
    fetch('/api/config')
      .then((response) => response.json())
      .then(setConfig)
      .catch(() => {});
  }, []);

  return (
    <div className="border-b border-slate-800 bg-slate-950/80 px-6 py-3">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 text-xs font-mono text-slate-400">
        {config ? (
          <>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
              <span>취약 환경</span>
              <span className="font-semibold text-red-300">{config.vulnerable.url}</span>
              <span className="rounded border border-red-900 bg-red-950/60 px-2 py-0.5 text-red-300">
                LOCAL / NO PROTECTION
              </span>
            </div>

            <span className="text-slate-700">|</span>

            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${config.aws.configured ? 'bg-emerald-500' : 'bg-slate-600'}`} />
              <span>AWS 환경</span>
              {config.aws.configured ? (
                <span className="font-semibold text-emerald-300">{config.aws.url}</span>
              ) : (
                <>
                  <span className="text-slate-500">미설정</span>
                  <span className="rounded border border-slate-700 bg-slate-800 px-2 py-0.5 text-slate-400">
                    .env.local에 AWS_API_URL 추가
                  </span>
                </>
              )}
            </div>
          </>
        ) : (
          <span className="text-slate-500">환경 설정을 불러오는 중입니다...</span>
        )}
      </div>
    </div>
  );
}
