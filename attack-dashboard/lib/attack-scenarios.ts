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
    title: 'S3 데이터 탈취 체인',
    shortTitle: 'S3 데이터 탈취 체인',
    description:
      '피해자 계정으로 로그인 → 파일 목록 조회 → Presigned URL 획득 → 서명 제거 후 S3 직접 접근까지의 탈취 체인 전체를 비교합니다.',
    totalRequests: 4,
    vulnNote:
      '취약 환경은 퍼블릭 버킷 설정으로 인해 서명 없는 S3 직접 URL로도 실제 파일이 다운로드됩니다.',
    awsNote:
      '보안 환경은 프라이빗 버킷으로 설정되어 있어 서명 파라미터를 제거한 직접 URL 접근 시 403이 반환됩니다.',
    flowSteps: [
      {
        title: '1. 피해자 계정 로그인',
        vulnerable: '크리덴셜 스터핑으로 획득한 victim@demo.com 계정으로 JWT를 발급받습니다.',
        secure: '동일 로그인 시도는 정상 처리되지만 이후 S3 직접 접근 단계에서 차단됩니다.',
      },
      {
        title: '2. 파일 목록 & 다운로드 URL',
        vulnerable: 'JWT를 사용해 /api/files 파일 목록과 Presigned URL을 정상적으로 획득합니다.',
        secure: '보안 환경에서도 API는 동일하게 Presigned URL을 반환합니다.',
      },
      {
        title: '3. 서명 제거 후 S3 직접 접근',
        vulnerable: 'Presigned URL에서 서명 파라미터를 모두 제거한 순수 S3 URL로 파일 다운로드가 성공합니다.',
        secure: '프라이빗 버킷이므로 서명 없는 접근은 즉시 403 Access Denied로 차단됩니다.',
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
  {
    key: 'header-scan',
    index: 4,
    title: 'HTTP 헤더 정보 노출',
    shortTitle: 'HTTP 헤더 스캔',
    description:
      '응답 헤더를 분석해 기술 스택 노출 여부를 비교합니다. 취약 환경은 Express·Node.js 버전 등이 노출되고 보안 환경은 CloudFront가 이를 숨기고 보안 헤더를 추가합니다.',
    totalRequests: 1,
    vulnNote:
      '취약 환경은 Express 기본 헤더(X-Powered-By 등)가 그대로 노출되어 공격자가 기술 스택을 쉽게 파악할 수 있습니다.',
    awsNote:
      '보안 환경은 CloudFront가 위험 헤더를 제거하고 HSTS 등 보안 헤더를 추가해 정보 노출을 최소화합니다.',
    flowSteps: [
      {
        title: '1. HTTP GET 요청 전송',
        vulnerable: '공격자가 취약 환경 API에 직접 GET 요청을 보내 응답 헤더를 수집합니다.',
        secure: '동일 요청이 CloudFront 엣지를 경유하며 헤더 변환이 적용됩니다.',
      },
      {
        title: '2. 위험 헤더 탐지',
        vulnerable: 'X-Powered-By: Express, Server 헤더 등 기술 스택 정보가 노출됩니다.',
        secure: 'CloudFront가 위험 헤더를 제거하고 Via, X-Cache 등 CDN 헤더로 대체합니다.',
      },
      {
        title: '3. 보안 헤더 비교',
        vulnerable: 'HSTS, X-Content-Type-Options 등 보안 헤더가 누락된 상태입니다.',
        secure: 'CloudFront 및 앱 설정으로 주요 보안 헤더가 추가된 상태를 확인합니다.',
      },
    ],
  },
  {
    key: 'sqli-xss',
    index: 5,
    title: 'SQL Injection / XSS 패턴 요청 차단 비교',
    shortTitle: 'SQLi / XSS 차단 비교',
    description:
      '의심스러운 SQLi / XSS 패턴이 포함된 요청을 보내, 취약 환경에서는 어디까지 도달하는지와 보안 환경에서 어디서 차단되는지를 비교합니다.',
    totalRequests: 6,
    vulnNote:
      '취약 환경은 앞단 WAF가 없어 의심 요청이 EC2와 서비스 로직까지 전달되고, 애플리케이션이 직접 응답을 반환합니다.',
    awsNote:
      '보안 환경은 CloudFront 뒤 WAF가 의심 패턴을 먼저 검사해 악성 요청을 애플리케이션 도달 전에 차단합니다.',
    flowSteps: [
      {
        title: '1. 악성 패턴 요청 전송',
        vulnerable: 'SQLi / XSS 형태의 의심 패턴이 포함된 요청이 공개 엔드포인트로 유입됩니다.',
        secure: '동일 요청이 먼저 CloudFront를 거쳐 WAF 정책 검사 단계로 전달됩니다.',
      },
      {
        title: '2. 처리 지점 비교',
        vulnerable: '앞단 차단 계층이 없어 요청이 EC2와 서비스 로직 계층까지 도달합니다.',
        secure: 'WAF가 Known Bad Inputs 및 패턴 규칙으로 의심 요청을 조기에 차단합니다.',
      },
      {
        title: '3. 보호 효과 해석',
        vulnerable: '애플리케이션이 직접 잘못된 입력을 처리하며 응답을 반환하는 흐름을 확인합니다.',
        secure: '같은 요청이 앞단에서 멈추는 지점을 통해 보안 계층의 역할을 확인합니다.',
      },
    ],
  },
  {
    key: 'bot-scan',
    index: 6,
    title: '비정상 스캐닝 / 봇 요청 차단 비교',
    shortTitle: '봇 요청 차단 비교',
    description:
      '관리자 페이지나 숨은 경로를 자동 탐색하는 요청이 취약 환경과 보안 환경에서 어디까지 도달하는지 비교합니다.',
    totalRequests: 6,
    vulnNote:
      '취약 환경은 탐색성 요청이 원본 서버까지 도달해 404 응답이라도 애플리케이션과 로그에 부담을 남깁니다.',
    awsNote:
      '보안 환경은 CloudFront 같은 앞단 계층에서 상당수 탐색 요청이 먼저 흡수되거나 차단되어 원본 도달 수를 줄입니다.',
    flowSteps: [
      {
        title: '1. 민감 경로 탐색',
        vulnerable: '/admin, /wp-login.php, /.env 같은 요청이 원본 애플리케이션으로 직접 전달됩니다.',
        secure: '동일 요청이 CloudFront 등 앞단 보호 계층으로 먼저 유입됩니다.',
      },
      {
        title: '2. 원본 도달 여부 비교',
        vulnerable: '존재하지 않는 경로라도 서버가 직접 404를 처리하며 로그와 부하가 누적됩니다.',
        secure: '앞단에서 흡수되거나 차단되는 요청이 늘어나 원본 서버 도달 수가 줄어듭니다.',
      },
      {
        title: '3. 영향 해석',
        vulnerable: '불필요한 스캐닝 요청이 서비스 계층까지 닿는 흐름을 확인합니다.',
        secure: '의미 없는 탐색 요청도 앞단 보호 계층에서 초기에 소거될 수 있음을 보여줍니다.',
      },
    ],
  },
  {
    key: 'origin-direct',
    index: 7,
    title: 'Origin 직접 접근 차단 비교',
    shortTitle: 'Origin 직접 접근',
    description:
      'CloudFront 같은 정상 진입 경로를 우회해 원본 EC2 주소나 직접 엔드포인트로 요청을 보내고, 원본 직접 노출 여부 차이를 비교합니다.',
    totalRequests: 1,
    vulnNote:
      '취약 환경은 외부에 노출된 원본 EC2로 직접 접근이 가능해 요청이 EC2와 서비스 로직까지 도달하고 응답이 돌아옵니다.',
    awsNote:
      '보안 환경은 원본 보안 그룹이 CloudFront 경로만 허용해 직접 접근 시 연결 실패, 403, 타임아웃 등으로 조기에 차단됩니다.',
    flowSteps: [
      {
        title: '1. 정상 경로 우회',
        vulnerable: '시뮬레이터가 CloudFront 같은 정상 진입 경로 대신 원본 EC2 주소로 직접 요청을 보냅니다.',
        secure: '보안 환경도 같은 방식으로 원본 주소에 직접 요청을 보내 보호 경로 우회 여부를 확인합니다.',
      },
      {
        title: '2. 원본 도달 여부 비교',
        vulnerable: '취약 환경은 원본이 외부에 노출돼 있어 EC2가 직접 응답하고 서비스 로직까지 요청이 이어집니다.',
        secure: '보안 환경은 Security Group과 앞단 보호 설계로 인해 직접 접근이 막혀 원본 응답이 돌아오지 않습니다.',
      },
      {
        title: '3. 핵심 메시지 확인',
        vulnerable: '공격자가 보호 장비를 우회해도 원본이 열려 있으면 직접 접근이 가능하다는 점을 보여줍니다.',
        secure: '원본이 직접 노출되지 않으면 같은 요청도 초기 단계에서 멈추며 인프라 설계 차이가 결과를 바꿉니다.',
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
