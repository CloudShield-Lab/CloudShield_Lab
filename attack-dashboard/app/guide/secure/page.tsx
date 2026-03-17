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
        <StepCard
          step={1}
          title="VPC 설정"
          note="AWS_REGION, AWS_AZ, CIDR 대역, main/vul VPC ID와 Route Table ID는 사용자 환경 값으로 바꿔야 하며, 기존 네트워크와 CIDR이 겹치지 않는지 먼저 확인하세요."
        >
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
              <li>AWS Console 접속 후 <code className="font-mono text-slate-300">VPC</code> 서비스로 이동합니다.</li>
              <li><span className="text-slate-200">Your VPCs</span>에서 <span className="text-slate-200">Create VPC</span>를 클릭하고 생성 유형은 <span className="text-slate-200">VPC only</span>를 선택합니다.</li>
              <li><code className="font-mono text-slate-300">secure-vpc</code>, <code className="font-mono text-slate-300">10.2.0.0/16</code>을 입력해 VPC를 생성합니다.</li>
              <li><span className="text-slate-200">Subnets</span>에서 <code className="font-mono text-slate-300">secure-subnet-public</code>와 <code className="font-mono text-slate-300">secure-subnet-private</code>를 각각 생성합니다.</li>
              <li><span className="text-slate-200">Internet Gateways</span>에서 <code className="font-mono text-slate-300">secure-igw</code>를 만들고 <code className="font-mono text-slate-300">secure-vpc</code>에 연결합니다.</li>
              <li><span className="text-slate-200">NAT Gateways</span>에서 <code className="font-mono text-slate-300">secure-nat</code>를 public subnet에 생성합니다.</li>
              <li><span className="text-slate-200">Route Tables</span>에서 <code className="font-mono text-slate-300">secure-rt-public</code>, <code className="font-mono text-slate-300">secure-rt-private</code>를 만들고 각각 IGW와 NAT를 기본 경로로 연결합니다.</li>
              <li><span className="text-slate-200">Peering connections</span>에서 <code className="font-mono text-slate-300">main-vpc</code>, <code className="font-mono text-slate-300">vul-vpc</code>와의 피어링을 생성하고 Route Table 경로를 추가합니다.</li>
            </ol>
          </ConsoleContent>
        </StepCard>

        {/* Step 2: S3 버킷 정책 */}
        <StepCard
          step={2}
          title="IAM 설정"
          note="trust-policy-ec2.json, secure-ec2-inline-policy.json 안의 YOUR_ACCOUNT_ID, S3 버킷 ARN, Secret ARN은 실제 값으로 바꿔야 합니다."
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
          <ConsoleContent>
            <ol className="space-y-2 text-sm text-slate-400 list-decimal list-inside">
              <li>AWS Console 접속 후 <code className="font-mono text-slate-300">IAM</code> 서비스로 이동합니다.</li>
              <li><span className="text-slate-200">Roles</span> → <span className="text-slate-200">Create role</span>을 클릭합니다.</li>
              <li>신뢰할 수 있는 엔터티 유형에서 <span className="text-slate-200">AWS service</span>, 사용 사례에서 <span className="text-slate-200">EC2</span>를 선택합니다.</li>
              <li><code className="font-mono text-slate-300">AmazonEC2ContainerRegistryReadOnly</code>, <code className="font-mono text-slate-300">AmazonSSMManagedInstanceCore</code>, <code className="font-mono text-slate-300">CloudWatchAgentServerPolicy</code>를 연결합니다.</li>
              <li>역할 이름을 <code className="font-mono text-slate-300">secure-ec2-role</code>로 입력하고 생성합니다.</li>
              <li>생성 후 역할 상세 화면에서 <span className="text-slate-200">권한 추가</span> → <span className="text-slate-200">인라인 정책 생성</span> → <span className="text-slate-200">JSON</span>으로 이동합니다.</li>
              <li>S3와 Secrets Manager 접근 정책을 붙여 넣고 정책 이름을 <code className="font-mono text-slate-300">secure-ec2-inline</code>으로 저장합니다.</li>
            </ol>
          </ConsoleContent>
        </StepCard>

        {/* Step 3: RDS */}
        <StepCard
          step={3}
          title="ECR 프라이빗 레포지토리 생성"
          note="리전, 저장소 이름, 로컬 이미지명은 사용자 환경에 맞게 조정하고, 출력된 ECR_URI를 그대로 docker tag/push에 사용하세요."
        >
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
--password-stdin \${ECR_URI%/*}

docker tag sentinel-api:latest \${ECR_URI}:latest
docker push \${ECR_URI}:latest`} />
          </CliContent>
          <ConsoleContent>
            <ol className="space-y-2 text-sm text-slate-400 list-decimal list-inside">
              <li>AWS Console 접속 후 <code className="font-mono text-slate-300">Amazon ECR</code> 서비스로 이동합니다.</li>
              <li><span className="text-slate-200">Repositories</span>에서 <span className="text-slate-200">Create repository</span>를 클릭합니다.</li>
              <li><span className="text-slate-200">Visibility settings</span>는 <span className="text-slate-200">Private</span>로 둡니다.</li>
              <li>Repository name에 <code className="font-mono text-slate-300">s3cure-api</code>를 입력합니다.</li>
              <li><span className="text-slate-200">Image tag mutability</span>는 <span className="text-slate-200">Mutable</span>, <span className="text-slate-200">Scan on push</span>는 <span className="text-slate-200">On</span>으로 설정합니다.</li>
              <li><span className="text-slate-200">Encryption</span>은 <span className="text-slate-200">AES-256</span>으로 두고 생성합니다.</li>
              <li>생성 후 Repository URI를 확인해 이후 배포나 이미지 push에 사용합니다.</li>
            </ol>
          </ConsoleContent>
        </StepCard>

        {/* Step 4: IAM 역할 */}
        <StepCard
          step={4}
          title="보안 그룹 설정"
          note="YOUR_PUBLIC_IP/32는 현재 작업 중인 공인 IP로 바꿔야 하며, 0.0.0.0/0 전체 공개는 피하는 것이 좋습니다."
        >
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
          <ConsoleContent>
            <ol className="space-y-2 text-sm text-slate-400 list-decimal list-inside">
              <li>AWS Console 접속 후 <code className="font-mono text-slate-300">EC2</code> → <span className="text-slate-200">Security Groups</span>로 이동합니다.</li>
              <li><span className="text-slate-200">Create security group</span>을 클릭하고 <code className="font-mono text-slate-300">secure-ec2-sg</code>를 생성합니다.</li>
              <li>VPC는 <code className="font-mono text-slate-300">secure-vpc</code>를 선택합니다.</li>
              <li>인바운드 규칙으로 <span className="text-slate-200">SSH 22</span>를 <span className="text-slate-200">내 IP/32</span>로 추가합니다.</li>
              <li>인바운드 규칙으로 <span className="text-slate-200">Custom TCP 3000</span>을 <span className="text-slate-200">내 IP/32</span>로 추가합니다.</li>
              <li>필요하면 같은 방식으로 <code className="font-mono text-slate-300">secure-bastion-sg</code>를 생성합니다.</li>
              <li>생성한 보안 그룹을 이후 <code className="font-mono text-slate-300">secure-ec2</code> 인스턴스에 연결합니다.</li>
            </ol>
          </ConsoleContent>
        </StepCard>

        {/* Step 5: Secrets Manager */}
        <StepCard
          step={5}
          title="S3 설정"
          note="버킷 이름은 전역 고유해야 하므로 이미 사용 중이면 다른 이름으로 바꾸고, 실제 생성된 이름을 이후 IAM 정책과 앱 설정에 동일하게 사용하세요."
        >
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
          <ConsoleContent>
            <ol className="space-y-2 text-sm text-slate-400 list-decimal list-inside">
              <li>AWS Console 접속 후 <code className="font-mono text-slate-300">Amazon S3</code>로 이동합니다.</li>
              <li><span className="text-slate-200">Create bucket</span>을 클릭합니다.</li>
              <li>Bucket name에 <code className="font-mono text-slate-300">secure-log</code>, Region에 <code className="font-mono text-slate-300">ap-northeast-2</code>를 입력합니다.</li>
              <li><span className="text-slate-200">Block Public Access</span>는 켠 상태를 유지합니다.</li>
              <li><span className="text-slate-200">Bucket Versioning</span>은 필요 시 선택합니다.</li>
              <li><span className="text-slate-200">Default encryption</span>은 <span className="text-slate-200">SSE-S3</span> 또는 <span className="text-slate-200">SSE-KMS</span>로 설정합니다.</li>
              <li><span className="text-slate-200">Create bucket</span>을 눌러 생성합니다.</li>
            </ol>
          </ConsoleContent>
        </StepCard>

        {/* Step 6: ECS 클러스터 + Security Group */}
        <StepCard
          step={6}
          title="GitHub Actions / OIDC 설정"
          note="github-oidc-trust.json과 cloudshield-policy.json 안의 AWS 계정 ID, 저장소명, ARN, 버킷/테이블 이름은 실제 사용자 환경 값으로 바꿔야 합니다."
        >
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
          <ConsoleContent>
            <ol className="space-y-2 text-sm text-slate-400 list-decimal list-inside">
              <li>AWS Console 접속 후 <code className="font-mono text-slate-300">IAM</code> → <span className="text-slate-200">Identity providers</span>로 이동합니다.</li>
              <li><span className="text-slate-200">Add provider</span>를 클릭하고 <span className="text-slate-200">OpenID Connect</span>를 선택합니다.</li>
              <li>Provider URL에 <code className="font-mono text-slate-300">https://token.actions.githubusercontent.com</code>, Audience에 <code className="font-mono text-slate-300">sts.amazonaws.com</code>을 입력합니다.</li>
              <li><span className="text-slate-200">Roles</span> → <span className="text-slate-200">Create role</span>에서 <span className="text-slate-200">Web identity</span>를 선택합니다.</li>
              <li>GitHub organization과 repository를 <code className="font-mono text-slate-300">CloudShield-Lab</code>, <code className="font-mono text-slate-300">CloudShield_Lab</code>로 지정합니다.</li>
              <li>역할 이름을 <code className="font-mono text-slate-300">CloudShield-Role</code>로 생성하고 Trust relationship을 확인합니다.</li>
              <li><span className="text-slate-200">Policies</span>에서 <code className="font-mono text-slate-300">CloudShield-Policy</code>를 만들고 역할에 연결합니다.</li>
              <li>GitHub 저장소의 <span className="text-slate-200">Settings → Secrets and variables → Actions</span>에 <code className="font-mono text-slate-300">AWS_ACCOUNT_ID</code>, <code className="font-mono text-slate-300">AWS_REGION</code>, <code className="font-mono text-slate-300">AWS_ROLE_ARN</code>을 등록합니다.</li>
            </ol>
          </ConsoleContent>
        </StepCard>

        {/* Step 7: WAF Web ACL */}
        <StepCard
          step={7}
          title="CloudWatch Log Group 생성"
          note="로그 그룹 이름과 보존 기간은 운영 정책에 맞게 조정할 수 있으며, AWS_REGION은 실제 로그를 저장할 리전과 일치해야 합니다."
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
          <ConsoleContent>
            <ol className="space-y-2 text-sm text-slate-400 list-decimal list-inside">
              <li>AWS Console 접속 후 <code className="font-mono text-slate-300">CloudWatch</code> 서비스로 이동합니다.</li>
              <li><span className="text-slate-200">Log groups</span>를 선택합니다.</li>
              <li><span className="text-slate-200">Create log group</span>을 클릭합니다.</li>
              <li>Log group name에 <code className="font-mono text-slate-300">/ec2/secure-backend</code>를 입력합니다.</li>
              <li>생성 후 필요하면 <span className="text-slate-200">Retention</span>을 <span className="text-slate-200">30 days</span>로 설정합니다.</li>
            </ol>
          </ConsoleContent>
        </StepCard>

        {/* Step 8: ECS 태스크 정의 + 서비스 */}
        <StepCard
          step={8}
          title="EC2 인스턴스 생성"
          note="<UBUNTU_AMI_ID>와 보안 그룹 ID는 실제 값으로 바꿔야 하며, subnet, instance type, 태그는 사용자 환경에 맞게 조정할 수 있습니다."
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
          <ConsoleContent>
            <ol className="space-y-2 text-sm text-slate-400 list-decimal list-inside">
              <li>AWS Console 접속 후 <code className="font-mono text-slate-300">EC2</code> → <span className="text-slate-200">Instances</span>로 이동합니다.</li>
              <li><span className="text-slate-200">Launch instances</span>를 클릭합니다.</li>
              <li>Name에 <code className="font-mono text-slate-300">secure-ec2</code>, AMI는 <span className="text-slate-200">Ubuntu Server</span>, instance type은 <code className="font-mono text-slate-300">t3.small</code>을 선택합니다.</li>
              <li>VPC는 <code className="font-mono text-slate-300">secure-vpc</code>, Subnet은 <code className="font-mono text-slate-300">secure-subnet-public</code>을 선택합니다.</li>
              <li><span className="text-slate-200">Auto-assign public IP</span>는 <span className="text-slate-200">Enable</span>로 설정합니다.</li>
              <li>Security Group은 <code className="font-mono text-slate-300">secure-ec2-sg</code>, IAM instance profile은 <code className="font-mono text-slate-300">secure-ec2-role</code>을 연결합니다.</li>
              <li>생성 후 퍼블릭 IP를 확인하고 SSH 또는 Connect 기능으로 접속합니다.</li>
            </ol>
          </ConsoleContent>
        </StepCard>

        {/* Step 9: CloudFront 배포 */}
        <StepCard
          step={9}
          title="DB 설정"
          note="DB 사용자명, DB 이름, 비밀번호는 사용자 환경에 맞게 변경하고, 이후 백엔드 .env의 DB_* 값과 반드시 동일하게 맞춰야 합니다."
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
          <ConsoleContent>
            <ol className="space-y-2 text-sm text-slate-400 list-decimal list-inside">
              <li>AWS Console 접속 후 <code className="font-mono text-slate-300">EC2</code> → <span className="text-slate-200">Instances</span>로 이동합니다.</li>
              <li><code className="font-mono text-slate-300">secure-ec2</code>를 선택하고 <span className="text-slate-200">Connect</span> 또는 SSH로 접속합니다.</li>
              <li>Ubuntu 터미널에서 PostgreSQL을 설치하고 서비스를 시작합니다.</li>
              <li><code className="font-mono text-slate-300">postgres</code> 사용자로 접속해 <code className="font-mono text-slate-300">sentinelshare</code> 사용자와 데이터베이스를 생성합니다.</li>
              <li><code className="font-mono text-slate-300">psql -c &quot;\\l&quot;</code>로 생성 결과를 확인합니다.</li>
            </ol>
          </ConsoleContent>
        </StepCard>

        {/* Step 10: Security Group CloudFront IP 제한 */}
        <StepCard
          step={10}
          title="백엔드 배포 및 실행"
          note=".env 안의 JWT_SECRET, DB 접속 정보, AWS_REGION, S3_BUCKET_NAME, CORS_ORIGIN은 실제 환경 값으로 변경해야 하며, S3_BUCKET_NAME은 생성한 버킷 이름과 일치해야 합니다."
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
          <ConsoleContent>
            <ol className="space-y-2 text-sm text-slate-400 list-decimal list-inside">
              <li><code className="font-mono text-slate-300">secure-ec2</code>에 접속한 뒤 저장소를 clone하고 <code className="font-mono text-slate-300">sentinel-share-backend</code> 디렉터리로 이동합니다.</li>
              <li>Node.js, npm, git을 설치하고 <code className="font-mono text-slate-300">npm install</code>을 실행합니다.</li>
              <li>프로젝트 루트에 <code className="font-mono text-slate-300">.env</code> 파일을 작성합니다.</li>
              <li><code className="font-mono text-slate-300">DB_HOST</code>, <code className="font-mono text-slate-300">DB_PORT</code>, <code className="font-mono text-slate-300">DB_NAME</code>, <code className="font-mono text-slate-300">DB_USER</code>, <code className="font-mono text-slate-300">DB_PASSWORD</code>를 로컬 PostgreSQL 값으로 채웁니다.</li>
              <li><code className="font-mono text-slate-300">AWS_REGION</code>, <code className="font-mono text-slate-300">S3_BUCKET_NAME</code>, <code className="font-mono text-slate-300">CORS_ORIGIN</code>도 함께 설정합니다.</li>
              <li><code className="font-mono text-slate-300">npm run dev</code> 또는 <code className="font-mono text-slate-300">node src/app.js</code>로 서버를 실행합니다.</li>
            </ol>
          </ConsoleContent>
        </StepCard>

        {/* Step 11: DB 마이그레이션 */}
        <StepCard
          step={11}
          title="프론트엔드 연결 및 접속 테스트"
          note="<EC2_PUBLIC_IP>는 실제 EC2 퍼블릭 IP 또는 사용 중인 도메인으로 바꿔야 하며, NEXT_PUBLIC_API_URL과 백엔드 CORS_ORIGIN이 서로 호환되도록 함께 확인하세요."
        >
          <CliContent>
            <CodeBlock code={`cd Sentinel_Share/sentinel-share-frontend

cat > .env.local <<'EOF'
NEXT_PUBLIC_API_URL=http://<EC2_PUBLIC_IP>:3000
EOF

npm install
npm run dev

curl http://<EC2_PUBLIC_IP>:3000/health`} />
          </CliContent>
          <ConsoleContent>
            <ol className="space-y-2 text-sm text-slate-400 list-decimal list-inside">
              <li>로컬 PC에서 <code className="font-mono text-slate-300">sentinel-share-frontend</code> 디렉터리로 이동합니다.</li>
              <li><code className="font-mono text-slate-300">.env.local</code> 파일을 만들고 <code className="font-mono text-slate-300">NEXT_PUBLIC_API_URL=http://&lt;EC2_PUBLIC_IP&gt;:3000</code> 값을 입력합니다.</li>
              <li><code className="font-mono text-slate-300">npm install</code> 후 <code className="font-mono text-slate-300">npm run dev</code>로 프론트를 실행합니다.</li>
              <li>브라우저에서 <code className="font-mono text-slate-300">http://localhost:3000</code>에 접속합니다.</li>
              <li><code className="font-mono text-slate-300">curl http://&lt;EC2_PUBLIC_IP&gt;:3000/health</code>로 백엔드 응답을 확인합니다.</li>
              <li>회원가입, 로그인, 파일 업로드, 다운로드가 정상 동작하는지 확인합니다.</li>
              <li>문제가 있으면 백엔드의 <code className="font-mono text-slate-300">CORS_ORIGIN</code>과 보안 그룹 3000 포트를 다시 확인합니다.</li>
            </ol>
          </ConsoleContent>
        </StepCard>

        {/* Step 12: Secrets Manager CORS 업데이트 + 대시보드 연결 */}
        <StepCard
          step={12}
          title="Secrets Manager 설정"
          note="Secret 이름, AWS_ACCOUNT_ID, Secret ARN, Role 이름은 실제 사용자 환경 값으로 맞춰야 하며, 현재 EC2 기반 구조라면 ECS용 역할명 대신 실제 EC2 역할명을 사용하세요."
        >
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
          <ConsoleContent>
            <ol className="space-y-2 text-sm text-slate-400 list-decimal list-inside">
              <li>AWS Console 접속 후 <code className="font-mono text-slate-300">Secrets Manager</code> 서비스로 이동합니다.</li>
              <li><span className="text-slate-200">Store a new secret</span>를 클릭하고 <span className="text-slate-200">Other type of secret</span>을 선택합니다.</li>
              <li>Key는 <code className="font-mono text-slate-300">password</code>, Value는 DB 비밀번호로 입력하고 Secret name은 <code className="font-mono text-slate-300">secure-db-password</code>로 저장합니다.</li>
              <li>같은 방식으로 JWT secret을 <code className="font-mono text-slate-300">secure-jwt-secret</code> 이름으로 생성합니다.</li>
              <li><code className="font-mono text-slate-300">IAM</code> → <span className="text-slate-200">Roles</span>에서 해당 역할을 열고 <span className="text-slate-200">Add permissions</span> → <span className="text-slate-200">Create inline policy</span>를 선택합니다.</li>
              <li><code className="font-mono text-slate-300">GetSecretValue</code> 권한을 허용하고 <code className="font-mono text-slate-300">secure-db-password</code>, <code className="font-mono text-slate-300">secure-jwt-secret</code>만 접근 가능하도록 제한합니다.</li>
            </ol>
          </ConsoleContent>
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
