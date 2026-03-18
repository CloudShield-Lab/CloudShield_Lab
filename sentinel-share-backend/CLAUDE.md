# sentinel-share-backend — Claude Code Context
<!-- 전체 아키텍처/보안 규칙/로드맵은 루트 CLAUDE.md 참조 -->

## 역할
Node.js/Express 파일 공유 API. 동일 코드를 취약/보안 두 EC2에 배포 (인프라만 다름).
- 포트 `3000`, ECR 레포 `sentinelshare-backend`, SSM으로 배포 트리거

## File Map
```
src/app.js                      Express 진입점 — helmet → cors → rateLimiter → routes
src/config/env.js               필수 환경변수 검증 (fail-fast)
src/config/db.js                pg Pool — 항상 query(text, params) 사용
src/config/s3.js                S3Client — AWS_ENDPOINT_URL 있으면 LocalStack
src/middleware/authenticate.js  Bearer JWT 검증 → req.user = { id, email, role }
src/middleware/rateLimiter.js   apiLimiter 200req/min (전역) — authLimiter 없음 (WAF 담당)
src/models/user.model.js        findByEmail, findById, create
src/models/file.model.js        create, findByOwner, findById, softDelete
                                ⚠ 모든 쿼리에 is_deleted = false 조건 필수
src/models/sharedLink.model.js  create, findValidByToken, findByFileAndOwner
src/services/auth.service.js    signup (bcrypt 12rounds + JWT), login
src/services/files.service.js   uploadFile, listFiles, getDownloadUrl, deleteFile, createShareLink
                                ⚠ 소유권/share token 검증이 항상 S3 작업보다 먼저
src/services/s3.service.js      PutObject, GetObject presigned URL (5분 TTL), DeleteObject
src/controllers/auth.controller.js   signup/login 핸들러
src/controllers/files.controller.js  multer 메모리 스토리지 + 파일/공유 엔드포인트
src/routes/auth.routes.js       POST /auth/signup, POST /auth/login
src/routes/files.routes.js      /files/* — 모두 authenticate 필요
src/routes/shared.routes.js     GET /shared/:token/download — 인증 불필요
src/utils/fileValidation.js     MIME type + 확장자 whitelist + 파일 크기 검증
src/utils/tokenGenerator.js     generateShareToken() → 64자 hex; generateStoredKey() → uploads/<uuid>/파일명
migrations/001_initial_schema.sql   users, files, shared_links 테이블 (Docker 이미지 포함)
```

## 핵심 패턴

### DB 쿼리 (SQL Injection 방지)
```javascript
// ✅ 올바른 방법
await db.query('SELECT * FROM files WHERE id = $1 AND owner_id = $2 AND is_deleted = false', [fileId, userId]);
// ❌ 절대 금지
await db.query(`SELECT * FROM files WHERE id = '${fileId}'`);
```

### 파일 서비스 패턴 (소유권 검증 → S3 작업 순서 필수)
```javascript
const file = await FileModel.findById(fileId);       // 1. DB 조회 (is_deleted 체크 포함)
if (!file || file.owner_id !== userId) throw 403;    // 2. 소유권 검증
const url = await S3Service.generatePresignedUrl(file.stored_key);  // 3. S3 작업
```

## 비밀번호 규칙
백엔드 validation: 8자 이상 + 대문자 1개 이상 + 숫자 1개 이상 (예: `Test1234`)

## 주요 환경변수
`JWT_SECRET`, `DB_HOST`(127.0.0.1), `DB_NAME`(sentinelshare), `DB_USER`, `DB_PASSWORD`,
`AWS_REGION`, `S3_BUCKET_NAME`, `CORS_ORIGIN`
로컬 only: `AWS_ENDPOINT_URL=http://localhost:4566`, `AWS_ACCESS_KEY_ID=test`
