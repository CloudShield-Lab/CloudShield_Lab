variable "env_name" {
  description = "Environment name"
  type        = string
}

variable "s3_bucket_name" {
  description = "Frontend S3 bucket name"
  type        = string
}

variable "s3_bucket_arn" {
  description = "Frontend S3 bucket ARN"
  type        = string
}

variable "s3_bucket_regional_domain" {
  description = "Frontend S3 bucket regional domain name"
  type        = string
}

variable "ec2_ip" {
  description = "EC2 Elastic IP address"
  type        = string
}

variable "waf_acl_arn" {
  description = "WAF WebACL ARN (must be us-east-1)"
  type        = string
}
