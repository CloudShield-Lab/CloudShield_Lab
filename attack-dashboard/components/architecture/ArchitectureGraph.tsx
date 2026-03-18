'use client';

import 'reactflow/dist/style.css';
import { useMemo } from 'react';
import ReactFlow, {
  Background,
  Edge,
  MarkerType,
  Node,
  Panel,
  useReactFlow,
} from 'reactflow';
import { STAGE_DESCRIPTIONS, STAGE_LABELS } from '@/lib/attack-simulation';
import type {
  ArchitectureEnvironment,
  ArchitectureNodeState,
  ArchitectureStage,
  AttackSimulationEvent,
} from '@/types';
import { ArchitectureNode } from './ArchitectureNode';

const nodeTypes = {
  architectureNode: ArchitectureNode,
};

const positions: Record<ArchitectureStage, { x: number; y: number }> = {
  attacker: { x: 0, y: 8 },
  cloudfront: { x: 250, y: 8 },
  waf: { x: 500, y: 8 },
  alb: { x: 0, y: 0 },
  ecs: { x: 250, y: 140 },
  app: { x: 500, y: 140 },
  s3: { x: 750, y: 140 },
  rds: { x: 0, y: 0 },
  redis: { x: 0, y: 0 },
};

const visibleStages: ArchitectureStage[] = ['attacker', 'cloudfront', 'waf', 'ecs', 'app', 's3'];

const secureEdges: Edge[] = [
  ['attacker', 'cloudfront'],
  ['cloudfront', 'waf'],
  ['waf', 'ecs'],
  ['ecs', 'app'],
  ['app', 's3'],
].map(([source, target]) => ({
  id: `secure-${source}-${target}`,
  source,
  target,
  type: 'smoothstep',
  markerEnd: { type: MarkerType.ArrowClosed, color: '#64748b' },
  style: { stroke: '#94a3b8', strokeWidth: 1.7 },
}));

const vulnerableEdges: Edge[] = [
  ['attacker', 'ecs'],
  ['ecs', 'app'],
  ['app', 's3'],
].map(([source, target]) => ({
  id: `vuln-${source}-${target}`,
  source,
  target,
  type: 'smoothstep',
  markerEnd: { type: MarkerType.ArrowClosed, color: '#64748b' },
  style: { stroke: '#94a3b8', strokeWidth: 1.8 },
}));

const envMeta: Record<ArchitectureEnvironment, { label: string; accent: string; panel: string }> = {
  vulnerable: {
    label: '취약 환경',
    accent: 'text-red-600',
    panel: 'border-red-200 bg-red-50/50',
  },
  secure: {
    label: '보안 환경',
    accent: 'text-emerald-600',
    panel: 'border-emerald-200 bg-emerald-50/50',
  },
};

interface Props {
  env: ArchitectureEnvironment;
  nodes: ArchitectureNodeState[];
  lastEvent?: AttackSimulationEvent;
}

function CompactControls() {
  const { zoomIn, zoomOut, fitView } = useReactFlow();

  return (
    <Panel position="bottom-right" className="!bottom-2 !right-2">
      <div className="flex items-center overflow-hidden rounded-md border border-slate-200 bg-white/95 shadow-[0_2px_12px_rgba(15,23,42,0.1)]">
        <button
          type="button"
          onClick={() => zoomIn()}
          className="h-6 w-6 border-r border-slate-200 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
          title="확대"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => zoomOut()}
          className="h-6 w-6 border-r border-slate-200 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
          title="축소"
        >
          -
        </button>
        <button
          type="button"
          onClick={() => fitView({ padding: 0.18, minZoom: 0.45, maxZoom: 1.1 })}
          className="h-6 w-6 text-[11px] font-bold text-slate-700 transition hover:bg-slate-50"
          title="화면 맞춤"
        >
          □
        </button>
      </div>
    </Panel>
  );
}

export function ArchitectureGraph({ env, nodes, lastEvent }: Props) {
  const graphNodes = useMemo<Node[]>(
    () =>
      nodes
        .filter((node) => visibleStages.includes(node.stage))
        .map((node) => {
          const muted = env === 'vulnerable' && (node.stage === 'cloudfront' || node.stage === 'waf');
          const highlighted =
            (env === 'vulnerable' && node.stage === 's3' && node.status === 'success') ||
            (env === 'secure' && node.stage === 'waf' && node.status === 'blocked');

          return {
            id: node.stage,
            type: 'architectureNode',
            position: positions[node.stage],
            data: {
              label: STAGE_LABELS[node.stage],
              description: STAGE_DESCRIPTIONS[node.stage],
              status: node.status,
              stage: node.stage,
              muted,
              highlighted,
            },
            draggable: false,
            selectable: false,
          };
        }),
    [env, nodes],
  );

  const edges = env === 'vulnerable' ? vulnerableEdges : secureEdges;

  return (
    <section className={`rounded-xl border p-3 ${envMeta[env].panel}`}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className={`text-sm font-semibold ${envMeta[env].accent}`}>{envMeta[env].label}</div>
        <div className="rounded-lg border border-slate-200 bg-white/90 px-2.5 py-1 text-[11px] text-slate-600">
          {lastEvent ? `${lastEvent.timestampLabel} · ${lastEvent.title}` : '이벤트 대기 중'}
        </div>
      </div>

      <div className="h-[268px] overflow-hidden rounded-xl border border-slate-200 bg-[radial-gradient(circle_at_top,_rgba(241,245,249,0.9),_rgba(255,255,255,0.98))]">
        <ReactFlow
          nodes={graphNodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.18, minZoom: 0.45, maxZoom: 1.1 }}
          defaultViewport={{ x: 0, y: 0, zoom: 0.68 }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#dbe3ef" gap={24} />
          <CompactControls />
        </ReactFlow>
      </div>
    </section>
  );
}
