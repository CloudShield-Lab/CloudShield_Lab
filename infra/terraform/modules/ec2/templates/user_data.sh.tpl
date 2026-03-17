#!/bin/bash
set -e
exec > /var/log/user_data.log 2>&1

echo "=== [1/8] 시스템 패키지 업데이트 ==="
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl gnupg

echo "=== [2/8] Docker 설치 ==="
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $$(. /etc/os-release && echo "$$VERSION_CODENAME") stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null

apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io
systemctl enable docker
systemctl start docker
echo "Docker 설치 완료: $$(docker --version)"

echo "=== [3/8] AWS CLI 설치 ==="
snap install aws-cli --classic
echo "AWS CLI 설치 완료: $$(aws --version)"

echo "=== [4/8] 앱 디렉토리 생성 ==="
mkdir -p /opt/app/logs
chmod 777 /opt/app/logs

echo "=== [5/8] PostgreSQL 14 설치 ==="
apt-get install -y postgresql postgresql-contrib
systemctl enable postgresql
systemctl start postgresql

# DB/유저 생성
sudo -u postgres psql <<SQL
CREATE USER sentinelshare WITH PASSWORD '${db_password}';
CREATE DATABASE sentinelshare OWNER sentinelshare;
GRANT ALL PRIVILEGES ON DATABASE sentinelshare TO sentinelshare;
SQL
echo "PostgreSQL 초기화 완료"

echo "=== [6/8] .env 파일 생성 ==="
cat > /opt/app/.env <<'ENVEOF'
${env_content}
ENVEOF
chmod 600 /opt/app/.env
echo ".env 파일 생성 완료"

echo "=== [7/8] ECR Docker 이미지 pull + 컨테이너 실행 ==="
aws ecr get-login-password --region ${aws_region} | docker login --username AWS --password-stdin ${ecr_registry}
docker pull ${ecr_image}

docker run -d \
  --name sentinelshare-backend \
  --env-file /opt/app/.env \
  --network host \
  -v /opt/app/logs:/opt/app/logs \
  --restart unless-stopped \
  ${ecr_image}

echo "컨테이너 실행 완료"

echo "=== [8/8] DB 마이그레이션 (컨테이너 기동 대기 20초) ==="
sleep 20

docker exec sentinelshare-backend \
  psql postgresql://sentinelshare:${db_password}@127.0.0.1:5432/sentinelshare \
  -f /app/migrations/001_initial_schema.sql \
  && echo "마이그레이션 완료" \
  || echo "마이그레이션 실패 (이미 실행됐거나 오류 확인 필요)"

echo "=== user_data 스크립트 완료 ==="
