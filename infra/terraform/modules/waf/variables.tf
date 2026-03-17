variable "env_name" {
  description = "Environment name"
  type        = string
}

variable "rate_limit" {
  description = "Maximum number of requests per 5-minute window per IP before blocking"
  type        = number
  default     = 2000
}
