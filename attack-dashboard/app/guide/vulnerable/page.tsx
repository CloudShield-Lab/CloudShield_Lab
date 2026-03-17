import Link from 'next/link';
import { StepCard } from '@/components/StepCard';
import { CodeBlock } from '@/components/CodeBlock';
import { MethodProvider, MethodToggle, CliContent, ConsoleContent } from '@/components/MethodTabs';

export default function VulnerableGuidePage() {
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
            <h1 className="text-2xl font-bold text-slate-100">취약 환경 구성</h1>
            <p className="text-slate-500 mt-1 text-sm">
              WAF 없음 · S3 퍼블릭 · Security Group 전체 개방 — 공격이 아무 제약 없이 통과하는 환경
            </p>
          </div>
          <span className="flex-shrink-0 px-3 py-1 rounded border border-red-900 bg-red-950 text-red-400 text-xs font-mono uppercase tracking-widest">
            Vulnerable
          </span>
        </div>

        {/* 구성 요약 */}
        <div className="rounded-lg border border-red-900/40 bg-red-950/10 p-4 text-sm">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'WAF', value: '없음', bad: true },
              { label: 'S3 Public Access', value: 'OFF (개방)', bad: true },
              { label: 'Security Group', value: '0.0.0.0/0', bad: true },
              { label: 'CloudFront', value: '없음 (선택)', bad: false },
            ].map((item) => (
              <div key={item.label}>
                <div className="text-slate-500 text-xs mb-0.5">{item.label}</div>
                <div className={`font-mono text-xs font-semibold ${item.bad ? 'text-red-400' : 'text-slate-400'}`}>
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CLI / Console 탭 토글 */}
        <MethodToggle />

        {/* Step 1: ECR 레포지토리 */}
        <StepCard step={1} title="ECR 레포지토리 생성 (공통)">
          <CliContent>
            <p className="text-slate-500 text-sm">두 환경이 동일 Docker 이미지를 사용합니다. 이미 생성했다면 건너뜁니다.</p>
            <CodeBlock code={`aws ecr create-repository \\
  --repository-name sentinelshare-backend \\
  --region ap-northeast-2`} />
          </CliContent>
          <ConsoleContent />
        </StepCard>

        {/* Step 2: ECS 클러스터 */}
        <StepCard step={2} title="ECS 클러스터 + CloudWatch 로그 그룹 생성">
          <CliContent>
            <CodeBlock code={`# ECS 클러스터 생성
aws ecs create-cluster --cluster-name sentinelshare-vulnerable

# CloudWatch 로그 그룹
aws logs create-log-group \\
  --log-group-name /ecs/sentinelshare-backend-vulnerable`} />
          </CliContent>
          <ConsoleContent />
        </StepCard>

        {/* Step 3: RDS */}
        <StepCard
          step={3}
          title="RDS X PostgreSQL 생성"
          warning="취약 환경이지만 RDS는 VPC 내부에만 배치합니다. ECS에서만 접근 가능하도록 Security Group을 설정하세요."
        >
          <CliContent>
            <CodeBlock code={`# RDS 서브넷 그룹 생성 (VPC 내 프라이빗 서브넷 2개 이상 필요)
aws rds create-db-subnet-group \\
  --db-subnet-group-name sentinelshare-vulnerable-subnet \\
  --db-subnet-group-description "SentinelShare Vulnerable DB Subnet" \\
  --subnet-ids subnet-XXXXXXXX subnet-YYYYYYYY

# RDS 인스턴스 생성
aws rds create-db-instance \\
  --db-instance-identifier sentinelshare-vulnerable \\
  --db-instance-class db.t3.micro \\
  --engine postgres \\
  --engine-version 17.9 \\
  --master-username sentinelshare_user \\
  --master-user-password YOUR_DB_PASSWORD \\
  --db-name sentinelshare \\
  --db-subnet-group-name sentinelshare-vulnerable-subnet \\
  --no-publicly-accessible \\
  --allocated-storage 20`} />
            <p className="text-slate-500 text-sm">RDS 생성에 약 5–10분 소요됩니다. 엔드포인트는 이후 단계에서 사용합니다.</p>
            <CodeBlock code={`# RDS 엔드포인트 확인
aws rds describe-db-instances \\
  --db-instance-identifier sentinelshare-vulnerable \\
  --query 'DBInstances[0].Endpoint.Address' \\
  --output text`} />
          </CliContent>
          <ConsoleContent />
        </StepCard>

        {/* Step 4: S3 버킷 — 퍼블릭 */}
        <StepCard
          step={4}
          title="S3 버킷 생성 — Block Public Access OFF (의도적 취약 설정)"
          warning="이것은 의도적인 취약 설정입니다. 공격 시뮬레이션 전용 환경에서만 사용하세요."
        >
          <CliContent>
            <CodeBlock code={`# 버킷 생성
aws s3api create-bucket \\
  --bucket your-vulnerable-bucket-name \\
  --region ap-northeast-2 \\
  --create-bucket-configuration LocationConstraint=ap-northeast-2

# Block Public Access 전체 해제 (취약 설정)
aws s3api put-public-access-block \\
  --bucket your-vulnerable-bucket-name \\
  --public-access-block-configuration \\
    "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false"`} />
            <p className="text-slate-500 text-sm">
              버킷 이름은 전역 고유해야 합니다. 예: <span className="font-mono text-slate-400">sentinelshare-vuln-{'{your-name}'}</span>
            </p>
          </CliContent>
          <ConsoleContent />
        </StepCard>

        {/* Step 5: IAM Task Role */}
        <StepCard step={5} title="IAM 역할 생성 (Task Role + Task Execution Role)">
          <CliContent>
            <p className="text-slate-500 text-sm mb-3">
              <code className="font-mono text-slate-400">sentinel-share-backend/infra/iam/</code> 디렉토리의 JSON 파일을 참조합니다.
            </p>
            <CodeBlock code={`# Task Execution Role (ECS가 ECR 이미지 Pull + Secrets Manager 읽기)
aws iam create-role \\
  --role-name sentinelshare-task-execution-role-vulnerable \\
  --assume-role-policy-document file://sentinel-share-backend/infra/iam/task-execution-role.json

aws iam attach-role-policy \\
  --role-name sentinelshare-task-execution-role-vulnerable \\
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy

# Task Role (컨테이너가 S3 + Secrets Manager 접근)
aws iam create-role \\
  --role-name sentinelshare-task-role-vulnerable \\
  --assume-role-policy-document file://sentinel-share-backend/infra/iam/task-role.json`} />
            <CodeBlock code={`# S3 접근 정책 연결 (업로드 prefix만)
aws iam put-role-policy \\
  --role-name sentinelshare-task-role-vulnerable \\
  --policy-name s3-access \\
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::your-vulnerable-bucket-name/uploads/*"
    }]
  }'`} />
          </CliContent>
          <ConsoleContent />
        </StepCard>

        {/* Step 6: Secrets Manager */}
        <StepCard step={6} title="Secrets Manager 시크릿 생성">
          <CliContent>
            <p className="text-slate-500 text-sm mb-3">
              취약 환경 시크릿 프리픽스: <code className="font-mono text-slate-400">sentinelshare/vulnerable/</code>
            </p>
            <CodeBlock code={`# JWT 시크릿
aws secretsmanager create-secret \\
  --name sentinelshare/vulnerable/jwt-secret \\
  --secret-string "$(openssl rand -base64 48)"

# DB 접속 정보 (Step 3에서 확인한 RDS 엔드포인트 사용)
aws secretsmanager create-secret \\
  --name sentinelshare/vulnerable/db-credentials \\
  --secret-string '{
    "host": "YOUR_RDS_ENDPOINT",
    "dbname": "sentinelshare",
    "username": "sentinelshare_user",
    "password": "YOUR_DB_PASSWORD"
  }'

# S3 버킷명
aws secretsmanager create-secret \\
  --name sentinelshare/vulnerable/s3-bucket-name \\
  --secret-string "your-vulnerable-bucket-name"

# CORS 허용 오리진 (프론트엔드 URL)
aws secretsmanager create-secret \\
  --name sentinelshare/vulnerable/cors-origin \\
  --secret-string "http://your-frontend-url"`} />
            <CodeBlock code={`# Secrets Manager 읽기 권한 추가
aws iam put-role-policy \\
  --role-name sentinelshare-task-execution-role-vulnerable \\
  --policy-name secrets-access \\
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Action": ["secretsmanager:GetSecretValue"],
      "Resource": "arn:aws:secretsmanager:ap-northeast-2:YOUR_ACCOUNT_ID:secret:sentinelshare/vulnerable/*"
    }]
  }'`} />
          </CliContent>
          <ConsoleContent />
        </StepCard>

        {/* Step 7: Security Group */}
        <StepCard
          step={7}
          title="Security Group 생성 — 0.0.0.0/0 개방 (의도적 취약 설정)"
          warning="포트 3000을 전체 인터넷에 개방합니다. 공격 시뮬레이션 전용 환경에서만 사용하세요."
        >
          <CliContent>
            <CodeBlock code={`# Security Group 생성
aws ec2 create-security-group \\
  --group-name sentinelshare-vulnerable-sg \\
  --description "SentinelShare Vulnerable - No restrictions" \\
  --vpc-id vpc-XXXXXXXX

# 포트 3000 전체 개방 (취약 설정)
aws ec2 authorize-security-group-ingress \\
  --group-id sg-XXXXXXXX \\
  --protocol tcp \\
  --port 3000 \\
  --cidr 0.0.0.0/0`} />
          </CliContent>
          <ConsoleContent />
        </StepCard>

        {/* Step 8: ECS 태스크 정의 + 서비스 */}
        <StepCard
          step={8}
          title="ECS 태스크 정의 등록 + 서비스 생성"
          note="태스크 정의 JSON은 sentinel-share-backend/infra/ecs-task-definition-vulnerable.json을 사용합니다. ACCOUNT_ID, 이미지 태그, 시크릿 ARN을 실제 값으로 대체하세요."
        >
          <CliContent>
            <CodeBlock code={`# 태스크 정의 등록
aws ecs register-task-definition \\
  --cli-input-json file://sentinel-share-backend/infra/ecs-task-definition-vulnerable.json

# ECS 서비스 생성
aws ecs create-service \\
  --cluster sentinelshare-vulnerable \\
  --service-name sentinelshare-backend-vulnerable \\
  --task-definition sentinelshare-backend-vulnerable \\
  --desired-count 1 \\
  --launch-type FARGATE \\
  --network-configuration "awsvpcConfiguration={
    subnets=[subnet-XXXXXXXX],
    securityGroups=[sg-XXXXXXXX],
    assignPublicIp=ENABLED
  }"`} />
            <CodeBlock code={`# ECS Task Public IP 확인 (이것이 취약 환경 엔드포인트)
TASK_ARN=$(aws ecs list-tasks \\
  --cluster sentinelshare-vulnerable \\
  --query 'taskArns[0]' --output text)

aws ecs describe-tasks \\
  --cluster sentinelshare-vulnerable \\
  --tasks $TASK_ARN \\
  --query 'tasks[0].attachments[0].details[?name==\`networkInterfaceId\`].value' \\
  --output text | xargs -I {} \\
  aws ec2 describe-network-interfaces \\
  --network-interface-ids {} \\
  --query 'NetworkInterfaces[0].Association.PublicIp' \\
  --output text`} />
          </CliContent>
          <ConsoleContent />
        </StepCard>

        {/* Step 9: DB 마이그레이션 */}
        <StepCard
          step={9}
          title="DB 마이그레이션 실행"
          note="ECS Task가 Running 상태가 된 후 실행합니다. RDS Security Group에서 마이그레이션 실행 머신의 IP를 일시적으로 허용해야 할 수 있습니다."
        >
          <CliContent>
            <CodeBlock code={`export PGPASSWORD="YOUR_DB_PASSWORD"
psql \\
  -h YOUR_RDS_ENDPOINT \\
  -p 5432 \\
  -U sentinelshare_user \\
  -d sentinelshare \\
  -f sentinel-share-backend/migrations/001_initial_schema.sql`} />
          </CliContent>
          <ConsoleContent />
        </StepCard>

        {/* Step 10: 대시보드 연결 */}
        <StepCard step={10} title="Attack Dashboard에 취약 환경 URL 등록">
          <CliContent>
            <p className="text-slate-500 text-sm mb-3">
              Step 8에서 확인한 ECS Task Public IP를 대시보드에 등록합니다.
            </p>
            <CodeBlock filename="attack-dashboard/.env.local" code={`VULNERABLE_API_URL=http://YOUR_ECS_PUBLIC_IP:3000
VULNERABLE_S3_BUCKET=your-vulnerable-bucket-name`} />
            <p className="text-slate-500 text-sm mt-2">
              설정 후 대시보드를 재시작하면 환경 상태 표시줄에 취약 환경 URL이 표시됩니다.
            </p>
          </CliContent>
          <ConsoleContent />
        </StepCard>

        {/* 완료 및 다음 단계 */}
        <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-6">
          <h3 className="text-slate-300 font-semibold mb-2">다음 단계</h3>
          <p className="text-slate-500 text-sm mb-4">
            취약 환경 구성이 완료되었습니다. 이제 보안 환경을 구성하고 공격 시뮬레이터에서 두 환경을 비교해보세요.
          </p>
          <div className="flex gap-3">
            <Link
              href="/guide/secure"
              className="px-4 py-2 rounded-lg border border-emerald-700 bg-emerald-950 text-emerald-400 text-sm font-medium hover:bg-emerald-900 transition-colors"
            >
              보안 환경 구성 →
            </Link>
            <Link
              href="/"
              className="px-4 py-2 rounded-lg border border-slate-700 text-slate-400 text-sm hover:text-slate-200 hover:border-slate-600 transition-colors"
            >
              Attack Simulator로 이동
            </Link>
          </div>
        </div>

      </div>
    </MethodProvider>
  );
}
