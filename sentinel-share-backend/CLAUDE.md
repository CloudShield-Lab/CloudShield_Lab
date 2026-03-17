# sentinel-share-backend — Claude Code Context

<!-- 이 파일은 백엔드 작업 시 필요한 세부 컨텍스트를 담는다.
     프로젝트 전체 아키텍처/보안 규칙/로드맵은 루트 CLAUDE.md 참조. -->

---

## 역할

Node.js/Express 파일 공유 API. **동일한 코드**를 취약/보안 두 AWS EC2 환경에 배포한다.
인프라 설정(S3 정책, WAF, CloudFront, Security Group)만 다르고 앱 코드는 완전히 동일.

- 포트: `3000`
- 런타임: Node.js 20 (Alpine), `nodemon` 개발용
- 배포 방식: EC2 + Docker (PostgreSQL 동거), SSM으로 배포 트리거
- ECR 레포: `sentinelshare-backend`

---

## File Map <!-- LAST_UPDATED: 2026-03-13 -->

```
src/app.js                      Express 앱 진입점 — 미들웨어 순서: helmet → cors → rateLimiter → routes
src/config/env.js               시작 시 필수 환경변수 검증 (fail-fast) → process.env 재-export
src/config/db.js                pg Pool 생성 — 항상 query(text, params) 사용, raw string 금지
src/config/s3.js                S3Client — AWS_ENDPOINT_URL 있으면 LocalStack, 없으면 실제 AWS
src/middleware/authenticate.js  Authorization: Bearer <jwt> 검증 → req.user = { id, email, role }
src/middleware/rateLimiter.js   apiLimiter 200req/min (전역) — authLimiter 없음 (WAF 담당)
src/middleware/validateRequest.js  express-validator 에러 처리 미들웨어
src/models/user.model.js        findByEmail(email), findById(id), create({email, passwordHash, role})
src/models/file.model.js        create, findByOwner(userId), findById(id), softDelete(id, userId)
                                ⚠ 모든 쿼리에 is_deleted = false 조건 필수
src/models/sharedLink.model.js  create(fileId, token, expiresAt, createdBy), findValidByToken(token),
                                findByFileAndOwner(fileId, userId)
src/services/auth.service.js    signup (bcrypt 12 rounds + JWT), login (compare + JWT 서명)
src/services/files.service.js   uploadFile, listFiles, getDownloadUrl, deleteFile, createShareLink
                                ⚠ 소유권/share token 검증이 항상 S3 작업보다 먼저 실행됨
src/services/s3.service.js      PutObject(업로드), GetObject presigned URL (5분 TTL), DeleteObject
src/controllers/auth.controller.js   signup/login 핸들러 — express-validator 연동
src/controllers/files.controller.js  multer 메모리 스토리지 + 파일/공유 엔드포인트 핸들러
src/routes/auth.routes.js       POST /auth/signup, POST /auth/login
src/routes/files.routes.js      /files/* — 모두 authenticate 미들웨어 필요
src/routes/shared.routes.js     GET /shared/:token/download — 인증 불필요 (퍼블릭)
src/utils/fileValidation.js     MIME type + 확장자 whitelist + 파일 크기 검증
src/utils/tokenGenerator.js     generateShareToken() → 64자 hex; generateStoredKey() → uploads/<uuid>/파일명
```

```
migrations/001_initial_schema.sql   users, files, shared_links 테이블 + 인덱스 + updated_at 트리거
                                    Docker 이미지에 포함됨 (/app/migrations/) — docker cp로 EC2 추출 가능
scripts/local-init.sh               LocalStack S3 버킷 생성 + migrations 실행 (최초 1회, 로컬 전용)
docker-compose.yml                  postgres:17.9-alpine (5432) + localstack/localstack:3 (4566)
Dockerfile                          멀티스테이지 Alpine, non-root user (appuser), 포트 3000
                                    migrations/ 포함, 헬스체크: GET http://localhost:3000/health
                                    ⚠ /opt/app/logs 볼륨 마운트 시 호스트 chmod 777 필수
infra/ecs-task-definition-vulnerable.json   (레거시 — EC2 전환으로 미사용)
infra/ecs-task-definition-secure.json       (레거시 — EC2 전환으로 미사용)
```

---

## API Endpoints

