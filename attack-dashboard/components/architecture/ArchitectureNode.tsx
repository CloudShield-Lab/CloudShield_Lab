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

const stageAccent: Record<ArchitectureStage, 'neutral' | 'sky' | 'violet' | 'emerald'> = {
  attacker: 'sky',
  cloudfront: 'violet',
  waf: 'emerald',
  alb: 'neutral',
  ecs: 'sky',
  app: 'violet',
  s3: 'emerald',
  rds: 'neutral',
  redis: 'neutral',
};

const containerClasses = {
  idle:
    'border-slate-400 bg-[linear-gradient(180deg,rgba(255,255,255,1),rgba(248,250,252,0.98))] shadow-[0_12px_28px_rgba(148,163,184,0.14)]',
  neutral:
    'border-slate-400 bg-[linear-gradient(180deg,rgba(255,255,255,1),rgba(248,250,252,0.98))] shadow-[0_12px_28px_rgba(148,163,184,0.14)]',
  sky:
    'border-sky-400 bg-[linear-gradient(180deg,rgba(240,249,255,1),rgba(224,242,254,0.92))] shadow-[0_0_0_1px_rgba(56,189,248,0.18),0_14px_28px_rgba(125,211,252,0.2)]',
  violet:
    'border-violet-400 bg-[linear-gradient(180deg,rgba(245,243,255,1),rgba(237,233,254,0.92))] shadow-[0_0_0_1px_rgba(167,139,250,0.18),0_14px_28px_rgba(196,181,253,0.2)]',
  emerald:
    'border-emerald-400 bg-[linear-gradient(180deg,rgba(236,253,245,1),rgba(209,250,229,0.92))] shadow-[0_0_0_1px_rgba(16,185,129,0.18),0_14px_28px_rgba(110,231,183,0.18)]',
} as const;

const badgeClasses = {
  idle: 'border-slate-300 bg-white/90 text-slate-700',
  neutral: 'border-slate-300 bg-white/90 text-slate-700',
  sky: 'border-sky-300 bg-white/90 text-sky-800',
  violet: 'border-violet-300 bg-white/90 text-violet-800',
  emerald: 'border-emerald-300 bg-white/90 text-emerald-800',
} as const;

const handleClasses = {
  idle: '!bg-slate-500',
  neutral: '!bg-slate-500',
  sky: '!bg-sky-500',
  violet: '!bg-violet-500',
  emerald: '!bg-emerald-500',
} as const;

const iconClasses = {
  idle: 'text-slate-700',
  neutral: 'text-slate-700',
  sky: 'text-sky-700',
  violet: 'text-violet-700',
  emerald: 'text-emerald-700',
} as const;

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
  const mutedClass = data.muted ? 'opacity-45 grayscale' : '';
  const highlightedClass = data.highlighted ? 'scale-[1.03] ring-2 ring-slate-200 ring-offset-1 ring-offset-white' : '';
  const accent = data.status === 'idle' ? 'idle' : stageAccent[data.stage];

  return (
    <div
      className={`min-w-[188px] rounded-xl border-2 px-[18px] py-3.5 transition-all ${containerClasses[accent]} ${mutedClass} ${highlightedClass}`}
    >
      <Handle
        position={Position.Left}
        type="target"
        className={`!h-2.5 !w-2.5 !border-2 !border-white ${handleClasses[accent]}`}
      />
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 opacity-95 ${iconClasses[accent]}`} />
          <span className="text-[15px] font-bold tracking-[0.01em] text-slate-950">{data.label}</span>
        </div>
        <span className={`rounded-full border px-2.5 py-0.5 font-mono text-[11px] font-bold uppercase tracking-[0.14em] shadow-sm ${badgeClasses[accent]}`}>
          {data.status}
        </span>
      </div>
      <div className="text-[11.5px] leading-5 text-slate-600">{data.description}</div>
      <Handle
        position={Position.Right}
        type="source"
        className={`!h-2.5 !w-2.5 !border-2 !border-white ${handleClasses[accent]}`}
      />
    </div>
  );
}
