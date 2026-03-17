variable "github_owner" {
  description = "GitHub organization or username"
  type        = string
}

variable "github_repo" {
  description = "GitHub repository name (e.g., CloudShield_Lab)"
  type        = string
  default     = "CloudShield_Lab"
}

variable "vuln_ec2_instance_id" {
  description = "Vulnerable EC2 instance ID (from environments/vulnerable output)"
  type        = string
}

variable "secure_ec2_instance_id" {
  description = "Secure EC2 instance ID (from environments/secure output)"
  type        = string
}

variable "vuln_ec2_public_ip" {
  description = "Vulnerable EC2 Elastic IP (from environments/vulnerable output)"
  type        = string
}

variable "cloudfront_distribution_id" {
  description = "CloudFront distribution ID (from environments/secure output)"
  type        = string
}
