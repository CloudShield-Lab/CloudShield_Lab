# EC2 환경 설정 가이드

취약(Vulnerable) / 보안(Secure) EC2 환경 초기 셋업 절차.
**앱 코드는 동일** — 인프라 설정만 다름.

---

## 공통 사전 조건

- Ubuntu 22.04 EC2
- IAM Role 연결 필요 권한:
  - `AmazonSSMManagedInstanceCore` — GitHub Actions SSM 배포
  - `AmazonEC2ContainerRegistryReadOnly` — ECR 이미지 pull

---

## Step 1: Docker 설치

```bash
# 패키지 업데이트
sudo apt-get update

# 의존성 설치
sudo apt-get install -y ca-certificates curl gnupg

# Docker 공식 GPG 키 추가
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# Docker apt 레포지토리 추가
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Docker 설치
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io

# Docker 데몬 자동 시작 설정
sudo systemctl enable docker
sudo systemctl start docker

# 설치 확인
docker --version
```

---

## Step 2: AWS CLI 설치

```bash
sudo snap install aws-cli --classic

# 설치 확인
aws --version
```

---

## Step 3: 앱 디렉토리 및 로그 폴더 생성

```bash
sudo mkdir -p /opt/app/logs
sudo chmod 777 /opt/app/logs
```

> `/opt/app/logs` 권한이 777이어야 Docker 컨테이너 내부의 non-root user(appuser)가 로그 파일을 쓸 수 있음.

---

## Step 4: 환경변수 파일 생성

### 취약 환경 (Vulnerable)

```bash
sudo tee /opt/app/.env <<'EOF'
# Application
NODE_ENV=production
PORT=3000

# JWT
JWT_SECRET=<강력한-랜덤-시크릿>
JWT_EXPIRES_IN=1h

# PostgreSQL (EC2 동거)
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=sentinelshare
DB_USER=sentinelshare
DB_PASSWORD=<DB-비밀번호>

# AWS S3
AWS_REGION=ap-northeast-2
S3_BUCKET_NAME=<취약-환경-S3-버킷명>

# Presigned URL TTL (seconds)
PRESIGNED_URL_TTL=300

# File upload limits
MAX_FILE_SIZE_MB=100
ALLOWED_MIME_TYPES=image/jpeg,image/png,image/gif,image/webp,application/pdf,text/plain,application/zip,application/x-zip-compressed

# CORS — 취약 환경: EC2 직접 접근 (CloudFront 없음)
CORS_ORIGIN=http://<취약-EC2-퍼블릭-IP>:3001
EOF

sudo chmod 600 /opt/app/.env
```

### 보안 환경 (Secure)

```bash
sudo tee /opt/app/.env <<'EOF'
# Application
NODE_ENV=production
PORT=3000

# JWT
JWT_SECRET=<강력한-랜덤-시크릿>
JWT_EXPIRES_IN=1h

# PostgreSQL (EC2 동거)
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=sentinelshare
DB_USER=sentinelshare
DB_PASSWORD=<DB-비밀번호>

# AWS S3
AWS_REGION=ap-northeast-2
S3_BUCKET_NAME=<보안-환경-S3-버킷명>

# Presigned URL TTL (seconds)
PRESIGNED_URL_TTL=300

# File upload limits
MAX_FILE_SIZE_MB=100
ALLOWED_MIME_TYPES=image/jpeg,image/png,image/gif,image/webp,application/pdf,text/plain,application/zip,application/x-zip-compressed

# CORS — 보안 환경: CloudFront 도메인
CORS_ORIGIN=https://dyfs11nls1dwb.cloudfront.net
EOF

sudo chmod 600 /opt/app/.env
```

---

## Step 5: PostgreSQL 설치 및 초기화

```bash
# PostgreSQL 17 설치
sudo apt-get install -y postgresql postgresql-contrib

# PostgreSQL 서비스 시작
sudo systemctl enable postgresql
sudo systemctl start postgresql

# DB 및 유저 생성
sudo -u postgres psql <<'EOF'
CREATE USER sentinelshare WITH PASSWORD '<DB-비밀번호>';
CREATE DATABASE sentinelshare OWNER sentinelshare;
GRANT ALL PRIVILEGES ON DATABASE sentinelshare TO sentinelshare;
EOF
```

> `DB_PASSWORD`는 `/opt/app/.env`의 값과 동일하게 설정.

---

## Step 6: DB 마이그레이션 실행

```bash
# psql로 마이그레이션 실행
PGPASSWORD=<DB-비밀번호> psql \
  -h 127.0.0.1 -p 5432 \
  -U sentinelshare -d sentinelshare \
  -f /opt/app/migrations/001_initial_schema.sql
```

> 마이그레이션 파일은 GitHub Actions 배포 후 컨테이너 안에 있으므로,
> 최초 1회는 로컬에서 파일을 EC2로 복사하거나 psql 직접 실행.

**대안 — 컨테이너 내부에서 실행:**
```bash
sudo docker exec -it sentinelshare-backend \
  node -e "
    const { Pool } = require('pg');
    const fs = require('fs');
    const pool = new Pool({ host:'127.0.0.1', port:5432, database:'sentinelshare', user:'sentinelshare', password:'<DB-비밀번호>' });
    pool.query(fs.readFileSync('/app/migrations/001_initial_schema.sql','utf8')).then(()=>{ console.log('done'); pool.end(); });
  "
```

---

## Step 7: 첫 배포 실행

GitHub Actions → `Deploy Backend to EC2` → **Run workflow**

Actions가 자동으로:
1. ECR에서 이미지 pull
2. `docker run --env-file /opt/app/.env --network host` 실행

**배포 완료 확인:**
```bash
sudo docker ps
# STATUS가 "Up ... (healthy)" 이어야 함

curl http://localhost:3000/health
# {"status":"ok"}
```

---

## 환경별 차이 요약

| 항목 | 취약 환경 | 보안 환경 |
|------|-----------|-----------|
| `CORS_ORIGIN` | `http://<EC2-IP>:3001` | `https://dyfs11nls1dwb.cloudfront.net` |
| `S3_BUCKET_NAME` | 취약 환경 버킷 | 보안 환경 버킷 |
| Security Group | `0.0.0.0/0` 포트 3000, 3001 | CloudFront prefix list(`pl-22a6434b`)만 허용 |
| CloudFront | 없음 | 있음 (WAF 연결) |
| S3 Block Public Access | OFF | ON |
| WAF | 없음 | Rate-based rule + AWS Managed Rules |

---

## 트러블슈팅

| 증상 | 원인 | 해결 |
|------|------|------|
| 컨테이너 `Restarting` | `/opt/app/logs` 권한 부족 | `sudo chmod 777 /opt/app/logs` |
| SSM 명령 `Failed` | Docker 데몬 미실행 | `sudo systemctl start docker` |
| SSM 명령 `Failed` | AWS CLI 미설치 | `sudo snap install aws-cli --classic` |
| ECR pull 실패 | EC2 IAM Role 권한 부족 | `AmazonEC2ContainerRegistryReadOnly` 정책 추가 |
| 백엔드 DB 연결 실패 | PostgreSQL 미실행 또는 유저/DB 없음 | Step 5 재확인 |
