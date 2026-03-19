variable "env_name" {
  description = "Environment name (vul or secure)"
  type        = string
}

variable "env_type" {
  description = "Environment type label (vulnerable or secure)"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "subnet_id" {
  description = "Subnet ID"
  type        = string
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-northeast-2"
}

variable "ami_id" {
  description = "AMI ID for Ubuntu 22.04 LTS in ap-northeast-2"
  type        = string
  # Ubuntu 22.04 LTS ap-northeast-2 최신 (2024)
  default = "ami-042e76978adeb8c48"
}

variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t3.small"
}

variable "allow_public_access" {
  description = "Allow public access to port 3000 (true = vulnerable, false = secure/CloudFront only)"
  type        = bool
  default     = true
}

variable "cloudfront_prefix_list_id" {
  description = "CloudFront managed prefix list ID (ap-northeast-2: pl-22a6434b)"
  type        = string
  default     = "pl-22a6434b"
}

variable "files_bucket_name" {
  description = "S3 files bucket name for IAM policy"
  type        = string
}

variable "db_password" {
  description = "PostgreSQL database password"
  type        = string
  sensitive   = true
  default     = ""
}

variable "jwt_secret" {
  description = "JWT signing secret"
  type        = string
  sensitive   = true
  default     = ""
}

variable "db_password_secret_name" {
  description = "Secrets Manager secret name for the database password"
  type        = string
  default     = ""
}

variable "jwt_secret_secret_name" {
  description = "Secrets Manager secret name for the JWT secret"
  type        = string
  default     = ""
}

variable "secrets_kms_key_arn" {
  description = "KMS key ARN used to encrypt Secrets Manager secrets"
  type        = string
  default     = ""
}

variable "frontend_origin" {
  description = "Frontend origin URL allowed by backend CORS"
  type        = string
}

variable "wazuh_manager_ip" {
  description = "Wazuh 매니저 서버 IP (비어있으면 에이전트 미설치)"
  type        = string
  default     = ""
}
