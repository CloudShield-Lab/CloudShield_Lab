import {
  BedrockRuntimeClient,
  InvokeModelWithResponseStreamCommand,
} from '@aws-sdk/client-bedrock-runtime';
import type { AnalysisSession, AttackResult } from '@/types';

function formatAttackChainSection(
  vulnResults: AttackResult[],
  secureResults: AttackResult[],
  lang: 'ko' | 'en',
): string {
  if (vulnResults.length === 0 && secureResults.length === 0) return '';

  const MAX = 40;

  const formatResult = (r: AttackResult, lang: 'ko' | 'en') => {
    const status = r.status > 0 ? `HTTP ${r.status}` : 'ERR (timeout/refused)';
    const urlNote = r.url ? ` [${r.url}]` : '';
    const latencyNote = r.latency > 0 ? ` (${r.latency}ms)` : '';
    return `  ${lang === 'ko' ? '시도' : 'Attempt'} ${r.attempt}: ${status}${urlNote}${latencyNote}`;
  };

  const vulnSample = vulnResults.slice(0, MAX);
  const secureSample = secureResults.slice(0, MAX);

  if (lang === 'ko') {
    let section = '\n\n### 공격 체인 실행 결과 (공격자 시점)';
    section += '\n공격자(attack-dashboard)가 각 단계에서 실제로 수신한 HTTP 상태 코드와 응답 지연 시간입니다. 차단 주체(WAF·SG·S3 정책 등)는 이 데이터만으로 단정할 수 없으며, 서버 액세스 로그와 교차 분석이 필요합니다.';

    section += `\n\n**취약 환경 (${vulnResults.length}건${vulnResults.length > MAX ? `, 상위 ${MAX}건 표시` : ''}):**`;
    if (vulnSample.length > 0) {
      section += '\n' + vulnSample.map((r) => formatResult(r, 'ko')).join('\n');
    } else {
      section += '\n  (없음)';
    }

    section += `\n\n**보안 환경 (${secureResults.length}건${secureResults.length > MAX ? `, 상위 ${MAX}건 표시` : ''}):**`;
    if (secureSample.length > 0) {
      section += '\n' + secureSample.map((r) => formatResult(r, 'ko')).join('\n');
    } else {
      section += '\n  (없음)';
    }

    return section;
  }

  let section = '\n\n### Attack Chain Execution Results (Attacker\'s Perspective)';
  section += '\nThese are the raw HTTP status codes and latencies received by the attack-dashboard at each step. The blocking entity (WAF, SG, S3 policy, etc.) cannot be determined from this data alone — cross-reference with server access logs to infer what happened.';

  section += `\n\n**Vulnerable environment (${vulnResults.length} steps${vulnResults.length > MAX ? `, showing top ${MAX}` : ''}):**`;
  if (vulnSample.length > 0) {
    section += '\n' + vulnSample.map((r) => formatResult(r, 'en')).join('\n');
  } else {
    section += '\n  (none)';
  }

  section += `\n\n**Secure environment (${secureResults.length} steps${secureResults.length > MAX ? `, showing top ${MAX}` : ''}):**`;
  if (secureSample.length > 0) {
    section += '\n' + secureSample.map((r) => formatResult(r, 'en')).join('\n');
  } else {
    section += '\n  (none)';
  }

  return section;
}

function formatAccessLogsSection(
  rawLogs: { vulnerable: string[]; secure: string[] },
  lang: 'ko' | 'en',
): string {
  const MAX_LINES = 80;
  const vulnSample = rawLogs.vulnerable.slice(0, MAX_LINES);
  const secureSample = rawLogs.secure.slice(0, MAX_LINES);

  if (vulnSample.length === 0 && secureSample.length === 0) return '';

  if (lang === 'ko') {
    let section = '\n\n### 서버 수신 HTTP 액세스 로그 (공격 시간대)';
    section += `\n\n**취약 환경 (${rawLogs.vulnerable.length}건${rawLogs.vulnerable.length > MAX_LINES ? `, 상위 ${MAX_LINES}건 표시` : ''}):**`;
    if (vulnSample.length > 0) {
      section += '\n```\n' + vulnSample.join('\n---\n') + '\n```';
    } else {
      section += '\n(없음)';
    }
    section += `\n\n**보안 환경 (${rawLogs.secure.length}건${rawLogs.secure.length > MAX_LINES ? `, 상위 ${MAX_LINES}건 표시` : ''}):**`;
    if (secureSample.length > 0) {
      section += '\n```\n' + secureSample.join('\n---\n') + '\n```';
    } else {
      section += '\n(없음 — WAF/SG가 서버 도달 전 차단)';
    }
    return section;
  }

  let section = '\n\n### HTTP Access Logs Received by Server (during attack window)';
  section += `\n\n**Vulnerable environment (${rawLogs.vulnerable.length} requests${rawLogs.vulnerable.length > MAX_LINES ? `, showing top ${MAX_LINES}` : ''}):**`;
  if (vulnSample.length > 0) {
    section += '\n```\n' + vulnSample.join('\n---\n') + '\n```';
  } else {
    section += '\n(none)';
  }
  section += `\n\n**Secure environment (${rawLogs.secure.length} requests${rawLogs.secure.length > MAX_LINES ? `, showing top ${MAX_LINES}` : ''}):**`;
  if (secureSample.length > 0) {
    section += '\n```\n' + secureSample.join('\n---\n') + '\n```';
  } else {
    section += '\n(none — WAF/SG blocked before reaching server)';
  }
  return section;
}

