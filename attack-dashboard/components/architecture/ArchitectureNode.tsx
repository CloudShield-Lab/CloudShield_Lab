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
  idle: 'border-slate-300 bg-white text-slate-800 shadow-[0_8px_18px_rgba(148,163,184,0.12)]',
  reached: 'border-sky-400 bg-sky-50 text-sky-800 shadow-[0_0_0_1px_rgba(56,189,248,0.18),0_10px_20px_rgba(125,211,252,0.16)]',
  passed: 'border-violet-400 bg-violet-50 text-violet-800 shadow-[0_0_0_1px_rgba(167,139,250,0.18),0_10px_20px_rgba(196,181,253,0.16)]',
  blocked: 'border-emerald-400 bg-emerald-100 text-emerald-900 shadow-[0_0_0_1px_rgba(16,185,129,0.2),0_12px_24px_rgba(16,185,129,0.16)]',
  failed: 'border-rose-400 bg-rose-50 text-rose-800 shadow-[0_0_0_1px_rgba(251,113,133,0.18),0_10px_20px_rgba(253,164,175,0.14)]',
  success: 'border-fuchsia-400 bg-fuchsia-100 text-fuchsia-900 shadow-[0_0_0_1px_rgba(217,70,239,0.2),0_12px_24px_rgba(232,121,249,0.16)]',
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

const statusLabel: Record<NodeStatus, string> = {
  idle: 'idle',
  reached: 'reached',
  passed: 'passed',
  blocked: 'blocked',
  failed: 'failed',
  success: 'success',
};

export function ArchitectureNode({ data }: NodeProps<ArchitectureNodeData>) {
  const Icon = icons[data.stage];
  const mutedClass = data.muted ? 'opacity-45 grayscale saturate-0' : '';
  const highlightedClass = data.highlighted ? 'scale-[1.03] ring-2 ring-slate-200 ring-offset-2 ring-offset-white' : '';
  const titleClass =
    data.status === 'blocked'
      ? 'text-emerald-900'
      : data.status === 'success'
        ? 'text-fuchsia-900'
        : 'text-slate-950';
  const badgeClass =
    data.status === 'blocked'
      ? 'border-emerald-300 bg-white/90 text-emerald-800'
      : data.status === 'success'
        ? 'border-fuchsia-300 bg-white/90 text-fuchsia-800'
        : 'border-slate-300 bg-white/90 text-slate-700';

  return (
    <div
      className={`w-[132px] rounded-[18px] border-[1.5px] px-3 py-3 transition-all ${statusClasses[data.status]} ${mutedClass} ${highlightedClass}`}
    >
      <Handle
        position={Position.Left}
        type="target"
        className="!h-2.5 !w-2.5 !border-2 !border-white !bg-slate-500"
      />
      <div className="flex flex-col items-center text-center">
        <div className="mb-2.5 flex h-9 w-9 items-center justify-center rounded-xl border border-white/80 bg-white/80 shadow-sm">
          <Icon className="h-4.5 w-4.5 opacity-95" />
        </div>
        <span className={`text-[13px] font-semibold leading-4 ${titleClass}`}>{data.label}</span>
        <span className={`mt-2 rounded-full border px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.12em] shadow-sm ${badgeClass}`}>
          {statusLabel[data.status]}
        </span>
      </div>
      <Handle
        position={Position.Right}
        type="source"
        className="!h-2.5 !w-2.5 !border-2 !border-white !bg-slate-500"
      />
    </div>
  );
}
