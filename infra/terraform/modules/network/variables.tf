variable "env_name" {
  description = "Environment name (e.g., vulnerable, secure)"
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

variable "az" {
  description = "Availability zone"
  type        = string
  default     = "ap-northeast-2a"
}

variable "ingress_rules" {
  description = "Ingress rules for EC2 security group"
  type = list(object({
    from_port       = number
    to_port         = number
    protocol        = string
    cidr_blocks     = list(string)
    prefix_list_ids = list(string)
    description     = string
  }))
}
