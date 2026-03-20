'use client';

import { useEffect, useState } from 'react';
import type { SessionMeta, WorkspaceMode } from '@/types';

const SCENARIO_ICONS: Record<string, string> = {
  bruteforce: '🔓',
  's3-access': '🪣',
  ratelimit: '📊',
  'header-scan': '🔍',
  'sqli-xss': '🧪',
  'bot-scan': '🤖',
};

const SCENARIO_LABELS: Record<string, string> = {
  bruteforce: '브루트포스',
  's3-access': 'S3 탈취',
  ratelimit: 'Rate Limit',
  'header-scan': '헤더 스캔',
  'sqli-xss': 'SQLi / XSS',
  'bot-scan': '봇 스캔',
};

interface Props {
  mode: WorkspaceMode;
  selectedId: string | null;
  onSelect: (meta: SessionMeta) => void;
}

export function SessionList({ mode, selectedId, onSelect }: Props) {
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/analysis/sessions?mode=${mode}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: SessionMeta[]) => {
        setSessions(data);
        setLoading(false);
      })
      .catch((e: Error) => {
        setError(e.message);
        setLoading(false);
      });
  }, [mode]);

  if (loading) {
    return (
      <div className="flex flex-col gap-2 p-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-center text-xs text-slate-400">
        <p>세션을 불러올 수 없습니다</p>
        <p className="mt-1 font-mono text-slate-300">{error}</p>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="p-6 text-center text-xs text-slate-400">
        <p className="text-2xl">📭</p>
        <p className="mt-2">저장된 세션이 없습니다</p>
        <p className="mt-1 text-slate-300">공격 시나리오를 실행하면 자동으로 저장됩니다</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 p-3">
      {sessions.map((meta) => {
        const icon = SCENARIO_ICONS[meta.scenario] ?? '⚔️';
        const label = SCENARIO_LABELS[meta.scenario] ?? meta.scenario;
        const date = new Date(meta.timestamp);
        const dateStr = date.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' });
        const timeStr = date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
        const isSelected = meta.sessionId === selectedId;

        return (
          <button
            key={meta.sessionId}
            onClick={() => onSelect(meta)}
            className={`w-full rounded-xl border px-3 py-2.5 text-left transition-colors ${
              isSelected
                ? 'border-violet-300 bg-violet-50'
                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-base">{icon}</span>
              <div className="min-w-0 flex-1">
                <div className={`truncate text-xs font-medium ${isSelected ? 'text-violet-800' : 'text-slate-800'}`}>
                  {label}
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] text-slate-400">
                  <span>{dateStr}</span>
                  <span>·</span>
                  <span>{timeStr}</span>
                </div>
              </div>
              <span className={`flex-shrink-0 rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase ${
                meta.mode === 'auto'
                  ? 'border-violet-200 bg-violet-50 text-violet-600'
                  : 'border-sky-200 bg-sky-50 text-sky-600'
              }`}>
                {meta.mode}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
