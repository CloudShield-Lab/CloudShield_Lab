variable "env_name" {
  description = "Environment name (e.g., vulnerable, secure)"
  type        = string
}

variable "aws_region" {
  description = "AWS region"
  type        = string
}

variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t3.small"
}

variable "subnet_id" {
  description = "Subnet ID to launch the instance in"
  type        = string
}

variable "security_group_id" {
  description = "Security group ID for EC2"
  type        = string
}

variable "ecr_registry" {
  description = "ECR registry URL (e.g., 833453046706.dkr.ecr.ap-northeast-2.amazonaws.com)"
  type        = string
}

variable "s3_bucket_name" {
  description = "S3 bucket name for file storage (set in .env)"
  type        = string
}

variable "cors_origin" {
  description = "CORS_ORIGIN value for the backend .env"
  type        = string
}

variable "jwt_secret" {
  description = "JWT signing secret"
  type        = string
  sensitive   = true
}

variable "db_password" {
  description = "PostgreSQL password for sentinelshare user"
  type        = string
  sensitive   = true
}
