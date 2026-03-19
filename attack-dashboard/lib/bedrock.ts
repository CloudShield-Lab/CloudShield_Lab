import {
  BedrockRuntimeClient,
  InvokeModelWithResponseStreamCommand,
} from '@aws-sdk/client-bedrock-runtime';
import type { AnalysisSession, WazuhAlert } from '@/types';

const MODEL_ID =
  process.env.BEDROCK_MODEL_ID || 'us.anthropic.claude-3-5-haiku-20241022-v1:0';
const REGION = process.env.BEDROCK_REGION || 'us-east-1';

function formatWazuhSection(alerts: WazuhAlert[], lang: 'ko' | 'en'): string {
  if (!alerts || alerts.length === 0) return '';

  const vulnAlerts = alerts.filter((a) => a.agent.name.includes('vulnerable'));
  const secureAlerts = alerts.filter((a) => !a.agent.name.includes('vulnerable'));

  const formatList = (list: WazuhAlert[]) =>
    list
      .map(
        (a) =>
          `- [Level ${a.rule.level}] ${a.rule.description} (rule ${a.rule.id}, agent: ${a.agent.name}, ${a.timestamp})`,
      )
      .join('\n');

  if (lang === 'ko') {
    let section = '\n\n### Wazuh HIDS 알림 (공격 시간대)';
    if (vulnAlerts.length > 0)
      section += `\n\n**취약 환경 알림 (${vulnAlerts.length}건):**\n${formatList(vulnAlerts)}`;
    if (secureAlerts.length > 0)
      section += `\n\n**보안 환경 알림 (${secureAlerts.length}건):**\n${formatList(secureAlerts)}`;
    return section;
  }

  let section = '\n\n### Wazuh HIDS Alerts (during attack window)';
  if (vulnAlerts.length > 0)
    section += `\n\n**Vulnerable environment (${vulnAlerts.length} alerts):**\n${formatList(vulnAlerts)}`;
  if (secureAlerts.length > 0)
    section += `\n\n**Secure environment (${secureAlerts.length} alerts):**\n${formatList(secureAlerts)}`;
  return section;
}

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
- 평균 응답시간: ${session.metrics.secure.avgLatency}ms${formatWazuhSection(session.wazuhAlerts ?? [], 'ko')}

다음 ${session.wazuhAlerts && session.wazuhAlerts.length > 0 ? '5가지' : '4가지'} 섹션으로 분석해주세요:

## 1. 공격 개요
시나리오 설명 및 공격 목적, 실제 공격자가 이 기법을 사용하는 맥락을 설명하세요.

## 2. 취약 환경 영향 분석
취약 환경에서의 공격 결과(차단율 ${vulnBlockRate}%)와 보안 위험, 실제 피해 가능성을 분석하세요.

## 3. 보안 환경 방어 효과
보안 환경의 차단 메커니즘(WAF, CloudFront 등)과 효과(차단율 ${secureBlockRate}%)를 설명하세요.

## 4. 핵심 인사이트
두 환경 비교를 통한 주요 보안 교훈과 실제 운영 환경에 적용할 권고사항을 제시하세요.${session.wazuhAlerts && session.wazuhAlerts.length > 0 ? `

## 5. 호스트 레벨 탐지 분석 (Wazuh HIDS)
위의 Wazuh HIDS 알림을 기반으로 호스트 레벨에서 탐지된 위협을 분석하세요. WAF(네트워크 레벨) 방어와 HIDS(호스트 레벨) 탐지의 역할 차이와 상호 보완 관계를 설명하세요.` : ''}`,
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
- Avg response time: ${session.metrics.secure.avgLatency}ms${formatWazuhSection(session.wazuhAlerts ?? [], 'en')}

Please analyze using the following ${session.wazuhAlerts && session.wazuhAlerts.length > 0 ? '5' : '4'} sections:

## 1. Attack Overview
Describe the scenario, attack objectives, and the real-world context in which attackers use this technique.

## 2. Vulnerable Environment Impact Analysis
Analyze the attack results in the vulnerable environment (block rate: ${vulnBlockRate}%), security risks, and potential real-world damage.

## 3. Secure Environment Defense Effectiveness
Explain the defense mechanisms (WAF, CloudFront, etc.) and their effectiveness (block rate: ${secureBlockRate}%).

## 4. Key Insights
Provide major security lessons from comparing both environments and actionable recommendations for production environments.${session.wazuhAlerts && session.wazuhAlerts.length > 0 ? `

## 5. Host-Level Detection Analysis (Wazuh HIDS)
Based on the Wazuh HIDS alerts above, analyze host-level threats detected during the attack. Explain the difference between WAF (network-level) defense and HIDS (host-level) detection, and how they complement each other.` : ''}`,
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
    max_tokens: 3000,
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