| Method | Path | Auth | 설명 |
|---|---|---|---|
| POST | `/api/auth/signup` | 없음 | 회원가입. email + password (8자+대문자+숫자) |
| POST | `/api/auth/login` | 없음 | 로그인 → JWT 반환 |
| POST | `/api/files/upload` | Bearer JWT | multer, 파일 업로드 → S3 PutObject |
| GET | `/api/files` | Bearer JWT | 내 파일 목록 (is_deleted=false만) |
| GET | `/api/files/:id/download` | Bearer JWT | S3 presigned URL 발급 (5분 TTL) |
| DELETE | `/api/files/:id` | Bearer JWT | soft delete (is_deleted=true) + S3 best-effort 삭제 |
| POST | `/api/files/:id/share` | Bearer JWT | share token 생성 → shared_links 테이블 |
| GET | `/api/shared/:token/download` | 없음 | token 유효성 + 만료 확인 → presigned URL |
| GET | `/health` | 없음 | 헬스체크 → 200 OK (/api prefix 없음) |

**에러 응답 형식:**
```json
{ "error": "메시지" }                    // 단일 에러
{ "errors": [{ "msg": "메시지" }] }     // express-validator 에러 배열
```

---

## Database Schema <!-- LAST_UPDATED: 2026-03-11 -->

```sql
users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  role          text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
)

files (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      uuid NOT NULL REFERENCES users(id),
  original_name text NOT NULL,
  stored_key    text UNIQUE NOT NULL,    -- ⚠ API 응답에 절대 노출 금지
  mime_type     text NOT NULL,
  size_bytes    bigint NOT NULL,
  is_deleted    boolean NOT NULL DEFAULT false,   -- ⚠ 모든 쿼리에 필수
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
)

shared_links (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id       uuid NOT NULL REFERENCES files(id),
  token         text UNIQUE NOT NULL,    -- 64자 hex (generateShareToken)
  expires_at    timestamptz NOT NULL,
  created_by    uuid NOT NULL REFERENCES users(id),
  created_at    timestamptz DEFAULT now()
)
```

**Migration 실행 (EC2 프로덕션 — 최초 1회):**
```bash
# 컨테이너에서 파일 추출 후 psql로 실행
sudo docker cp sentinelshare-backend:/app/migrations/001_initial_schema.sql /tmp/
PGPASSWORD=<비밀번호> psql -h 127.0.0.1 -p 5432 -U sentinelshare -d sentinelshare \
  -f /tmp/001_initial_schema.sql
```

**Migration 재실행 (로컬):**
```bash
export PATH="$PATH:/c/Program Files/PostgreSQL/17/bin"
export PGPASSWORD="localpassword"
psql -h 127.0.0.1 -p 5432 -U sentinelshare_user -d sentinelshare \
  -f migrations/001_initial_schema.sql
```

---

## Environment Variables <!-- LAST_UPDATED: 2026-03-13 -->

`src/config/env.js`에서 시작 시 검증 (없으면 즉시 crash):

| 변수 | 필수 | 설명 |
|---|---|---|
| `JWT_SECRET` | ✅ | JWT 서명 키 |
| `JWT_EXPIRES_IN` | ✅ | JWT 만료 시간 (e.g. `1h`) |
| `DB_HOST` | ✅ | PostgreSQL 호스트 (EC2 동거: `127.0.0.1`) |
| `DB_PORT` | ✅ | PostgreSQL 포트 (`5432`) |
| `DB_NAME` | ✅ | DB 이름 (`sentinelshare`) |
| `DB_USER` | ✅ | DB 유저 |
| `DB_PASSWORD` | ✅ | DB 비밀번호 |
| `AWS_REGION` | ✅ | AWS 리전 (`ap-northeast-2`) |
| `S3_BUCKET_NAME` | ✅ | S3 버킷명 |
| `AWS_ENDPOINT_URL` | 로컬 only | LocalStack: `http://localhost:4566` |
| `AWS_ACCESS_KEY_ID` | 로컬 only | LocalStack: `test` |
| `AWS_SECRET_ACCESS_KEY` | 로컬 only | LocalStack: `test` |
| `CORS_ORIGIN` | 선택 | 허용 origin (로컬: `http://localhost:3001,http://localhost:3002`) |
| `PRESIGNED_URL_TTL` | 선택 | presigned URL 만료 초 (기본 300) |
| `MAX_FILE_SIZE_MB` | 선택 | 업로드 최대 크기 MB |
| `METRICS_ENABLED` | 계획 (3단계) | `true` → /metrics 엔드포인트 활성화 |

**EC2 프로덕션 환경변수 관리:**

AWS 배포 시 Secrets Manager 대신 EC2 내 `/opt/app/.env` 파일 사용.
Terraform `user_data` templatefile로 최초 생성, 이후 수동 수정 가능.
```
# EC2 내 /opt/app/.env 예시
NODE_ENV=production
JWT_SECRET=...
DB_HOST=127.0.0.1
DB_PORT=5432
...
```

