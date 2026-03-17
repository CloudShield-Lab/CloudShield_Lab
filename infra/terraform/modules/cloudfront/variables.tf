variable "env_name" {
  description = "Environment name"
  type        = string
}

variable "frontend_bucket_domain" {
  description = "S3 bucket regional domain name for CloudFront OAC origin"
  type        = string
}

variable "ec2_origin_domain" {
  description = "EC2 Elastic IP address for API origin"
  type        = string
}

variable "waf_web_acl_arn" {
  description = "WAF WebACL ARN to associate with CloudFront (must be in us-east-1)"
  type        = string
}
