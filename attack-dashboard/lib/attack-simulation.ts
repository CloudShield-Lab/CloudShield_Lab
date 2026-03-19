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
  ecs: '애플리케이션 호스트',
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
      '실제 SSE 공격 결과를 기반으로 취약 환경과 보안 환경의 로그인 공격 흐름을 반영합니다.',
    events: [],
  },
  's3-access': {
    id: 's3-access',
    name: 'S3 접근 경로 비교',
    description:
      '실제 SSE 공격 결과를 기반으로 취약 환경과 보안 환경의 S3 접근 흐름을 반영합니다.',
    events: [],
  },
  ratelimit: {
    id: 'ratelimit',
    name: 'API Rate Limit 비교',
    description:
      '실제 SSE 공격 결과를 기반으로 취약 환경과 보안 환경의 반복 요청 흐름을 반영합니다.',
    events: [],
  },
  'header-scan': {
    id: 'header-scan',
    name: 'HTTP 헤더 정보 노출',
    description:
      '응답 헤더를 분석해 취약 환경과 보안 환경의 기술 스택 노출 여부를 비교합니다.',
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
  return {
    ...states,
    [event.env]: states[event.env].map((node) =>
      node.stage === event.stage
        ? { ...node, status: event.status, lastEventId: event.id }
        : node,
    ),
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

function createEvent(
  key: ScenarioKey,
  env: ArchitectureEnvironment,
  stage: ArchitectureStage,
  status: NodeStatus,
  title: string,
  description: string,
  severity: AttackSimulationEvent['severity'],
  suffix: string,
): AttackSimulationEvent {
  return {
    id: `${key}-${env}-${stage}-${suffix}`,
    env,
    stage,
    status,
    title,
    description,
    timestampLabel: buildTimestampLabel(),
    offsetMs: 0,
    severity,
  };
}

function isSuccessfulS3Reach(status: number) {
  return status > 0 && status !== 403;
}

export function mapAttackResultToArchitectureEvents(
  endpoint: ScenarioKey,
  event: Extract<AttackEvent, { type: 'result' }>,
): AttackSimulationEvent[] {
  const env = mapEnvironment(event.env);
  const suffix = `${event.attempt}-${event.status}-${event.blocked ? 'b' : 'p'}`;

  if (env === 'vulnerable') {
    const events: AttackSimulationEvent[] = [
      createEvent(
        endpoint,
        env,
        'attacker',
        'reached',
        '공격 유입',
        '공격 요청이 취약 환경으로 유입되었습니다.',
        'critical',
        `${suffix}-attacker`,
      ),
      createEvent(
        endpoint,
        env,
        'ecs',
        event.status > 0 ? 'reached' : 'failed',
        event.status > 0 ? 'EC2 도달' : 'EC2 도달 실패',
        event.status > 0
          ? '공격 요청이 애플리케이션 호스트 계층에 도달했습니다.'
          : '호스트 계층 이전에서 연결이 실패했습니다.',
        event.status > 0 ? 'critical' : 'warning',
        `${suffix}-ec2`,
      ),
    ];

    if (endpoint === 's3-access') {
      events.push(
        createEvent(
          endpoint,
          env,
          'app',
          event.status > 0 ? 'passed' : 'failed',
          'Service Logic 경유',
          '스토리지 접근 요청이 서비스 로직을 통과했습니다.',
          'warning',
          `${suffix}-app`,
        ),
      );

      if (isSuccessfulS3Reach(event.status)) {
        events.push(
          createEvent(
            endpoint,
            env,
            's3',
            'success',
            'S3 도달',
            event.label || '취약 환경에서 S3 접근이 허용되었습니다.',
            'critical',
            `${suffix}-s3`,
          ),
        );
      }
    } else {
      events.push(
        createEvent(
          endpoint,
          env,
          'app',
          event.status > 0 ? 'passed' : 'failed',
          event.status === 200 ? '서비스 로직 성공 응답' : '서비스 로직 도달',
          event.label || '취약 환경에서 서비스 로직이 요청을 처리했습니다.',
          event.status === 200 ? 'critical' : 'warning',
          `${suffix}-app`,
        ),
      );
    }

    return events;
  }

  const secureEvents: AttackSimulationEvent[] = [
    createEvent(
      endpoint,
      env,
      'attacker',
      'reached',
      '공격 유입',
      '동일한 공격 요청이 보안 환경으로도 유입되었습니다.',
      'critical',
      `${suffix}-attacker`,
    ),
    createEvent(
      endpoint,
      env,
      'cloudfront',
      'passed',
      'CloudFront 전달',
      '보안 환경은 요청을 엣지 계층에서 먼저 처리합니다.',
      'info',
      `${suffix}-cloudfront`,
    ),
  ];

  if (event.blocked) {
    secureEvents.push(
      createEvent(
        endpoint,
        env,
        'waf',
        'blocked',
        'WAF 차단',
        event.label || '보안 환경의 WAF가 요청을 차단했습니다.',
        'success',
        `${suffix}-waf`,
      ),
    );
    return secureEvents;
  }

  secureEvents.push(
    createEvent(
      endpoint,
      env,
      'waf',
      'passed',
      'WAF 통과',
      '이 요청은 WAF 정책을 통과했습니다.',
      'warning',
      `${suffix}-waf`,
    ),
  );

  if (event.status > 0) {
    secureEvents.push(
      createEvent(
        endpoint,
        env,
        'ecs',
        'reached',
        'EC2 도달',
        '차단되지 않은 요청이 호스트 계층에 도달했습니다.',
        'warning',
        `${suffix}-ec2`,
      ),
      createEvent(
        endpoint,
        env,
        'app',
        'passed',
        'Service Logic 처리',
        event.label || '보안 환경에서도 서비스 로직까지 요청이 도달했습니다.',
        'warning',
        `${suffix}-app`,
      ),
    );

    if (endpoint === 's3-access' && isSuccessfulS3Reach(event.status)) {
      secureEvents.push(
        createEvent(
          endpoint,
          env,
          's3',
          'success',
          'S3 도달',
          '보안 환경에서도 스토리지 접근이 허용되었습니다.',
          'critical',
          `${suffix}-s3`,
        ),
      );
    }
  }

  return secureEvents;
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
