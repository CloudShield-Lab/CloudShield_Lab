# attack-dashboard — Claude Code Context
<!-- 전체 아키텍처/보안 규칙/로드맵은 루트 CLAUDE.md 참조 -->

## 역할
취약/보안 두 환경을 실시간으로 공격하고 결과를 나란히 비교하는 시뮬레이터.
- 포트 `3002`, ECR 레포 `cloudshield-dashboard`, ECS Fargate 배포, `output: 'standalone'`

## File Map
```
app/layout.tsx                          Navbar + EnvironmentStatus 전역 마운트
app/page.tsx                            InfraControl + DashboardHome
app/auto/attack/[scenario]/page.tsx     자동 배포 모드 공격 시나리오 (mode="auto")
app/manual/attack/[scenario]/page.tsx   수동 구성 모드 공격 시나리오 (mode="manual")
app/auto/analysis/page.tsx              AI 사후 분석 (자동 모드)
app/manual/analysis/page.tsx            AI 사후 분석 (수동 모드)
app/guide/                              인프라 구성 가이드 페이지들
app/api/config/route.ts                 GET → 환경 설정 반환 + tfstate fallback (ECS 헬스체크 겸용)
app/api/analysis/save/route.ts          POST: 공격 세션 S3 저장
app/api/analysis/sessions/route.ts      GET: 세션 목록 (?mode=auto|manual)
app/api/analysis/[sessionId]/route.ts   GET: 세션 상세 (?key=s3Key)
app/api/analysis/analyze/route.ts       POST: Bedrock AI 분석 SSE 스트림
app/api/analysis/wazuh-alerts/route.ts  GET: Wazuh 알림 조회 (Phase 3)
app/api/terraform-outputs/route.ts      GET/POST → S3 tfstate 읽기, POST는 캐시 무효화
app/api/infra/deploy/route.ts           SSE: GitHub Actions workflow_dispatch + 폴링
                                        ref: 'dev', GITHUB_TOKEN 환경변수 필요
app/api/attack/bruteforce/route.ts      POST: 크리덴셜 스터핑 (credentials[] + mode)
app/api/attack/s3-access/route.ts       GET: S3 버킷 열거 (?mode=)
app/api/attack/ratelimit/route.ts       GET: 고빈도 요청 (?mode=)
components/InfraControl.tsx             취약/보안 독립 패널 배포/삭제 + 배포 완료 후 URL 자동 표시
components/AttackCard.tsx               공격 카드 (s3-access, ratelimit용) — mode prop 필수, complete 시 세션 자동 저장
components/BruteforceAttackCard.tsx     브루트포스 전용 카드 — CredentialEditor + 탈취 계정 누적 표시 + 세션 자동 저장
components/HeaderScanCard.tsx           HTTP 헤더 스캔 카드 — 세션 자동 저장
components/AnalysisPage.tsx             사후 분석 메인 페이지 (세션 목록 + AI 분석)
components/SessionList.tsx              세션 목록 (S3에서 로드, 시나리오/날짜/모드 표시)
components/AiAnalysisPanel.tsx          AI 분석 패널 — Bedrock SSE 스트림, KO/EN 토글
components/CredentialEditor.tsx         100쌍 크리덴셜 인라인 편집 (토글형 테이블)
components/EnvironmentStatus.tsx        pathname 기반 mode 감지 → 취약/보안 URL 표시
components/workspace/AttackScenarioContent.tsx  bruteforce → BruteforceAttackCard, 나머지 → AttackCard
                                                auto 미배포 시 amber 배너
lib/default-credentials.ts             기본 100쌍 크리덴셜 (77번: victim@demo.com / Demo1234!)
lib/terraform-state.ts                 S3 tfstate 읽기 + 30초 인메모리 캐시
lib/url-utils.ts                        normalizeApiBaseUrl() — /api suffix 자동 제거
lib/attack-scenarios.ts                 4개 시나리오 설정값
lib/analysis-storage.ts                 S3 세션 저장/조회 (saveSession, listSessions, getSessionById)
lib/bedrock.ts                          Amazon Bedrock Claude 스트리밍 분석 (analyzeAttackSession)
types/index.ts                          WorkspaceMode, DashboardConfig, AnalysisSession, SessionMeta 등
```

## 수동/자동 모드 분리 아키텍처
- `WorkspaceMode = 'manual' | 'auto'`
- page → `AttackScenarioContent(mode)` → `AttackCard(mode)` / `BruteforceAttackCard(mode)` → API route(`?mode=` or body)
- attack API route: `URL_MAP = { manual: { vulnerable, aws }, auto: { vulnerable, aws } }`
- `EnvironmentStatus`: pathname `/auto/*` → autoVulnerable/autoAws, 나머지 → vulnerable/aws