const MODEL_ID =
  process.env.BEDROCK_MODEL_ID || 'us.anthropic.claude-3-5-haiku-20241022-v1:0';
const REGION = process.env.BEDROCK_REGION || 'us-east-1';

function getScenarioContext(scenario: string, lang: 'ko' | 'en'): string {
  const ctx: Record<string, { ko: string; en: string }> = {
    'origin-direct': {
      ko: `
### 환경 아키텍처 구성
- 이 공격은 CloudFront를 거치지 않고 EC2 원본 서버에 직접 요청을 보내는 시도입니다.
- WAF는 CloudFront에 연결되어 있어 이 요청 경로에는 관여하지 않습니다.
- 취약 환경: EC2가 외부에 직접 노출되어 있습니다.
- 보안 환경: EC2 Security Group이 CloudFront 소스에서 오는 트래픽만 허용하도록 구성되어 있습니다.
- SG에서 거부된 요청은 앱까지 도달하지 않으므로 서버 액세스 로그에 남지 않습니다.`,
      en: `
### Environment Architecture
- This attack sends requests directly to the EC2 origin server, bypassing CloudFront.
- WAF is attached to CloudFront and is not involved in this request path.
- Vulnerable environment: EC2 is directly exposed to the internet.
- Secure environment: EC2 Security Group is configured to allow traffic only from CloudFront sources.
- Requests rejected at the SG level never reach the app and will not appear in server access logs.`,
    },
    'rce-injection': {
      ko: `
### 환경 아키텍처 구성
- 이 공격은 HTTP 헤더(User-Agent 등)에 JNDI 페이로드를 삽입해 원격 코드 실행을 시도합니다.
- 요청 흐름: 공격자 → CloudFront → WAF → EC2 앱 (두 환경 모두 동일)
- 취약 환경: WAF 없음 — 페이로드가 그대로 EC2 앱과 로그까지 전달됩니다.
- 보안 환경: WAF에 알려진 악성 입력 패턴 탐지 규칙이 있습니다.
- 두 환경 모두 정상 요청은 HTTP 200이 예상되므로, 차이는 페이로드 포함 요청에 대한 응답에 있습니다.`,
      en: `
### Environment Architecture
- This attack injects JNDI payloads into HTTP headers (e.g., User-Agent) to attempt remote code execution.
- Request flow: Attacker → CloudFront → WAF → EC2 app (same for both environments)
- Vulnerable environment: no WAF — payloads are forwarded as-is to the EC2 app and logged.
- Secure environment: WAF has rules for detecting known malicious input patterns.
- Both environments return HTTP 200 for normal requests; the difference lies in how payload-carrying requests are handled.`,
    },
    'bot-scan': {
      ko: `
### 환경 아키텍처 구성
- 자동화 스캐너가 /admin, /.env, /wp-login.php 등 민감한 경로를 탐색하는 시나리오입니다.
- 요청 흐름: 공격자 → CloudFront → WAF → EC2 앱
- 취약 환경: WAF 없음 — 모든 요청이 EC2 앱까지 전달됩니다.
- 보안 환경: WAF에 의심 경로 탐지 규칙이 구성되어 있습니다.
- 취약 환경 백엔드에는 시연 목적으로 해당 경로에 실제 응답을 반환하는 엔드포인트가 있습니다.`,
      en: `
### Environment Architecture
- An automated scanner probes sensitive paths like /admin, /.env, /wp-login.php.
- Request flow: Attacker → CloudFront → WAF → EC2 app
- Vulnerable environment: no WAF — all requests reach the EC2 app.
- Secure environment: WAF has rules configured for detecting suspicious path patterns.
- The vulnerable backend has demo endpoints at these paths that return actual responses.`,
    },
    'sqli-xss': {
      ko: `
### 환경 아키텍처 구성
- SQL 인젝션·XSS 페이로드를 요청 본문과 쿼리 파라미터에 삽입하는 시나리오입니다.
- 요청 흐름: 공격자 → CloudFront → WAF → EC2 앱 → PostgreSQL DB
- 취약 환경: WAF 없음, 앱 레벨 입력 검증도 없습니다.
- 보안 환경: WAF가 요청 본문과 쿼리 파라미터의 인젝션 패턴을 검사합니다.
- WAF에서 차단된 요청은 서버 액세스 로그에 남지 않습니다.`,
      en: `
### Environment Architecture
- SQL injection and XSS payloads are injected into request body and query parameters.
- Request flow: Attacker → CloudFront → WAF → EC2 app → PostgreSQL DB
- Vulnerable environment: no WAF, no app-level input validation.
- Secure environment: WAF inspects request body and query parameters for injection patterns.
- Requests blocked by WAF will not appear in server access logs.`,
    },
    'bruteforce': {
      ko: `
### 환경 아키텍처 구성
- POST /api/auth/login 엔드포인트에 대량의 크리덴셜 조합을 반복 시도하는 공격입니다.
- 요청 흐름: 공격자 → CloudFront → WAF → EC2 앱 → PostgreSQL DB (인증)
- 취약 환경: WAF 없음, 앱 코드에도 별도 속도 제한 없습니다.
- 보안 환경: WAF에 해당 로그인 엔드포인트에 대한 Rate Limit 규칙이 있습니다.
- HTTP 200 = 로그인 성공, 401 = 크리덴셜 불일치, 429 = 요청 횟수 제한`,
      en: `
### Environment Architecture
- Large volumes of credential combinations are repeatedly attempted against POST /api/auth/login.
- Request flow: Attacker → CloudFront → WAF → EC2 app → PostgreSQL DB (auth)
- Vulnerable environment: no WAF, no rate limiting in app code.
- Secure environment: WAF has a rate limit rule on the login endpoint.
- HTTP 200 = login success, 401 = wrong credentials, 429 = rate-limited`,
    },
    's3-access': {
      ko: `
### 환경 아키텍처 구성
- 다단계 공격 체인입니다: 사용자 열거 → 크리덴셜 탈취 → 파일 업로드 → S3 직접 URL 접근.
- 단계 1~3: 공격자 → CloudFront → WAF → EC2 앱 경로로 API 호출
- 단계 4 (S3 직접 URL): EC2 앱을 경유하지 않고 S3 엔드포인트에 직접 요청 — 서버 액세스 로그에 나타나지 않습니다.
- 취약 환경 S3: 퍼블릭 읽기 접근이 허용되어 있습니다.
- 보안 환경 S3: 퍼블릭 접근이 차단되어 있으며 허가된 주체만 접근 가능합니다.`,
      en: `
### Environment Architecture
- Multi-step attack chain: user enumeration → credential theft → file upload → S3 direct URL access.
- Steps 1–3: API calls via Attacker → CloudFront → WAF → EC2 app
- Step 4 (S3 direct URL): request goes directly to the S3 endpoint, bypassing the EC2 app — will not appear in server access logs.
- Vulnerable environment S3: public read access is enabled.
- Secure environment S3: public access is blocked; only authorized principals can access.`,
    },
  };

  const entry = ctx[scenario];
  if (!entry) return '';
  return lang === 'ko' ? entry.ko : entry.en;
}

