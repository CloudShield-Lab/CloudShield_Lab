variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-northeast-2"
}

variable "db_password" {
  description = "Persistent database password secret value"
  type        = string
  sensitive   = true
}

variable "jwt_secret" {
  description = "Persistent JWT signing secret value"
  type        = string
  sensitive   = true
}
