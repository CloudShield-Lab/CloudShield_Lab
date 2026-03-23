variable "env_name" {
  description = "Environment name"
  type        = string
}

variable "key_purpose" {
  description = "Short purpose name used in the alias, tags, and description"
  type        = string
  default     = "secrets"
}
