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
  description = "Optional EC2 IAM role ARN (used only when a private bucket policy is explicitly enabled)"
  type        = string
  default     = ""
}

variable "cors_origin" {
  description = "Optional CORS allowed origin for files bucket"
  type        = string
  default     = ""
}
