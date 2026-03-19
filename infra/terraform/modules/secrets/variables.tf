variable "env_name" {
  description = "Environment name"
  type        = string
}

variable "kms_key_arn" {
  description = "KMS key ARN used to encrypt the secrets"
  type        = string
}

variable "db_password" {
  description = "Database password to store"
  type        = string
  sensitive   = true
}

variable "jwt_secret" {
  description = "JWT secret to store"
  type        = string
  sensitive   = true
}

variable "db_password_secret_name" {
  description = "Secret name to use for the database password"
  type        = string
  default     = ""
}

variable "jwt_secret_secret_name" {
  description = "Secret name to use for the JWT secret"
  type        = string
  default     = ""
}
