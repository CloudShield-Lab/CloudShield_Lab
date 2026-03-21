import type {
  ArchitectureEnvironment,
  ArchitectureNodeState,
  ArchitectureScenario,
  ArchitectureStage,
  AttackEndpoint,
  AttackEvent,
  AttackSimulationEvent,
  EventSeverity,
  NodeStatus,
} from '@/types';

export type ScenarioKey = AttackEndpoint;

export const STAGES: ArchitectureStage[] = [
  'attacker',
  'cloudfront',
  'waf',
  'ecs',
  'app',
  's3',
];

export const STAGE_LABELS: Record<ArchitectureStage, string> = {
  attacker: '공격자',
  cloudfront: 'CloudFront',
  waf: 'WAF',
  alb: 'ALB',
  ecs: 'EC2',
  app: 'Service Logic',
  s3: 'S3',
  rds: 'RDS',
  redis: 'Redis',
};

export const STAGE_DESCRIPTIONS: Record<ArchitectureStage, string> = {
  attacker: '공격 시작 지점',
  cloudfront: '엣지 진입 계층',
  waf: '요청 필터링 계층',
  alb: '사용하지 않음',
  ecs: '애플리케이션 인스턴스',
  app: '서비스 처리 로직',
  s3: '스토리지 계층',
  rds: '사용하지 않음',
  redis: '사용하지 않음',
};

const INITIAL_STATUS_BY_STAGE: Record<ArchitectureStage, NodeStatus> = {
  attacker: 'idle',
  cloudfront: 'idle',
  waf: 'idle',
  alb: 'idle',
  ecs: 'idle',
  app: 'idle',
  s3: 'idle',
  rds: 'idle',
  redis: 'idle',
};

const scenarios: Record<ScenarioKey, ArchitectureScenario> = {
  bruteforce: {
    id: 'bruteforce',
    name: '브루트포스 로그인 비교',
    description:
      '실제 SSE 공격 결과를 기반으로 취약 환경과 보안 환경의 로그인 공격 흐름을 비교합니다.',
    events: [],
  },
  's3-access': {
    id: 's3-access',
    name: 'S3 접근 경로 비교',
    description:
      '실제 SSE 공격 결과를 기반으로 취약 환경과 보안 환경의 S3 접근 흐름을 비교합니다.',
    events: [],
  },
  'header-scan': {
    id: 'header-scan',
    name: 'HTTP 헤더 정보 노출',
    description:
      '응답 헤더를 분석해 취약 환경과 보안 환경의 기술 스택 노출 차이를 비교합니다.',
    events: [],
  },
  'sqli-xss': {
    id: 'sqli-xss',
    name: 'SQL Injection / XSS 패턴 요청 차단 비교',
    description:
      '의심 패턴 요청이 취약 환경과 보안 환경에서 어디까지 도달하는지 비교합니다.',
    events: [],
  },
  'bot-scan': {
    id: 'bot-scan',
    name: '비정상 스캐닝 / 봇 요청 차단 비교',
    description:
      '관리자 페이지와 숨은 경로 스캔 요청이 앞단에서 차단되는지, 원본까지 도달하는지 비교합니다.',
    events: [],
  },
  'origin-direct': {
    id: 'origin-direct',
    name: 'Origin 직접 접근 차단 비교',
    description:
      '정상 진입 경로를 우회해 원본 EC2 주소로 직접 요청을 보내고, 원본 노출 여부 차이를 비교합니다.',
    events: [],
  },
};

export function getScenarioByKey(key: ScenarioKey): ArchitectureScenario {
  return scenarios[key];
}

export function createInitialNodeStates(): Record<ArchitectureEnvironment, ArchitectureNodeState[]> {
  return {
    vulnerable: STAGES.map((stage) => ({ stage, status: INITIAL_STATUS_BY_STAGE[stage] })),
    secure: STAGES.map((stage) => ({ stage, status: INITIAL_STATUS_BY_STAGE[stage] })),
  };
}

export function applySimulationEvent(
  states: Record<ArchitectureEnvironment, ArchitectureNodeState[]>,
  event: AttackSimulationEvent,
) {
  const isTerminal = event.status === 'blocked' || event.status === 'failed';
  const eventStageIndex = STAGES.indexOf(event.stage);

  return {
    ...states,
    [event.env]: states[event.env].map((node) => {
      if (node.stage === event.stage) {
        return { ...node, status: event.status, lastEventId: event.id };
      }

      if (isTerminal && STAGES.indexOf(node.stage) > eventStageIndex) {
        return { ...node, status: 'idle' };
      }

      return node;
    }),
  };
}

function mapEnvironment(env: 'vulnerable' | 'aws'): ArchitectureEnvironment {
  return env === 'vulnerable' ? 'vulnerable' : 'secure';
}

function buildTimestampLabel() {
  return new Date().toLocaleTimeString('ko-KR', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function mapStageEventToArchitectureEvent(
  endpoint: ScenarioKey,
  event: Extract<AttackEvent, { type: 'stage' }>,
): AttackSimulationEvent {
  return {
    id: `${endpoint}-${event.env}-${event.stage}-${event.attempt ?? 'na'}-${event.status}-${Date.now()}`,
    env: mapEnvironment(event.env),
    stage: event.stage,
    status: event.status,
    title: event.title,
    description: event.description,
    timestampLabel: buildTimestampLabel(),
    offsetMs: 0,
    severity: event.severity ?? inferSeverity(event.status),
  };
}

function inferSeverity(status: NodeStatus): EventSeverity {
  if (status === 'blocked') return 'success';
  if (status === 'success') return 'critical';
  if (status === 'failed') return 'warning';
  if (status === 'passed') return 'warning';
  if (status === 'reached') return 'critical';
  return 'info';
}
