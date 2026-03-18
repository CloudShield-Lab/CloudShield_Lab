# sentinel-share-frontend — Claude Code Context

<!-- 이 파일은 프론트엔드 작업 시 필요한 세부 컨텍스트를 담는다.
     프로젝트 전체 아키텍처/보안 규칙/로드맵은 루트 CLAUDE.md 참조. -->

---

## 역할

사용자용 파일 관리 웹 애플리케이션. Next.js 15 App Router + TypeScript + Tailwind CSS.

- 포트: `3001` (개발: `npm run dev -- -p 3001`)
- 백엔드 연결: `NEXT_PUBLIC_API_URL` 환경변수

---

## 배포 방식 <!-- LAST_UPDATED: 2026-03-16 -->

- **S3 정적 배포** — `STATIC_EXPORT=true npm run build` → `out/` → `aws s3 sync`
- **취약 환경**: `sentinel-share-vul-frontend` S3 버킷 (Block Public Access OFF, 직접 접근)
- **보안 환경**: `sentinel-share-secure-frontend` S3 버킷 (CloudFront `dyfs11nls1dwb.cloudfront.net` 경유)
- **CI/CD**: `.github/workflows/deploy-frontend.yml` — 취약/보안 별도 빌드 + 배포

---

## File Map <!-- LAST_UPDATED: 2026-03-13 -->

```
lib/api.ts                  모든 API 호출의 단일 진입점 — Bearer 토큰 자동 주입
                            에러 파싱: { error: string } 과 { errors: [{msg}] } 두 형식 처리
lib/auth.ts                 localStorage 기반 세션 헬퍼 (saveSession, getToken, clearSession)
types/index.ts              공유 타입 정의 (User, FileRecord, ShareLink 등)
components/AuthGuard.tsx    보호된 페이지 래퍼 — 토큰 없으면 /login 리디렉션
app/layout.tsx              기본 HTML 레이아웃 (globals.css 포함)
app/page.tsx                루트 → /dashboard 리디렉션 (또는 랜딩 페이지)
app/(auth)/login/page.tsx   로그인 페이지
app/(auth)/signup/page.tsx  회원가입 페이지
app/dashboard/page.tsx      파일 목록 + 업로드 폼 (통합 페이지)
app/shared/[token]/page.tsx 공유 링크 다운로드 페이지 — 인증 불필요
next.config.ts              보안 헤더 설정 (X-Frame-Options, X-Content-Type-Options 등)
```

---

## 타입 정의 (`types/index.ts`) <!-- LAST_UPDATED: 2026-03-13 -->

```typescript
interface User        { id: string; email: string; role: 'user' | 'admin' }
interface FileRecord  { id: string; original_name: string; mime_type: string; size_bytes: number; created_at: string }
interface ShareLink   { id: string; file_id: string; token: string; expires_at: string; created_at: string }
interface AuthResponse      { token: string; user: User }
interface DownloadResponse  { url: string; expiresIn: number }
interface ApiError          { error: string }
```

---

## api.ts 사용 패턴

모든 API 호출은 반드시 `lib/api.ts`의 `request<T>()` 래퍼를 통해 수행한다.
직접 `fetch()`를 호출하지 않는다.

```typescript
import { request } from '@/lib/api'

// 일반 JSON 요청
const files = await request<FileRecord[]>('/files', { method: 'GET' })

// FormData 요청 (파일 업로드)
const form = new FormData()
form.append('file', file)
const result = await request<FileRecord>('/files/upload', { method: 'POST', body: form })

// 에러 처리 — 두 형식 모두 처리됨
try {
  const data = await request<AuthResponse>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
} catch (err) {
  // err.message는 { error: '...' } 또는 { errors: [{msg: '...'}] } 양쪽에서 파싱됨
  setError(err instanceof Error ? err.message : '오류가 발생했습니다')
}
```

**request() 내부 동작:**
1. `getToken()`으로 localStorage에서 JWT 추출
2. `Authorization: Bearer <token>` 헤더 자동 주입
3. FormData면 Content-Type 헤더 생략 (브라우저 자동 설정)
4. `!response.ok`이면 에러 파싱 후 throw

---

## auth.ts 헬퍼 함수

```typescript
import { saveSession, getToken, getUser, clearSession, isAuthenticated } from '@/lib/auth'

saveSession(token: string, user: User)   // localStorage에 ss_token, ss_user 저장
getToken()                               // string | null
getUser()                                // User | null (JSON.parse)
clearSession()                           // 로그아웃 시 localStorage 정리
isAuthenticated()                        // boolean — getToken() !== null
```

**localStorage 키:** `ss_token`, `ss_user`

---

## AuthGuard 사용법

보호가 필요한 모든 페이지는 `<AuthGuard>`로 감싼다:

```tsx
// app/dashboard/page.tsx 패턴
import AuthGuard from '@/components/AuthGuard'

export default function DashboardPage() {
  return (
    <AuthGuard>
      <DashboardContent />
    </AuthGuard>
  )
}
```

`/shared/[token]` 페이지는 AuthGuard 불필요 — 퍼블릭 접근 허용.

---

## 환경변수

| 변수 | 필수 | 설명 |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | ✅ | 백엔드 베이스 URL — **/api suffix 포함** |
| `STATIC_EXPORT` | 빌드 시 | `true` 설정 시 `output: 'export'` 활성화 (S3 배포용) |
| `NEXT_PUBLIC_ENV_TYPE` | 빌드 시 | `vulnerable` 또는 `secure` — `app/layout.tsx` 배경색 분기 (bg-red-50 / bg-green-50) |

**환경별 NEXT_PUBLIC_API_URL 값:**
- 로컬 개발: `http://localhost:3000/api`
- 취약 환경 (S3): `http://<취약EC2-IP>:3000/api` (GitHub Secret `VULN_API_URL`)
- 보안 환경 (CloudFront): `https://dyfs11nls1dwb.cloudfront.net/api` (workflow 하드코딩)

`.env.local` 설정:
```bash
echo "NEXT_PUBLIC_API_URL=http://localhost:3000/api" > .env.local
```

**S3 정적 빌드:**
```bash
STATIC_EXPORT=true NEXT_PUBLIC_API_URL=https://... npm run build
# → out/ 디렉토리 생성
```

---

## 보안 헤더 (`next.config.ts`)

```javascript
// 모든 응답에 적용되는 헤더
'X-Frame-Options': 'DENY'
'X-Content-Type-Options': 'nosniff'
'Referrer-Policy': 'strict-origin-when-cross-origin'
```

---

## 주요 패턴 & 주의사항

### 회원가입 비밀번호 규칙
백엔드 validation: **8자 이상 + 대문자 1개 이상 + 숫자 1개 이상** (예: `Test1234`)
프론트엔드는 에러 메시지를 `{ errors: [{msg}] }` 배열 형식으로 수신할 수 있음 — api.ts가 처리.

### 새 API 연동 추가 시
1. `types/index.ts`에 응답 타입 추가
2. `lib/api.ts`의 `request<T>()`로 호출
3. `getToken()` 필요 여부는 api.ts가 자동 처리 (로그인 없는 페이지는 토큰이 null이어도 됨)

### 공유 링크 페이지
`/shared/[token]` — Next.js dynamic route. 백엔드 `GET /shared/:token/download`를 호출.
이 페이지에서는 `getToken()`이 null이어도 API 호출 가능 (백엔드가 token 자체로 인증).
