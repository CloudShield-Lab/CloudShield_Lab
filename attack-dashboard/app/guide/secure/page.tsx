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
            <CodeBlock code={`# 버킷 생성
aws s3api create-bucket \\
  --bucket your-secure-bucket-name \\
  --region ap-northeast-2 \\
  --create-bucket-configuration LocationConstraint=ap-northeast-2

# Block Public Access 전체 활성화
aws s3api put-public-access-block \\
  --bucket your-secure-bucket-name \\
  --public-access-block-configuration \\
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"`} />
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
            <CodeBlock code={`# 버킷 정책 적용 (HTTPS 강제 + Task Role만 허용)
aws s3api put-bucket-policy \\
  --bucket your-secure-bucket-name \\
  --policy file://sentinel-share-backend/infra/s3-bucket-policy.json`} />
            <p className="text-slate-500 text-sm">
              버킷 정책 내용은 HTTPS 접근만 허용하고, 업로드 prefix(<code className="font-mono text-slate-400">uploads/*</code>)에 대해 ECS Task Role ARN만 허용합니다.
            </p>
          </CliContent>
          <ConsoleContent />
        </StepCard>

        {/* Step 3: RDS */}
        <StepCard step={3} title="ECR 프라이빗 레포지토리 생성">
          <CliContent>
            <p className="text-slate-500 text-sm mb-3">취약 환경과 동일한 방식으로 생성합니다. 별도 서브넷 그룹과 인스턴스를 사용하세요.</p>
            <CodeBlock code={`aws rds create-db-subnet-group \\
  --db-subnet-group-name sentinelshare-secure-subnet \\
  --db-subnet-group-description "SentinelShare Secure DB Subnet" \\
  --subnet-ids subnet-XXXXXXXX subnet-YYYYYYYY

aws rds create-db-instance \\
  --db-instance-identifier sentinelshare-secure \\
  --db-instance-class db.t3.micro \\
  --engine postgres \\
  --engine-version 17.9 \\
  --master-username sentinelshare_user \\
  --master-user-password YOUR_DB_PASSWORD \\
  --db-name sentinelshare \\
  --db-subnet-group-name sentinelshare-secure-subnet \\
  --no-publicly-accessible \\
  --allocated-storage 20`} />
            <CodeBlock code={`# RDS 엔드포인트 확인
aws rds describe-db-instances \\
  --db-instance-identifier sentinelshare-secure \\
  --query 'DBInstances[0].Endpoint.Address' \\
  --output text`} />
          </CliContent>
          <ConsoleContent />
        </StepCard>

        {/* Step 4: IAM 역할 */}
        <StepCard step={4} title="보안 그룹 설정">
          <CliContent>
            <CodeBlock code={`# Task Execution Role
aws iam create-role \\
  --role-name sentinelshare-task-execution-role \\
  --assume-role-policy-document file://sentinel-share-backend/infra/iam/task-execution-role.json

aws iam attach-role-policy \\
  --role-name sentinelshare-task-execution-role \\
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy

# Task Role
aws iam create-role \\
  --role-name sentinelshare-task-role \\
  --assume-role-policy-document file://sentinel-share-backend/infra/iam/task-role.json`} />
            <CodeBlock code={`# S3 + Secrets Manager 접근 정책
aws iam put-role-policy \\
  --role-name sentinelshare-task-role \\
  --policy-name s3-access \\
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::your-secure-bucket-name/uploads/*"
    }]
  }'

aws iam put-role-policy \\
  --role-name sentinelshare-task-execution-role \\
  --policy-name secrets-access \\
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Action": ["secretsmanager:GetSecretValue"],
      "Resource": "arn:aws:secretsmanager:ap-northeast-2:YOUR_ACCOUNT_ID:secret:sentinelshare/*"
    }]
  }'`} />
          </CliContent>
          <ConsoleContent />
        </StepCard>

        {/* Step 5: Secrets Manager */}
        <StepCard step={5} title="S3 설정">
          <CliContent>
            <p className="text-slate-500 text-sm mb-3">
              보안 환경 시크릿 프리픽스: <code className="font-mono text-slate-400">sentinelshare/</code> (취약 환경은 <code className="font-mono text-slate-400">sentinelshare/vulnerable/</code>)
            </p>
            <CodeBlock code={`aws secretsmanager create-secret \\
  --name sentinelshare/jwt-secret \\
  --secret-string "$(openssl rand -base64 48)"

aws secretsmanager create-secret \\
  --name sentinelshare/db-credentials \\
  --secret-string '{
    "host": "YOUR_SECURE_RDS_ENDPOINT",
    "dbname": "sentinelshare",
    "username": "sentinelshare_user",
    "password": "YOUR_DB_PASSWORD"
  }'

aws secretsmanager create-secret \\
  --name sentinelshare/s3-bucket-name \\
  --secret-string "your-secure-bucket-name"

aws secretsmanager create-secret \\
  --name sentinelshare/cors-origin \\
  --secret-string "https://YOUR_CLOUDFRONT_DOMAIN.cloudfront.net"`} />
          </CliContent>
          <ConsoleContent />
        </StepCard>

        {/* Step 6: ECS 클러스터 + Security Group */}
        <StepCard step={6} title="GitHub Actions / OIDC 설정">
          <CliContent>
            <CodeBlock code={`# ECS 클러스터
aws ecs create-cluster --cluster-name sentinelshare-secure
aws logs create-log-group --log-group-name /ecs/sentinelshare-backend

# Security Group 생성
aws ec2 create-security-group \\
  --group-name sentinelshare-secure-sg \\
  --description "SentinelShare Secure - CloudFront IP only" \\
  --vpc-id vpc-XXXXXXXX`} />
            <p className="text-slate-500 text-sm">
              Security Group 인바운드 규칙은 CloudFront 배포 완료 후 Step 10에서 추가합니다.
            </p>
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
            <CodeBlock code={`# WAF Web ACL 생성 (us-east-1 필수)
aws wafv2 create-web-acl \\
  --name sentinelshare-waf \\
  --scope CLOUDFRONT \\
  --region us-east-1 \\
  --default-action Allow={} \\
  --rules '[
    {
      "Name": "RateLimit",
      "Priority": 1,
      "Statement": {
        "RateBasedStatement": {
          "Limit": 100,
          "AggregateKeyType": "IP"
        }
      },
      "Action": {"Block": {}},
      "VisibilityConfig": {
        "SampledRequestsEnabled": true,
        "CloudWatchMetricsEnabled": true,
        "MetricName": "RateLimit"
      }
    },
    {
      "Name": "AWSManagedRulesCommonRuleSet",
      "Priority": 2,
      "OverrideAction": {"None": {}},
      "Statement": {
        "ManagedRuleGroupStatement": {
          "VendorName": "AWS",
          "Name": "AWSManagedRulesCommonRuleSet"
        }
      },
      "VisibilityConfig": {
        "SampledRequestsEnabled": true,
        "CloudWatchMetricsEnabled": true,
        "MetricName": "AWSCommonRules"
      }
    }
  ]' \\
  --visibility-config \\
    "SampledRequestsEnabled=true,CloudWatchMetricsEnabled=true,MetricName=sentinelshare-waf"`} />
            <CodeBlock code={`# WAF ARN 확인 (CloudFront 설정 시 필요)
aws wafv2 list-web-acls \\
  --scope CLOUDFRONT \\
  --region us-east-1 \\
  --query 'WebACLs[?Name==\`sentinelshare-waf\`].ARN' \\
  --output text`} />
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
            <CodeBlock code={`# 태스크 정의 등록
aws ecs register-task-definition \\
  --cli-input-json file://sentinel-share-backend/infra/ecs-task-definition-secure.json

# ECS 서비스 생성 (아직 assignPublicIp=ENABLED — CloudFront 연결 전 임시)
aws ecs create-service \\
  --cluster sentinelshare-secure \\
  --service-name sentinelshare-backend \\
  --task-definition sentinelshare-backend \\
  --desired-count 1 \\
  --launch-type FARGATE \\
  --network-configuration "awsvpcConfiguration={
    subnets=[subnet-XXXXXXXX],
    securityGroups=[sg-XXXXXXXX],
    assignPublicIp=ENABLED
  }"`} />
            <CodeBlock code={`# ECS Task Public IP 확인 (CloudFront 오리진으로 사용)
TASK_ARN=$(aws ecs list-tasks \\
  --cluster sentinelshare-secure \\
  --query 'taskArns[0]' --output text)

ENI_ID=$(aws ecs describe-tasks \\
  --cluster sentinelshare-secure \\
  --tasks $TASK_ARN \\
  --query 'tasks[0].attachments[0].details[?name==\`networkInterfaceId\`].value' \\
  --output text)

aws ec2 describe-network-interfaces \\
  --network-interface-ids $ENI_ID \\
  --query 'NetworkInterfaces[0].Association.PublicIp' \\
  --output text`} />
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
            <CodeBlock code={`# CloudFront 배포 생성
aws cloudfront create-distribution \\
  --distribution-config '{
    "CallerReference": "sentinelshare-secure-'$(date +%s)'",
    "Comment": "SentinelShare Secure Environment",
    "DefaultCacheBehavior": {
      "TargetOriginId": "ecs-backend",
      "ViewerProtocolPolicy": "redirect-to-https",
      "CachePolicyId": "4135ea2d-6df8-44a3-9df3-4b5a84be39ad",
      "OriginRequestPolicyId": "b689b0a8-53d0-40ab-baf2-68738e2966ac",
      "AllowedMethods": {
        "Quantity": 7,
        "Items": ["GET","HEAD","OPTIONS","PUT","POST","PATCH","DELETE"],
        "CachedMethods": {"Quantity": 2, "Items": ["GET","HEAD"]}
      }
    },
    "Origins": {
      "Quantity": 1,
      "Items": [{
        "Id": "ecs-backend",
        "DomainName": "YOUR_ECS_PUBLIC_IP",
        "CustomOriginConfig": {
          "HTTPPort": 3000,
          "HTTPSPort": 443,
          "OriginProtocolPolicy": "http-only"
        }
      }]
    },
    "WebACLId": "YOUR_WAF_ARN",
    "Enabled": true
  }'`} />
            <CodeBlock code={`# CloudFront 도메인 확인 (배포에 약 10–15분 소요)
aws cloudfront list-distributions \\
  --query 'DistributionList.Items[?Comment==\`SentinelShare Secure Environment\`].DomainName' \\
  --output text`} />
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
            <CodeBlock code={`# 기존 0.0.0.0/0 규칙 제거 (임시로 열었던 경우)
aws ec2 revoke-security-group-ingress \\
  --group-id sg-XXXXXXXX \\
  --protocol tcp \\
  --port 3000 \\
  --cidr 0.0.0.0/0

# CloudFront 관리형 프리픽스 리스트만 허용
aws ec2 authorize-security-group-ingress \\
  --group-id sg-XXXXXXXX \\
  --ip-permissions '[{
    "IpProtocol": "tcp",
    "FromPort": 3000,
    "ToPort": 3000,
    "PrefixListIds": [{"PrefixListId": "pl-3b927c52"}]
  }]'`} />
            <p className="text-slate-500 text-sm">
              <code className="font-mono text-slate-400">pl-3b927c52</code>는 CloudFront가 사용하는 IP 범위 전체를 자동으로 포함하는 AWS 관리형 프리픽스 리스트입니다.
            </p>
          </CliContent>
          <ConsoleContent />
        </StepCard>

        {/* Step 11: DB 마이그레이션 */}
        <StepCard step={11} title="프론트엔드 연결 및 접속 테스트">
          <CliContent>
            <CodeBlock code={`export PGPASSWORD="YOUR_DB_PASSWORD"
psql \\
  -h YOUR_SECURE_RDS_ENDPOINT \\
  -p 5432 \\
  -U sentinelshare_user \\
  -d sentinelshare \\
  -f sentinel-share-backend/migrations/001_initial_schema.sql`} />
          </CliContent>
          <ConsoleContent />
        </StepCard>

        {/* Step 12: Secrets Manager CORS 업데이트 + 대시보드 연결 */}
        <StepCard step={12} title="Secrets Manager 설정">
          <CliContent>
            <p className="text-slate-500 text-sm mb-3">
              CloudFront 도메인이 확정되었으면 CORS 시크릿을 업데이트합니다.
            </p>
            <CodeBlock code={`# CORS 시크릿 업데이트
aws secretsmanager update-secret \\
  --secret-id sentinelshare/cors-origin \\
  --secret-string "https://YOUR_CLOUDFRONT_DOMAIN.cloudfront.net"`} />
            <CodeBlock filename="attack-dashboard/.env.local" code={`VULNERABLE_API_URL=http://YOUR_VULNERABLE_ECS_IP:3000
VULNERABLE_S3_BUCKET=your-vulnerable-bucket-name
AWS_API_URL=https://YOUR_CLOUDFRONT_DOMAIN.cloudfront.net
AWS_S3_BUCKET=your-secure-bucket-name
AWS_REGION=ap-northeast-2`} />
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
