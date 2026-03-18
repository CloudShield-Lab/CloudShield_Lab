# SentinelShare — Cloud Security Impact Simulator

동일한 파일 공유 앱을 취약/보안 두 AWS 환경에 배포하고, 공격 시뮬레이터로 인프라 보안 효과를 실시간 비교하는 플랫폼.

---

## 아키텍처

```
┌──────────────────────────────────────────────────────────────┐
│                    Attack Dashboard (ECS Fargate)             │
│              브루트포스 / S3 직접접근 / API 플러드               │
└────────────────┬───────────────────────┬─────────────────────┘
                 │                       │
                 ▼                       ▼
┌───────────────────────┐   ┌──────────────────────────────────┐
│  취약 환경 (Vulnerable) │   │       보안 환경 (Secure)           │
│  SG: 0.0.0.0/0:3000   │   │  CloudFront + WAF                │
│  S3: Public Bucket     │   │  SG: CloudFront IP만 허용         │
│  WAF: 없음             │   │  S3: Block Public Access ON      │
│                        │   │  WAF: Rate-limit + Managed Rules │
│  EC2 (t3.small)        │   │  EC2 (t3.small)                  │
│  └─ Docker + PostgreSQL│   │  └─ Docker + PostgreSQL          │
└───────────────────────┘   └──────────────────────────────────┘
```

| 공격 시나리오 | 취약 환경 | 보안 환경 |
|---|---|---|
| 브루트포스 로그인 (30회) | 전부 서버 도달 | WAF Rate Rule 차단 |
| S3 버킷 직접 접근 | 200 OK (파일 노출) | 403 AccessDenied |
| API 플러드 (60회) | 전부 통과 | WAF 임계값 초과 차단 |

---

## 프로젝트 구조

```
SentinelShare/
├── sentinel-share-backend/   Node.js/Express API (양쪽 환경 동일 코드)
├── sentinel-share-frontend/  Next.js 15 사용자 UI
├── attack-dashboard/         보안 비교 시뮬레이터 (ECS Fargate)
├── infra/terraform/          취약/보안 환경 IaC
│   ├── modules/              network, ec2, s3, waf, cloudfront
│   ├── environments/         vulnerable/, secure/
│   └── scripts/              user_data.sh.tpl
├── docs/
│   └── ec2-setup-guide.md    EC2 초기 셋업 절차
└── .github/workflows/        CI/CD
```

---

## 로컬 개발

### 사전 준비
- Docker Desktop, Node.js 20+, AWS CLI

> **Windows 주의:** PostgreSQL 로컬 설치 시 5432 포트 충돌 방지:
> ```powershell
> Stop-Service -Name 'postgresql-x64-17' -Force
> Set-Service -Name 'postgresql-x64-17' -StartupType Disabled
> ```

### 실행 순서

```bash
# 1. PostgreSQL + LocalStack 시작
cd sentinel-share-backend && docker compose up -d
bash scripts/local-init.sh    # S3 버킷 생성 + DB 마이그레이션 (최초 1회)
cp .env.local.example .env && npm install && npm run dev    # → :3000

# 2. 프론트엔드 (새 터미널)
cd sentinel-share-frontend
echo "NEXT_PUBLIC_API_URL=http://localhost:3000/api" > .env.local
npm install && npm run dev -- -p 3001    # → :3001

# 3. 공격 대시보드 (새 터미널)
cd attack-dashboard
cp .env.local.example .env.local && npm install && npm run dev    # → :3002
```

### DB 직접 접속 (로컬)
```bash
export PATH="$PATH:/c/Program Files/PostgreSQL/17/bin"
PGPASSWORD="localpassword" psql -h 127.0.0.1 -p 5432 -U sentinelshare_user -d sentinelshare
```

---

## AWS 환경

### Terraform 자동 배포 (권장)

Attack Dashboard의 InfraControl 패널에서 취약/보안 환경을 원클릭 배포/삭제.
- 취약 환경: `terraform-vulnerable.yml` workflow_dispatch
- 보안 환경: `terraform-secure.yml` workflow_dispatch (CloudFront 생성/삭제 15~20분 소요)

**Terraform 자동화 흐름 (apply):**
1. `terraform fmt → init(S3 backend) → validate → plan → apply`
2. apply 실패 시 → auto-destroy (고아 리소스 방지)
3. apply 성공 시 → GitHub Secrets 자동 주입 (EC2 ID, EIP, CloudFront 정보)
4. SSM으로 DB 마이그레이션 자동 실행
5. `deploy-frontend.yml` 자동 트리거

