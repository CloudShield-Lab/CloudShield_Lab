terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  backend "s3" {
    bucket = "sentinelshare-terraform-state-833453046706-ap-northeast-2-an"
    key    = "secure/terraform.tfstate"
    region = "ap-northeast-2"
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

data "terraform_remote_state" "secure_kms" {
  backend = "s3"

  config = {
    bucket = "sentinelshare-terraform-state-833453046706-ap-northeast-2-an"
    key    = "secure-kms/terraform.tfstate"
    region = var.aws_region
  }
}

module "network" {
  source         = "../../modules/network"
  env_name       = "secure"
  aws_region     = var.aws_region
  wazuh_vpc_id   = var.wazuh_vpc_id
}

module "s3" {
  source                = "../../modules/s3"
  env_name              = "secure"
  block_public_access   = true
  enable_kms_encryption = true
  kms_key_arn           = data.terraform_remote_state.secure_kms.outputs.data_kms_key_arn
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
  ec2_ip                    = module.ec2.elastic_ip_dns
  waf_acl_arn               = module.waf.web_acl_arn
}

module "ec2" {
  source                  = "../../modules/ec2"
  env_name                = "secure"
  env_type                = "secure"
  vpc_id                  = module.network.vpc_id
  subnet_id               = module.network.subnet_id
  aws_region              = var.aws_region
  allow_public_access     = false
  files_bucket_name       = module.s3.files_bucket_name
  secret_delivery_mode    = "secrets_manager"
  db_password_secret_name = data.terraform_remote_state.secure_kms.outputs.db_password_secret_name
  jwt_secret_secret_name  = data.terraform_remote_state.secure_kms.outputs.jwt_secret_secret_name
  secrets_kms_key_arn     = data.terraform_remote_state.secure_kms.outputs.secrets_kms_key_arn
  data_kms_key_arn        = data.terraform_remote_state.secure_kms.outputs.data_kms_key_arn
  enable_data_kms_access  = true
  root_volume_encrypted   = true
  root_volume_kms_key_id  = data.terraform_remote_state.secure_kms.outputs.ebs_kms_key_arn
  wazuh_manager_ip        = var.wazuh_manager_ip
}
