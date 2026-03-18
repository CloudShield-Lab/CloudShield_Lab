'use client';

import 'reactflow/dist/style.css';
import { useMemo } from 'react';
import ReactFlow, { Background, Edge, MarkerType, Node, Panel, useReactFlow } from 'reactflow';
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
  markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' },
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
  markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' },
  style: { stroke: '#94a3b8', strokeWidth: 1.8 },
}));

const envMeta: Record<ArchitectureEnvironment, { label: string; accent: string; panel: string }> = {
  vulnerable: {
    label: '취약 환경',
    accent: 'text-red-600',
    panel: 'border-red-200 bg-red-50/40',
  },
  secure: {
    label: '보안 환경',
    accent: 'text-emerald-600',
    panel: 'border-emerald-200 bg-emerald-50/40',
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
    <Panel position="bottom-right" className="!bottom-3 !right-3">
      <div className="flex items-center overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_8px_20px_rgba(15,23,42,0.08)]">
        <button
          type="button"
          onClick={() => zoomIn()}
          className="h-8 w-8 border-r border-slate-200 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
          title="확대"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => zoomOut()}
          className="h-8 w-8 border-r border-slate-200 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
          title="축소"
        >
          -
        </button>
        <button
          type="button"
          onClick={() => fitView({ padding: 0.16, minZoom: 0.45, maxZoom: 1.1 })}
          className="h-8 w-8 text-[11px] font-bold text-slate-700 transition hover:bg-slate-50"
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
    [env, nodes]
  );

  const edges = env === 'vulnerable' ? vulnerableEdges : secureEdges;

  return (
    <section className={`rounded-2xl border p-4 ${envMeta[env].panel}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className={`text-2xl font-semibold ${envMeta[env].accent}`}>{envMeta[env].label}</div>
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-500 shadow-sm">
          {lastEvent ? `${lastEvent.timestampLabel} · ${lastEvent.title}` : '이벤트 대기 중'}
        </div>
      </div>

      <div className="h-[330px] overflow-hidden rounded-2xl border border-slate-200 bg-[radial-gradient(circle_at_top,_rgba(248,250,252,0.98),_rgba(255,255,255,1))]">
        <ReactFlow
          nodes={graphNodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.16, minZoom: 0.45, maxZoom: 1.1 }}
          defaultViewport={{ x: 0, y: 0, zoom: 0.7 }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#e5edf6" gap={24} />
          <CompactControls />
        </ReactFlow>
      </div>
    </section>
  );
}
