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
    key: 'origin-direct',
    index: 1,
    title: 'Origin 직접 접근 차단 비교',
    shortTitle: 'Origin 직접 접근',
    description:
      'CloudFront 같은 정상 진입 경로를 우회해 원본 EC2 주소로 직접 요청을 보내고, 원본 직접 노출 여부 차이를 비교합니다.',
    totalRequests: 1,
    vulnNote:
      '취약 환경은 원본 EC2가 외부에 직접 노출되어 있어 요청이 EC2와 서비스 로직까지 도달하고 응답이 돌아옵니다.',
    awsNote:
      '보안 환경은 원본 보안 그룹과 앞단 보호 구조로 인해 직접 접근이 연결 실패, 403, 타임아웃 등으로 조기에 차단됩니다.',
    flowSteps: [
      {
        title: '1. 정상 경로 우회',
        vulnerable: '시뮬레이터가 CloudFront 같은 정상 진입 경로 대신 원본 EC2 주소로 직접 요청을 보냅니다.',
        secure: '보안 환경도 같은 방식으로 원본 주소에 직접 요청해 보호 경로 우회 여부를 확인합니다.',
      },
      {
        title: '2. 원본 도달 여부 비교',
        vulnerable: '취약 환경은 원본이 외부에 노출되어 있어 EC2가 직접 응답하고 서비스 로직까지 요청이 이어집니다.',
        secure: '보안 환경은 Security Group과 앞단 보호 구조로 인해 직접 접근이 막혀 원본 응답이 돌아오지 않습니다.',
      },
      {
        title: '3. 전달 메시지 확인',
        vulnerable: '보호 장비를 우회해도 원본이 열려 있으면 직접 접근이 가능하다는 점을 보여줍니다.',
        secure: '원본이 직접 노출되지 않으면 같은 요청도 초기 단계에서 멈추며 인프라 구조 차이가 결과를 바꿉니다.',
      },
    ],
  },
  {
    key: 'bot-scan',
    index: 2,
    title: '비정상 스캐닝 / 봇 요청 차단 비교',
    shortTitle: '봇 요청 차단 비교',
    description:
      '관리자 페이지나 숨은 경로를 자동 탐색하는 요청이 취약 환경과 보안 환경에서 어디까지 도달하는지 비교합니다.',
    totalRequests: 6,
    vulnNote:
      '취약 환경은 탐색 요청이 원본 서버까지 도달해 404 응답이더라도 애플리케이션과 로그에 부하를 줍니다.',
    awsNote:
      '보안 환경은 CloudFront 같은 앞단 계층에서 탐색 요청을 먼저 흡수하거나 차단해 원본 도달 수를 줄입니다.',
    flowSteps: [
      {
        title: '1. 민감 경로 탐색',
        vulnerable: '/admin, /wp-login.php, /.env 같은 요청이 원본 애플리케이션으로 직접 전달됩니다.',
        secure: '동일 요청이 CloudFront와 앞단 보호 계층으로 먼저 유입됩니다.',
      },
      {
        title: '2. 원본 도달 여부 비교',
        vulnerable: '존재하지 않는 경로라도 서버가 직접 404를 처리하며 로그와 부하가 누적됩니다.',
        secure: '앞단에서 흡수되거나 차단된 요청은 원본 서버 도달 수가 줄어듭니다.',
      },
      {
        title: '3. 영향 해석',
        vulnerable: '불필요한 스캔 요청이 서비스 계층까지 닿는 흐름을 확인합니다.',
        secure: '의미 없는 탐색 요청이 앞단 보호 계층에서 조기에 제거됨을 보여줍니다.',
      },
    ],
  },
  {
    key: 'rce-injection',
    index: 3,
    title: 'RCE / Log4Shell JNDI 헤더 인젝션',
    shortTitle: 'RCE / Log4Shell',
    description:
      'HTTP 헤더에 JNDI 페이로드를 삽입해 취약 환경에서 페이로드가 애플리케이션 로그까지 도달하는 반면, 보안 환경의 WAF KnownBadInputsRuleSet이 앱 도달 전에 차단하는 차이를 비교합니다.',
    totalRequests: 1,
    vulnNote:
      '취약 환경은 WAF가 없어 JNDI 페이로드가 포함된 헤더가 그대로 EC2와 애플리케이션 로그까지 전달됩니다. Log4j 같은 취약 라이브러리가 있다면 실제 원격 코드 실행으로 이어질 수 있습니다.',
    awsNote:
      '보안 환경은 WAF AWSManagedRulesKnownBadInputsRuleSet이 ${jndi:...} 패턴을 탐지해 애플리케이션 도달 전에 403으로 차단합니다.',
    flowSteps: [
      {
        title: '1. JNDI 페이로드 헤더 삽입',
        vulnerable: '${jndi:ldap://...} 패턴이 User-Agent 등 HTTP 헤더에 포함된 요청이 취약 환경으로 직접 전달됩니다.',
        secure: '동일한 요청이 CloudFront를 거쳐 WAF 검사 단계로 먼저 전달됩니다.',
      },
      {
        title: '2. WAF 탐지 여부 비교',
        vulnerable: 'WAF가 없어 JNDI 문자열이 EC2에 도달하고 애플리케이션 로그에 그대로 기록됩니다.',
        secure: 'WAF KnownBadInputs 규칙이 ${jndi:...} 패턴을 즉시 탐지해 403으로 차단합니다.',
      },
      {
        title: '3. 실제 위협 해석',
        vulnerable: 'Log4j 취약 버전이라면 JNDI lookup이 외부 서버로 콜백을 시도합니다. 취약 라이브러리 여부와 무관하게 페이로드가 앱 내부까지 도달합니다.',
        secure: '페이로드가 애플리케이션에 전혀 도달하지 않아 취약 라이브러리 여부와 무관하게 안전합니다.',
      },
    ],
  },
  {
    key: 'sqli-xss',
    index: 4,
    title: 'SQL Injection / XSS 패턴 요청 차단 비교',
    shortTitle: 'SQLi / XSS 차단 비교',
    description:
      '자동 공격: SQLi / XSS 페이로드 6종을 email 필드로 전송해 취약 환경(앱 도달)과 보안 환경(WAF 차단)을 자동 비교합니다. 직접 체험: XSS 구문을 복사해 각 환경 로그인 페이지에서 실제 alert 발생 여부를 확인해보세요.',
    totalRequests: 6,
    vulnNote:
      '취약 환경은 앞단 WAF가 없어 의심 패턴이 email 필드를 통해 SQL 계층까지 도달하고, XSS 페이로드는 에러 응답에 반사되어 브라우저에서 실행됩니다.',
    awsNote:
      '보안 환경은 CloudFront 뒤 WAF가 요청 본문의 패턴을 먼저 검사해 애플리케이션 도달 전에 차단합니다. XSS 페이로드도 서버에 전혀 닿지 않습니다.',
    flowSteps: [
      {
        title: '1. 악성 패턴을 email 필드로 전송',
        vulnerable: 'SQLi / XSS 패턴이 로그인 요청의 email 필드에 삽입되어 서버로 전달됩니다.',
        secure: '동일 요청이 먼저 CloudFront를 거쳐 WAF 검사 단계로 전달됩니다.',
      },
      {
        title: '2. 처리 지점 비교',
        vulnerable: '앞단 차단 계층이 없어 페이로드가 SQL 파라미터 계층까지 도달합니다. XSS는 에러 메시지에 반사되어 브라우저가 실행합니다.',
        secure: 'WAF가 Known Bad Inputs 규칙으로 요청 본문 패턴을 조기에 탐지·차단합니다.',
      },
      {
        title: '3. 심층 방어 효과',
        vulnerable: '파라미터화 쿼리가 SQLi를 방어해도 XSS는 브라우저에서 실행됩니다. 앱 레벨 방어만으로는 불충분함을 보여줍니다.',
        secure: 'WAF가 앱 도달 전에 모두 차단해, 코드 레벨 방어에 더해 인프라 레벨 심층 방어를 제공합니다.',
      },
    ],
  },
  {
    key: 'bruteforce',
    index: 5,
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
        vulnerable: '공격 요청이 공개 엔드포인트로 바로 유입됩니다.',
        secure: 'CloudFront가 먼저 요청을 받고 WAF 검사 단계로 전달합니다.',
      },
      {
        title: '2. 차단 여부 비교',
        vulnerable: '별도 rate 기반 제어가 없어 백엔드까지 요청이 이어집니다.',
        secure: 'WAF가 비정상 로그인 패턴을 탐지하면 애플리케이션 도달 전에 차단합니다.',
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
    index: 6,
    title: 'S3 데이터 탈취 체인',
    shortTitle: 'S3 데이터 탈취 체인',
    description:
      '탈취한 계정으로 로그인한 뒤 파일 목록 조회, Presigned URL 획득, 서명 제거 후 S3 직접 접근까지의 흐름을 비교합니다.',
    totalRequests: 4,
    vulnNote:
      '취약 환경은 퍼블릭 버킷 설정으로 인해 서명 없는 S3 직접 URL로도 실제 파일을 다운로드할 수 있습니다.',
    awsNote:
      '보안 환경은 프라이빗 버킷으로 설정되어 있어 서명 파라미터를 제거한 직접 URL 접근 시 403을 반환합니다.',
    flowSteps: [
      {
        title: '1. 탈취 계정 로그인',
        vulnerable: '브루트포스 단계에서 획득한 victim 계정으로 JWT를 발급받습니다.',
        secure: '동일한 로그인은 가능하지만 이후 S3 직접 접근 단계에서 차단됩니다.',
      },
      {
        title: '2. 파일 목록 및 다운로드 URL 획득',
        vulnerable: 'JWT로 파일 목록과 Presigned URL을 정상적으로 가져옵니다.',
        secure: '보안 환경도 애플리케이션 API는 동일하게 Presigned URL을 반환합니다.',
      },
      {
        title: '3. 서명 제거 후 S3 직접 접근',
        vulnerable: 'Presigned URL의 서명 파라미터를 제거해도 순수 S3 URL로 다운로드가 성공합니다.',
        secure: '프라이빗 버킷은 서명 없는 요청을 즉시 403 Access Denied로 차단합니다.',
      },
    ],
  },
];

export const defaultAttackScenario: AttackEndpoint = 'origin-direct';

export function getAttackScenarioConfig(key: string) {
  return attackScenarioConfigs.find((item) => item.key === key);
}

export function isAttackScenarioKey(key: string): key is AttackEndpoint {
  return attackScenarioConfigs.some((item) => item.key === key);
}