function buildPrompt(session: AnalysisSession, lang: 'ko' | 'en'): { system: string; user: string } {
  const chainSection = formatAttackChainSection(session.vulnResults, session.secureResults, lang);
  const rawLogsSection = session.rawLogs ? formatAccessLogsSection(session.rawLogs, lang) : '';
  const scenarioContext = getScenarioContext(session.scenario, lang);

  if (lang === 'ko') {
    return {
      system:
        'You are a cloud security expert analyzing AWS attack simulation results. Respond in Korean. Provide structured, insightful security analysis.',
      user: `## 공격 세션 분석 요청

**시나리오:** ${session.scenarioTitle}
**실행 모드:** ${session.mode === 'auto' ? '자동 배포 (Terraform)' : '수동 배포'}
**실행 시각:** ${new Date(session.timestamp).toLocaleString('ko-KR')}
${scenarioContext}

아래 두 가지 데이터를 교차 분석해 공격의 전모를 파악하세요.
- **공격 체인 실행 결과**: attack-dashboard가 공격을 수행하며 각 단계에서 받은 실제 HTTP 응답 (공격자 시점)
- **서버 수신 액세스 로그**: 취약/보안 환경 백엔드가 실제로 수신한 요청 (서버 시점, WAF 차단된 요청은 미포함)
${chainSection}${rawLogsSection}

다음 5가지 섹션으로 분석해주세요:

## 1. 공격 개요
두 데이터를 근거로 어떤 공격이 어떤 순서로 수행됐는지 설명하세요. 공격 목적과 실제 공격자가 이 기법을 사용하는 맥락도 함께 서술하세요.

## 2. 취약 환경 영향 분석
공격 체인 결과와 서버 액세스 로그를 교차해 취약 환경에서의 공격 결과와 실질적 피해를 분석하세요. 어느 단계에서 성공했는지, 어떤 계정/데이터가 노출됐는지 구체적으로 제시하세요.

## 3. 보안 환경 방어 효과
공격 체인 결과(공격자가 받은 응답)와 서버 액세스 로그(서버 도달 여부)를 함께 분석해 어느 계층에서 어떻게 차단됐는지 설명하세요. 두 데이터 간 불일치(예: 공격자는 403을 받았지만 서버 로그엔 없음 → WAF 선제 차단)도 근거로 활용하세요.

## 4. 공격 재구성
두 데이터를 종합해 공격자의 행동을 시간순으로 재구성하세요. 어떤 IP에서 어떤 단계를 시도했고, 어디서 성공/차단됐는지 구체적으로 서술하세요.

## 5. 환경별 보안 평가 및 결론
아래 형식으로 두 환경을 각각 평가하세요:

**[취약 환경]**
- 보안 수준: (매우 낮음/낮음/보통/높음 중 선택 + 한 줄 근거)
- 주요 위험: (이번 공격으로 확인된 실질적 피해)
- 즉각 조치 필요 사항: (우선순위 순으로 2~3가지)

**[보안 환경]**
- 보안 수준: (매우 낮음/낮음/보통/높음 중 선택 + 한 줄 근거)
- 방어 효과: (어떤 계층의 어떤 메커니즘이 어떻게 작동했는지)
- 개선 가능 사항: (보안 환경이더라도 보완할 점)`,
    };
  }

  return {
    system:
      'You are a cloud security expert analyzing AWS attack simulation results. Respond in English. Provide structured, insightful security analysis.',
    user: `## Attack Session Analysis

**Scenario:** ${session.scenarioTitle}
**Deployment Mode:** ${session.mode === 'auto' ? 'Auto (Terraform)' : 'Manual'}
**Timestamp:** ${new Date(session.timestamp).toLocaleString('en-US')}
${scenarioContext}

Cross-analyze the two data sources below to understand the full scope of the attack:
- **Attack chain execution results**: Actual HTTP responses received at each attack step by the dashboard (attacker's perspective)
- **Server access logs**: Requests actually received by the vulnerable/secure backend servers (server's perspective — WAF-blocked requests are absent)
${chainSection}${rawLogsSection}

Please analyze using the following 5 sections:

## 1. Attack Overview
Using both data sources, describe what attack was performed and in what order. Include the attack objective and real-world context.

## 2. Vulnerable Environment Impact Analysis
Cross-reference the attack chain results and server access logs to analyze the attack outcome and actual damage in the vulnerable environment. Specify at which step the attack succeeded and what accounts/data were exposed.

## 3. Secure Environment Defense Effectiveness
Analyze both the attack chain results (what the attacker received) and server access logs (what reached the server) to explain which layer blocked the attack and how. Use discrepancies between the two (e.g., attacker got 403 but no server log entry → WAF pre-blocked) as evidence.

## 4. Attack Reconstruction
Synthesize both data sources to reconstruct the attacker's actions in chronological order. Detail which IP attempted which steps, and where success or blocking occurred.

## 5. Per-Environment Security Assessment & Conclusion
Evaluate each environment separately using the format below:

**[Vulnerable Environment]**
- Security Level: (Critical/Low/Moderate/High — one-line rationale)
- Key Risk: (actual damage confirmed by this attack)
- Immediate Actions Required: (2–3 items in priority order)

**[Secure Environment]**
- Security Level: (Critical/Low/Moderate/High — one-line rationale)
- Defense Effectiveness: (which layer, which mechanism, how it worked)
- Areas for Improvement: (gaps even in the secure environment)`,
  };
}

export async function* analyzeAttackSession(
  session: AnalysisSession,
  lang: 'ko' | 'en' = 'ko',
): AsyncGenerator<string> {
  const client = new BedrockRuntimeClient({ region: REGION });
  const { system, user } = buildPrompt(session, lang);

  const body = JSON.stringify({
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: 4096,
    system,
    messages: [{ role: 'user', content: user }],
  });

  const command = new InvokeModelWithResponseStreamCommand({
    modelId: MODEL_ID,
    contentType: 'application/json',
    accept: 'application/json',
    body: new TextEncoder().encode(body),
  });

  const response = await client.send(command);
  if (!response.body) return;

  for await (const event of response.body) {
    if (event.chunk?.bytes) {
      const decoded = new TextDecoder().decode(event.chunk.bytes);
      try {
        const parsed = JSON.parse(decoded);
        if (
          parsed.type === 'content_block_delta' &&
          parsed.delta?.type === 'text_delta'
        ) {
          yield parsed.delta.text as string;
        }
      } catch {
        // skip malformed chunk
      }
    }
  }
}
