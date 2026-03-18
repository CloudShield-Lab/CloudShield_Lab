import type { AttackEndpoint } from '@/types';

export type AttackScenarioConfig = {
  key: AttackEndpoint;
  index: number;
  title: string;
  shortTitle: string;
  description: string;
  totalRequests: number;
  attackParams?: string;
  vulnNote: string;
  awsNote: string;
  flowSteps: Array<{
    title: string;
    vulnerable: string;
    secure: string;
  }>;
};

export const attackScenarioConfigs: AttackScenarioConfig[] = [
  {
    key: 'bruteforce',
    index: 1,
    title: '브루트포스 로그인 비교',
    shortTitle: '브루트포스 로그인 비교',
    description:
      '동일한 로그인 공격 요청이 취약 환경과 보안 환경에서 어디까지 도달하는지 비교합니다.',
    totalRequests: 100,
    attackParams: 'count=100',
    vulnNote:
      '취약 환경은 별도 방어 계층이 없어 다수의 로그인 요청이 애플리케이션 로직까지 직접 도달합니다.',
    awsNote:
      '보안 환경은 CloudFront와 WAF가 먼저 요청을 검사하며 비정상적인 로그인 시도를 앞단에서 차단합니다.',
    flowSteps: [
      {
        title: '1. 반복 로그인 시도 전송',
        vulnerable: '공격 요청이 공개된 엔드포인트로 바로 유입됩니다.',
        secure: 'CloudFront가 먼저 수신한 뒤 WAF 정책 검사 단계로 전달합니다.',
      },
      {
        title: '2. 차단 여부 비교',
        vulnerable: '별도 rate 기반 제어가 없어 백엔드까지 요청이 이어질 수 있습니다.',
        secure: 'WAF가 비정상 패턴을 탐지하면 애플리케이션 도달 전에 차단합니다.',
      },
      {
        title: '3. 결과와 영향 확인',
        vulnerable: '인증 로직과 인프라 자원이 계속 소모되는 흐름을 확인합니다.',
        secure: '차단 비율과 최초 차단 시점을 통해 보호 효과를 확인합니다.',
      },
    ],
  },
  {
    key: 's3-access',
    index: 2,
    title: 'S3 접근 경로 비교 API',
    shortTitle: 'S3 접근 경로 비교 API',
    description:
      'S3 요청이 공개 경로로 노출되는지, 보호된 경로를 통해서만 허용되는지 비교합니다.',
    totalRequests: 5,
    vulnNote:
      '취약 환경은 잘못된 스토리지 설정으로 인해 S3 접근이 직접 허용되는 흐름을 확인할 수 있습니다.',
    awsNote:
      '보안 환경은 프라이빗 버킷, 제한된 권한, 보호된 전달 경로를 통해 동일한 요청을 제어합니다.',
    flowSteps: [
      {
        title: '1. 스토리지 요청 전송',
        vulnerable: '공개 경로로 들어온 요청이 앱과 스토리지 경로를 그대로 탐색합니다.',
        secure: '보호된 전달 경로를 따라 요청의 정당성을 먼저 확인합니다.',
      },
      {
        title: '2. 접근 허용 범위 비교',
        vulnerable: '버킷 또는 오브젝트가 잘못 공개돼 있으면 직접 접근이 가능해집니다.',
        secure: '프라이빗 버킷과 제한된 권한으로 인해 우회 접근이 막힙니다.',
      },
      {
        title: '3. 최종 도달 지점 확인',
        vulnerable: 'S3 성공 응답 여부로 노출 상태를 직관적으로 확인합니다.',
        secure: '차단 또는 제한 응답으로 보호된 아키텍처를 검증합니다.',
      },
    ],
  },
  {
    key: 'ratelimit',
    index: 3,
    title: 'Rate Limit 비교',
    shortTitle: 'Rate Limit 비교',
    description:
      '짧은 시간에 반복되는 API 요청이 서비스 내부까지 도달하는지, 앞단에서 제어되는지 비교합니다.',
    totalRequests: 200,
    attackParams: 'count=200',
    vulnNote:
      '취약 환경은 요청 제한이 약하거나 없어 애플리케이션과 인프라 자원 사용량이 빠르게 증가합니다.',
    awsNote:
      '보안 환경은 WAF와 보호 정책이 먼저 동작해 과도한 트래픽이 서비스 로직에 도달하기 전에 제어됩니다.',
    flowSteps: [
      {
        title: '1. 고빈도 요청 발생',
        vulnerable: '짧은 간격의 API 요청이 동일 엔드포인트로 몰립니다.',
        secure: '동일 요청이라도 먼저 엣지 계층과 보호 정책을 거칩니다.',
      },
      {
        title: '2. 처리 지점 비교',
        vulnerable: '백엔드 처리량과 응답 지연이 직접 증가하는 흐름을 볼 수 있습니다.',
        secure: '정책 기준을 넘는 요청은 조기에 차단되어 내부 자원 사용을 줄입니다.',
      },
      {
        title: '3. 보호 효과 해석',
        vulnerable: '도달 수와 평균 지연을 통해 서비스 부담을 확인합니다.',
        secure: '차단 수와 차단 비율로 앞단 제어 효과를 시각적으로 확인합니다.',
      },
    ],
  },
];

export const defaultAttackScenario: AttackEndpoint = 'bruteforce';

export function getAttackScenarioConfig(key: string) {
  return attackScenarioConfigs.find((item) => item.key === key);
}

export function isAttackScenarioKey(key: string): key is AttackEndpoint {
  return attackScenarioConfigs.some((item) => item.key === key);
}
