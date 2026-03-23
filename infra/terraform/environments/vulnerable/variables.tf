variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-northeast-2"
}

variable "db_password" {
  description = "PostgreSQL database password"
  type        = string
  sensitive   = true
}

variable "jwt_secret" {
  description = "JWT signing secret"
  type        = string
  sensitive   = true
}

variable "wazuh_manager_ip" {
  description = "Wazuh 매니저 서버 IP (비어있으면 에이전트 미설치)"
  type        = string
  default     = ""
}

variable "wazuh_vpc_id" {
  description = "Wazuh Manager VPC ID (비어있으면 피어링 미생성)"
  type        = string
  default     = ""
}
