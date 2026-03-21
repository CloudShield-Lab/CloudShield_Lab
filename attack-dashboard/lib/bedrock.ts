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
    const status = r.status > 0 ? `HTTP ${r.status}` : 'ERR';
    const label = r.label ?? (r.blocked ? (lang === 'ko' ? '차단' : 'BLOCKED') : (lang === 'ko' ? '통과' : 'PASSED'));
    const isS3Direct = r.url && r.url.includes('amazonaws.com');
    const urlNote = isS3Direct
      ? lang === 'ko'
        ? ` [S3 직접 접근 — WAF/CloudFront 비경유: ${r.url}]`
        : ` [S3 direct access — bypasses WAF/CloudFront: ${r.url}]`
      : r.url ? ` [${r.url}]` : '';
    return `  ${lang === 'ko' ? '시도' : 'Attempt'} ${r.attempt}: ${status} — ${label}${urlNote} (${r.latency}ms)`;
  };

  const vulnSample = vulnResults.slice(0, MAX);
  const secureSample = secureResults.slice(0, MAX);

  if (lang === 'ko') {
    let section = '\n\n### 공격 체인 실행 결과 (공격자 시점)';
    section += '\n서버 액세스 로그에 기록되지 않는 단계(S3 직접 접근 등)의 결과도 포함됩니다.';

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
  section += '\nIncludes steps not recorded in server access logs (e.g., direct S3 access).';

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
### 시나리오 아키텍처 참고 (AI 분석 정확도용)
- 이 공격은 CloudFront를 우회해 EC2 원본 서버에 직접 HTTP 요청을 보내는 시도입니다.
- WAF는 CloudFront에 연결되어 있으므로, 직접 접근 경로에서는 WAF가 관여하지 않습니다.
- 보안 환경의 EC2 Security Group은 CloudFront prefix list(pl-22a6434b)만 허용 → 직접 접근은 SG 레벨에서 네트워크 차단됩니다 (앱/WAF 도달 전 TCP 연결 자체가 거부됨).
- 따라서 보안 환경 차단 시 서버 HTTP 로그에 해당 요청이 전혀 남지 않습니다 (SG가 패킷을 드롭).
- 취약 환경의 SG는 0.0.0.0/0을 허용하므로 직접 접근이 EC2 앱까지 도달합니다.`,
      en: `
### Scenario Architecture Notes (for accurate AI analysis)
- This attack attempts to bypass CloudFront and send HTTP requests directly to the EC2 origin server.
- WAF is attached to CloudFront, so it does NOT participate in the direct-access path.
- The secure environment's EC2 Security Group allows only the CloudFront prefix list (pl-22a6434b) → direct access is blocked at the network/SG layer before reaching the app or WAF (TCP connection is refused).
- Therefore, if blocked in the secure environment, NO server HTTP logs will contain the request (SG drops the packet).
- The vulnerable environment's SG allows 0.0.0.0/0, so direct access reaches the EC2 app.`,
    },
    'header-scan': {
      ko: `
### 시나리오 아키텍처 참고 (AI 분석 정확도용)
- 이 공격은 HTTP 응답 헤더를 분석해 기술 스택(서버, 프레임워크, 버전 등)을 핑거프린팅하는 정찰 기법입니다.
- 요청 자체는 정상 GET이므로 WAF가 차단하지 않습니다 — 차이는 응답 헤더에 있습니다.
- 보안 환경: CloudFront가 X-Powered-By, Server 등 백엔드 식별 헤더를 제거하거나 덮어씁니다.
- 취약 환경: 백엔드가 응답 헤더를 그대로 노출(X-Powered-By: Express, Server: Node.js 등).
- 이 시나리오에서 서버 HTTP 로그는 두 환경 모두 존재하지만, 차이는 응답 내용(헤더)에 있습니다.`,
      en: `
### Scenario Architecture Notes (for accurate AI analysis)
- This attack is a reconnaissance technique that fingerprints the technology stack (server, framework, versions) by analyzing HTTP response headers.
- Requests are standard GETs, so WAF does not block them — the difference lies in the response headers.
- Secure environment: CloudFront strips or overwrites backend-identifying headers (X-Powered-By, Server, etc.).
- Vulnerable environment: Backend exposes headers verbatim (e.g., X-Powered-By: Express, Server: Node.js).
- Server HTTP logs will exist in both environments; the difference is in the response content (headers), not blocking.`,
    },
    'bot-scan': {
      ko: `
### 시나리오 아키텍처 참고 (AI 분석 정확도용)
- 이 공격은 자동화된 스캐너가 /admin, /.env, /wp-login.php 등 민감한 경로를 탐색하는 시나리오입니다.
- 요청 흐름: 공격자 → CloudFront → WAF → EC2 앱 (보안 환경에서 WAF가 차단).
- 보안 환경: WAF AWSManagedRulesCommonRuleSet + BotControlRuleSet이 탐색 패턴을 감지해 차단 → EC2에 도달하지 않으므로 서버 로그에 없음.
- 취약 환경: WAF 없음 → EC2 앱이 직접 수신 → 서버 로그에 기록됨.
- 취약 환경 백엔드에는 시연용 모의 민감 데이터 엔드포인트가 구성되어 있어 실제 응답 본문이 반환됩니다.
- CloudFront는 중간에 있지만 요청을 차단하지 않고 WAF로 전달하는 역할만 합니다 (차단 주체는 WAF).`,
      en: `
### Scenario Architecture Notes (for accurate AI analysis)
- This attack simulates an automated scanner probing sensitive paths like /admin, /.env, /wp-login.php.
- Request flow: Attacker → CloudFront → WAF → EC2 app (WAF blocks in the secure environment).
- Secure environment: WAF AWSManagedRulesCommonRuleSet + BotControlRuleSet detects scan patterns and blocks → request never reaches EC2, so absent from server logs.
- Vulnerable environment: No WAF → EC2 app receives directly → logged in server access logs.
- The vulnerable backend has mock sensitive-data endpoints configured for demo purposes, returning realistic fake response bodies.
- CloudFront is in the path but only forwards to WAF — the blocking entity is WAF, not CloudFront itself.`,
    },
    'sqli-xss': {
      ko: `
### 시나리오 아키텍처 참고 (AI 분석 정확도용)
- 이 공격은 쿼리 파라미터/입력값에 SQL 인젝션 페이로드와 XSS 스크립트를 삽입하는 시나리오입니다.
- 보안 환경: WAF AWSManagedRulesSQLiRuleSet + AWSManagedRulesCommonRuleSet(XSS 룰)이 요청을 검사해 차단 → EC2/DB에 도달하지 않음.
- 취약 환경: 별도 WAF 없음 + 앱 내 입력 검증 없음 → SQL 인젝션이 DB에 직접 도달 가능.
- 보안 환경에서 WAF가 차단한 요청은 서버 HTTP 로그에 없고, 공격자는 403을 수신합니다.
- SQL 인젝션 성공 시 DB 레코드 유출, XSS 성공 시 사용자 브라우저에서 스크립트 실행 가능.`,
      en: `
### Scenario Architecture Notes (for accurate AI analysis)
- This attack injects SQL injection payloads and XSS scripts into query parameters and input fields.
- Secure environment: WAF AWSManagedRulesSQLiRuleSet + AWSManagedRulesCommonRuleSet (XSS rules) inspect and block requests → never reaches EC2 or DB.
- Vulnerable environment: No WAF + no app-level input validation → SQL injection reaches the database directly.
- Requests blocked by WAF in the secure environment will be absent from server HTTP logs; the attacker receives a 403.
- Successful SQL injection can leak DB records; successful XSS can execute scripts in the victim's browser.`,
    },
    'bruteforce': {
      ko: `
### 시나리오 아키텍처 참고 (AI 분석 정확도용)
- 이 공격은 대량의 이메일/패스워드 조합을 /api/auth/login에 반복 시도하는 크리덴셜 스터핑입니다.
- 보안 환경: WAF 속도 제한(Rate Limit) 규칙이 동일 IP의 반복 요청을 일정 임계치 이후 차단 → 429 응답.
- 취약 환경: WAF 없음 → 모든 시도가 EC2 앱 → DB 인증까지 도달 → 올바른 크리덴셜로 로그인 성공 가능.
- 앱 코드에 authLimiter(Express rate-limit)는 의도적으로 없음 — rate limit은 WAF 담당 아키텍처.
- 보안 환경에서도 임계치 이전 요청은 EC2에 도달하므로 서버 로그 초반부에는 요청이 기록됩니다.
- 탈취 성공 계정(HTTP 200 응답)은 실제 DB에 존재하는 시연용 계정입니다.`,
      en: `
### Scenario Architecture Notes (for accurate AI analysis)
- This attack is a credential stuffing attempt — repeatedly trying email/password combinations against /api/auth/login.
- Secure environment: WAF Rate Limit rule throttles repeated requests from the same IP after a threshold → 429 responses.
- Vulnerable environment: No WAF → all attempts reach EC2 app → DB authentication → correct credentials can succeed.
- The app code intentionally has no authLimiter (Express rate-limit) — rate limiting is the WAF's responsibility by architecture design.
- In the secure environment, requests below the threshold do reach EC2, so early server logs will contain some entries.
- Successfully compromised accounts (HTTP 200 responses) are real demo accounts seeded in the database.`,
    },
    's3-access': {
      ko: `
### 시나리오 아키텍처 참고 (AI 분석 정확도용)
- 이 공격은 다단계 체인입니다: (1) 사용자 열거 → (2) 크리덴셜 탈취 → (3) 악성 파일 업로드 → (4) S3 직접 URL 접근.
- 단계 1~3: CloudFront → WAF → EC2 경로를 통해 API 호출 → WAF가 이 단계들을 보호.
- 단계 4 (S3 직접 URL 접근): CloudFront를 전혀 경유하지 않음 → S3 엔드포인트에 직접 요청 → WAF 비관여.
- 단계 4의 유일한 방어: S3 Block Public Access 설정 + 버킷 정책 (보안 환경: 차단 / 취약 환경: 공개 허용).
- 단계 4는 EC2 앱을 거치지 않으므로 서버 HTTP 액세스 로그에 기록되지 않습니다.
- 공격 체인 실행 결과에 's3.amazonaws.com' URL이 포함된 항목이 단계 4입니다.`,
      en: `
### Scenario Architecture Notes (for accurate AI analysis)
- This attack is a multi-step chain: (1) user enumeration → (2) credential theft → (3) malicious file upload → (4) S3 direct URL access.
- Steps 1–3: API calls via CloudFront → WAF → EC2 → WAF protects these steps.
- Step 4 (S3 direct URL access): Completely bypasses CloudFront → requests go directly to the S3 endpoint → WAF is NOT involved.
- The only defense at step 4: S3 Block Public Access + bucket policy (secure env: blocked / vulnerable env: publicly readable).
- Step 4 bypasses the EC2 app entirely, so it will NOT appear in server HTTP access logs.
- In the attack chain results, entries with 's3.amazonaws.com' URLs represent step 4.`,
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
