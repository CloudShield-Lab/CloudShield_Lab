# SentinelShare — Claude Code Context

<!-- ============================================================
  문서 관리 지침
  ============================================================
  이 파일은 프로젝트 전체 관점(아키텍처, 보안 규칙, 로드맵)을 담는다.
  컴포넌트별 세부 정보는 각 서브디렉토리 CLAUDE.md에 기록한다:
    sentinel-share-backend/CLAUDE.md  → API, DB, 환경변수, 공통 작업
    sentinel-share-frontend/CLAUDE.md → 타입, api.ts 패턴, 라우팅
    attack-dashboard/CLAUDE.md        → SSE 패턴, 공격 라우트, Docker

  업데이트 규칙:
  - 변경된 섹션의 LAST_UPDATED 날짜 갱신
  - STATUS 값: [완료] | [진행중] | [계획]
  - Security Rules는 절대 임의 삭제 금지 — 삭제 시 사용자 확인 필요
  ============================================================ -->

---

## 사용자 설정

- **커밋 메시지에 `Co-Authored-By` 태그 포함 금지** — 커밋은 항상 사용자 단독 작성으로 기록

---

## Project Overview

**Cloud Security Impact Simulator** — 클라우드 인프라 보안 효과를 실시간으로 시각화하는 플랫폼.

파일 공유 서비스(SentinelShare)를 동일한 앱 코드로 취약/보안 두 AWS 환경에 배포한 뒤,
공격 시뮬레이터 대시보드에서 실제 공격을 수행하고 결과를 나란히 비교한다.

**현재 상태:** 취약/보안 EC2 Docker 배포 완료. 프론트엔드 S3 정적 배포 + CloudFront 보안 환경 구성 완료 (2026-03-16 기준). Terraform 인프라 자동화(4단계) 진행 예정.

---

## 구현 로드맵 <!-- LAST_UPDATED: 2026-03-16 -->

| 단계 | 내용 | STATUS |
|---|---|---|
| 1단계 | Attack Dashboard 플랫폼 확장 + AWS 배포 (Dockerfile + CI/CD) | [완료] |
| 2단계 | 백엔드 EC2 Docker 전환 + 프론트 S3 배포 + CloudFront 구성 | [완료] |
| 3단계 | Wazuh 연동 + CI/CD 보안 스캔 강화 (Trivy, Prowler) | [계획] |
| 4단계 | Terraform 인프라 자동화 (EC2 + PostgreSQL + S3 + WAF + CloudFront) | [진행중] |
| 5단계 | SIEM 스택 구축 (Prometheus + Grafana + Loki) | [계획] |

