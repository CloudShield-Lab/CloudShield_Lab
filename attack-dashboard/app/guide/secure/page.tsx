import Link from 'next/link';
import { StepCard } from '@/components/StepCard';
import { CodeBlock } from '@/components/CodeBlock';
import { MethodProvider, MethodToggle, CliContent, ConsoleContent } from '@/components/MethodTabs';

export default function SecureGuidePage() {
  return (
    <MethodProvider>
      <div className="max-w-4xl mx-auto w-full px-4 py-8 space-y-6">

        {/* 헤더 */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Link href="/guide" className="text-slate-600 hover:text-slate-400 text-sm transition-colors">
                ← Infrastructure Guide
              </Link>
            </div>
            <h1 className="text-2xl font-bold text-slate-100">보안 환경 구성</h1>
            <p className="text-slate-500 mt-1 text-sm">
              CloudFront + WAF · S3 프라이빗 · Security Group CloudFront IP 제한 — 동일 코드, 다른 인프라
            </p>
          </div>
          <span className="flex-shrink-0 px-3 py-1 rounded border border-emerald-900 bg-emerald-950 text-emerald-400 text-xs font-mono uppercase tracking-widest">
            Secure
          </span>
        </div>

        {/* 구성 요약 */}
        <div className="rounded-lg border border-emerald-900/40 bg-emerald-950/10 p-4 text-sm">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'WAF', value: 'Rate-based + OWASP' },
              { label: 'S3 Public Access', value: 'ON (차단)' },
              { label: 'Security Group', value: 'CF IP only' },
              { label: 'CloudFront', value: 'HTTPS + CDN' },
            ].map((item) => (
              <div key={item.label}>
                <div className="text-slate-500 text-xs mb-0.5">{item.label}</div>
                <div className="font-mono text-xs font-semibold text-emerald-400">{item.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* CLI / Console 탭 토글 */}
        <MethodToggle />

        {/* Step 1: S3 버킷 — 프라이빗 */}
        <StepCard step={1} title="VPC 설정">
          <CliContent>
            <CodeBlock code={`AWS_REGION=ap-northeast-2
AWS_AZ=ap-northeast-2a

VPC_ID=$(aws ec2 create-vpc \\
  --region$AWS_REGION \\
  --cidr-block 10.2.0.0/16 \\
  --tag-specifications"ResourceType=vpc,Tags=[{Key=Name,Value=secure-vpc}]" \\
  --query'Vpc.VpcId' \\
  --output text)

PUBLIC_SUBNET_ID=$(aws ec2 create-subnet \\
  --region$AWS_REGION \\
  --vpc-id$VPC_ID \\
  --cidr-block 10.2.1.0/24 \\
  --availability-zone$AWS_AZ \\
  --tag-specifications"ResourceType=subnet,Tags=[{Key=Name,Value=secure-subnet-public}]" \\
  --query'Subnet.SubnetId' \\
  --output text)

aws ec2 modify-subnet-attribute \\
--region$AWS_REGION \\
--subnet-id$PUBLIC_SUBNET_ID \\
--map-public-ip-on-launch

PRIVATE_SUBNET_ID=$(aws ec2 create-subnet \\
  --region$AWS_REGION \\
  --vpc-id$VPC_ID \\
  --cidr-block 10.2.101.0/24 \\
  --availability-zone$AWS_AZ \\
  --tag-specifications"ResourceType=subnet,Tags=[{Key=Name,Value=secure-subnet-private}]" \\
  --query'Subnet.SubnetId' \\
  --output text)

IGW_ID=$(aws ec2 create-internet-gateway \\
  --region$AWS_REGION \\
  --tag-specifications"ResourceType=internet-gateway,Tags=[{Key=Name,Value=secure-igw}]" \\
  --query'InternetGateway.InternetGatewayId' \\
  --output text)

aws ec2 attach-internet-gateway \\
--region$AWS_REGION \\
--internet-gateway-id$IGW_ID \\
--vpc-id$VPC_ID

EIP_ALLOC_ID=$(aws ec2 allocate-address \\
  --region$AWS_REGION \\
  --domain vpc \\
  --query'AllocationId' \\
  --output text)

NAT_GW_ID=$(aws ec2 create-nat-gateway \\
  --region$AWS_REGION \\
  --subnet-id$PUBLIC_SUBNET_ID \\
  --allocation-id$EIP_ALLOC_ID \\
  --tag-specifications"ResourceType=natgateway,Tags=[{Key=Name,Value=secure-nat}]" \\
  --query'NatGateway.NatGatewayId' \\
  --output text)

aws ec2 wait nat-gateway-available \\
--region$AWS_REGION \\
--nat-gateway-ids$NAT_GW_ID

PUBLIC_RT_ID=$(aws ec2 create-route-table \\
  --region$AWS_REGION \\
  --vpc-id$VPC_ID \\
  --tag-specifications"ResourceType=route-table,Tags=[{Key=Name,Value=secure-rt-public}]" \\
  --query'RouteTable.RouteTableId' \\
  --output text)

aws ec2 create-route \\
--region$AWS_REGION \\
--route-table-id$PUBLIC_RT_ID \\
--destination-cidr-block0.0.0.0/0 \\
--gateway-id$IGW_ID

aws ec2 associate-route-table \\
--region$AWS_REGION \\
--route-table-id$PUBLIC_RT_ID \\
--subnet-id$PUBLIC_SUBNET_ID

PRIVATE_RT_ID=$(aws ec2 create-route-table \\
  --region$AWS_REGION \\
  --vpc-id$VPC_ID \\
  --tag-specifications"ResourceType=route-table,Tags=[{Key=Name,Value=secure-rt-private}]" \\
  --query'RouteTable.RouteTableId' \\
  --output text)

aws ec2 create-route \\
--region$AWS_REGION \\
--route-table-id$PRIVATE_RT_ID \\
--destination-cidr-block0.0.0.0/0 \\
--nat-gateway-id$NAT_GW_ID

aws ec2 associate-route-table \\
--region$AWS_REGION \\
--route-table-id$PRIVATE_RT_ID \\
--subnet-id$PRIVATE_SUBNET_ID

MAIN_VPC_ID=main-vpc의 VPC ID
VUL_VPC_ID=vul-vpc의 VPC ID
MAIN_PRIVATE_RT_ID=main-vpc의 Route Table ID
VUL_PRIVATE_RT_ID=vul-vpc의 Route Table ID

MAIN_SECURE_PEERING_ID=$(aws ec2 create-vpc-peering-connection \\
  --region $AWS_REGION \\
  --vpc-id $MAIN_VPC_ID \\
  --peer-vpc-id $VPC_ID \\
  --tag-specifications "ResourceType=vpc-peering-connection,Tags=[{Key=Name,Value=wazuh-peering-main-secure}]" \\
  --query 'VpcPeeringConnection.VpcPeeringConnectionId' \\
  --output text)

aws ec2 accept-vpc-peering-connection \\
--region $AWS_REGION \\
--vpc-peering-connection-id $MAIN_SECURE_PEERING_ID

MAIN_VUL_PEERING_ID=$(aws ec2 create-vpc-peering-connection \\
  --region $AWS_REGION \\
  --vpc-id $MAIN_VPC_ID \\
  --peer-vpc-id $VUL_VPC_ID \\
  --tag-specifications "ResourceType=vpc-peering-connection,Tags=[{Key=Name,Value=wazuh-peering-main-vul}]" \\
  --query 'VpcPeeringConnection.VpcPeeringConnectionId' \\
  --output text)

aws ec2 accept-vpc-peering-connection \\
--region $AWS_REGION \\
--vpc-peering-connection-id $MAIN_VUL_PEERING_ID`} />
          </CliContent>
          <ConsoleContent>
            <ol className="space-y-2 text-sm text-slate-400 list-decimal list-inside">
              <li>AWS 콘솔 상단 검색창에 <code className="font-mono text-slate-300">S3</code> 검색 → S3 클릭</li>
              <li>우측 상단 <span className="text-slate-200">버킷 만들기</span> 클릭</li>
              <li>버킷 이름 입력 → 리전: <code className="font-mono text-slate-300">ap-northeast-2</code> 선택</li>
              <li>객체 소유권: <span className="text-slate-200">ACL 비활성화됨</span> 유지</li>
              <li>퍼블릭 액세스 차단 설정: 4개 항목 모두 체크 확인</li>
              <li><span className="text-slate-200">버킷 만들기</span> 클릭</li>
            </ol>
          </ConsoleContent>
        </StepCard>

        {/* Step 2: S3 버킷 정책 */}
        <StepCard
          step={2}
          title="IAM 설정"
          note="sentinel-share-backend/infra/s3-bucket-policy.json 파일의 YOUR_ACCOUNT_ID와 버킷명을 실제 값으로 대체한 후 적용합니다."
        >
          <CliContent>
            <CodeBlock code={`aws iam create-role \\
  --role-name secure-ec2-role \\
  --assume-role-policy-document file://trust-policy-ec2.json

aws iam attach-role-policy \\
  --role-name secure-ec2-role \\
  --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore

aws iam attach-role-policy \\
  --role-name secure-ec2-role \\
  --policy-arn arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy

aws iam put-role-policy \\
  --role-name secure-ec2-role \\
  --policy-name secure-ec2-inline \\
  --policy-document file://secure-ec2-inline-policy.json`} />
          </CliContent>
          <ConsoleContent />
        </StepCard>

        {/* Step 3: RDS */}
        <StepCard step={3} title="ECR 프라이빗 레포지토리 생성">
          <CliContent>
            <CodeBlock code={`ECR_URI=$(aws ecr create-repository \\
  --repository-name s3cure-api \\
  --image-scanning-configuration scanOnPush=true \\
  --region ap-northeast-2 \\
  --query'repository.repositoryUri' \\
  --output text)

aws ecr get-login-password \\
--region ap-northeast-2 \\
  | docker login \\
--username AWS \\
--password-stdin${ECR_URI%/*}

docker tag sentinel-api:latest${ECR_URI}:latest
docker push${ECR_URI}:latest`} />
          </CliContent>
          <ConsoleContent />
        </StepCard>

        {/* Step 4: IAM 역할 */}
        <StepCard step={4} title="보안 그룹 설정">
          <CliContent>
            <CodeBlock code={`CONTAINER_SG_ID=$(aws ec2 create-security-group \\
  --group-name secure-container-sg \\
  --description "security group for secure container" \\
  --vpc-id $VPC_ID \\
  --region $AWS_REGION \\
  --query 'GroupId' \\
  --output text)

aws ec2 authorize-security-group-ingress \\
  --group-id $CONTAINER_SG_ID \\
  --protocol tcp \\
  --port 3000 \\
  --cidr 10.1.0.0/16 \\
  --region $AWS_REGION

MY_IP=YOUR_PUBLIC_IP/32

BASTION_SG_ID=$(aws ec2 create-security-group \\
  --group-name secure-bastion-sg \\
  --description "security group for secure bastion" \\
  --vpc-id $VPC_ID \\
  --region $AWS_REGION \\
  --query 'GroupId' \\
  --output text)

aws ec2 authorize-security-group-ingress \\
  --group-id $BASTION_SG_ID \\
  --protocol tcp \\
  --port 22 \\
  --cidr $MY_IP \\
  --region $AWS_REGION`} />
          </CliContent>
          <ConsoleContent />
        </StepCard>

        {/* Step 5: Secrets Manager */}
        <StepCard step={5} title="S3 설정">
          <CliContent>
            <CodeBlock code={`aws s3api create-bucket \\
  --bucket secure-log \\
  --region $AWS_REGION \\
  --create-bucket-configuration LocationConstraint=$AWS_REGION

aws s3api put-public-access-block \\
  --bucket secure-log \\
  --public-access-block-configuration \\
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

aws s3api put-bucket-encryption \\
  --bucket secure-log \\
  --server-side-encryption-configuration \\
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'`} />
          </CliContent>
          <ConsoleContent />
        </StepCard>

        {/* Step 6: ECS 클러스터 + Security Group */}
        <StepCard step={6} title="GitHub Actions / OIDC 설정">
          <CliContent>
            <CodeBlock code={`aws iam create-policy \\
  --policy-name CloudShield-Policy \\
  --policy-document file://cloudshield-policy.json

aws iam create-role \\
  --role-name CloudShield-Role \\
  --assume-role-policy-document file://github-oidc-trust.json

aws iam attach-role-policy \\
  --role-name CloudShield-Role \\
  --policy-arn arn:aws:iam::833453046706:policy/CloudShield-Policy`} />
          </CliContent>
          <ConsoleContent />
        </StepCard>

        {/* Step 7: WAF Web ACL */}
        <StepCard
          step={7}
          title="CloudWatch Log Group 생성"
          note="WAF는 CloudFront에 연결하므로 반드시 us-east-1 리전에서 생성해야 합니다."
        >
          <CliContent>
            <CodeBlock code={`aws logs create-log-group \\
  --log-group-name /ec2/secure-backend \\
  --region $AWS_REGION

aws logs put-retention-policy \\
  --log-group-name /ec2/secure-backend \\
  --retention-in-days 30 \\
  --region $AWS_REGION`} />
          </CliContent>
          <ConsoleContent />
        </StepCard>

        {/* Step 8: ECS 태스크 정의 + 서비스 */}
        <StepCard
          step={8}
          title="EC2 인스턴스 생성"
          note="sentinel-share-backend/infra/ecs-task-definition-secure.json을 사용합니다. ACCOUNT_ID와 시크릿 ARN을 실제 값으로 대체하세요."
        >
          <CliContent>
            <CodeBlock code={`aws ec2 run-instances \\
  --image-id <UBUNTU_AMI_ID> \\
  --instance-type t3.small \\
  --subnet-id $PUBLIC_SUBNET_ID \\
  --security-group-ids $EC2_SG_ID \\
  --iam-instance-profile Name=secure-ec2-role \\
  --associate-public-ip-address \\
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=secure-ec2}]" \\
  --region $AWS_REGION`} />
          </CliContent>
          <ConsoleContent />
        </StepCard>

        {/* Step 9: CloudFront 배포 */}
        <StepCard
          step={9}
          title="DB 설정"
          note="오리진은 ECS Task의 Public IP입니다. 실제 프로덕션에서는 ALB를 오리진으로 사용하는 것이 권장되지만, 이 데모 환경에서는 ECS IP를 직접 사용합니다."
        >
          <CliContent>
            <CodeBlock code={`sudo apt update
sudo apt install -y postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql

sudo -u postgres psql <<EOF
CREATE USER sentinelshare WITH PASSWORD 'localpassword';
CREATE DATABASE sentinelshare OWNER sentinelshare;
\\q
EOF

sudo -u postgres psql -c "\\l"`} />
          </CliContent>
          <ConsoleContent />
        </StepCard>

        {/* Step 10: Security Group CloudFront IP 제한 */}
        <StepCard
          step={10}
          title="백엔드 배포 및 실행"
          warning="이 단계 완료 후 ECS에 직접 접근이 차단됩니다. CloudFront 도메인을 통해서만 접근 가능합니다."
        >
          <CliContent>
            <CodeBlock code={`git clone https://github.com/CloudShield-Lab/CloudShield_Lab.git Sentinel_Share
cd Sentinel_Share/sentinel-share-backend

sudo apt update
sudo apt install -y nodejs npm git
npm install

cat > .env <<'EOF'
NODE_ENV=development
PORT=3000
JWT_SECRET=s3cure123!
JWT_EXPIRES_IN=1h
DB_HOST=localhost
DB_PORT=5432
DB_NAME=sentinelshare
DB_USER=sentinelshare
DB_PASSWORD=localpassword
AWS_REGION=ap-northeast-2
S3_BUCKET_NAME=your-sentinelshare-bucket
PRESIGNED_URL_TTL=300
MAX_FILE_SIZE_MB=100
ALLOWED_MIME_TYPES=image/jpeg,image/png,image/gif,image/webp,application/pdf,text/plain,application/zip,application/x-zip-compressed
CORS_ORIGIN=http://localhost:3000
EOF

npm run dev`} />
          </CliContent>
          <ConsoleContent />
        </StepCard>

        {/* Step 11: DB 마이그레이션 */}
        <StepCard step={11} title="프론트엔드 연결 및 접속 테스트">
          <CliContent>
            <CodeBlock code={`cd Sentinel_Share/sentinel-share-frontend

cat > .env.local <<'EOF'
NEXT_PUBLIC_API_URL=http://<EC2_PUBLIC_IP>:3000
EOF

npm install
npm run dev

curl http://<EC2_PUBLIC_IP>:3000/health`} />
          </CliContent>
          <ConsoleContent />
        </StepCard>

        {/* Step 12: Secrets Manager CORS 업데이트 + 대시보드 연결 */}
        <StepCard step={12} title="Secrets Manager 설정">
          <CliContent>
            <CodeBlock code={`aws secretsmanager create-secret \\
--name secure-db-password \\
--secret-string'{"password":"s3cure123!"}' \\
--region$AWS_REGION

aws secretsmanager create-secret \\
--name secure-jwt-secret \\
--secret-string'{"password":"s3cure123!"}' \\
--region$AWS_REGION

aws iam put-role-policy \\
--role-name s3cure-taskexecutionrole \\
--policy-name SecureSecretsReadPolicy \\
--policy-document file://secrets-inline-policy.json`} />
          </CliContent>
          <ConsoleContent />
        </StepCard>

        {/* 검증 */}
        <div className="rounded-xl border border-emerald-900/40 bg-emerald-950/10 p-6">
          <h3 className="text-emerald-400 font-semibold mb-3">설정 검증</h3>
          <div className="space-y-2 text-sm">
            {[
              { check: 'CloudFront URL로 /health 요청 → 200 OK', cmd: 'curl https://YOUR_CF_DOMAIN.cloudfront.net/health' },
              { check: 'ECS IP 직접 접근 → 연결 거부 (SG 차단)', cmd: 'curl http://YOUR_ECS_IP:3000/health  # 타임아웃 또는 연결 거부' },
              { check: 'S3 버킷 직접 접근 → 403 AccessDenied', cmd: 'curl https://your-secure-bucket.s3.ap-northeast-2.amazonaws.com/  # 403' },
            ].map((item, i) => (
              <div key={i} className="space-y-1">
                <div className="flex items-center gap-2 text-slate-400">
                  <span className="text-emerald-600">✓</span>
                  {item.check}
                </div>
                <CodeBlock code={item.cmd} />
              </div>
            ))}
          </div>
        </div>

        {/* 완료 */}
        <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-6">
          <h3 className="text-slate-300 font-semibold mb-2">모든 구성 완료</h3>
          <p className="text-slate-500 text-sm mb-4">
            취약/보안 두 환경이 모두 준비되었습니다. Attack Simulator에서 공격을 실행하고 결과를 비교해보세요.
          </p>
          <div className="flex gap-3">
            <Link
              href="/"
              className="px-4 py-2 rounded-lg border border-red-700 bg-red-950 text-red-400 text-sm font-medium hover:bg-red-900 transition-colors"
            >
              ▶ Attack Simulator 실행
            </Link>
            <Link
              href="/guide/vulnerable"
              className="px-4 py-2 rounded-lg border border-slate-700 text-slate-400 text-sm hover:text-slate-200 hover:border-slate-600 transition-colors"
            >
              ← 취약 환경 가이드
            </Link>
          </div>
        </div>

      </div>
    </MethodProvider>
  );
}
