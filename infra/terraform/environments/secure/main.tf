terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# 기본 provider: ap-northeast-2 (모든 리소스 기본값)
provider "aws" {
  region = var.aws_region
}

# us-east-1 provider: WAF WebACL (CloudFront scope 필수)
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}

locals {
  env_name             = "secure"
  ecr_registry         = "${var.aws_account_id}.dkr.ecr.${var.aws_region}.amazonaws.com"
  frontend_bucket_name = "sentinel-share-secure-frontend-${var.aws_account_id}"
}

# ─── Network (VPC + SG) ──────────────────────────────────────
module "network" {
  source      = "../../modules/network"
  env_name    = local.env_name
  vpc_cidr    = "10.20.0.0/16"
  subnet_cidr = "10.20.1.0/24"
  az          = "${var.aws_region}a"

  # 보안 환경: CloudFront 관리형 프리픽스 리스트만 허용
  ingress_rules = [
    {
      from_port       = 3000
      to_port         = 3000
      protocol        = "tcp"
      cidr_blocks     = []
      prefix_list_ids = [var.cloudfront_prefix_list_id]
      description     = "App port - CloudFront IPs only"
    }
  ]
}

# ─── WAF WebACL (us-east-1 필수) ─────────────────────────────
module "waf" {
  source     = "../../modules/waf"
  providers  = { aws = aws.us_east_1 }
  env_name   = local.env_name
  rate_limit = var.waf_rate_limit
}

# ─── Frontend S3 (비공개 + CloudFront OAC) ───────────────────
module "frontend_s3" {
  source                    = "../../modules/s3"
  bucket_name               = local.frontend_bucket_name
  env_name                  = local.env_name
  block_public_access       = true
  enable_static_website     = false
  enable_public_read_policy = false
}

# ─── File Storage S3 (보안: EC2 role만 허용) ─────────────────
module "storage_s3" {
  source                    = "../../modules/s3"
  bucket_name               = var.storage_bucket_name
  env_name                  = local.env_name
  block_public_access       = true
  enable_static_website     = false
  enable_public_read_policy = false
}

# ─── CloudFront Distribution ─────────────────────────────────
module "cloudfront" {
  source                 = "../../modules/cloudfront"
  env_name               = local.env_name
  frontend_bucket_domain = module.frontend_s3.bucket_regional_domain
  ec2_origin_domain      = module.ec2.public_dns
  waf_web_acl_arn        = module.waf.web_acl_arn
}

# ─── S3 Frontend Bucket Policy (CloudFront OAC) ──────────────
# CloudFront 배포 ARN이 필요하므로 module.cloudfront 완료 후 생성
resource "aws_s3_bucket_policy" "frontend_oac" {
  bucket = module.frontend_s3.bucket_id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid    = "AllowCloudFrontOAC"
      Effect = "Allow"
      Principal = {
        Service = "cloudfront.amazonaws.com"
      }
      Action   = "s3:GetObject"
      Resource = "${module.frontend_s3.bucket_arn}/*"
      Condition = {
        StringEquals = {
          "AWS:SourceArn" = module.cloudfront.distribution_arn
        }
      }
    }]
  })

  depends_on = [module.cloudfront, module.frontend_s3]
}

# ─── S3 Storage Bucket Policy (EC2 Role만 허용) ──────────────
resource "aws_s3_bucket_policy" "storage_ec2_only" {
  bucket = module.storage_s3.bucket_id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid    = "AllowEC2RoleOnly"
      Effect = "Allow"
      Principal = {
        AWS = module.ec2.iam_role_arn
      }
      Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"]
      Resource = [
        module.storage_s3.bucket_arn,
        "${module.storage_s3.bucket_arn}/*"
      ]
    }]
  })

  depends_on = [module.ec2, module.storage_s3]
}

# ─── EC2 (백엔드 + PostgreSQL) ───────────────────────────────
# CloudFront 도메인이 CORS_ORIGIN에 필요 → module.cloudfront 먼저 생성됨
module "ec2" {
  source            = "../../modules/ec2"
  env_name          = local.env_name
  aws_region        = var.aws_region
  subnet_id         = module.network.subnet_id
  security_group_id = module.network.security_group_id
  ecr_registry      = local.ecr_registry
  s3_bucket_name    = var.storage_bucket_name
  cors_origin       = "https://${module.cloudfront.domain_name}"
  jwt_secret        = var.jwt_secret
  db_password       = var.db_password
}
