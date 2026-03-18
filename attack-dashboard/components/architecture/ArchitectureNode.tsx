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
  idle: 'border-slate-600 bg-slate-900/95 text-slate-200',
  reached: 'border-sky-500 bg-sky-950/70 text-sky-100 shadow-[0_0_0_1px_rgba(56,189,248,0.24)]',
  passed: 'border-amber-500 bg-amber-950/75 text-amber-100 shadow-[0_0_0_1px_rgba(251,191,36,0.24)]',
  blocked: 'border-emerald-300 bg-emerald-900/90 text-emerald-50 shadow-[0_0_36px_rgba(52,211,153,0.65)]',
  failed: 'border-rose-500 bg-rose-950/75 text-rose-100 shadow-[0_0_0_1px_rgba(251,113,133,0.24)]',
  success: 'border-fuchsia-300 bg-fuchsia-900/90 text-fuchsia-50 shadow-[0_0_38px_rgba(232,121,249,0.7)]',
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
  const highlightedClass = data.highlighted ? 'scale-[1.03] ring-2 ring-white/20 ring-offset-1 ring-offset-slate-950' : '';
  const titleClass =
    data.status === 'blocked'
      ? 'text-emerald-50'
      : data.status === 'success'
        ? 'text-fuchsia-50'
        : 'text-white';
  const badgeClass =
    data.status === 'blocked'
      ? 'border-emerald-200/50 bg-emerald-200/15 text-emerald-50'
      : data.status === 'success'
        ? 'border-fuchsia-200/50 bg-fuchsia-200/15 text-fuchsia-50'
        : 'border-current/30 bg-black/20 text-white';

  return (
    <div
      className={`min-w-[172px] rounded-xl border px-4 py-3 transition-all ${statusClasses[data.status]} ${mutedClass} ${highlightedClass}`}
    >
      <Handle
        position={Position.Left}
        type="target"
        className="!h-2.5 !w-2.5 !border-2 !border-slate-950 !bg-slate-300"
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
      <div className="text-[11px] text-slate-400">{data.description}</div>
      <Handle
        position={Position.Right}
        type="source"
        className="!h-2.5 !w-2.5 !border-2 !border-slate-950 !bg-slate-300"
      />
    </div>
  );
}