**생성 리소스:**

| 리소스 | 취약 | 보안 |
|---|---|---|
| VPC + Subnet + IGW | O | O |
| EC2 t3.small + EIP | O | O |
| IAM Role (SSM+ECR+S3) | O | O |
| S3 파일버킷 | Public | Private (OAC) |
| S3 프론트버킷 | O | O |
| WAF WebACL | X | O (us-east-1) |
| CloudFront | X | O |

**Terraform state:** S3 버킷 `sentinelshare-terraform-state-833453046706-ap-northeast-2-an`

### EC2 수동 마이그레이션 (필요 시)
```bash
# SSM Session Manager 또는 Run Command로 EC2에서 실행
docker cp sentinelshare-backend:/app/migrations/001_initial_schema.sql /tmp/migration.sql
DB_PASS=$(grep ^DB_PASSWORD= /opt/app/.env | cut -d= -f2)
PGPASSWORD=$DB_PASS psql -h 127.0.0.1 -U sentinelshare -d sentinelshare -f /tmp/migration.sql
```

---

## CI/CD

```
deploy-backend.yml       master/dev push → ECR → SSM으로 취약/보안 EC2 재시작
deploy-dashboard.yml     attack-dashboard/** → ECR → ECS 업데이트
deploy-frontend.yml      sentinel-share-frontend/** → S3 sync (+ CloudFront invalidation)
                         workflow_dispatch(deploy_tf_envs=true) → Terraform 환경 S3 배포
terraform-vulnerable.yml workflow_dispatch(apply|destroy)
terraform-secure.yml     workflow_dispatch(apply|destroy)
```

### GitHub Secrets

| Secret | 용도 |
|---|---|
| `AWS_ROLE_ARN` | OIDC 인증 |
| `VULN_EC2_INSTANCE_ID` / `SECURE_EC2_INSTANCE_ID` | SSM 배포 타겟 (Terraform 후 자동 주입) |
| `VULN_API_URL` | 취약 환경 API URL |
| `CLOUDFRONT_DISTRIBUTION_ID` | 보안 환경 CloudFront |
| `TF_DB_PASSWORD` / `TF_JWT_SECRET` | Terraform 민감 변수 |
| `GH_PAT` | `gh secret set` 용 (`repo` 스코프) |
| `TF_VULN_API_URL` / `TF_SECURE_CF_URL` / `TF_SECURE_CF_DIST_ID` | Terraform apply 후 자동 주입 |

---

## API

| Method | Path | 인증 | 설명 |
|---|---|---|---|
| POST | `/api/auth/signup` | — | 회원가입 (비밀번호: 8자+대문자+숫자) |
| POST | `/api/auth/login` | — | 로그인, JWT 반환 |
| POST | `/api/files/upload` | JWT | 파일 업로드 (multipart, field: `file`) |
| GET | `/api/files` | JWT | 내 파일 목록 |
| GET | `/api/files/:id/download` | JWT | presigned URL 발급 (5분 TTL) |
| DELETE | `/api/files/:id` | JWT | soft delete + S3 삭제 |
| POST | `/api/files/:id/share` | JWT | 공유 링크 생성 |
| GET | `/api/shared/:token/download` | — | 공유 토큰으로 presigned URL 발급 |
| GET | `/health` | — | 헬스체크 |

---

## DB 스키마

```sql
users         id(uuid), email(unique), password_hash, role('user'|'admin'), created_at, updated_at
files         id(uuid), owner_id, original_name, stored_key, mime_type, size_bytes, is_deleted, created_at, updated_at
shared_links  id(uuid), file_id, token(64자hex), expires_at, created_by, created_at
```

**마이그레이션:** `migrations/001_initial_schema.sql` (Docker 이미지 포함, `/app/migrations/`)

---

## 구현 로드맵

| 단계 | 내용 | 상태 |
|---|---|---|
| 1단계 | Attack Dashboard + ECS 배포 | 완료 |
| 2단계 | EC2 Docker + S3 + CloudFront | 완료 |
| 3단계 | Wazuh + Trivy + Prowler | 계획 |
| 4단계 | Terraform 인프라 자동화 | 완료 |
| 5단계 | Prometheus + Grafana + Loki | 계획 |
