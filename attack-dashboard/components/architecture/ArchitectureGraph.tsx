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
  attacker: { x: 0, y: 12 },
  cloudfront: { x: 220, y: 12 },
  waf: { x: 440, y: 12 },
  alb: { x: 0, y: 0 },
  ecs: { x: 220, y: 126 },
  app: { x: 440, y: 126 },
  s3: { x: 660, y: 126 },
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
  style: { stroke: '#64748b', strokeWidth: 2.1 },
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
  style: { stroke: '#64748b', strokeWidth: 2.1 },
}));

const envMeta: Record<ArchitectureEnvironment, { label: string; accent: string; panel: string }> = {
  vulnerable: {
    label: '취약 환경',
    accent: 'text-red-600',
    panel: 'border-red-200 bg-[linear-gradient(180deg,rgba(254,242,242,0.86),rgba(255,255,255,0.96))]',
  },
  secure: {
    label: '보안 환경',
    accent: 'text-emerald-700',
    panel: 'border-emerald-200 bg-[linear-gradient(180deg,rgba(236,253,245,0.86),rgba(255,255,255,0.96))]',
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
      <div className="flex items-center overflow-hidden rounded-lg border border-slate-300 bg-white/95 shadow-[0_10px_24px_rgba(15,23,42,0.08)] backdrop-blur">
        <button
          type="button"
          onClick={() => zoomIn()}
          className="h-8 w-8 border-r border-slate-300 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
          title="확대"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => zoomOut()}
          className="h-8 w-8 border-r border-slate-300 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
          title="축소"
        >
          -
        </button>
        <button
          type="button"
          onClick={() => fitView({ padding: 0.08, minZoom: 0.55, maxZoom: 1.18 })}
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
    <section className={`rounded-2xl border p-4 shadow-[0_14px_34px_rgba(15,23,42,0.05)] ${envMeta[env].panel}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className={`text-2xl font-semibold ${envMeta[env].accent}`}>{envMeta[env].label}</div>
        <div className="rounded-xl border border-slate-300 bg-white/90 px-3 py-1.5 text-sm text-slate-600 shadow-sm">
          {lastEvent ? `${lastEvent.timestampLabel} · ${lastEvent.title}` : '이벤트 대기 중'}
        </div>
      </div>

      <div className="h-[288px] overflow-hidden rounded-2xl border border-slate-300 bg-[linear-gradient(180deg,rgba(248,250,252,0.96),rgba(255,255,255,1)),radial-gradient(circle_at_top,rgba(226,232,240,0.65),transparent_58%)] shadow-inner">
        <ReactFlow
          nodes={graphNodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.08, minZoom: 0.55, maxZoom: 1.18 }}
          defaultViewport={{ x: 0, y: 0, zoom: 0.84 }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#d8e1ec" gap={22} />
          <CompactControls />
        </ReactFlow>
      </div>
    </section>
  );
}
