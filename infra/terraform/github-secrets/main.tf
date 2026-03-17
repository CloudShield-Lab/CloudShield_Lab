terraform {
  required_version = ">= 1.5.0"
  required_providers {
    github = {
      source  = "integrations/github"
      version = "~> 6.0"
    }
  }
}

# GITHUB_TOKEN 환경변수로 인증
# export GITHUB_TOKEN=ghp_xxxx
provider "github" {
  owner = var.github_owner
}

# ─── VULN_EC2_INSTANCE_ID ────────────────────────────────────
resource "github_actions_secret" "vuln_ec2_instance_id" {
  repository      = var.github_repo
  secret_name     = "VULN_EC2_INSTANCE_ID"
  plaintext_value = var.vuln_ec2_instance_id
}

# ─── SECURE_EC2_INSTANCE_ID ──────────────────────────────────
resource "github_actions_secret" "secure_ec2_instance_id" {
  repository      = var.github_repo
  secret_name     = "SECURE_EC2_INSTANCE_ID"
  plaintext_value = var.secure_ec2_instance_id
}

# ─── VULN_API_URL ────────────────────────────────────────────
resource "github_actions_secret" "vuln_api_url" {
  repository      = var.github_repo
  secret_name     = "VULN_API_URL"
  plaintext_value = "http://${var.vuln_ec2_public_ip}:3000/api"
}

# ─── CLOUDFRONT_DISTRIBUTION_ID ──────────────────────────────
resource "github_actions_secret" "cloudfront_distribution_id" {
  repository      = var.github_repo
  secret_name     = "CLOUDFRONT_DISTRIBUTION_ID"
  plaintext_value = var.cloudfront_distribution_id
}
