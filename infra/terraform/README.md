# CloudShield Lab — Terraform 인프라

취약(Vulnerable) / 보안(Secure) 두 환경을 독립적으로 프로비저닝한다.

## 디렉토리 구조

```
infra/terraform/
├── modules/
│   ├── network/        VPC, 서브넷, Security Group
│   ├── ec2/            EC2 + Elastic IP + IAM Role + user_data 초기화
│   ├── s3/             S3 버킷 (공개/비공개 옵션)
│   ├── waf/            WAF WebACL (us-east-1 필수)
│   └── cloudfront/     CloudFront + OAC
├── environments/
│   ├── vulnerable/     취약 환경 (WAF/CloudFront 없음, SG 전체 오픈)
│   └── secure/         보안 환경 (WAF + CloudFront + SG CloudFront만 허용)
└── github-secrets/     Terraform output → GitHub Actions Secrets 자동 주입
```

## 사전 요구사항

- Terraform >= 1.5.0
- AWS CLI 설정 (`aws configure` 또는 환경변수)
- Terraform state 저장용 S3 버킷 (수동 생성 필요)
- GitHub Personal Access Token (github-secrets 적용 시)

## 배포 순서

### 1. 취약 환경

```bash
cd environments/vulnerable

# tfvars 파일 준비
cp terraform.tfvars.example terraform.tfvars
# terraform.tfvars 편집: jwt_secret, db_password 입력

# 초기화 (S3 backend 버킷명 입력)
terraform init \
  -backend-config="bucket=YOUR_TFSTATE_BUCKET" \
  -backend-config="key=cloudshield/vulnerable/terraform.tfstate" \
  -backend-config="region=ap-northeast-2"

terraform plan
terraform apply
```

### 2. 보안 환경

```bash
cd environments/secure

cp terraform.tfvars.example terraform.tfvars
# terraform.tfvars 편집: jwt_secret, db_password 입력

terraform init \
  -backend-config="bucket=YOUR_TFSTATE_BUCKET" \
  -backend-config="key=cloudshield/secure/terraform.tfstate" \
  -backend-config="region=ap-northeast-2"

terraform plan
terraform apply
```

### 3. GitHub Secrets 자동 주입

```bash
cd github-secrets

cp terraform.tfvars.example terraform.tfvars
# 두 환경의 output 값을 terraform.tfvars에 입력

export GITHUB_TOKEN=ghp_xxxxxxxxxxxx

terraform init
terraform apply
```

## 주요 outputs

| output | 용도 |
|---|---|
| `ec2_instance_id` | GitHub Secret: `VULN_EC2_INSTANCE_ID` / `SECURE_EC2_INSTANCE_ID` |
| `vuln_api_url` | GitHub Secret: `VULN_API_URL` |
| `cloudfront_distribution_id` | GitHub Secret: `CLOUDFRONT_DISTRIBUTION_ID` |
| `cloudfront_domain_name` | 프론트엔드 배포 URL |

## 주의사항

- `terraform.tfvars`는 `.gitignore`에 포함됨 — 커밋 금지
- WAF WebACL은 `us-east-1`에 생성됨 (CloudFront scope 필수)
- 보안 환경 EC2 Security Group은 CloudFront prefix list `pl-22a6434b`만 허용
- `user_data_replace_on_change = false` → EC2 재시작 없이 인프라 변경 가능
