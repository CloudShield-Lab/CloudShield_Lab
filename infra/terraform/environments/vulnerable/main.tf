terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

locals {
  env_name             = "vulnerable"
  ecr_registry         = "${var.aws_account_id}.dkr.ecr.${var.aws_region}.amazonaws.com"
  frontend_bucket_name = "sentinel-share-vul-frontend-${var.aws_account_id}"
  frontend_cors_origin = "http://${local.frontend_bucket_name}.s3-website.${var.aws_region}.amazonaws.com"
}

# ─── Network (VPC + SG) ──────────────────────────────────────
module "network" {
  source      = "../../modules/network"
  env_name    = local.env_name
  vpc_cidr    = "10.10.0.0/16"
  subnet_cidr = "10.10.1.0/24"
  az          = "${var.aws_region}a"

  # 취약 환경: 전체 오픈 (의도적 취약 설계)
  ingress_rules = [
    {
      from_port       = 3000
      to_port         = 3000
      protocol        = "tcp"
      cidr_blocks     = ["0.0.0.0/0"]
      prefix_list_ids = []
      description     = "App port - intentionally open (vulnerable demo)"
    },
    {
      from_port       = 80
      to_port         = 80
      protocol        = "tcp"
      cidr_blocks     = ["0.0.0.0/0"]
      prefix_list_ids = []
      description     = "HTTP - intentionally open"
    },
    {
      from_port       = 443
      to_port         = 443
      protocol        = "tcp"
      cidr_blocks     = ["0.0.0.0/0"]
      prefix_list_ids = []
      description     = "HTTPS - intentionally open"
    }
  ]
}

# ─── Frontend S3 (공개 정적 웹사이트) ──────────────────────
module "frontend_s3" {
  source                    = "../../modules/s3"
  bucket_name               = local.frontend_bucket_name
  env_name                  = local.env_name
  block_public_access       = false
  enable_static_website     = true
  enable_public_read_policy = true
}

# ─── File Storage S3 (취약: 퍼블릭 접근 허용) ──────────────
module "storage_s3" {
  source                    = "../../modules/s3"
  bucket_name               = var.storage_bucket_name
  env_name                  = local.env_name
  block_public_access       = false
  enable_static_website     = false
  enable_public_read_policy = false
}

# ─── EC2 (백엔드 + PostgreSQL) ───────────────────────────────
module "ec2" {
  source            = "../../modules/ec2"
  env_name          = local.env_name
  aws_region        = var.aws_region
  subnet_id         = module.network.subnet_id
  security_group_id = module.network.security_group_id
  ecr_registry      = local.ecr_registry
  s3_bucket_name    = var.storage_bucket_name
  cors_origin       = local.frontend_cors_origin
  jwt_secret        = var.jwt_secret
  db_password       = var.db_password
}
