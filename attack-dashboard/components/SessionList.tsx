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
  onDeleted?: (deletedIds: string[]) => void;
}

export function SessionList({ mode, selectedId, onSelect, onDeleted }: Props) {
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setEditMode(false);
    setCheckedIds(new Set());
    fetch(`/api/analysis/sessions?mode=${mode}`, { cache: 'no-store' })
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

  const toggleCheck = (id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (checkedIds.size === sessions.length) {
      setCheckedIds(new Set());
    } else {
      setCheckedIds(new Set(sessions.map((s) => s.sessionId)));
    }
  };

  const handleDelete = async (idsToDelete: string[]) => {
    if (idsToDelete.length === 0) return;
    setDeleting(true);
    const keysToDelete = sessions
      .filter((s) => idsToDelete.includes(s.sessionId))
      .map((s) => s.s3Key);

    try {
      await fetch('/api/analysis/sessions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys: keysToDelete }),
      });
      setSessions((prev) => prev.filter((s) => !idsToDelete.includes(s.sessionId)));
      setCheckedIds(new Set());
      setEditMode(false);
      onDeleted?.(idsToDelete);
    } catch {
      // silently ignore
    } finally {
      setDeleting(false);
    }
  };

  // ── Header ──────────────────────────────────────────
  const header = (
    <div className="border-b border-slate-200 px-4 py-3">
      {editMode ? (
        <div className="flex items-center justify-between gap-2">
          <label className="flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              checked={checkedIds.size === sessions.length && sessions.length > 0}
              onChange={toggleAll}
              className="h-3.5 w-3.5 rounded border-slate-300 accent-violet-600"
            />
            <span className="text-xs text-slate-500">
              {checkedIds.size > 0 ? `${checkedIds.size}개 선택` : '전체 선택'}
            </span>
          </label>
          <div className="flex items-center gap-1.5">
            {checkedIds.size > 0 && (
              <button
                onClick={() => handleDelete([...checkedIds])}
                disabled={deleting}
                className="rounded-md border border-red-300 bg-red-50 px-2 py-1 text-[10px] font-medium text-red-600 transition-colors hover:bg-red-100 disabled:opacity-50"
              >
                {deleting ? '삭제 중…' : `${checkedIds.size}개 삭제`}
              </button>
            )}
            <button
              onClick={() => { setEditMode(false); setCheckedIds(new Set()); }}
              className="rounded-md border border-slate-200 px-2 py-1 text-[10px] text-slate-500 transition-colors hover:bg-slate-50"
            >
              취소
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">저장된 세션</div>
          {sessions.length > 0 && (
            <button
              onClick={() => setEditMode(true)}
              className="rounded-md border border-slate-200 px-2 py-1 text-[10px] text-slate-400 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-500"
            >
              편집
            </button>
          )}
        </div>
      )}
    </div>
  );

  if (loading) {
    return (
      <>
        {header}
        <div className="flex flex-col gap-2 p-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        {header}
        <div className="p-4 text-center text-xs text-slate-400">
          <p>세션을 불러올 수 없습니다</p>
          <p className="mt-1 font-mono text-slate-300">{error}</p>
        </div>
      </>
    );
  }

  if (sessions.length === 0) {
    return (
      <>
        {header}
        <div className="p-6 text-center text-xs text-slate-400">
          <p className="text-2xl">📭</p>
          <p className="mt-2">저장된 세션이 없습니다</p>
          <p className="mt-1 text-slate-300">공격 시나리오를 실행하면 자동으로 저장됩니다</p>
        </div>
      </>
    );
  }

  return (
    <>
      {header}
      <div className="flex flex-col gap-1.5 p-3">
        {sessions.map((meta) => {
          const icon = SCENARIO_ICONS[meta.scenario] ?? '⚔️';
          const label = SCENARIO_LABELS[meta.scenario] ?? meta.scenario;
          const date = new Date(meta.timestamp);
          const dateStr = date.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' });
          const timeStr = date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
          const isSelected = meta.sessionId === selectedId;
          const isChecked = checkedIds.has(meta.sessionId);

          return (
            <div key={meta.sessionId} className="flex items-center gap-1.5">
              {editMode && (
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggleCheck(meta.sessionId)}
                  className="h-3.5 w-3.5 flex-shrink-0 rounded border-slate-300 accent-violet-600"
                />
              )}
              <button
                onClick={() => editMode ? toggleCheck(meta.sessionId) : onSelect(meta)}
                className={`min-w-0 flex-1 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                  isSelected && !editMode
                    ? 'border-violet-300 bg-violet-50'
                    : isChecked
                    ? 'border-red-200 bg-red-50'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-base">{icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className={`truncate text-xs font-medium ${
                      isSelected && !editMode ? 'text-violet-800' : 'text-slate-800'
                    }`}>
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
            </div>
          );
        })}

        {/* 전체 삭제 버튼 (편집 모드 아닐 때도 하단에 항상 표시) */}
        {!editMode && sessions.length > 0 && (
          <button
            onClick={() => {
              if (confirm(`전체 ${sessions.length}개 세션을 삭제하시겠습니까?`)) {
                void handleDelete(sessions.map((s) => s.sessionId));
              }
            }}
            disabled={deleting}
            className="mt-1 w-full rounded-lg border border-slate-200 py-1.5 text-[10px] text-slate-400 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
          >
            {deleting ? '삭제 중…' : '전체 삭제'}
          </button>
        )}
      </div>
    </>
  );
}
