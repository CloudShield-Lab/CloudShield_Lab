variable "bucket_name" {
  description = "S3 bucket name"
  type        = string
}

variable "env_name" {
  description = "Environment name for tagging"
  type        = string
}

variable "block_public_access" {
  description = "Whether to block all public access (true = secure, false = vulnerable)"
  type        = bool
  default     = true
}

variable "enable_static_website" {
  description = "Whether to enable static website hosting"
  type        = bool
  default     = false
}

variable "enable_public_read_policy" {
  description = "Whether to add a public GetObject bucket policy"
  type        = bool
  default     = false
}
