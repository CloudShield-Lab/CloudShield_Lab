#!/bin/bash
set -euo pipefail
exec > /var/log/user-data.log 2>&1

trap 'echo ""; echo "=== USER-DATA FAILED (line $LINENO) ==="; touch /var/log/user-data-failed' ERR

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
export AWS_PAGER=""

DB_PASSWORD=${db_password}
JWT_SECRET_VALUE=${jwt_secret}
DB_PASSWORD_SECRET_NAME=${db_password_secret_name}
JWT_SECRET_SECRET_NAME=${jwt_secret_secret_name}

if [ -n "$DB_PASSWORD_SECRET_NAME" ]; then
  DB_PASSWORD="$(aws secretsmanager get-secret-value \
    --region ${aws_region} \
    --secret-id "$DB_PASSWORD_SECRET_NAME" \
    --query SecretString \
    --output text)"
fi

if [ -n "$JWT_SECRET_SECRET_NAME" ]; then
  JWT_SECRET_VALUE="$(aws secretsmanager get-secret-value \
    --region ${aws_region} \
    --secret-id "$JWT_SECRET_SECRET_NAME" \
    --query SecretString \
    --output text)"
fi

if [ -z "$DB_PASSWORD" ] || [ -z "$JWT_SECRET_VALUE" ]; then
  echo "Required application secrets are missing"
  exit 1
fi

# ─── Step 3: 앱 디렉토리 + 로그 폴더 ───
mkdir -p /opt/app/logs
chmod 777 /opt/app/logs

# ─── Step 4: PostgreSQL 14 설치 및 초기화 ───
DEBIAN_FRONTEND=noninteractive apt-get install -y postgresql postgresql-contrib

systemctl enable postgresql
systemctl start postgresql

# DB 및 유저 생성
DB_ROLE_EXISTS=$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'sentinelshare'")
DB_PASSWORD_SQL=$${DB_PASSWORD//\'/\'\'}
if [ "$DB_ROLE_EXISTS" != "1" ]; then
  sudo -u postgres psql -v ON_ERROR_STOP=1 \
    -c "CREATE USER sentinelshare WITH PASSWORD '$${DB_PASSWORD_SQL}';"
fi

sudo -u postgres psql -v ON_ERROR_STOP=1 <<PSQL
ALTER USER sentinelshare WITH PASSWORD '$${DB_PASSWORD_SQL}';
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
JWT_SECRET=$${JWT_SECRET_VALUE}
JWT_EXPIRES_IN=1h

# PostgreSQL
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=sentinelshare
DB_USER=sentinelshare
DB_PASSWORD=$${DB_PASSWORD}

# AWS S3
AWS_REGION=${aws_region}
S3_BUCKET_NAME=${s3_bucket_name}

# Presigned URL TTL (seconds)
PRESIGNED_URL_TTL=300

# File upload limits
MAX_FILE_SIZE_MB=100
ALLOWED_MIME_TYPES=image/jpeg,image/png,image/gif,image/webp,application/pdf,text/plain,application/zip,application/x-zip-compressed

# CORS
CORS_ORIGIN=${frontend_origin}

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

# ─── Step 8: 컨테이너 기동 대기 ───
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

# ─── Step 9: DB 마이그레이션 ───
# 컨테이너 안 psql 없음 → docker cp로 SQL 추출 후 호스트 psql 실행
docker cp sentinelshare-backend:/app/migrations/001_initial_schema.sql /tmp/schema.sql

PGPASSWORD="$${DB_PASSWORD}" psql \
  -h 127.0.0.1 -U sentinelshare -d sentinelshare \
  -f /tmp/schema.sql \
  && echo "Migration complete" \
  || echo "Migration failed or already applied (continuing)"

unset DB_PASSWORD JWT_SECRET_VALUE DB_PASSWORD_SECRET_NAME JWT_SECRET_SECRET_NAME

# ─── Step 10: 시드 데이터 — victim 계정 + 데모 파일 ───
# victim@demo.com 계정 생성 (이미 있으면 409 → 무시)
curl -sf -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"victim@demo.com","password":"Demo1234!"}' \
  && echo "victim account created" \
  || echo "victim account already exists or signup failed (continuing)"

# victim으로 로그인 → JWT 획득
VICTIM_TOKEN=$(curl -sf -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"victim@demo.com","password":"Demo1234!"}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('token',''))" 2>/dev/null || true)

# JWT 획득 성공 시 데모 파일 업로드 (시나리오 2 S3 탈취 체인용)
if [ -n "$VICTIM_TOKEN" ]; then
  echo "SentinelShare Demo — confidential-report.txt" > /tmp/demo-report.txt
  curl -sf -X POST http://localhost:3000/api/files/upload \
    -H "Authorization: Bearer $VICTIM_TOKEN" \
    -F "file=@/tmp/demo-report.txt;type=text/plain" \
    && echo "Demo file uploaded for victim account" \
    || echo "File upload failed (non-fatal)"
else
  echo "Could not obtain victim JWT — skipping file upload"
fi

# ─── Step 11: Wazuh Agent 설치 (wazuh_manager_ip 설정된 경우만) ───
%{ if wazuh_manager_ip != "" }
echo "=== Installing Wazuh Agent ==="

apt-get install -y gnupg

curl -s https://packages.wazuh.com/key/GPG-KEY-WAZUH \
  | gpg --no-default-keyring \
        --keyring gnupg-ring:/usr/share/keyrings/wazuh.gpg \
        --import

chmod 644 /usr/share/keyrings/wazuh.gpg

echo "deb [signed-by=/usr/share/keyrings/wazuh.gpg] https://packages.wazuh.com/4.x/apt/ stable main" \
  | tee /etc/apt/sources.list.d/wazuh.list

DEBIAN_FRONTEND=noninteractive apt-get update -q

WAZUH_MANAGER="${wazuh_manager_ip}" \
  WAZUH_AGENT_NAME="$(hostname)-${env_type}" \
  DEBIAN_FRONTEND=noninteractive apt-get install -y wazuh-agent

systemctl daemon-reload
systemctl enable wazuh-agent
systemctl start wazuh-agent

echo "Wazuh agent installed and started"
%{ endif }

echo "=== SentinelShare EC2 Init Complete ==="
touch /var/log/user-data-complete
