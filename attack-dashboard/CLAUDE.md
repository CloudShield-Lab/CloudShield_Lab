# attack-dashboard — Claude Code Context
<!-- 전체 아키텍처/보안 규칙/로드맵은 루트 CLAUDE.md 참조 -->

## 역할
취약/보안 두 환경을 실시간으로 공격하고 결과를 나란히 비교하는 시뮬레이터.
- 포트 `3002`, ECR 레포 `cloudshield-dashboard`, ECS Fargate 배포, `output: 'standalone'`

## File Map
```
app/layout.tsx                      Navbar + EnvironmentStatus 전역 마운트
app/page.tsx                        InfraControl + 팀원 DashboardHome + AttackCard들
app/guide/page.tsx                  인프라 가이드 홈
app/guide/vulnerable/page.tsx       취약 환경 구성 가이드
app/guide/secure/page.tsx           보안 환경 구성 가이드
app/api/config/route.ts             GET → 환경 설정 반환 (ECS 헬스체크 겸용)
app/api/infra/deploy/route.ts       SSE: GitHub Actions workflow_dispatch + 상태 폴링
                                    ref: 'dev', GITHUB_TOKEN 환경변수 필요
app/api/attack/bruteforce/route.ts  SSE: 30회 병렬 로그인 시도
app/api/attack/s3-access/route.ts   SSE: S3 버킷 열거 + 파일 직접 접근 시도
app/api/attack/ratelimit/route.ts   SSE: 60회 연속 API 요청
components/InfraControl.tsx         취약/보안 독립 패널 동시 배포/삭제 — 각 환경 별도 SSE
components/AttackCard.tsx           공격 카드 — 취약 결과 / AWS 결과 나란히 비교
components/Navbar.tsx               Attack Simulator / Infrastructure Guide 탭
components/EnvironmentStatus.tsx    취약/보안 연결 상태 표시줄
components/CodeBlock.tsx            복사 버튼 있는 코드블록 (가이드용)
components/StepCard.tsx             번호+제목+경고 step 카드 (가이드용)
```

## SSE 스트리밍 패턴
```typescript
// Route Handler
export async function GET() {
  const encoder = new TextEncoder()
  const { readable, writable } = new TransformStream()
  const writer = writable.getWriter()
  const send = async (data: object) =>
    writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))

  ;(async () => {
    try { await send({ type: 'log', message: '...' }) }
    finally { writer.close() }
  })()

  return new Response(readable, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' }
  })
}

// Client
const es = new EventSource('/api/attack/bruteforce')
es.onmessage = (e) => { const data = JSON.parse(e.data) }
es.onerror = () => es.close()
```

## 환경변수
- `VULNERABLE_API_URL`, `VULNERABLE_S3_BUCKET`, `AWS_API_URL`, `AWS_S3_BUCKET`
- `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_TOKEN` — InfraControl workflow_dispatch용
- ECS 배포 시 Secrets Manager에서 주입
