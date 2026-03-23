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
    key    = "vulnerable/terraform.tfstate"
    region = "ap-northeast-2"
  }
}

provider "aws" {
  region = var.aws_region
}

module "network" {
  source         = "../../modules/network"
  env_name       = "vul"
  aws_region     = var.aws_region
  wazuh_vpc_id   = var.wazuh_vpc_id
}

module "s3" {
  source              = "../../modules/s3"
  env_name            = "vul"
  block_public_access = false
}

module "ec2" {
  source               = "../../modules/ec2"
  env_name             = "vul"
  env_type             = "vulnerable"
  vpc_id               = module.network.vpc_id
  subnet_id            = module.network.subnet_id
  aws_region           = var.aws_region
  allow_public_access  = true
  files_bucket_name    = module.s3.files_bucket_name
  secret_delivery_mode = "raw"
  db_password          = var.db_password
  jwt_secret           = var.jwt_secret
  frontend_origin      = "*"
  wazuh_manager_ip     = var.wazuh_manager_ip
}
