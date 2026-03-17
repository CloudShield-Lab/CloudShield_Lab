variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-northeast-2"
}

variable "aws_account_id" {
  description = "AWS account ID"
  type        = string
  default     = "833453046706"
}

variable "storage_bucket_name" {
  description = "S3 bucket name for file storage (user uploads)"
  type        = string
  default     = "sentinel-share-vul-files"
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
