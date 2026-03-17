terraform {
  required_version = ">= 1.6"
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

# WAF는 us-east-1에 생성 (CloudFront 연결 필수)
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}

module "network" {
  source     = "../../modules/network"
  env_name   = "secure"
  aws_region = var.aws_region
}

module "s3" {
  source              = "../../modules/s3"
  env_name            = "secure"
  block_public_access = true
  ec2_role_arn        = module.ec2.role_arn
  cors_origin         = "https://${module.cloudfront.cloudfront_domain}"
}

module "waf" {
  source = "../../modules/waf"
  providers = {
    aws.us_east_1 = aws.us_east_1
  }
  env_name = "secure"
}

module "cloudfront" {
  source                    = "../../modules/cloudfront"
  env_name                  = "secure"
  s3_bucket_name            = module.s3.frontend_bucket_name
  s3_bucket_arn             = module.s3.frontend_bucket_arn
  s3_bucket_regional_domain = "${module.s3.frontend_bucket_name}.s3.${var.aws_region}.amazonaws.com"
  ec2_ip                    = module.ec2.elastic_ip
  waf_acl_arn               = module.waf.web_acl_arn
}

module "ec2" {
  source              = "../../modules/ec2"
  env_name            = "secure"
  env_type            = "secure"
  vpc_id              = module.network.vpc_id
  subnet_id           = module.network.subnet_id
  aws_region          = var.aws_region
  allow_public_access = false
  files_bucket_name   = module.s3.files_bucket_name
  db_password         = var.db_password
  jwt_secret          = var.jwt_secret
  cors_origin         = "https://${module.cloudfront.cloudfront_domain}"
}
