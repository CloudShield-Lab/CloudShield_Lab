'use client';

import type { NodeProps } from 'reactflow';
import { Handle, Position } from 'reactflow';
import {
  Activity,
  Cpu,
  Database,
  Globe,
  HardDrive,
  Server,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import type { ArchitectureStage, NodeStatus } from '@/types';

type ArchitectureNodeData = {
  label: string;
  description: string;
  status: NodeStatus;
  stage: ArchitectureStage;
  muted?: boolean;
  highlighted?: boolean;
};

const statusClasses: Record<NodeStatus, string> = {
  idle: 'border-slate-200 bg-white text-slate-700',
  reached: 'border-sky-300 bg-sky-50 text-sky-700 shadow-[0_0_0_1px_rgba(56,189,248,0.14)]',
  passed: 'border-amber-300 bg-amber-50 text-amber-700 shadow-[0_0_0_1px_rgba(251,191,36,0.14)]',
  blocked: 'border-emerald-300 bg-emerald-100 text-emerald-800 shadow-[0_0_24px_rgba(16,185,129,0.18)]',
  failed: 'border-rose-300 bg-rose-50 text-rose-700 shadow-[0_0_0_1px_rgba(251,113,133,0.14)]',
  success: 'border-fuchsia-300 bg-fuchsia-100 text-fuchsia-800 shadow-[0_0_24px_rgba(232,121,249,0.18)]',
};

const icons: Record<ArchitectureStage, typeof Globe> = {
  attacker: ShieldAlert,
  cloudfront: Globe,
  waf: ShieldCheck,
  alb: Activity,
  ecs: Server,
  app: Cpu,
  s3: HardDrive,
  rds: Database,
  redis: Database,
};

export function ArchitectureNode({ data }: NodeProps<ArchitectureNodeData>) {
  const Icon = icons[data.stage];
  const mutedClass = data.muted ? 'opacity-45 grayscale' : '';
  const highlightedClass = data.highlighted ? 'scale-[1.03] ring-2 ring-slate-200 ring-offset-1 ring-offset-white' : '';
  const titleClass =
    data.status === 'blocked'
      ? 'text-emerald-800'
      : data.status === 'success'
        ? 'text-fuchsia-800'
        : 'text-slate-900';
  const badgeClass =
    data.status === 'blocked'
      ? 'border-emerald-300 bg-white/70 text-emerald-700'
      : data.status === 'success'
        ? 'border-fuchsia-300 bg-white/70 text-fuchsia-700'
        : 'border-slate-200 bg-white/70 text-slate-600';

  return (
    <div
      className={`min-w-[172px] rounded-xl border px-4 py-3 transition-all ${statusClasses[data.status]} ${mutedClass} ${highlightedClass}`}
    >
      <Handle
        position={Position.Left}
        type="target"
        className="!h-2.5 !w-2.5 !border-2 !border-white !bg-slate-400"
      />
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 opacity-95" />
          <span className={`text-[15px] font-semibold tracking-[0.01em] ${titleClass}`}>{data.label}</span>
        </div>
        <span className={`rounded-full border px-2.5 py-0.5 font-mono text-[11px] font-bold uppercase tracking-[0.14em] ${badgeClass}`}>
          {data.status}
        </span>
      </div>
      <div className="text-[11px] text-slate-500">{data.description}</div>
      <Handle
        position={Position.Right}
        type="source"
        className="!h-2.5 !w-2.5 !border-2 !border-white !bg-slate-400"
      />
    </div>
  );
}