**새 환경변수 추가 시 체크리스트:**
1. `src/config/env.js` required 배열 + export 추가
2. `.env.local.example` + `.env.example` 추가
3. EC2 `/opt/app/.env` 직접 수정 (취약/보안 양쪽)
4. (4단계) Terraform `user_data` 템플릿에도 추가

---

## 핵심 코딩 패턴

### DB 쿼리 패턴
```javascript
// ✅ 올바른 방법
const result = await db.query(
  'SELECT * FROM files WHERE id = $1 AND owner_id = $2 AND is_deleted = false',
  [fileId, userId]
);

// ❌ 절대 금지
const result = await db.query(`SELECT * FROM files WHERE id = '${fileId}'`);
```

### 파일 서비스 패턴 (소유권 검증 → S3 작업 순서)
```javascript
// services/files.service.js 패턴
const file = await FileModel.findById(fileId);          // 1. DB 조회 (is_deleted 체크 포함)
if (!file || file.owner_id !== userId) throw 403;       // 2. 소유권 검증
const url = await S3Service.generatePresignedUrl(file.stored_key);  // 3. S3 작업
```

### stored_key 생성 패턴
```javascript
// utils/tokenGenerator.js
generateStoredKey(originalName) → `uploads/${uuid()}/${originalName}`
generateShareToken()            → 64자 hex (crypto.randomBytes(32).toString('hex'))
```

---

## 비밀번호 규칙

백엔드 validation: **8자 이상 + 대문자 1개 이상 + 숫자 1개 이상**
예시: `Test1234`

---

## Docker & 배포

```dockerfile
# Dockerfile 구조 (로컬 개발 및 ECR 빌드 공통)
FROM node:20-alpine AS base
FROM base AS deps     → npm ci --omit=dev
FROM base AS release  → non-root user (appuser), COPY src/ + node_modules
EXPOSE 3000
HEALTHCHECK: wget -qO- http://localhost:3000/health || exit 1
```

**EC2 프로덕션 배포 방식:**

```bash
# EC2에서 실행되는 배포 명령 (SSM Send Command로 전달)
aws ecr get-login-password --region ap-northeast-2 \
  | docker login --username AWS --password-stdin $ECR_REGISTRY

docker pull $ECR_REGISTRY/sentinelshare-backend:latest
docker stop sentinelshare-backend || true
docker rm sentinelshare-backend || true
docker run -d \
  --name sentinelshare-backend \
  --env-file /opt/app/.env \
  -p 3000:3000 \
  --restart unless-stopped \
  $ECR_REGISTRY/sentinelshare-backend:latest
```

**EC2 IAM Role 필요 권한:**
- `AmazonSSMManagedInstanceCore` — SSM Agent 통신 (GitHub Actions → EC2)
- `AmazonEC2ContainerRegistryReadOnly` — ECR에서 이미지 pull

**GitHub Secrets (백엔드 배포용):**
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
- `VULN_EC2_INSTANCE_ID` — 취약 EC2 인스턴스 ID
- `SECURE_EC2_INSTANCE_ID` — 보안 EC2 인스턴스 ID

**PostgreSQL (EC2 동거):**
- EC2에 PostgreSQL 17 직접 설치 (Terraform user_data 또는 수동)
- `DB_HOST=127.0.0.1` (컨테이너 내부 → 호스트 접근 시 host network 또는 host IP)
- `docker run` 시 `--network host` 또는 `--add-host=host.docker.internal:host-gateway` 필요

---

## 공통 작업 레시피

### 새 API 엔드포인트 추가
1. `src/models/` — SQL 쿼리 함수 추가 (반드시 $1 params, is_deleted 체크)
2. `src/services/` — 비즈니스 로직 + 소유권/권한 검증
3. `src/controllers/` — HTTP 핸들러 (에러: `res.status(4xx).json({ error: '...' })`)
4. `src/routes/` — 라우트 등록 + authenticate 미들웨어 필요 여부 결정

### 로컬 Docker 재시작
```bash
docker compose down -v          # 볼륨 포함 삭제 (DB 초기화 시)
docker compose up -d
bash scripts/local-init.sh      # 버킷 생성 + 마이그레이션
```

### DB 직접 접속
```bash
export PATH="$PATH:/c/Program Files/PostgreSQL/17/bin"
export PGPASSWORD="localpassword"
psql -h 127.0.0.1 -p 5432 -U sentinelshare_user -d sentinelshare
```

| 항목 | 값 |
|---|---|
| Host | `127.0.0.1` (localhost는 IPv6 문제 발생 가능) |
| Port | 5432 |
| Database | sentinelshare |
| User | sentinelshare_user |
| Password | localpassword |
