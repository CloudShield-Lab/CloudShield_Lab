# attack-dashboard

취약/보안 두 환경을 실시간으로 공격하고 결과를 나란히 비교하는 시뮬레이터.

## 로컬 실행

```bash
cp .env.local.example .env.local    # AWS URL은 배포 후 채워넣기
npm install && npm run dev          # → http://localhost:3002
```

---

## 환경변수

| 변수 | 로컬 | AWS | 설명 |
|---|---|---|---|
| `VULNERABLE_API_URL` | `http://localhost:3000` | 취약 EC2 URL | 공격 대상 |
| `VULNERABLE_S3_BUCKET` | `sentinelshare-local` | 취약 버킷명 | |
| `AWS_API_URL` | (빈 값) | CloudFront HTTPS URL | 보안 환경 |
| `AWS_S3_BUCKET` | (빈 값) | 보안 버킷명 | |
| `AWS_REGION` | `ap-northeast-2` | `ap-northeast-2` | |
| `GITHUB_OWNER` | GitHub 사용자명 | GitHub 사용자명 | InfraControl용 |
| `GITHUB_REPO` | `SentinelShare` | `SentinelShare` | InfraControl용 |
| `GITHUB_TOKEN` | GitHub PAT | Secrets Manager | workflow_dispatch 권한 |

---

## 공격 라우트

| 라우트 | 동작 |
|---|---|
| `/api/attack/bruteforce` | 30회 병렬 로그인 시도 → 취약(무제한) vs 보안(WAF 차단) |
| `/api/attack/s3-access` | S3 ListBucket + GetObject → 취약(공개 성공) vs 보안(403) |
| `/api/attack/ratelimit` | 60회 연속 API 요청 → 취약(통과) vs 보안(WAF rate limit) |
| `/api/config` | 현재 환경 설정 반환 (ECS 헬스체크 겸용) |

---

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
    try {
      await send({ type: 'log', message: '시작', target: 'vulnerable' })
      // ... 공격 로직
      await send({ type: 'result', status: 200, target: 'aws' })
    } finally { writer.close() }
  })()

  return new Response(readable, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' }
  })
}

// Client
const es = new EventSource('/api/attack/bruteforce')
es.onmessage = (e) => {
  const data = JSON.parse(e.data)
  // data.target === 'vulnerable' | 'aws' 로 각 패널에 분기
}
es.onerror = () => es.close()
```

---

## Docker & ECS 배포

```dockerfile
FROM node:20-alpine AS builder  → npm ci + next build (output: 'standalone')
FROM node:20-alpine AS runner   → .next/standalone/ 만 복사, non-root user
CMD ["sh", "-c", "HOSTNAME=0.0.0.0 node server.js"]
# ↑ ENV HOSTNAME만으론 ECS가 덮어씀 → CMD에서 강제 고정 필수
```

**ECS Task Definition:** CPU 512 / Memory 2048, 포트 3000, CloudWatch Logs `/ecs/cloudshield-dashboard`

**Secrets Manager 키 (ECS 배포 전 등록):**
```
cloudshield/dashboard/vulnerable-api-url
cloudshield/dashboard/vulnerable-s3-bucket
cloudshield/dashboard/aws-api-url
cloudshield/dashboard/aws-s3-bucket
```

**CI/CD:** `attack-dashboard/**` 변경 시 ECR push → ECS 업데이트 (grace period 120s)
