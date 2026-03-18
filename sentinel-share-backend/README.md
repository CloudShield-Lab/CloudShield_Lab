# sentinel-share-backend

Node.js/Express 파일 공유 API. 동일 코드를 취약/보안 두 EC2에 배포 (인프라만 다름).

## 로컬 실행

```bash
docker compose up -d          # PostgreSQL 17.9 + LocalStack 3
bash scripts/local-init.sh    # S3 버킷 생성 + DB 마이그레이션 (최초 1회)
cp .env.local.example .env
npm install && npm run dev    # → http://localhost:3000
```

### DB 직접 접속
```bash
export PATH="$PATH:/c/Program Files/PostgreSQL/17/bin"
PGPASSWORD="localpassword" psql -h 127.0.0.1 -p 5432 -U sentinelshare_user -d sentinelshare
```

| 항목 | 값 |
|---|---|
| Host | `127.0.0.1` (localhost는 IPv6 문제 가능) |
| Port | 5432 |
| Database | sentinelshare |
| User | sentinelshare_user |
| Password | localpassword |

---

## API Endpoints

| Method | Path | Auth | 설명 |
|---|---|---|---|
| POST | `/api/auth/signup` | — | 비밀번호: 8자+대문자+숫자 (예: `Test1234`) |
| POST | `/api/auth/login` | — | JWT 반환 |
| POST | `/api/files/upload` | JWT | multipart, field: `file` |
| GET | `/api/files` | JWT | 내 파일 목록 |
| GET | `/api/files/:id/download` | JWT | presigned URL (5분 TTL) |
| DELETE | `/api/files/:id` | JWT | soft delete |
| POST | `/api/files/:id/share` | JWT | `{ expiresInHours: 1–168 }` |
| GET | `/api/shared/:token/download` | — | 공유 토큰으로 presigned URL |
| GET | `/health` | — | 헬스체크 |

에러 형식: `{ "error": "..." }` 또는 `{ "errors": [{ "msg": "..." }] }`

---

## DB 스키마

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
  stored_key    text UNIQUE NOT NULL,  -- API 응답에 절대 노출 금지
  mime_type     text NOT NULL,
  size_bytes    bigint NOT NULL,
  is_deleted    boolean NOT NULL DEFAULT false,  -- 모든 쿼리에 조건 필수
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
)

shared_links (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id    uuid NOT NULL REFERENCES files(id),
  token      text UNIQUE NOT NULL,  -- 64자 hex
  expires_at timestamptz NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz DEFAULT now()
)
```

### EC2 마이그레이션 수동 실행
```bash
docker cp sentinelshare-backend:/app/migrations/001_initial_schema.sql /tmp/migration.sql
DB_PASS=$(grep ^DB_PASSWORD= /opt/app/.env | cut -d= -f2)
PGPASSWORD=$DB_PASS psql -h 127.0.0.1 -U sentinelshare -d sentinelshare -f /tmp/migration.sql
```

---

## 환경변수

| 변수 | 필수 | 설명 |
|---|---|---|
| `JWT_SECRET` | ✅ | JWT 서명 키 |
| `JWT_EXPIRES_IN` | ✅ | 만료 (예: `1h`) |
| `DB_HOST` | ✅ | PostgreSQL 호스트 (EC2 동거: `127.0.0.1`) |
| `DB_PORT` | ✅ | `5432` |
| `DB_NAME` | ✅ | `sentinelshare` |
| `DB_USER` | ✅ | DB 유저 |
| `DB_PASSWORD` | ✅ | DB 비밀번호 |
| `AWS_REGION` | ✅ | `ap-northeast-2` |
| `S3_BUCKET_NAME` | ✅ | S3 버킷명 |
| `CORS_ORIGIN` | 선택 | 허용 origin |
| `AWS_ENDPOINT_URL` | 로컬 only | `http://localhost:4566` |
| `AWS_ACCESS_KEY_ID` | 로컬 only | `test` |
| `AWS_SECRET_ACCESS_KEY` | 로컬 only | `test` |

**새 환경변수 추가 시:** `src/config/env.js` required 배열 + export → `.env.local.example` → EC2 `/opt/app/.env` → `infra/terraform/scripts/user_data.sh.tpl`

---

## EC2 프로덕션 배포

SSM Send Command로 EC2에 명령 전달 (SSH 포트 불필요):

```bash
aws ecr get-login-password --region ap-northeast-2 \
  | docker login --username AWS --password-stdin <ECR_REGISTRY>
docker pull <ECR_REGISTRY>/sentinelshare-backend:latest
docker stop sentinelshare-backend || true && docker rm sentinelshare-backend || true
docker run -d --name sentinelshare-backend \
  --env-file /opt/app/.env --network host \
  --restart unless-stopped \
  <ECR_REGISTRY>/sentinelshare-backend:latest
```

EC2 IAM Role 필요 권한: `AmazonSSMManagedInstanceCore`, `AmazonEC2ContainerRegistryReadOnly`