## CloudFront 오탐 방지 (중요)
보안 환경 CloudFront는 WAF 403을 `custom_error_response`로 200+HTML(SPA index.html)로 변환함.
→ attack route에서 `200 && Content-Type != application/json` 이면 실제 상태를 403(WAF BLOCKED)으로 재판정.
브루트포스(`tryLogin`)와 ratelimit(`floodRequest`) 모두 적용. 새 시나리오 추가 시도 동일하게 처리할 것.

## URL 정규화 (중요)
`AUTO_AWS_API_URL`은 `/api` suffix 포함 형태로 입력될 수 있음 (`https://xxx.cloudfront.net/api`).
attack route에서는 반드시 `normalizeApiBaseUrl(url)` 적용 후 `/api/...` 경로 붙일 것.

## SSE 스트리밍 패턴 (GET 시나리오용)
```typescript
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const mode = url.searchParams.get('mode') === 'auto' ? 'auto' : 'manual'
  const VULNERABLE_URL = URL_MAP[mode].vulnerable || 'http://localhost:3000'
  const AWS_URL = URL_MAP[mode].aws
  // ...TransformStream SSE 패턴
}
```

## POST 스트리밍 패턴 (bruteforce용)
```typescript
// Route: POST, body: { credentials: Credential[], mode: 'manual'|'auto' }
// Client: fetch POST + response.body.getReader() 수동 파싱 ("data: {...}\n\n")
```

## Terraform tfstate 자동 읽기
- S3 버킷: `sentinelshare-terraform-state-833453046706-ap-northeast-2-an`
- vulnerable 키: `vulnerable/terraform.tfstate`, secure 키: `secure/terraform.tfstate`
- `/api/config`에서 AUTO_* env var 없으면 tfstate fallback 자동 적용
- ECS 동작 조건: `cloudshield-dashboard-task-role`에 해당 S3 버킷 `GetObject` 권한 필요

## 환경변수
```
# 수동 구성
VULNERABLE_API_URL, VULNERABLE_FRONTEND_URL, VULNERABLE_S3_BUCKET
AWS_API_URL, AWS_S3_BUCKET, AWS_REGION

# 자동 배포 (Terraform) — 없으면 tfstate에서 자동 읽기
AUTO_VULNERABLE_API_URL, AUTO_VULNERABLE_FRONTEND_URL, AUTO_VULNERABLE_S3_BUCKET
AUTO_AWS_API_URL, AUTO_AWS_S3_BUCKET

# 기타
GITHUB_OWNER, GITHUB_REPO, GITHUB_TOKEN   — InfraControl workflow_dispatch용
LOCALSTACK_URL                             — 로컬 S3 테스트용

# AI 사후 분석
ANALYSIS_S3_BUCKET   — 세션 저장 버킷 (기본: tfstate 버킷)
ANALYSIS_S3_PREFIX   — S3 key prefix (기본: analysis-sessions)
BEDROCK_MODEL_ID     — Claude 모델 ID (기본: anthropic.claude-3-5-haiku-20241022-v1:0)
BEDROCK_REGION       — Bedrock 리전 (기본: us-east-1)

# Wazuh
WAZUH_API_URL        — Wazuh API 주소 (예: https://10.1.101.167:55000), Secrets Manager
WAZUH_API_USER       — Wazuh API 사용자명, Secrets Manager
WAZUH_API_PASSWORD   — Wazuh API 비밀번호, Secrets Manager
WAZUH_INSECURE       — true 설정 시 TLS 인증서 검증 비활성화 (자체 서명 cert 환경, ecs-task-def에 설정됨)
```

## AI 분석 IAM 권한 (cloudshield-dashboard-task-role에 수동 추가 필요)
```json
{
  "Effect": "Allow",
  "Action": ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
  "Resource": "arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-5-haiku-20241022-v1:0"
},
{
  "Effect": "Allow",
  "Action": ["s3:PutObject", "s3:GetObject", "s3:ListBucket"],
  "Resource": [
    "arn:aws:s3:::sentinelshare-terraform-state-833453046706-ap-northeast-2-an/analysis-sessions/*",
    "arn:aws:s3:::sentinelshare-terraform-state-833453046706-ap-northeast-2-an"
  ]
}
```
- ECS 배포 시 `secrets` 항목은 Secrets Manager ARN으로 주입 (ecs-task-definition-dashboard.json 참조)

## 시나리오 현황
| key | 컴포넌트 | 상태 |
|-----|---------|------|
| bruteforce | BruteforceAttackCard | 완료 — 크리덴셜 스터핑, 탈취 계정 표시 |
| s3-access | AttackCard (GET) | 기존 유지 |
| ratelimit | AttackCard (GET) | 기존 유지 |

새 시나리오 추가 시:
1. `lib/attack-scenarios.ts`에 config 추가
2. `app/api/attack/<key>/route.ts` 생성 (URL_MAP + normalizeApiBaseUrl + CF 오탐 방지)
3. 필요 시 전용 카드 컴포넌트 생성, 아니면 AttackCard 재사용
4. `AttackScenarioContent.tsx`에 조건 추가
