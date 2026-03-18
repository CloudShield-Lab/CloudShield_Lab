export type Environment = 'vulnerable' | 'aws';
export type ArchitectureEnvironment = 'vulnerable' | 'secure';

export type AttackPhase = 'idle' | 'running' | 'complete' | 'error';

export type AttackResult = {
  attempt: number;
  status: number;
  latency: number;
  blocked: boolean;
  label?: string;
  error?: string;
};

export type AttackEvent =
  | { type: 'start' }
  | {
      type: 'stage';
      env: Environment;
      stage: ArchitectureStage;
      status: NodeStatus;
      title: string;
      description: string;
      severity?: EventSeverity;
      attempt?: number;
    }
  | {
      type: 'result';
      env: Environment;
      attempt: number;
      status: number;
      latency: number;
      blocked: boolean;
      label?: string;
      error?: string;
      email?: string;
      password?: string;
    }
  | { type: 'complete' }
  | { type: 'error'; message: string };

export type WorkspaceMode = 'manual' | 'auto';

export type EnvConfig = {
  url: string;
  frontendUrl?: string;
  s3Url?: string;
  configured: boolean;
};

export type DashboardConfig = {
  vulnerable: EnvConfig;
  aws: EnvConfig;
  autoVulnerable: EnvConfig;
  autoAws: EnvConfig;
};

export type ArchitectureStage =
  | 'attacker'
  | 'cloudfront'
  | 'waf'
  | 'alb'
  | 'ecs'
  | 'app'
  | 's3'
  | 'rds'
  | 'redis';

export type NodeStatus = 'idle' | 'reached' | 'passed' | 'blocked' | 'failed' | 'success';

export type ArchitectureNodeState = {
  stage: ArchitectureStage;
  status: NodeStatus;
  lastEventId?: string;
};

export type EventSeverity = 'info' | 'warning' | 'critical' | 'success';

export type AttackSimulationEvent = {
  id: string;
  env: ArchitectureEnvironment;
  stage: ArchitectureStage;
  status: NodeStatus;
  title: string;
  description: string;
  timestampLabel: string;
  offsetMs: number;
  severity: EventSeverity;
};

export type ArchitectureSummary = {
  env: ArchitectureEnvironment;
  blockedStage: ArchitectureStage | null;
  deepestStage: ArchitectureStage;
  totalEvents: number;
  blockedEvents: number;
  successEvents: number;
};

export type ArchitectureScenario = {
  id: string;
  name: string;
  description: string;
  events: AttackSimulationEvent[];
};

export type AttackEndpoint = 'bruteforce' | 's3-access' | 'ratelimit';
