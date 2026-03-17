# CloudShield Lab — Terraform 자동화 계획

## 1. Terraform 연결 후 전체 아키텍처

```
CloudShield Lab — Terraform 자동화 아키텍처 (ap-northeast-2)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

infra/terraform/
├── environments/vulnerable/    ← terraform apply (취약 환경)
└── environments/secure/        ← terraform apply (보안 환경)

┌──────────────────────────────────────────────────────────────┐
│                     취약 환경 (Vulnerable)                    │
│                                                              │
│  Internet (0.0.0.0/0)                                        │
│       ↓                                                      │
│  EC2 t3.small (Elastic IP 고정)                              │
│  ├── Docker: sentinelshare-backend:latest (포트 3000)        │
│  ├── PostgreSQL 14 (co-located)                              │
│  ├── SG: 0.0.0.0/0 → 3000, 80, 443 (전체 오픈)             │
│  └── /opt/app/.env (templatefile로 주입)                     │
│                                                              │
│  S3: sentinel-share-vul-frontend                             │
│  ├── Block Public Access: OFF                                │
│  ├── 버킷 정책 없음 (의도적 취약)                             │
│  └── 정적 웹사이트 호스팅 직접 접근                          │
│                                                              │
│  WAF: 없음  /  CloudFront: 없음                              │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│                      보안 환경 (Secure)                       │
│                                                              │
│  User                                                        │
│   └──→ CloudFront (dyfs11nls1dwb.cloudfront.net)            │
│         ├── /api/* → EC2 (HTTP:3000) [Origin 1]             │
│         └── /*     → S3 sentinel-share-secure-frontend       │
│                        [Origin 2, OAC]                       │
│                                                              │
│  EC2 t3.small (Elastic IP 고정)                              │
│  ├── Docker: sentinelshare-backend:latest (포트 3000)        │
│  ├── PostgreSQL 14 (co-located)                              │
│  ├── SG: CloudFront prefix list pl-22a6434b만 허용           │
│  └── /opt/app/.env (templatefile로 주입)                     │
│                                                              │
│  S3: sentinel-share-secure-frontend                          │
│  ├── Block Public Access: ON                                 │
│  └── EC2 Instance Role만 허용하는 버킷 정책                  │
│                                                              │
│  WAF WebACL → CloudFront 연결                                │
│  ├── Rate-based rule (임계값 설정)                            │
│  └── AWS Managed Rules (AWSManagedRulesCommonRuleSet 등)     │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│                   공유 인프라 (Shared)                        │
│                                                              │
│  ECR: sentinelshare-backend (Docker 이미지)                  │
│  ECR: cloudshield-dashboard (Attack Dashboard)               │
│  ECS Fargate: attack-dashboard (별도 유지)                   │
│                                                              │
│  IAM OIDC: GitHub Actions → AWS Role (OIDC 인증)            │
│  SSM: EC2 배포 명령 전달 (SSH 포트 불필요)                   │
└──────────────────────────────────────────────────────────────┘

Terraform 완료 후 GitHub Secrets 자동 주입 (GitHub Provider)
  VULN_EC2_INSTANCE_ID  ← aws_instance.vulnerable.id
  SECURE_EC2_INSTANCE_ID ← aws_instance.secure.id
  VULN_API_URL          ← http://{aws_eip.vulnerable.public_ip}:3000/api
  CLOUDFRONT_DISTRIBUTION_ID ← aws_cloudfront_distribution.secure.id
```

---

## 2. 다른 AI에게 줄 Terraform 구현 프롬프트

