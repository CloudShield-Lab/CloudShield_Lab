'use client';

import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { STAGES } from '@/lib/attack-simulation';
import type { ArchitectureEnvironment, ArchitectureNodeState } from '@/types';

const scoreByStatus = {
  idle: 0,
  reached: 1,
  passed: 2,
  blocked: 2,
  failed: 1,
  success: 3,
};

interface Props {
  nodeStates: Record<ArchitectureEnvironment, ArchitectureNodeState[]>;
}

export function AttackPathChart({ nodeStates }: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const data = STAGES.filter((stage) => stage !== 'attacker').map((stage) => ({
    stage: stage.toUpperCase(),
    vulnerable:
      scoreByStatus[nodeStates.vulnerable.find((node) => node.stage === stage)?.status ?? 'idle'],
    secure:
      scoreByStatus[nodeStates.secure.find((node) => node.stage === stage)?.status ?? 'idle'],
  }));

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-slate-100">Stage 도달 비교</h2>
        <p className="text-sm text-slate-500">
          값이 높을수록 더 깊은 계층까지 도달했거나 최종 영향이 발생했음을 의미합니다.
        </p>
      </div>

      <div className="h-[300px]">
        {mounted ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} barGap={8}>
              <CartesianGrid stroke="#1e293b" vertical={false} />
              <XAxis dataKey="stage" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} width={26} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#020617',
                  border: '1px solid #1e293b',
                  borderRadius: 12,
                  color: '#e2e8f0',
                }}
              />
              <Bar dataKey="vulnerable" fill="#f87171" radius={[6, 6, 0, 0]} />
              <Bar dataKey="secure" fill="#34d399" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-800 text-sm text-slate-500">
            차트 초기화 중입니다.
          </div>
        )}
      </div>
    </section>
  );
}
