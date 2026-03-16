import Link from 'next/link';
import { StepCard } from '@/components/StepCard';
import { CodeBlock } from '@/components/CodeBlock';
import { MethodProvider, MethodToggle, CliContent, ConsoleContent } from '@/components/MethodTabs';

export default function SecureGuidePage() {
  return (
    <MethodProvider>
      <div className="max-w-4xl mx-auto w-full px-4 py-8 space-y-6">

        {/* ?ㅻ뜑 */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Link href="/guide" className="text-slate-600 hover:text-slate-400 text-sm transition-colors">
                ??Infrastructure Guide
              </Link>
            </div>
            <h1 className="text-2xl font-bold text-slate-100">蹂댁븞 ?섍꼍 援ъ꽦</h1>
            <p className="text-slate-500 mt-1 text-sm">
              CloudFront + WAF 쨌 S3 ?꾨씪?대퉿 쨌 Security Group CloudFront IP ?쒗븳 ???숈씪 肄붾뱶, ?ㅻⅨ ?명봽??
            </p>
          </div>
          <span className="flex-shrink-0 px-3 py-1 rounded border border-emerald-900 bg-emerald-950 text-emerald-400 text-xs font-mono uppercase tracking-widest">
            Secure
          </span>
        </div>

        {/* 援ъ꽦 ?붿빟 */}
        <div className="rounded-lg border border-emerald-900/40 bg-emerald-950/10 p-4 text-sm">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'WAF', value: 'Rate-based + OWASP' },
              { label: 'S3 Public Access', value: 'ON (李⑤떒)' },
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

        {/* CLI / Console ???좉? */}
        <MethodToggle />

        {/* Step 1: S3 踰꾪궥 ???꾨씪?대퉿 */}
        <StepCard step={1} title="VPC 설정">
          <CliContent>
            <CodeBlock code={`# 踰꾪궥 ?앹꽦
aws s3api create-bucket \\
  --bucket your-secure-bucket-name \\
  --region ap-northeast-2 \\
  --create-bucket-configuration LocationConstraint=ap-northeast-2

# Block Public Access ?꾩껜 ?쒖꽦??
aws s3api put-public-access-block \\
  --bucket your-secure-bucket-name \\
  --public-access-block-configuration \\
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"`} />
          </CliContent>
          <ConsoleContent>
            <ol className="space-y-2 text-sm text-slate-400 list-decimal list-inside">
              <li>AWS 肄섏넄 ?곷떒 寃?됱갹??<code className="font-mono text-slate-300">S3</code> 寃????S3 ?대┃</li>
              <li>?곗륫 ?곷떒 <span className="text-slate-200">踰꾪궥 留뚮뱾湲?/span> ?대┃</li>
              <li>踰꾪궥 ?대쫫 ?낅젰 ??由ъ쟾: <code className="font-mono text-slate-300">ap-northeast-2</code> ?좏깮</li>
              <li>媛앹껜 ?뚯쑀沅? <span className="text-slate-200">ACL 鍮꾪솢?깊솕??/span> ?좎?</li>
              <li>?쇰툝由??≪꽭??李⑤떒 ?ㅼ젙: 4媛???ぉ 紐⑤몢 泥댄겕 ?뺤씤</li>
              <li><span className="text-slate-200">踰꾪궥 留뚮뱾湲?/span> ?대┃</li>
            </ol>
          </ConsoleContent>
        </StepCard>

        {/* Step 2: S3 踰꾪궥 ?뺤콉 */}
        <StepCard
          step={2}
          title="IAM 설정"
          note="sentinel-share-backend/infra/s3-bucket-policy.json ?뚯씪??YOUR_ACCOUNT_ID? 踰꾪궥紐낆쓣 ?ㅼ젣 媛믪쑝濡??泥댄븳 ???곸슜?⑸땲??"
        >
          <CliContent>
            <CodeBlock code={`# 踰꾪궥 ?뺤콉 ?곸슜 (HTTPS 媛뺤젣 + Task Role留??덉슜)
aws s3api put-bucket-policy \\
  --bucket your-secure-bucket-name \\
  --policy file://sentinel-share-backend/infra/s3-bucket-policy.json`} />
            <p className="text-slate-500 text-sm">
              踰꾪궥 ?뺤콉 ?댁슜? HTTPS ?묎렐留??덉슜?섍퀬, ?낅줈??prefix(<code className="font-mono text-slate-400">uploads/*</code>)?????ECS Task Role ARN留??덉슜?⑸땲??
            </p>
          </CliContent>
          <ConsoleContent />
        </StepCard>

        {/* Step 3: RDS */}
        <StepCard step={3} title="ECR 프라이빗 레포지토리 생성">
          <CliContent>
            <p className="text-slate-500 text-sm mb-3">痍⑥빟 ?섍꼍怨??숈씪??諛⑹떇?쇰줈 ?앹꽦?⑸땲?? 蹂꾨룄 ?쒕툕??洹몃９怨??몄뒪?댁뒪瑜??ъ슜?섏꽭??</p>
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
            <CodeBlock code={`# RDS ?붾뱶?ъ씤???뺤씤
aws rds describe-db-instances \\
  --db-instance-identifier sentinelshare-secure \\
  --query 'DBInstances[0].Endpoint.Address' \\
  --output text`} />
          </CliContent>
          <ConsoleContent />
        </StepCard>

        {/* Step 4: IAM ??븷 */}
        <StepCard step={4} title="RDS 설정">
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
            <CodeBlock code={`# S3 + Secrets Manager ?묎렐 ?뺤콉
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
        <StepCard step={5} title="보안그룹 설정">
          <CliContent>
            <p className="text-slate-500 text-sm mb-3">
              蹂댁븞 ?섍꼍 ?쒗겕由??꾨━?쎌뒪: <code className="font-mono text-slate-400">sentinelshare/</code> (痍⑥빟 ?섍꼍? <code className="font-mono text-slate-400">sentinelshare/vulnerable/</code>)
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

        {/* Step 6: ECS ?대윭?ㅽ꽣 + Security Group */}
        <StepCard step={6} title="S3설정">
          <CliContent>
            <CodeBlock code={`# ECS ?대윭?ㅽ꽣
aws ecs create-cluster --cluster-name sentinelshare-secure
aws logs create-log-group --log-group-name /ecs/sentinelshare-backend

# Security Group ?앹꽦
aws ec2 create-security-group \\
  --group-name sentinelshare-secure-sg \\
  --description "SentinelShare Secure - CloudFront IP only" \\
  --vpc-id vpc-XXXXXXXX`} />
            <p className="text-slate-500 text-sm">
              Security Group ?몃컮?대뱶 洹쒖튃? CloudFront 諛고룷 ?꾨즺 ??Step 10?먯꽌 異붽??⑸땲??
            </p>
          </CliContent>
          <ConsoleContent />
        </StepCard>

        {/* Step 7: WAF Web ACL */}
        <StepCard
          step={7}
          title="GitHub Actions / OIDC 설정"
          note="WAF??CloudFront???곌껐?섎?濡?諛섎뱶??us-east-1 由ъ쟾?먯꽌 ?앹꽦?댁빞 ?⑸땲??"
        >
          <CliContent>
            <CodeBlock code={`# WAF Web ACL ?앹꽦 (us-east-1 ?꾩닔)
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
            <CodeBlock code={`# WAF ARN ?뺤씤 (CloudFront ?ㅼ젙 ???꾩슂)
aws wafv2 list-web-acls \\
  --scope CLOUDFRONT \\
  --region us-east-1 \\
  --query 'WebACLs[?Name==\`sentinelshare-waf\`].ARN' \\
  --output text`} />
          </CliContent>
          <ConsoleContent />
        </StepCard>

        {/* Step 8: ECS ?쒖뒪???뺤쓽 + ?쒕퉬??*/}
        <StepCard
          step={8}
          title="CloudWatch Log Group 생성"
          note="sentinel-share-backend/infra/ecs-task-definition-secure.json???ъ슜?⑸땲?? ACCOUNT_ID? ?쒗겕由?ARN???ㅼ젣 媛믪쑝濡??泥댄븯?몄슂."
        >
          <CliContent>
            <CodeBlock code={`# ?쒖뒪???뺤쓽 ?깅줉
aws ecs register-task-definition \\
  --cli-input-json file://sentinel-share-backend/infra/ecs-task-definition-secure.json

# ECS ?쒕퉬???앹꽦 (?꾩쭅 assignPublicIp=ENABLED ??CloudFront ?곌껐 ???꾩떆)
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
            <CodeBlock code={`# ECS Task Public IP ?뺤씤 (CloudFront ?ㅻ━吏꾩쑝濡??ъ슜)
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

        {/* Step 9: CloudFront 諛고룷 */}
        <StepCard
          step={9}
          title="ECS Fargate 설정"
          note="?ㅻ━吏꾩? ECS Task??Public IP?낅땲?? ?ㅼ젣 ?꾨줈?뺤뀡?먯꽌??ALB瑜??ㅻ━吏꾩쑝濡??ъ슜?섎뒗 寃껋씠 沅뚯옣?섏?留? ???곕え ?섍꼍?먯꽌??ECS IP瑜?吏곸젒 ?ъ슜?⑸땲??"
        >
          <CliContent>
            <CodeBlock code={`# CloudFront 諛고룷 ?앹꽦
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
            <CodeBlock code={`# CloudFront ?꾨찓???뺤씤 (諛고룷????10??5遺??뚯슂)
aws cloudfront list-distributions \\
  --query 'DistributionList.Items[?Comment==\`SentinelShare Secure Environment\`].DomainName' \\
  --output text`} />
          </CliContent>
          <ConsoleContent />
        </StepCard>

        {/* Step 10: Security Group CloudFront IP ?쒗븳 */}
        <StepCard
          step={10}
          title="ECS Service 설정"
        >
          <CliContent>
            <CodeBlock code={`# 湲곗〈 0.0.0.0/0 洹쒖튃 ?쒓굅 (?꾩떆濡??댁뿀??寃쎌슦)
aws ec2 revoke-security-group-ingress \\
  --group-id sg-XXXXXXXX \\
  --protocol tcp \\
  --port 3000 \\
  --cidr 0.0.0.0/0

# CloudFront 愿由ы삎 ?꾨━?쎌뒪 由ъ뒪?몃쭔 ?덉슜
aws ec2 authorize-security-group-ingress \\
  --group-id sg-XXXXXXXX \\
  --ip-permissions '[{
    "IpProtocol": "tcp",
    "FromPort": 3000,
    "ToPort": 3000,
    "PrefixListIds": [{"PrefixListId": "pl-3b927c52"}]
  }]'`} />
            <p className="text-slate-500 text-sm">
              <code className="font-mono text-slate-400">pl-3b927c52</code>??CloudFront媛 ?ъ슜?섎뒗 IP 踰붿쐞 ?꾩껜瑜??먮룞?쇰줈 ?ы븿?섎뒗 AWS 愿由ы삎 ?꾨━?쎌뒪 由ъ뒪?몄엯?덈떎.
            </p>
          </CliContent>
          <ConsoleContent />
        </StepCard>

        {/* Step 11: DB 留덉씠洹몃젅?댁뀡 */}
        <StepCard step={11} title="Secrets Manager 설정">
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

        {/* Step 12: Secrets Manager CORS ?낅뜲?댄듃 + ??쒕낫???곌껐 */}
        <StepCard step={12} title="CORS ?낅뜲?댄듃 + Attack Dashboard ?곌껐">
          <CliContent>
            <p className="text-slate-500 text-sm mb-3">
              CloudFront ?꾨찓?몄씠 ?뺤젙?섏뿀?쇰㈃ CORS ?쒗겕由우쓣 ?낅뜲?댄듃?⑸땲??
            </p>
            <CodeBlock code={`# CORS ?쒗겕由??낅뜲?댄듃
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

        {/* 寃利?*/}
        <div className="rounded-xl border border-emerald-900/40 bg-emerald-950/10 p-6">
          <h3 className="text-emerald-400 font-semibold mb-3">?ㅼ젙 寃利?/h3>
          <div className="space-y-2 text-sm">
            {[
              { check: 'CloudFront URL濡?/health ?붿껌 ??200 OK', cmd: 'curl https://YOUR_CF_DOMAIN.cloudfront.net/health' },
              { check: 'ECS IP 吏곸젒 ?묎렐 ???곌껐 嫄곕? (SG 李⑤떒)', cmd: 'curl http://YOUR_ECS_IP:3000/health  # ??꾩븘???먮뒗 ?곌껐 嫄곕?' },
              { check: 'S3 踰꾪궥 吏곸젒 ?묎렐 ??403 AccessDenied', cmd: 'curl https://your-secure-bucket.s3.ap-northeast-2.amazonaws.com/  # 403' },
            ].map((item, i) => (
              <div key={i} className="space-y-1">
                <div className="flex items-center gap-2 text-slate-400">
                  <span className="text-emerald-600">??/span>
                  {item.check}
                </div>
                <CodeBlock code={item.cmd} />
              </div>
            ))}
          </div>
        </div>

        {/* ?꾨즺 */}
        <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-6">
          <h3 className="text-slate-300 font-semibold mb-2">紐⑤뱺 援ъ꽦 ?꾨즺</h3>
          <p className="text-slate-500 text-sm mb-4">
            痍⑥빟/蹂댁븞 ???섍꼍??紐⑤몢 以鍮꾨릺?덉뒿?덈떎. Attack Simulator?먯꽌 怨듦꺽???ㅽ뻾?섍퀬 寃곌낵瑜?鍮꾧탳?대낫?몄슂.
          </p>
          <div className="flex gap-3">
            <Link
              href="/"
              className="px-4 py-2 rounded-lg border border-red-700 bg-red-950 text-red-400 text-sm font-medium hover:bg-red-900 transition-colors"
            >
              ??Attack Simulator ?ㅽ뻾
            </Link>
            <Link
              href="/guide/vulnerable"
              className="px-4 py-2 rounded-lg border border-slate-700 text-slate-400 text-sm hover:text-slate-200 hover:border-slate-600 transition-colors"
            >
              ??痍⑥빟 ?섍꼍 媛?대뱶
            </Link>
          </div>
        </div>

      </div>
    </MethodProvider>
  );
}