```
# CloudShield Lab — Terraform 인프라 자동화 구현 지시

## 프로젝트 배경
SentinelShare는 클라우드 보안 효과를 비교 시연하는 플랫폼이다.
동일한 Node.js/Express 백엔드 Docker 이미지를 두 AWS EC2에 배포하되,
인프라 설정(WAF, CloudFront, S3 정책, Security Group)만 다르게 구성한다.
이 두 환경을 Terraform으로 자동화하는 것이 목표다.

## 구현 대상 경로
현재 레포지토리에 infra/terraform/ 디렉토리가 비어있다.
아래 구조를 그대로 구현하라:

infra/terraform/
├── modules/
│   ├── network/        # VPC, 서브넷, Security Group
│   ├── ec2/            # EC2 인스턴스 + Elastic IP, user_data 초기화
│   ├── s3/             # S3 버킷 + 정책 (취약/보안 옵션 분기)
│   ├── waf/            # WAF WebACL (보안 환경만)
│   └── cloudfront/     # CloudFront distribution (보안 환경만)
├── environments/
│   ├── vulnerable/     # terraform.tfvars + main.tf (취약 환경)
│   └── secure/         # terraform.tfvars + main.tf (보안 환경)
└── github-secrets/     # Terraform GitHub Provider로 Secrets 자동 주입

## AWS 환경 정보
- Region: ap-northeast-2
- Account ID: 833453046706
- 기존 ECR 레포: sentinelshare-backend, cloudshield-dashboard
- 기존 CloudFront Distribution ID: E1UMT2HJR995IV
- CloudFront prefix list (ap-northeast-2): pl-22a6434b
- Terraform state backend: S3 (버킷명은 변수로 처리, 하드코딩 금지)

## 취약 환경 (environments/vulnerable) 상세 스펙

EC2:
- 인스턴스 타입: t3.small
- AMI: Ubuntu 22.04 LTS (ap-northeast-2 최신 AMI 데이터소스로 조회)
- IAM Role 필요 권한: AmazonSSMManagedInstanceCore, AmazonEC2ContainerRegistryReadOnly
- Elastic IP 연결 (VULN_API_URL 고정용)
- user_data.sh로 다음을 자동 실행:
  1. Docker 설치 (apt-get, GPG 키 방식)
  2. Docker 데몬 enable + start
  3. AWS CLI 설치 (snap install aws-cli --classic)
  4. /opt/app/logs 디렉토리 생성 + chmod 777
  5. PostgreSQL 14 설치, DB명 sentinelshare, 유저 sentinelshare 생성
  6. /opt/app/.env 파일 생성 (templatefile()로 변수 주입)
  7. ECR에서 sentinelshare-backend:latest pull
  8. docker run -d --name sentinelshare-backend --env-file /opt/app/.env --network host -v /opt/app/logs:/opt/app/logs --restart unless-stopped {image}
  9. migrations/ SQL 파일을 docker cp 후 psql로 실행 (최초 1회)

Security Group:
- Inbound: 0.0.0.0/0 → 3000, 80, 443 (의도적 취약 설정)
- Outbound: 전체 허용

S3 (프론트엔드):
- 버킷명: sentinel-share-vul-frontend
- Block Public Access: 전체 OFF
- 정적 웹사이트 호스팅 활성화
- 버킷 정책: s3:GetObject 전체 공개

WAF: 없음
CloudFront: 없음

## 보안 환경 (environments/secure) 상세 스펙

EC2:
- 인스턴스 타입: t3.small
- AMI: 위와 동일 (데이터소스 공유)
- IAM Role: 동일 (SSM + ECR)
- Elastic IP 연결
- user_data.sh: 취약 환경과 동일 구조 (환경변수 값만 다름)

Security Group:
- Inbound: CloudFront 관리형 프리픽스 리스트 pl-22a6434b → 3000 (HTTP만)
- SSH(22) 포트: 열지 않음 (SSM으로 접근)
- Outbound: 전체 허용

S3 (프론트엔드):
- 버킷명: sentinel-share-secure-frontend
- Block Public Access: 전체 ON
- 버킷 정책: EC2 Instance Role의 s3:GetObject만 허용
- 정적 웹사이트 호스팅 비활성 (CloudFront OAC 방식)

WAF:
- WebACL (scope: CLOUDFRONT이므로 us-east-1 provider 별도 설정 필요)
- Rate-based rule: 5분간 2000 요청 초과 시 BLOCK
- AWS Managed Rules: AWSManagedRulesCommonRuleSet, AWSManagedRulesKnownBadInputsRuleSet
- CloudFront distribution에 연결

CloudFront:
- 기존 Distribution 재사용 또는 신규 생성 (변수로 분기 가능하게)
- Origin 1: /api/* → EC2 Elastic IP HTTP:3000 (캐시 비활성 - CachingDisabled)
- Origin 2: /* → S3 (OAC 방식)
- Custom Error Response: 403 → /index.html (HTTP 200), 404 → /index.html (HTTP 200)
- WAF WebACL 연결
- HTTPS only, TLSv1.2_2021

## /opt/app/.env 주입 변수 목록 (templatefile)
다음 변수를 templatefile()로 .env에 주입해야 한다:
- DATABASE_URL (postgresql://sentinelshare:{password}@localhost:5432/sentinelshare)
- JWT_SECRET
- AWS_REGION
- AWS_ACCESS_KEY_ID (Instance Role 사용 시 제거 가능 — 변수로 처리)
- AWS_SECRET_ACCESS_KEY (동상)
- S3_BUCKET_NAME (파일 저장용 버킷명)
- AWS_ENDPOINT_URL (로컬 LocalStack용, 프로덕션은 빈 값)
- CORS_ORIGIN
  - 취약: http://{S3 웹사이트 엔드포인트}
  - 보안: https://dyfs11nls1dwb.cloudfront.net

민감 값(JWT_SECRET, DB 패스워드 등)은 절대 .tf 파일에 하드코딩하지 말고
terraform.tfvars 또는 AWS Secrets Manager 참조로 처리하라.

## GitHub Secrets 자동 주입 (github-secrets/main.tf)
terraform apply 완료 시 다음 GitHub Secrets를 자동 갱신:
- VULN_EC2_INSTANCE_ID  ← aws_instance.vulnerable.id
- SECURE_EC2_INSTANCE_ID ← aws_instance.secure.id
- VULN_API_URL          ← "http://${aws_eip.vulnerable.public_ip}:3000/api"
- CLOUDFRONT_DISTRIBUTION_ID ← aws_cloudfront_distribution.secure.id

GitHub Provider 설정 시 GITHUB_TOKEN은 환경변수로 주입받는다.
레포지토리: CloudShield_Lab (owner는 변수로 처리)

## 기존 CI/CD 워크플로우와의 연동 포인트
다음 GitHub Actions 워크플로우가 이미 존재한다. Terraform output이
이 워크플로우의 secrets와 연결되어야 한다:

- .github/workflows/deploy-backend.yml
  SSM Send Command로 VULN_EC2_INSTANCE_ID, SECURE_EC2_INSTANCE_ID 타겟
- .github/workflows/deploy-frontend.yml
  S3 sync → sentinel-share-vul-frontend, sentinel-share-secure-frontend
  CloudFront invalidation → CLOUDFRONT_DISTRIBUTION_ID

## 중요 제약사항
1. Terraform state 파일(*.tfstate, *.tfstate.backup)은 절대 커밋하지 않는다
   → .gitignore에 추가 필수
2. authLimiter를 앱 코드에 추가하지 않는다
   (rate limit은 WAF가 담당 — 의도적 아키텍처 설계)
3. 보안 환경 S3 버킷에 Public Access를 열지 않는다
4. Terraform outputs에 민감 값(비밀번호 등)을 포함할 경우 sensitive = true 처리
5. WAF WebACL은 CloudFront 연결이므로 반드시 us-east-1 provider alias 사용

## 구현 후 검증 체크리스트
- [ ] terraform validate 통과
- [ ] terraform plan 실행 시 에러 없음
- [ ] environments/vulnerable과 environments/secure가 독립적으로 apply 가능
- [ ] modules/는 재사용 가능한 인터페이스로 설계
- [ ] 모든 민감 변수는 variable {} 선언 + sensitive = true
- [ ] .gitignore에 *.tfstate, *.tfstate.backup, .terraform/, *.tfvars (secrets 포함 파일) 추가
```
