variable "env_name" {
  description = "Environment name (vul or secure)"
  type        = string
}

variable "block_public_access" {
  description = "Enable S3 Block Public Access (false = vulnerable, true = secure)"
  type        = bool
  default     = true
}

variable "ec2_role_arn" {
  description = "EC2 IAM role ARN (for secure env bucket policy)"
  type        = string
  default     = ""
}

variable "cors_origin" {
  description = "CORS allowed origin for S3 bucket"
  type        = string
}
