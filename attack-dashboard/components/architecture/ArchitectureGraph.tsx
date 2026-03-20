'use client';

import 'reactflow/dist/style.css';
import { useMemo } from 'react';
import ReactFlow, { Background, Edge, MarkerType, Node, Panel, useReactFlow } from 'reactflow';
import { STAGE_DESCRIPTIONS, STAGE_LABELS, type ScenarioKey } from '@/lib/attack-simulation';
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
  attacker: { x: 22, y: 20 },
  cloudfront: { x: 214, y: 20 },
  waf: { x: 406, y: 20 },
  alb: { x: 0, y: 0 },
  ecs: { x: 118, y: 176 },
  app: { x: 310, y: 176 },
  s3: { x: 502, y: 176 },
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
  style: { stroke: '#64748b', strokeWidth: 2 },
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
  style: { stroke: '#64748b', strokeWidth: 2 },
}));

const envMeta: Record<ArchitectureEnvironment, { label: string; accent: string; panel: string }> = {
  vulnerable: {
    label: '취약 환경',
    accent: 'text-red-700',
    panel: 'border-red-200 bg-[linear-gradient(180deg,rgba(254,242,242,0.92),rgba(255,255,255,0.98))]',
  },
  secure: {
    label: '보안 환경',
    accent: 'text-emerald-700',
    panel: 'border-emerald-200 bg-[linear-gradient(180deg,rgba(236,253,245,0.92),rgba(255,255,255,0.98))]',
  },
};

interface Props {
  env: ArchitectureEnvironment;
  nodes: ArchitectureNodeState[];
  lastEvent?: AttackSimulationEvent;
  scenarioKey: ScenarioKey;
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
          onClick={() => fitView({ padding: 0.1, minZoom: 0.72, maxZoom: 1.2 })}
          className="h-8 w-8 text-[11px] font-bold text-slate-700 transition hover:bg-slate-50"
          title="화면 맞춤"
        >
          □
        </button>
      </div>
    </Panel>
  );
}

export function ArchitectureGraph({ env, nodes, lastEvent, scenarioKey }: Props) {
  const bypassActive =
    env === 'secure' &&
    scenarioKey === 'origin-direct' &&
    nodes.some((node) => node.stage === 'attacker' && node.status !== 'idle');
  const preserveDefaultSecureStages = env === 'secure' && scenarioKey === 'origin-direct';

  const graphNodes = useMemo<Node[]>(
    () =>
      nodes
        .filter((node) => visibleStages.includes(node.stage))
        .map((node) => {
          const displayStatus =
            preserveDefaultSecureStages && (node.stage === 'cloudfront' || node.stage === 'waf')
              ? 'idle'
              : node.status;
          const muted = env === 'vulnerable' && (node.stage === 'cloudfront' || node.stage === 'waf');
          const highlighted =
            (env === 'vulnerable' && node.stage === 's3' && displayStatus === 'success') ||
            (env === 'secure' && node.stage === 'waf' && displayStatus === 'blocked');

          return {
            id: node.stage,
            type: 'architectureNode',
            position: positions[node.stage],
            data: {
              label: STAGE_LABELS[node.stage],
              description: STAGE_DESCRIPTIONS[node.stage],
              status: displayStatus,
              stage: node.stage,
              muted,
              highlighted,
              showBypassHandle: bypassActive && node.stage === 'attacker',
            },
            draggable: false,
            selectable: false,
          };
        }),
    [bypassActive, env, nodes, preserveDefaultSecureStages]
  );

  const edges = useMemo(() => {
    if (env === 'vulnerable') {
      return vulnerableEdges;
    }

    const baseSecureEdges = preserveDefaultSecureStages
      ? secureEdges.map((edge) =>
          edge.id === 'secure-attacker-cloudfront'
            ? { ...edge, sourceHandle: 'default-source' }
            : edge
        )
      : secureEdges;

    if (!bypassActive) {
      return baseSecureEdges;
    }

    return [
      ...baseSecureEdges,
      {
        id: 'secure-origin-bypass',
        source: 'attacker',
        sourceHandle: 'bypass-source',
        target: 'ecs',
        type: 'default',
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed, color: '#f97316' },
        style: { stroke: '#f97316', strokeWidth: 2.5 },
      } satisfies Edge,
    ];
  }, [bypassActive, env]);

  return (
    <section className={`rounded-2xl border p-4 shadow-[0_14px_34px_rgba(15,23,42,0.05)] ${envMeta[env].panel}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className={`text-2xl font-semibold ${envMeta[env].accent}`}>{envMeta[env].label}</div>
        <div className="rounded-xl border border-slate-300 bg-white/95 px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm">
          {lastEvent ? `${lastEvent.timestampLabel} · ${lastEvent.title}` : '이벤트 대기 중'}
        </div>
      </div>

      <div className="h-[360px] overflow-hidden rounded-2xl border border-slate-300 bg-[linear-gradient(180deg,rgba(248,250,252,0.98),rgba(255,255,255,1)),radial-gradient(circle_at_top,rgba(203,213,225,0.45),transparent_58%)] shadow-inner">
        <ReactFlow
          nodes={graphNodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.08, minZoom: 0.8, maxZoom: 1.2 }}
          defaultViewport={{ x: 0, y: 0, zoom: 0.98 }}
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
