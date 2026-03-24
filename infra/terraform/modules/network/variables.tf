variable "env_name" {
  description = "Environment name (vul or secure)"
  type        = string
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "subnet_cidr" {
  description = "CIDR block for the public subnet"
  type        = string
  default     = "10.0.1.0/24"
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-northeast-2"
}

variable "wazuh_vpc_id" {
  description = "Wazuh Manager VPC ID (비어있으면 피어링 미생성)"
  type        = string
  default     = ""
}

variable "wazuh_vpc_cidr" {
  description = "Wazuh Manager VPC CIDR"
  type        = string
  default     = "10.1.0.0/16"
}
