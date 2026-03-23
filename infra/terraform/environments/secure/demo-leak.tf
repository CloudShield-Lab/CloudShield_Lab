# ============================================================
# [DEMO] Trivy Secret Scan Detection Test
# These are ALL FAKE values for CI pipeline demonstration.
# None of these credentials are real or have ever been valid.
# ============================================================

variable "leaked_aws_access_key" {
  description = "[DEMO] Fake AWS access key to trigger Trivy secret scan"
  default     = "AKIAIOSFODNN7EXAMPLE"
}

variable "leaked_aws_secret_key" {
  description = "[DEMO] Fake AWS secret key to trigger Trivy secret scan"
  default     = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
}

variable "leaked_github_token" {
  description = "[DEMO] Fake GitHub PAT to trigger Trivy secret scan"
  default     = "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef12"
}
