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
    key    = "secure-kms/terraform.tfstate"
    region = "ap-northeast-2"
  }
}

provider "aws" {
  region = var.aws_region
}

module "kms" {
  source   = "../../modules/kms"
  env_name = "secure"
}

module "kms_data" {
  source      = "../../modules/kms"
  env_name    = "secure"
  key_purpose = "data"
}

module "kms_ebs" {
  source      = "../../modules/kms"
  env_name    = "secure"
  key_purpose = "ebs"
}

module "secrets" {
  source                  = "../../modules/secrets"
  env_name                = "secure"
  kms_key_arn             = module.kms.key_arn
  db_password             = var.db_password
  jwt_secret              = var.jwt_secret
  db_password_secret_name = "secure-tf-db-password"
  jwt_secret_secret_name  = "secure-tf-jwt-secret"
}
