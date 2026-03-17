terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  backend "s3" {
    bucket = "sentinelshare-terraform-state"
    key    = "vulnerable/terraform.tfstate"
    region = "ap-northeast-2"
  }
}

provider "aws" {
  region = var.aws_region
}

module "network" {
  source     = "../../modules/network"
  env_name   = "vul"
  aws_region = var.aws_region
}

module "s3" {
  source              = "../../modules/s3"
  env_name            = "vul"
  block_public_access = false
  ec2_role_arn        = module.ec2.role_arn
  cors_origin         = "http://${module.ec2.elastic_ip}:3000"
}

module "ec2" {
  source              = "../../modules/ec2"
  env_name            = "vul"
  env_type            = "vulnerable"
  vpc_id              = module.network.vpc_id
  subnet_id           = module.network.subnet_id
  aws_region          = var.aws_region
  allow_public_access = true
  files_bucket_name   = module.s3.files_bucket_name
  db_password         = var.db_password
  jwt_secret          = var.jwt_secret
  cors_origin         = "http://${module.s3.frontend_website_endpoint}"
}
