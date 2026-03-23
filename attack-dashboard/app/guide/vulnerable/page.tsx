import Link from 'next/link';
import { StepCard } from '@/components/StepCard';
import { CodeBlock } from '@/components/CodeBlock';
import { MethodProvider, MethodToggle, CliContent, ConsoleContent } from '@/components/MethodTabs';

export default function VulnerableGuidePage() {
  return (
    <MethodProvider>
      <div className="max-w-4xl mx-auto w-full px-4 py-8 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Link href="/manual" className="text-slate-600 hover:text-slate-400 text-sm transition-colors">
                ← Infrastructure Guide
              </Link>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">취약 환경 구성</h1>
            <p className="text-slate-500 mt-1 text-sm">
              CloudFront 없음 · WAF 없음 · 공개 S3 · 직접 노출 EC2 — 보호 계층 없이 외부 요청이 바로 도달하는 환경
            </p>
          </div>
          <span className="flex-shrink-0 rounded border border-red-200 bg-red-50 px-3 py-1 text-xs font-mono uppercase tracking-widest text-red-700">
            Vulnerable
          </span>
        </div>

        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'WAF', value: '없음' },
              { label: 'S3 Public Access', value: 'OFF (개방)' },
              { label: 'Security Group', value: '0.0.0.0/0' },
              { label: 'CloudFront', value: '없음' },
            ].map((item) => (
              <div key={item.label}>
                <div className="text-slate-500 text-xs mb-0.5">{item.label}</div>
                <div className="font-mono text-xs font-semibold text-red-400">{item.value}</div>
              </div>
            ))}
          </div>
        </div>

        <MethodToggle />

        <StepCard
          step={1}
          title="VPC 설정"
          cliNote="AWS_REGION, AWS_AZ, CIDR 대역과 리소스 이름은 사용자 환경에 맞게 변경하고, 기존 네트워크와 CIDR이 겹치지 않는지 확인하세요."
          warning="취약 환경은 public subnet 중심으로 외부 접근이 직접 가능하도록 구성하므로 운영 환경에는 적합하지 않습니다."
        >
          <CliContent>
            <CodeBlock code={`AWS_REGION=ap-northeast-2
AWS_AZ=ap-northeast-2a

VPC_ID=$(aws ec2 create-vpc \\
  --region $AWS_REGION \\
  --cidr-block 10.3.0.0/16 \\
  --tag-specifications "ResourceType=vpc,Tags=[{Key=Name,Value=vul-vpc}]" \\
  --query 'Vpc.VpcId' \\
  --output text)

PUBLIC_SUBNET_ID=$(aws ec2 create-subnet \\
  --region $AWS_REGION \\
  --vpc-id $VPC_ID \\
  --cidr-block 10.3.1.0/24 \\
  --availability-zone $AWS_AZ \\
  --tag-specifications "ResourceType=subnet,Tags=[{Key=Name,Value=vul-subnet-public}]" \\
  --query 'Subnet.SubnetId' \\
  --output text)

aws ec2 modify-subnet-attribute \\
  --region $AWS_REGION \\
  --subnet-id $PUBLIC_SUBNET_ID \\
  --map-public-ip-on-launch

PRIVATE_SUBNET_ID=$(aws ec2 create-subnet \\
  --region $AWS_REGION \\
  --vpc-id $VPC_ID \\
  --cidr-block 10.3.101.0/24 \\
  --availability-zone $AWS_AZ \\
  --tag-specifications "ResourceType=subnet,Tags=[{Key=Name,Value=vul-subnet-private}]" \\
  --query 'Subnet.SubnetId' \\
  --output text)

IGW_ID=$(aws ec2 create-internet-gateway \\
  --region $AWS_REGION \\
  --tag-specifications "ResourceType=internet-gateway,Tags=[{Key=Name,Value=vul-igw}]" \\
  --query 'InternetGateway.InternetGatewayId' \\
  --output text)

aws ec2 attach-internet-gateway \\
  --region $AWS_REGION \\
  --internet-gateway-id $IGW_ID \\
  --vpc-id $VPC_ID

PUBLIC_RT_ID=$(aws ec2 create-route-table \\
  --region $AWS_REGION \\
  --vpc-id $VPC_ID \\
  --tag-specifications "ResourceType=route-table,Tags=[{Key=Name,Value=vul-rt-public}]" \\
  --query 'RouteTable.RouteTableId' \\
  --output text)

aws ec2 create-route \\
  --region $AWS_REGION \\
  --route-table-id $PUBLIC_RT_ID \\
  --destination-cidr-block 0.0.0.0/0 \\
  --gateway-id $IGW_ID

aws ec2 associate-route-table \\
  --region $AWS_REGION \\
  --route-table-id $PUBLIC_RT_ID \\
  --subnet-id $PUBLIC_SUBNET_ID`} />
          </CliContent>
          <ConsoleContent>
            <ol className="space-y-2 text-sm text-slate-400 list-decimal list-inside">
              <li>AWS Console 접속 후 <code className="font-mono text-slate-300">VPC</code> → <span className="text-slate-200">Your VPCs</span>에서 <span className="text-slate-200">Create VPC</span>를 클릭합니다.</li>
              <li><span className="text-slate-200">VPC only</span>를 선택하고 이름은 <code className="font-mono text-slate-300">vul-vpc</code>, CIDR은 <code className="font-mono text-slate-300">10.3.0.0/16</code>으로 생성합니다.</li>
              <li><code className="font-mono text-slate-300">Subnets</code>에서 <code className="font-mono text-slate-300">vul-subnet-public</code>, <code className="font-mono text-slate-300">vul-subnet-private</code> 두 개를 생성합니다.</li>
              <li>Public subnet은 <span className="text-slate-200">Auto-assign public IPv4</span>를 활성화합니다.</li>
              <li><code className="font-mono text-slate-300">Internet Gateways</code>에서 <code className="font-mono text-slate-300">vul-igw</code>를 생성하고 <code className="font-mono text-slate-300">vul-vpc</code>에 연결합니다.</li>
              <li><code className="font-mono text-slate-300">Route Tables</code>에서 <code className="font-mono text-slate-300">vul-rt-public</code>을 만들고 <code className="font-mono text-slate-300">0.0.0.0/0 → vul-igw</code> 경로를 추가한 뒤 public subnet에 연결합니다.</li>
            </ol>
          </ConsoleContent>
        </StepCard>

        <StepCard
          step={2}
          title="IAM 설정"
          cliNote="trust-policy-ec2.json 파일이 먼저 준비되어 있어야 하며, 역할 이름이 이미 존재하면 다른 이름으로 조정하세요."
          warning="AmazonS3FullAccess처럼 리소스 범위를 제한하지 않은 권한은 계정 내 다른 버킷까지 영향을 줄 수 있으므로 운영 환경에는 적합하지 않습니다."
        >
          <CliContent>
            <CodeBlock code={`aws iam create-role \\
  --role-name vul-ec2-role \\
  --assume-role-policy-document file://trust-policy-ec2.json

aws iam attach-role-policy \\
  --role-name vul-ec2-role \\
  --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore

aws iam attach-role-policy \\
  --role-name vul-ec2-role \\
  --policy-arn arn:aws:iam::aws:policy/AmazonS3FullAccess`} />
          </CliContent>
          <ConsoleContent>
            <ol className="space-y-2 text-sm text-slate-400 list-decimal list-inside">
              <li>AWS Console 접속 후 <code className="font-mono text-slate-300">IAM</code> → <span className="text-slate-200">Roles</span>로 이동합니다.</li>
              <li><span className="text-slate-200">Create role</span>에서 <span className="text-slate-200">AWS service</span>와 <span className="text-slate-200">EC2</span>를 선택합니다.</li>
              <li><code className="font-mono text-slate-300">AmazonSSMManagedInstanceCore</code>와 <code className="font-mono text-slate-300">AmazonS3FullAccess</code> 정책을 연결합니다.</li>
              <li>역할 이름을 <code className="font-mono text-slate-300">vul-ec2-role</code>로 지정하고 생성합니다.</li>
            </ol>
          </ConsoleContent>
        </StepCard>

        <StepCard
          step={3}
          title="보안 그룹 설정"
          cliNote="VPC_ID는 앞 단계에서 생성한 값과 일치해야 하며, 보안 그룹 이름은 필요하면 사용자 환경에 맞게 변경할 수 있습니다."
          warning="SSH와 애플리케이션 포트를 0.0.0.0/0으로 개방하는 것은 의도적인 취약 설정입니다. 공격 실습용 환경에서만 사용해야 합니다."
        >
          <CliContent>
            <CodeBlock code={`VUL_SG_ID=$(aws ec2 create-security-group \\
  --group-name vul-sg-public \\
  --description "security group for vulnerable public instance" \\
  --vpc-id $VPC_ID \\
  --region $AWS_REGION \\
  --query 'GroupId' \\
  --output text)

aws ec2 authorize-security-group-ingress \\
  --group-id $VUL_SG_ID \\
  --protocol tcp \\
  --port 22 \\
  --cidr 0.0.0.0/0 \\
  --region $AWS_REGION

aws ec2 authorize-security-group-ingress \\
  --group-id $VUL_SG_ID \\
  --protocol tcp \\
  --port 3000 \\
  --cidr 0.0.0.0/0 \\
  --region $AWS_REGION`} />
          </CliContent>
          <ConsoleContent>
            <ol className="space-y-2 text-sm text-slate-400 list-decimal list-inside">
              <li>AWS Console 접속 후 <code className="font-mono text-slate-300">EC2</code> → <span className="text-slate-200">Security Groups</span>로 이동합니다.</li>
              <li><span className="text-slate-200">Create security group</span>을 클릭하고 이름은 <code className="font-mono text-slate-300">vul-sg-public</code>, VPC는 <code className="font-mono text-slate-300">vul-vpc</code>로 설정합니다.</li>
              <li>인바운드 규칙에 <code className="font-mono text-slate-300">SSH / 22 / 0.0.0.0/0</code>을 추가합니다.</li>
              <li>인바운드 규칙에 <code className="font-mono text-slate-300">Custom TCP / 3000 / 0.0.0.0/0</code>을 추가합니다.</li>
            </ol>
          </ConsoleContent>
        </StepCard>

        <StepCard
          step={4}
          title="S3 설정"
          cliNote="버킷 이름은 전역 고유해야 하므로 이미 사용 중이면 다른 이름으로 바꾸고, 이후 동일한 이름을 계속 사용하세요."
          warning='Block Public Access를 해제하고 Principal "*"로 s3:GetObject를 허용하면 누구나 프론트엔드 객체를 직접 읽을 수 있으므로 의도적인 취약 설정입니다.'
        >
          <CliContent>
            <CodeBlock code={`aws s3api create-bucket \\
  --bucket sentinel-share-vul-frontend \\
  --region $AWS_REGION \\
  --create-bucket-configuration LocationConstraint=$AWS_REGION

aws s3api delete-public-access-block \\
  --bucket sentinel-share-vul-frontend

aws s3api put-bucket-policy \\
  --bucket sentinel-share-vul-frontend \\
  --policy '{
    "Version":"2012-10-17",
    "Statement":[
      {
        "Sid":"PublicReadGetObject",
        "Effect":"Allow",
        "Principal":"*",
        "Action":"s3:GetObject",
        "Resource":"arn:aws:s3:::sentinel-share-vul-frontend/*"
      }
    ]
  }'`} />
          </CliContent>
          <ConsoleContent>
            <ol className="space-y-2 text-sm text-slate-400 list-decimal list-inside">
              <li>AWS Console 접속 후 <code className="font-mono text-slate-300">S3</code> → <span className="text-slate-200">Create bucket</span>을 선택합니다.</li>
              <li>버킷 이름은 <code className="font-mono text-slate-300">sentinel-share-vul-frontend</code>, 리전은 <code className="font-mono text-slate-300">ap-northeast-2</code>로 생성합니다.</li>
              <li><span className="text-slate-200">Block Public Access</span>를 해제합니다.</li>
              <li>버킷 생성 후 <span className="text-slate-200">권한</span> 탭에서 공개 읽기 버킷 정책을 추가합니다.</li>
              <li><code className="font-mono text-slate-300">arn:aws:s3:::sentinel-share-vul-frontend/*</code>에 대해 <code className="font-mono text-slate-300">Principal: *</code>, <code className="font-mono text-slate-300">s3:GetObject</code>를 허용합니다.</li>
            </ol>
          </ConsoleContent>
        </StepCard>

        <StepCard
          step={5}
          title="EC2 인스턴스 생성"
          cliNote="<UBUNTU_AMI_ID>는 리전에 맞는 실제 Ubuntu AMI ID로 바꾸고, subnet ID와 security group ID도 앞 단계 값과 일치시켜야 합니다."
          warning="퍼블릭 IP가 붙은 EC2를 public subnet에 직접 노출하므로 외부 스캔과 직접 접근에 취약합니다."
        >
          <CliContent>
            <CodeBlock code={`aws ec2 run-instances \\
  --image-id <UBUNTU_AMI_ID> \\
  --instance-type t3.small \\
  --subnet-id $PUBLIC_SUBNET_ID \\
  --security-group-ids $VUL_SG_ID \\
  --iam-instance-profile Name=vul-ec2-role \\
  --associate-public-ip-address \\
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=vul-ec2}]" \\
  --region $AWS_REGION`} />
          </CliContent>
          <ConsoleContent>
            <ol className="space-y-2 text-sm text-slate-400 list-decimal list-inside">
              <li>AWS Console 접속 후 <code className="font-mono text-slate-300">EC2</code> → <span className="text-slate-200">Instances</span>로 이동합니다.</li>
              <li><span className="text-slate-200">Launch instances</span>를 클릭합니다.</li>
              <li>Name은 <code className="font-mono text-slate-300">vul-ec2</code>, AMI는 <span className="text-slate-200">Ubuntu Server</span>, instance type은 <code className="font-mono text-slate-300">t3.small</code>을 선택합니다.</li>
              <li>VPC는 <code className="font-mono text-slate-300">vul-vpc</code>, Subnet은 <code className="font-mono text-slate-300">vul-subnet-public</code>, Public IP는 <span className="text-slate-200">Enable</span>로 설정합니다.</li>
              <li>Security Group은 <code className="font-mono text-slate-300">vul-sg-public</code>, IAM role은 <code className="font-mono text-slate-300">vul-ec2-role</code>을 연결합니다.</li>
            </ol>
          </ConsoleContent>
        </StepCard>

        <StepCard
          step={6}
          title="DB 설정"
          cliNote="DB 사용자명, DB 이름, 비밀번호는 사용자 환경에 맞게 변경하고, 이후 백엔드 .env 값과 동일하게 맞추세요."
          warning="애플리케이션 서버와 DB가 한 인스턴스에 함께 존재하므로 분리 수준이 낮고, 예시 비밀번호는 반드시 실습용으로만 사용해야 합니다."
        >
          <CliContent>
            <CodeBlock code={`sudo apt update
sudo apt install -y postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql

sudo -u postgres psql <<EOF
CREATE USER sentinelshare WITH PASSWORD 'vulpassword';
CREATE DATABASE sentinelshare OWNER sentinelshare;
\\q
EOF

sudo -u postgres psql -c "\\l"`} />
          </CliContent>
          <ConsoleContent>
            <ol className="space-y-2 text-sm text-slate-400 list-decimal list-inside">
              <li>AWS Console 접속 후 <code className="font-mono text-slate-300">EC2</code>에서 <code className="font-mono text-slate-300">vul-ec2</code>에 접속합니다.</li>
              <li>Ubuntu 터미널에서 PostgreSQL 패키지를 설치하고 서비스를 시작합니다.</li>
              <li><code className="font-mono text-slate-300">postgres</code> 사용자로 접속해 <code className="font-mono text-slate-300">sentinelshare</code> 사용자와 데이터베이스를 생성합니다.</li>
              <li><code className="font-mono text-slate-300">psql -c &quot;\\l&quot;</code>로 생성 결과를 확인합니다.</li>
            </ol>
          </ConsoleContent>
        </StepCard>

        <StepCard
          step={7}
          title="백엔드 배포 및 실행"
          cliNote=".env 안의 JWT_SECRET, DB 접속 정보, AWS_REGION, S3_BUCKET_NAME, CORS_ORIGIN은 실제 환경 값으로 변경해야 합니다."
          warning="퍼블릭 EC2에서 백엔드가 직접 실행되고 3000 포트가 외부에 공개되며, CloudFront나 WAF 같은 앞단 보호 계층 없이 요청이 바로 도달합니다."
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
JWT_SECRET=vulsecret
JWT_EXPIRES_IN=1h
DB_HOST=localhost
DB_PORT=5432
DB_NAME=sentinelshare
DB_USER=sentinelshare
DB_PASSWORD=vulpassword
AWS_REGION=ap-northeast-2
S3_BUCKET_NAME=vul-s3-team2
PRESIGNED_URL_TTL=300
MAX_FILE_SIZE_MB=100
ALLOWED_MIME_TYPES=image/jpeg,image/png,image/gif,image/webp,application/pdf,text/plain,application/zip,application/x-zip-compressed
CORS_ORIGIN=http://localhost:3000
EOF

npm run dev`} />
          </CliContent>
          <ConsoleContent>
            <ol className="space-y-2 text-sm text-slate-400 list-decimal list-inside">
              <li><code className="font-mono text-slate-300">vul-ec2</code>에 접속한 뒤 저장소를 clone하고 <code className="font-mono text-slate-300">sentinel-share-backend</code> 디렉터리로 이동합니다.</li>
              <li>Node.js, npm, git을 설치한 뒤 <code className="font-mono text-slate-300">npm install</code>을 실행합니다.</li>
              <li>프로젝트 루트에 <code className="font-mono text-slate-300">.env</code> 파일을 만들고 DB 접속 정보와 S3 버킷 이름을 입력합니다.</li>
              <li><code className="font-mono text-slate-300">npm run dev</code> 또는 <code className="font-mono text-slate-300">node src/app.js</code>로 백엔드를 실행합니다.</li>
            </ol>
          </ConsoleContent>
        </StepCard>

        <StepCard
          step={8}
          title="프론트엔드 정적 배포"
          cliNote="<VUL_EC2_PUBLIC_IP>는 실제 취약 환경 EC2 퍼블릭 IP로 바꿔야 하며, S3 sync 대상 버킷 이름도 실제 버킷과 일치해야 합니다."
          warning="취약 환경 프론트엔드는 CloudFront 없이 S3에서 직접 서빙되므로 버킷 공개 설정이 곧 사용자 접근 경로가 됩니다."
        >
          <CliContent>
            <CodeBlock code={`cd Sentinel_Share/sentinel-share-frontend

cat > .env.local <<'EOF'
NEXT_PUBLIC_API_URL=http://<VUL_EC2_PUBLIC_IP>:3000
EOF

npm install
npm run build

aws s3 sync out/ s3://sentinel-share-vul-frontend --delete`} />
          </CliContent>
          <ConsoleContent>
            <ol className="space-y-2 text-sm text-slate-400 list-decimal list-inside">
              <li>로컬 PC에서 <code className="font-mono text-slate-300">sentinel-share-frontend</code> 디렉터리로 이동합니다.</li>
              <li><code className="font-mono text-slate-300">.env.local</code> 파일에 <code className="font-mono text-slate-300">NEXT_PUBLIC_API_URL=http://&lt;VUL_EC2_PUBLIC_IP&gt;:3000</code>을 입력합니다.</li>
              <li><code className="font-mono text-slate-300">npm install</code> 후 <code className="font-mono text-slate-300">npm run build</code>를 실행합니다.</li>
              <li>생성된 정적 결과물을 <code className="font-mono text-slate-300">sentinel-share-vul-frontend</code> 버킷에 업로드합니다.</li>
              <li>버킷 안에 <code className="font-mono text-slate-300">index.html</code>, <code className="font-mono text-slate-300">login/</code>, <code className="font-mono text-slate-300">signup/</code>, <code className="font-mono text-slate-300">dashboard/</code>, <code className="font-mono text-slate-300">shared/</code>, <code className="font-mono text-slate-300">__next/</code>가 존재하는지 확인합니다.</li>
            </ol>
          </ConsoleContent>
        </StepCard>

        <StepCard
          step={9}
          title="GitHub Actions 배포 설정"
          cliNote="워크플로 파일 경로와 Job 이름이 현재 저장소 구성과 일치하는지 확인하고, 필요하면 저장소의 실제 워크플로 이름 기준으로 확인하세요."
          warning="취약 환경 프론트엔드가 S3 Direct로 배포되면 성공 즉시 공개 버킷 변경 사항이 사용자에게 직접 노출될 수 있습니다."
        >
          <CliContent>
            <CodeBlock code={`# 확인 파일
.github/workflows/deploy-frontend.yml

# 확인 포인트
Deploy Frontend to S3
Build & Deploy → Vulnerable (S3 Direct)`} />
          </CliContent>
          <ConsoleContent>
            <ol className="space-y-2 text-sm text-slate-400 list-decimal list-inside">
              <li>GitHub 저장소 접속 후 <span className="text-slate-200">Actions</span> 탭으로 이동합니다.</li>
              <li><code className="font-mono text-slate-300">Deploy Frontend to S3</code> 워크플로를 선택합니다.</li>
              <li>가장 최근 실행을 열고 <code className="font-mono text-slate-300">Build & Deploy → Vulnerable (S3 Direct)</code> job이 성공했는지 확인합니다.</li>
              <li>필요하면 저장소의 <code className="font-mono text-slate-300">.github/workflows/deploy-frontend.yml</code> 파일에서 취약 환경 배포 구성을 다시 확인합니다.</li>
            </ol>
          </ConsoleContent>
        </StepCard>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
          <h3 className="text-slate-900 font-semibold mb-2">다음 단계</h3>
          <p className="text-slate-500 text-sm mb-4">
            취약 환경 구성이 완료되었습니다. 이제 보안 환경을 구성하고 Attack Simulator에서 두 환경을 비교해보세요.
          </p>
          <div className="flex gap-3">
            <Link
              href="/manual/secure"
              className="px-4 py-2 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-sm font-medium transition-colors hover:bg-emerald-100"
            >
              보안 환경 구성 →
            </Link>
            <Link
              href="/manual/attack/bruteforce"
              className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm transition-colors hover:border-slate-300 hover:text-slate-900"
            >
              Attack Simulator로 이동
            </Link>
          </div>
        </div>
      </div>
    </MethodProvider>
  );
}
