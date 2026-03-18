# sentinel-share-frontend — Claude Code Context
<!-- 전체 아키텍처/보안 규칙/로드맵은 루트 CLAUDE.md 참조 -->

## 역할
사용자용 파일 관리 웹앱. Next.js 15 App Router + TypeScript + Tailwind CSS.
- 개발 포트 `3001`, S3 정적 배포 (`STATIC_EXPORT=true`)

## File Map
```
lib/api.ts                  모든 API 호출 단일 진입점 — Bearer 토큰 자동 주입
lib/auth.ts                 localStorage 세션 헬퍼 (saveSession, getToken, clearSession)
types/index.ts              공유 타입 (User, FileRecord, ShareLink, AuthResponse 등)
components/AuthGuard.tsx    보호된 페이지 래퍼 — 토큰 없으면 /login 리디렉션
app/layout.tsx              NEXT_PUBLIC_ENV_TYPE으로 배경색 분기 (bg-red-50 / bg-green-50)
app/(auth)/login/page.tsx   로그인
app/(auth)/signup/page.tsx  회원가입
app/dashboard/page.tsx      파일 목록 + 업로드
app/shared/[token]/page.tsx 공유 링크 다운로드 — 인증 불필요, AuthGuard 없음
next.config.ts              STATIC_EXPORT=true 시 output: 'export' 활성화
```

## api.ts 사용 패턴
```typescript
// 직접 fetch() 금지 — 반드시 request<T>() 사용
import { request } from '@/lib/api'

const files = await request<FileRecord[]>('/files', { method: 'GET' })
const form = new FormData(); form.append('file', file)
const result = await request<FileRecord>('/files/upload', { method: 'POST', body: form })
```
에러: `{ error: string }` 과 `{ errors: [{msg}] }` 두 형식 모두 처리됨.

## 환경변수
- `NEXT_PUBLIC_API_URL`: **/api suffix 포함** (예: `http://localhost:3000/api`)
- `STATIC_EXPORT=true`: S3 빌드 시만 설정
- `NEXT_PUBLIC_ENV_TYPE`: `vulnerable` | `secure` — 배경색 분기용
