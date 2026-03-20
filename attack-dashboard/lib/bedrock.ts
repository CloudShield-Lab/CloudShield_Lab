import {
  BedrockRuntimeClient,
  InvokeModelWithResponseStreamCommand,
} from '@aws-sdk/client-bedrock-runtime';
import type { AnalysisSession } from '@/types';

function formatRawLogsSection(
  rawLogs: { vulnerable: string[]; secure: string[] },
  lang: 'ko' | 'en',
): string {
  const MAX_LINES = 80;
  const vulnSample = rawLogs.vulnerable.slice(0, MAX_LINES);
  const secureSample = rawLogs.secure.slice(0, MAX_LINES);

  if (vulnSample.length === 0 && secureSample.length === 0) return '';

  if (lang === 'ko') {
    let section = '\n\n### 서버 수신 Raw HTTP 로그 (공격 시간대)';
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

  let section = '\n\n### Raw HTTP Logs Received by Server (during attack window)';
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


function buildPrompt(session: AnalysisSession, lang: 'ko' | 'en'): { system: string; user: string } {
  const vulnBlocked = session.vulnResults.filter((r) => r.blocked).length;
  const secureBlocked = session.secureResults.filter((r) => r.blocked).length;
  const vulnTotal = session.vulnResults.length;
  const secureTotal = session.secureResults.length;
  const vulnBlockRate = vulnTotal > 0 ? Math.round((vulnBlocked / vulnTotal) * 100) : 0;
  const secureBlockRate = secureTotal > 0 ? Math.round((secureBlocked / secureTotal) * 100) : 0;

  if (lang === 'ko') {
    return {
      system:
        'You are a cloud security expert analyzing AWS attack simulation results. Respond in Korean. Provide structured, insightful security analysis.',
      user: `## 공격 세션 분석 요청

**시나리오:** ${session.scenarioTitle}
**실행 모드:** ${session.mode === 'auto' ? '자동 배포 (Terraform)' : '수동 배포'}
**실행 시각:** ${new Date(session.timestamp).toLocaleString('ko-KR')}

### 취약 환경 결과
- 총 요청: ${vulnTotal}건
- 차단됨: ${vulnBlocked}건 (${vulnBlockRate}%)
- 통과됨: ${vulnTotal - vulnBlocked}건
- 평균 응답시간: ${session.metrics.vuln.avgLatency}ms

### 보안 환경 결과
- 총 요청: ${secureTotal}건
- 차단됨: ${secureBlocked}건 (${secureBlockRate}%)
- 통과됨: ${secureTotal - secureBlocked}건
- 평균 응답시간: ${session.metrics.secure.avgLatency}ms${session.rawLogs ? formatRawLogsSection(session.rawLogs, 'ko') : ''}

다음 5가지 섹션으로 분석해주세요:

## 1. 공격 개요
시나리오 설명 및 공격 목적, 실제 공격자가 이 기법을 사용하는 맥락을 설명하세요.

## 2. 취약 환경 영향 분석
취약 환경에서의 공격 결과(차단율 ${vulnBlockRate}%)와 보안 위험, 실제 피해 가능성을 분석하세요. 위의 서버 raw HTTP 로그를 근거로 구체적인 수치(시도 횟수, 성공한 계정, 사용된 패스워드 등)를 제시하세요.

## 3. 보안 환경 방어 효과
보안 환경의 차단 메커니즘(WAF, CloudFront 등)과 효과(차단율 ${secureBlockRate}%)를 설명하세요. 서버 raw 로그가 없다면 그것이 의미하는 바(WAF 선제 차단으로 서버 미도달)를 명시하세요.

## 4. Raw 로그 기반 공격 재구성
위의 raw HTTP 로그를 기반으로 공격자의 행동을 시간순으로 재구성하세요. 어떤 IP에서, 어떤 계정을, 어떤 패스워드로 시도했는지, 언제 성공했는지 구체적으로 서술하세요. 취약/보안 환경 간 서버 도달 로그 수 차이가 의미하는 바를 분석하세요.

## 5. 환경별 보안 평가 및 결론
아래 형식으로 두 환경을 각각 평가하세요:

**[취약 환경]**
- 보안 수준: (매우 낮음/낮음/보통/높음 중 선택 + 한 줄 근거)
- 주요 위험: (이번 공격으로 확인된 실질적 피해)
- 즉각 조치 필요 사항: (우선순위 순으로 2~3가지)

**[보안 환경]**
- 보안 수준: (매우 낮음/낮음/보통/높음 중 선택 + 한 줄 근거)
- 방어 효과: (어떤 메커니즘이 어떻게 작동했는지)
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

### Vulnerable Environment Results
- Total requests: ${vulnTotal}
- Blocked: ${vulnBlocked} (${vulnBlockRate}%)
- Passed: ${vulnTotal - vulnBlocked}
- Avg response time: ${session.metrics.vuln.avgLatency}ms

### Secure Environment Results
- Total requests: ${secureTotal}
- Blocked: ${secureBlocked} (${secureBlockRate}%)
- Passed: ${secureTotal - secureBlocked}
- Avg response time: ${session.metrics.secure.avgLatency}ms${session.rawLogs ? formatRawLogsSection(session.rawLogs, 'en') : ''}

Please analyze using the following 5 sections:

## 1. Attack Overview
Describe the scenario, attack objectives, and the real-world context in which attackers use this technique.

## 2. Vulnerable Environment Impact Analysis
Analyze the attack results in the vulnerable environment (block rate: ${vulnBlockRate}%), security risks, and potential real-world damage. Use the raw HTTP server logs above to provide specific evidence (attempt counts, compromised accounts, passwords used, etc.).

## 3. Secure Environment Defense Effectiveness
Explain the defense mechanisms (WAF, CloudFront, etc.) and their effectiveness (block rate: ${secureBlockRate}%). If raw server logs are absent, explicitly state what that means (WAF pre-blocking prevented server reach).

## 4. Attack Reconstruction from Raw Logs
Using the raw HTTP logs above, reconstruct the attacker's actions in chronological order. Detail which IP, which accounts, which passwords were attempted, and when a breach occurred. Analyze the significance of the difference in server-side log volume between vulnerable and secure environments.

## 5. Per-Environment Security Assessment & Conclusion
Evaluate each environment separately using the format below:

**[Vulnerable Environment]**
- Security Level: (Critical/Low/Moderate/High — one-line rationale)
- Key Risk: (actual damage confirmed by this attack)
- Immediate Actions Required: (2–3 items in priority order)

**[Secure Environment]**
- Security Level: (Critical/Low/Moderate/High — one-line rationale)
- Defense Effectiveness: (which mechanisms worked and how)
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
