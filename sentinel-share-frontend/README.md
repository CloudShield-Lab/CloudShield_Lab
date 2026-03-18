# sentinel-share-frontend

사용자용 파일 관리 웹앱. Next.js 15 App Router + TypeScript + Tailwind CSS.

## 로컬 실행

```bash
echo "NEXT_PUBLIC_API_URL=http://localhost:3000/api" > .env.local
npm install && npm run dev -- -p 3001    # → http://localhost:3001
```

## S3 정적 빌드

```bash
STATIC_EXPORT=true NEXT_PUBLIC_API_URL=https://... NEXT_PUBLIC_ENV_TYPE=vulnerable npm run build
# → out/ 디렉토리 생성
aws s3 sync out/ s3://버킷명/ --delete
```

---

## 환경변수

| 변수 | 설명 |
|---|---|
| `NEXT_PUBLIC_API_URL` | 백엔드 URL — **/api suffix 포함** 필수 (예: `http://localhost:3000/api`) |
| `STATIC_EXPORT` | `true` 설정 시 `output: 'export'` 활성화 (S3 빌드용) |
| `NEXT_PUBLIC_ENV_TYPE` | `vulnerable` \| `secure` — layout.tsx 배경색 분기 |

**환경별 NEXT_PUBLIC_API_URL:**
- 로컬: `http://localhost:3000/api`
- 취약 환경: `http://<EC2-EIP>:3000/api`
- 보안 환경: `https://dyfs11nls1dwb.cloudfront.net/api`

---

## 주요 패턴

### API 호출 — 반드시 `request<T>()` 사용
```typescript
import { request } from '@/lib/api'

// GET
const files = await request<FileRecord[]>('/files', { method: 'GET' })

// FormData (파일 업로드)
const form = new FormData(); form.append('file', file)
const result = await request<FileRecord>('/files/upload', { method: 'POST', body: form })

// 에러 처리
try {
  await request<AuthResponse>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
} catch (err) {
  setError(err instanceof Error ? err.message : '오류')
}
```

### 세션 관리
```typescript
import { saveSession, getToken, getUser, clearSession } from '@/lib/auth'
// localStorage 키: ss_token, ss_user
```

### 보호된 페이지
```tsx
import AuthGuard from '@/components/AuthGuard'
export default function Page() {
  return <AuthGuard><PageContent /></AuthGuard>
}
// /shared/[token]은 AuthGuard 불필요 (퍼블릭)
```

---

## 타입 정의 (`types/index.ts`)

```typescript
interface User        { id: string; email: string; role: 'user' | 'admin' }
interface FileRecord  { id: string; original_name: string; mime_type: string; size_bytes: number; created_at: string }
interface ShareLink   { id: string; file_id: string; token: string; expires_at: string }
interface AuthResponse      { token: string; user: User }
interface DownloadResponse  { url: string; expiresIn: number }
```

---

## 배포 (S3 + CloudFront)

**취약 환경:** `sentinel-share-vul-frontend` (Block Public Access OFF, 직접 접근)
**보안 환경:** `sentinel-share-secure-frontend` (CloudFront `dyfs11nls1dwb.cloudfront.net` 경유)

- `/shared/[token]` 동적 라우트: CloudFront Custom Error Response(403/404 → `/index.html`, HTTP 200)로 처리
- CI/CD: `.github/workflows/deploy-frontend.yml` 자동 배포