**1단계 완료 항목:**
- Attack Dashboard 네비게이션 탭 (Navbar), 가이드 페이지 (`/guide`, `/guide/vulnerable`, `/guide/secure`)
- CodeBlock (복사 버튼), StepCard 공통 컴포넌트
- layout.tsx에 Navbar + EnvironmentStatus 통합 (모든 페이지 persistent)
- Dockerfile — Next.js standalone 멀티스테이지 빌드, 포트 3000, Node.js 헬스체크
- infra/ecs-task-definition-dashboard.json — CPU 512, Memory 2048
- .github/workflows/deploy-dashboard.yml — attack-dashboard/** 변경 감지 → ECR → ECS (grace period 120s)
- ECS 헬스체크 트러블슈팅 완료: wget → Node.js 교체, HOSTNAME=0.0.0.0 CMD 강제 고정 (ECS 덮어쓰기 문제)

**2단계 완료 항목:**
- 취약/보안 EC2 Docker 배포 완료 — 백엔드(포트 3000) Docker 컨테이너로 실행 중
- deploy-backend.yml SSM 배포 파이프라인 구축 완료 (취약/보안 양쪽 EC2)
- deploy-frontend.yml S3 CI/CD 완료 — STATIC_EXPORT=true 빌드 → S3 sync + CloudFront invalidation
- next.config.ts `output: 'export'` 조건부 적용 완료 (`STATIC_EXPORT=true` 환경변수로 제어)
- shared/[token] 페이지 서버/클라이언트 컴포넌트 분리 완료 (Next.js static export 호환)
- 프론트엔드 S3 정적 배포 완료 — 취약: `sentinel-share-vul-frontend`, 보안: `sentinel-share-secure-frontend`
- CloudFront 보안 환경 구성 완료 — `/api/*` → EC2(HTTP:3000), `/*` → S3, Custom Error Response 설정
- Dockerfile에 `migrations/` 디렉토리 포함 — `docker cp` + psql로 EC2 마이그레이션 실행
- docs/ec2-setup-guide.md 작성 완료 — EC2 초기 셋업 전체 절차 문서화

---

## Monorepo Structure <!-- LAST_UPDATED: 2026-03-12 -->

```
SentinelShare/
├── sentinel-share-backend/   Node.js/Express API (양쪽 환경에 동일 코드 배포)
├── sentinel-share-frontend/  Next.js 15 App Router — 사용자 파일 관리 UI
├── attack-dashboard/         보안 비교 시뮬레이터 (플랫폼 확장 완료, Dockerfile+CI/CD 완료)
├── docs/
│   └── ec2-setup-guide.md    취약/보안 EC2 초기 셋업 절차 (완료)
├── infra/
│   ├── terraform/            취약/보안 환경 IaC (작성 예정 — 4단계)
│   └── monitoring/           Prometheus + Grafana + Loki (작성 예정 — 5단계)
└── .github/workflows/        GitHub Actions CI/CD
```

---

## Tech Stack <!-- LAST_UPDATED: 2026-03-12 -->

| Layer | Technology | STATUS |
|---|---|---|
| Backend | Node.js, Express 4, AWS SDK v3 | [완료] |
| Frontend | Next.js 15 (App Router), TypeScript, Tailwind CSS | [완료] |
| Attack Dashboard | Next.js 15, SSE 스트리밍 | [완료] — 배포는 1단계 |
| Database | PostgreSQL 17.9 (pg pool, parameterized queries) | [완료] |
| Storage | AWS S3 (실제 S3 두 버킷) / LocalStack 3 (로컬 개발) | [완료] |
| Auth | JWT (jsonwebtoken 9), bcryptjs (12 rounds) | [완료] |
| Container | Docker, ECS Fargate, ECR | [완료] |
| CI/CD | GitHub Actions | [완료] — Trivy/Prowler는 2단계 |
| Security Scan | Trivy (이미지), Prowler (AWS 포스처) | [계획] — 2단계 |
| Monitoring | Prometheus + Grafana + Loki | [계획] — 3단계 |
| IaC | Terraform | [계획] — 4단계 |
| Local dev | Docker Compose (PostgreSQL 17.9 + LocalStack 3) | [완료] |

---

## Key Architectural Decisions <!-- LAST_UPDATED: 2026-03-16 -->

- **두 AWS 환경 비교** — 동일한 Docker 이미지를 취약/보안 두 EC2에 배포. 인프라 설정(S3 정책, WAF, CloudFront, Security Group)만 다름.
- **백엔드: EC2 (not Fargate)** — Wazuh agent가 OS 레벨 접근을 필요로 하기 때문에 ECS Fargate 대신 EC2 사용. Attack Dashboard는 Fargate 유지.
- **PostgreSQL: EC2 동거 (co-located)** — 앱 서버 EC2에 PostgreSQL을 함께 설치. 별도 RDS 없음. `terraform destroy` 시 DB도 함께 정리되는 것이 데모 특성상 자연스러움. Wazuh가 PostgreSQL 로그도 감시 가능.
- **Wazuh agent** — 취약/보안 EC2 각각에 수동 설치. Wazuh Manager는 별도 EC2(공식 AMI). Terraform 자동화 제외.
- **authLimiter 제거 (의도적)** — 브루트포스 rate limit은 앱 코드가 아닌 AWS WAF 인프라가 담당. "인프라 보호 효과"를 시연하기 위한 설계. **절대 authLimiter를 다시 추가하지 않는다.**
- **No ALB** — CloudFront가 HTTPS/CDN 처리. 보안 EC2 Security Group이 CloudFront IP(pl-3b927c52)만 허용.
- **Presigned URLs only** — 백엔드는 파일 바이트를 절대 프록시하지 않음. S3 소유권/토큰 검증 후 presigned URL 발급 (5분 TTL).
- **Soft delete** — `files.is_deleted = true`. S3 객체는 best-effort 삭제. 하드 캐스케이드 없음.
- **LocalStack for local dev** — `AWS_ENDPOINT_URL=http://localhost:4566` + `forcePathStyle: true`. 프로덕션과 동일한 앱 코드 실행.
- **Multer memory storage** — EC2에서도 동일. 파일은 메모리에서 S3로 직접 업로드.
- **CI/CD 배포 트리거** — ECR push 후 `aws ssm send-command`로 EC2에 docker pull + restart 명령 전달. SSH 포트 불필요.
- **프론트엔드 next.config `output: 'export'` 조건부 적용** — EC2 서버 실행 시(`npm run dev` / `npm start`)에는 비활성. S3 정적 빌드 시에만 `STATIC_EXPORT=true` 환경변수로 활성화. deploy-frontend.yml에 적용 완료.
- **shared/[token] 동적 라우트 구조** — `page.tsx`(서버 컴포넌트)가 `generateStaticParams() { return [] }` 담당, 클라이언트 로직은 `SharedClient.tsx`로 분리. S3 배포 시 토큰은 빌드 타임에 알 수 없으므로 CloudFront Custom Error Response(403/404 → `/index.html`, HTTP 200)로 처리.
- **NEXT_PUBLIC_API_URL에 /api suffix 포함** — `https://domain.com/api` 형태로 설정. 프론트 코드는 `/auth/login` 등 상대 경로만 붙임. `/health` 엔드포인트는 `/api` prefix 없음 (헬스체크 전용).
- **CloudFront prefix list (ap-northeast-2)** — `pl-22a6434b`. CLAUDE.md의 `pl-3b927c52`는 다른 리전 값이었음. 보안 EC2 Security Group에 이 값으로 설정됨.
- **Docker 컨테이너 로그 볼륨 마운트 권한** — `-v /opt/app/logs:/opt/app/logs` 사용 시 호스트 디렉토리를 `chmod 777`로 설정 필수. Dockerfile 내 `chown appuser`는 호스트 마운트 시 덮어씌워짐.
- **마이그레이션 전략** — Dockerfile에 `migrations/` 포함. EC2 최초 설정 시 `docker cp` + psql로 실행. Terraform user_data.sh에 자동화 예정.

---

## AWS Deployment (두 환경) <!-- LAST_UPDATED: 2026-03-16 -->

### 취약 환경 (Vulnerable)

| 항목 | 설정 |
|---|---|
| 컴퓨팅 | EC2 t3.small — Node.js 앱 + PostgreSQL 14 동거 |
| 백엔드 | Docker 컨테이너, 포트 3000, `--network host` |
| 프론트엔드 | S3 정적 배포 (`sentinel-share-vul-frontend`) — 직접 접근 |
| S3 (파일) | Block Public Access **OFF**, 버킷 정책 없음 |
| EC2 Security Group | `0.0.0.0/0` 포트 3000, 80, 443 허용 (의도적 취약 설정) |
| WAF | 없음 |
| CloudFront | 없음 |
| CORS_ORIGIN | S3 웹사이트 엔드포인트 URL |
| Wazuh Agent | 수동 설치 예정 (3단계) |
| 환경변수 | EC2 내 `/opt/app/.env` 파일 |

### 보안 환경 (Secure)

| 항목 | 설정 |
|---|---|
| 컴퓨팅 | EC2 t3.small — Node.js 앱 + PostgreSQL 14 동거 |
| 백엔드 | Docker 컨테이너, 포트 3000, `--network host` |
| 프론트엔드 | S3 정적 배포 (`sentinel-share-secure-frontend`) — CloudFront 경유 |
| CloudFront | `dyfs11nls1dwb.cloudfront.net` — Distribution ID: `E1UMT2HJR995IV` |
| CloudFront Behaviors | `/api/*` → EC2(HTTP:3000), `/*` → S3, Custom Error: 403/404 → `/index.html` |
| S3 (파일) | Block Public Access **ON**, EC2 Instance Role만 허용하는 버킷 정책 |
| EC2 Security Group | CloudFront 관리형 프리픽스 리스트 `pl-22a6434b`만 허용 (ap-northeast-2) |
| WAF | Rate-based rule + AWS Managed Rules (설정 예정) |
| CORS_ORIGIN | `https://dyfs11nls1dwb.cloudfront.net` |
| Wazuh Agent | 수동 설치 예정 (3단계) |
| 환경변수 | EC2 내 `/opt/app/.env` 파일 |

### Attack Dashboard

| 항목 | 설정 |
|---|---|
| 컴퓨팅 | ECS Fargate 유지 (Wazuh 모니터링 대상 아님) |
| ECR 레포 | `cloudshield-dashboard` |

---

## CI/CD Overview <!-- LAST_UPDATED: 2026-03-16 -->

```
.github/workflows/deploy-backend.yml
  trigger: master/dev, sentinel-share-backend/** 변경
  build        → Docker 이미지 빌드 1회 + ECR 푸시 (:sha + :latest)
    ├── deploy-vulnerable → SSM Send Command → 취약 EC2: docker pull + restart
    └── deploy-secure     → SSM Send Command → 보안 EC2: docker pull + restart

.github/workflows/deploy-dashboard.yml
  trigger: master/dev, attack-dashboard/** 변경
  build  → Docker 이미지 빌드 + ECR 푸시 (cloudshield-dashboard)
    └── deploy → aws ecs update-service (Fargate 유지)

.github/workflows/deploy-frontend.yml  ← 완료
  trigger: master/dev, sentinel-share-frontend/** 변경
  deploy-vulnerable → NEXT_PUBLIC_API_URL=$VULN_API_URL, STATIC_EXPORT=true npm run build
                   → aws s3 sync out/ s3://sentinel-share-vul-frontend/ --delete
  deploy-secure    → NEXT_PUBLIC_API_URL=https://dyfs11nls1dwb.cloudfront.net/api
                   → aws s3 sync out/ s3://sentinel-share-secure-frontend/ --delete
                   → aws cloudfront create-invalidation --paths "/*"
```

**SSM 배포 방식 (백엔드):**
- SSH 포트 불필요 — IAM 권한으로 EC2에 명령 전달
- EC2 IAM Role 필요 권한: `AmazonSSMManagedInstanceCore`, `AmazonEC2ContainerRegistryReadOnly`
- 배포 명령: ECR login → `docker pull :latest` → `docker stop/rm` → `docker run`
- 환경변수는 EC2 내 `/opt/app/.env`에서 로드 (최초 1회 수동 설정)

**GitHub Secrets 전체 목록:**

| Secret | 값/용도 | Terraform 후 |
|---|---|---|
| `AWS_ROLE_ARN` | OIDC 인증용 IAM Role ARN | 유지 |
| `AWS_REGION` | `ap-northeast-2` | 유지 (또는 하드코딩) |
| `AWS_ACCOUNT_ID` | `833453046706` | 유지 (또는 하드코딩) |
| `VULN_EC2_INSTANCE_ID` | 취약 EC2 인스턴스 ID (SSM 타겟) | Terraform output 자동 주입 |
| `SECURE_EC2_INSTANCE_ID` | 보안 EC2 인스턴스 ID (SSM 타겟) | Terraform output 자동 주입 |
| `VULN_API_URL` | `http://<취약EC2-IP>:3000/api` | Elastic IP 고정 후 자동 주입 |
| `CLOUDFRONT_DISTRIBUTION_ID` | `E1UMT2HJR995IV` | Terraform output 자동 주입 |
| `DASHBOARD_ECS_CLUSTER` | 대시보드 ECS 클러스터 | Terraform output 자동 주입 |
| `DASHBOARD_ECS_SERVICE` | 대시보드 ECS 서비스 | Terraform output 자동 주입 |

**계획 (3단계):**
- `trivy-scan` — 이미지 빌드 후 CRITICAL/HIGH 취약점 스캔 (exit-code: 1)
- `prowler-scan` — 배포 후 AWS 보안 포스처 자동 검사

---

## Terraform 모듈 구조 (4단계 — 진행중) <!-- LAST_UPDATED: 2026-03-16 -->

```
infra/terraform/
├── modules/
│   ├── network/        VPC, subnets, security groups
│   ├── ec2/            EC2 인스턴스 (앱 + PostgreSQL 동거), user_data로 초기화
│   ├── s3/             bucket + policy (취약/보안 옵션)
│   ├── waf/            WebACL — Rate-based rule + AWS Managed Rules (보안 환경만)
│   └── cloudfront/     CloudFront distribution (보안 환경만)
├── environments/
│   ├── vulnerable/     취약 환경 (WAF/CloudFront 비활성, SG 전체 오픈)
│   └── secure/         보안 환경 (WAF/CloudFront 활성, SG CloudFront IP만 허용)
└── main.tf

user_data.sh 주요 동작 (docs/ec2-setup-guide.md 기반으로 자동화):
  1. Docker 설치 (apt-get, GPG 키, 레포 추가)
  2. Docker 데몬 enable + start
  3. AWS CLI 설치 (snap install aws-cli --classic)
  4. /opt/app/logs 디렉토리 생성 + chmod 777 (non-root appuser 쓰기 권한)
  5. PostgreSQL 14 설치 + DB/유저 생성
  6. /opt/app/.env 파일 생성 (변수는 Terraform templatefile로 주입)
  7. ECR에서 sentinelshare-backend:latest pull + docker run
  8. 마이그레이션: docker cp로 SQL 파일 복사 후 psql 실행 (최초 1회)

GitHub Secrets 자동화 (Terraform GitHub Provider):
  → terraform apply 완료 시 EC2 ID, CloudFront ID, ECS 정보를 GitHub Secrets에 자동 주입
  → aws_eip 리소스로 Elastic IP 고정 → VULN_API_URL 불변

Wazuh Agent 설치: 수동 (Terraform 자동화 제외)
  → Wazuh Manager IP를 알아야 agent 등록 가능하므로 별도 수동 진행
```

---

## Local Development

### 사전 준비 (Windows 기준)

- Docker Desktop 실행 중
- Node.js 20+
- AWS CLI
- psql 클라이언트 (PostgreSQL 17.9 설치 시 포함)

> **Windows 주의:** `winget install PostgreSQL.PostgreSQL.17` 으로 설치하면 로컬 PostgreSQL 서버가 5432 포트를 점유해
> Docker 컨테이너 접속을 막는다. **관리자 권한 PowerShell**에서 비활성화 필요:
> ```powershell
> Stop-Service -Name 'postgresql-x64-17' -Force
> Set-Service -Name 'postgresql-x64-17' -StartupType Disabled
> ```

### 로컬 실행 순서

```bash
# 1. Docker 컨테이너 시작 (PostgreSQL 17.9 + LocalStack 3)
cd sentinel-share-backend
docker compose up -d

# 2. S3 버킷 생성 + DB 마이그레이션 (최초 1회)
bash scripts/local-init.sh

# 3. 백엔드 시작
cp .env.local.example .env
npm install && npm run dev          # → http://localhost:3000

# 4. 프론트엔드 시작 (별도 터미널)
cd ../sentinel-share-frontend
echo "NEXT_PUBLIC_API_URL=http://localhost:3000" > .env.local
npm install && npm run dev -- -p 3001   # → http://localhost:3001

# 5. 공격 시뮬레이터 대시보드 시작 (선택 사항, 별도 터미널)
cd ../attack-dashboard
cp .env.local.example .env.local
npm install && npm run dev          # → http://localhost:3002
```

---

## Security Rules (do not violate)

- S3 presigned URL 생성 전 반드시 파일 소유권 또는 유효한 share token 검증
- SQL은 항상 `db.query(text, [$1 params])` — 문자열 연결 절대 금지
- `stored_key` 값을 API 응답에 절대 포함하지 않음
- 시크릿을 코드나 `.env.example`에 저장 금지
- 모든 파일 쿼리에 `is_deleted = false` 조건 필수 (`file.model.js` 참조)
- `authLimiter`를 auth 라우트에 다시 추가하지 않음 — rate limit은 WAF 담당 (의도적 설계)
- Terraform state 파일(`*.tfstate`) 커밋 금지 — S3 backend 또는 .gitignore 처리
- Prowler 스캔 결과에 실제 리소스 ARN/계정ID 포함 시 커밋 금지

---

## CLAUDE.md 업데이트 체크리스트

- [ ] 변경된 섹션의 `LAST_UPDATED` 날짜 갱신
- [ ] 구현 완료된 항목의 STATUS를 `[완료]`로 변경
- [ ] 새 파일 추가 시 해당 컴포넌트의 CLAUDE.md File Map 반영
- [ ] 삭제된 기능/파일은 File Map에서 제거
- [ ] 아키텍처 결정 변경 시 루트 CLAUDE.md Key Architectural Decisions 업데이트
