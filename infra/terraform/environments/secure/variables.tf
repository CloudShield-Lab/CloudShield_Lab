variable "aws_region" {
  description = "AWS region (main)"
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
  default     = "sentinel-share-secure-files"
}

# CloudFront 관리형 프리픽스 리스트 (ap-northeast-2)
variable "cloudfront_prefix_list_id" {
  description = "AWS managed prefix list ID for CloudFront IPs in ap-northeast-2"
  type        = string
  default     = "pl-22a6434b"
}

variable "waf_rate_limit" {
  description = "WAF rate-based rule: max requests per 5 minutes per IP"
  type        = number
  default     = 2000
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
