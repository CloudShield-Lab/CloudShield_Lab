'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import {
  applySimulationEvent,
  createInitialNodeStates,
  getScenarioByKey,
  mapAttackResultToArchitectureEvents,
  type ScenarioKey,
} from '@/lib/attack-simulation';
import type {
  ArchitectureEnvironment,
  ArchitectureNodeState,
  ArchitectureScenario,
  AttackEvent,
  AttackPhase,
  AttackSimulationEvent,
} from '@/types';

type VisualizationState = {
  scenario: ArchitectureScenario;
  scenarioKey: ScenarioKey;
  phase: AttackPhase;
  timeline: AttackSimulationEvent[];
  nodeStates: Record<ArchitectureEnvironment, ArchitectureNodeState[]>;
};

type VisualizationContextValue = VisualizationState & {
  startScenario: (key: ScenarioKey) => void;
  handleAttackEvent: (key: ScenarioKey, event: AttackEvent) => void;
  resetScenario: () => void;
};

const DEFAULT_SCENARIO_KEY: ScenarioKey = 'bruteforce';

const ArchitectureVisualizationContext = createContext<VisualizationContextValue | null>(null);

function createInitialState(key: ScenarioKey): VisualizationState {
  return {
    scenario: getScenarioByKey(key),
    scenarioKey: key,
    phase: 'idle',
    timeline: [],
    nodeStates: createInitialNodeStates(),
  };
}

export function ArchitectureVisualizationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, setState] = useState<VisualizationState>(createInitialState(DEFAULT_SCENARIO_KEY));

  const resetScenario = useCallback(() => {
    setState((current) => createInitialState(current.scenarioKey));
  }, []);

  const startScenario = useCallback((key: ScenarioKey) => {
    setState({
      scenario: getScenarioByKey(key),
      scenarioKey: key,
      phase: 'running',
      timeline: [],
      nodeStates: createInitialNodeStates(),
    });
  }, []);

  const handleAttackEvent = useCallback((key: ScenarioKey, event: AttackEvent) => {
    if (event.type === 'start') {
      setState({
        scenario: getScenarioByKey(key),
        scenarioKey: key,
        phase: 'running',
        timeline: [],
        nodeStates: createInitialNodeStates(),
      });
      return;
    }

    if (event.type === 'complete') {
      setState((current) => ({ ...current, phase: 'complete' }));
      return;
    }

    if (event.type === 'error') {
      setState((current) => ({ ...current, phase: 'error' }));
      return;
    }

    const derivedEvents = mapAttackResultToArchitectureEvents(key, event);

    setState((current) => {
      let nextNodeStates = current.nodeStates;

      for (const derivedEvent of derivedEvents) {
        nextNodeStates = applySimulationEvent(nextNodeStates, derivedEvent);
      }

      return {
        ...current,
        scenario: getScenarioByKey(key),
        scenarioKey: key,
        phase: 'running',
        timeline: [...current.timeline, ...derivedEvents],
        nodeStates: nextNodeStates,
      };
    });
  }, []);

  const value = useMemo(
    () => ({
      ...state,
      startScenario,
      handleAttackEvent,
      resetScenario,
    }),
    [handleAttackEvent, resetScenario, startScenario, state],
  );

  return (
    <ArchitectureVisualizationContext.Provider value={value}>
      {children}
    </ArchitectureVisualizationContext.Provider>
  );
}

export function useArchitectureVisualization() {
  const context = useContext(ArchitectureVisualizationContext);

  if (!context) {
    throw new Error('useArchitectureVisualization must be used within ArchitectureVisualizationProvider');
  }

  return context;
}
