#!/bin/bash
set -e
exec > /var/log/user-data.log 2>&1

echo "=== SentinelShare EC2 Init Start ==="

# ─── Step 1: 패키지 업데이트 + Docker 설치 ───
apt-get update -y
apt-get install -y ca-certificates curl gnupg

install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null

DEBIAN_FRONTEND=noninteractive apt-get update -y
DEBIAN_FRONTEND=noninteractive apt-get install -y docker-ce docker-ce-cli containerd.io

systemctl enable docker
systemctl start docker

echo "Docker installed: $(docker --version)"

# ─── Step 2: AWS CLI 설치 ───
snap install aws-cli --classic
echo "AWS CLI installed: $(aws --version)"

# ─── Step 3: 앱 디렉토리 + 로그 폴더 ───
mkdir -p /opt/app/logs
chmod 777 /opt/app/logs

# ─── Step 4: PostgreSQL 14 설치 및 초기화 ───
DEBIAN_FRONTEND=noninteractive apt-get install -y postgresql postgresql-contrib

systemctl enable postgresql
systemctl start postgresql

# DB 및 유저 생성
sudo -u postgres psql <<'PSQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'sentinelshare') THEN
    CREATE USER sentinelshare WITH PASSWORD '${db_password}';
  END IF;
END$$;
PSQL

sudo -u postgres psql <<PSQL
ALTER USER sentinelshare WITH PASSWORD '${db_password}';
SELECT 'CREATE DATABASE sentinelshare OWNER sentinelshare'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'sentinelshare')\gexec
GRANT ALL PRIVILEGES ON DATABASE sentinelshare TO sentinelshare;
PSQL

echo "PostgreSQL ready"

# ─── Step 5: 환경변수 파일 생성 ───
cat > /opt/app/.env <<EOF
# Application
NODE_ENV=production
PORT=3000

# JWT
JWT_SECRET=${jwt_secret}
JWT_EXPIRES_IN=1h

# PostgreSQL
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=sentinelshare
DB_USER=sentinelshare
DB_PASSWORD=${db_password}

# AWS S3
AWS_REGION=${aws_region}
S3_BUCKET_NAME=${s3_bucket_name}

# Presigned URL TTL (seconds)
PRESIGNED_URL_TTL=300

# File upload limits
MAX_FILE_SIZE_MB=100
ALLOWED_MIME_TYPES=image/jpeg,image/png,image/gif,image/webp,application/pdf,text/plain,application/zip,application/x-zip-compressed

# CORS
CORS_ORIGIN=${cors_origin}

# Environment type
ENV_TYPE=${env_type}
EOF

chmod 600 /opt/app/.env

# ─── Step 6: ECR 로그인 + Docker 이미지 pull ───
aws ecr get-login-password --region ${aws_region} | \
  docker login --username AWS --password-stdin ${ecr_registry}

docker pull ${ecr_registry}/sentinelshare-backend:latest

# ─── Step 7: 컨테이너 실행 ───
docker run -d \
  --name sentinelshare-backend \
  --env-file /opt/app/.env \
  --network host \
  -v /opt/app/logs:/opt/app/logs \
  --restart unless-stopped \
  ${ecr_registry}/sentinelshare-backend:latest

echo "Container started"

# ─── Step 8: 컨테이너 기동 대기 후 마이그레이션 ───
sleep 15

# 헬스체크 대기 (최대 120초)
for i in $(seq 1 24); do
  if curl -sf http://localhost:3000/health > /dev/null 2>&1; then
    echo "Backend health check OK"
    break
  fi
  echo "Waiting for backend... ($i/24)"
  sleep 5
done

# 마이그레이션 실행 (최초 1회 — 이미 실행된 경우 멱등성 보장)
docker exec sentinelshare-backend \
  psql "postgresql://sentinelshare:${db_password}@127.0.0.1:5432/sentinelshare" \
  -f /app/migrations/001_initial_schema.sql || true

echo "=== SentinelShare EC2 Init Complete ==="
