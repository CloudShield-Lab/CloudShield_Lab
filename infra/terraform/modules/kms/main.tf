terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

data "aws_caller_identity" "current" {}

resource "aws_kms_key" "main" {
  description             = "KMS key for SentinelShare ${var.env_name} ${var.key_purpose}"
  deletion_window_in_days = 7
  enable_key_rotation     = true

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "EnableRootPermissions"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
    ]
  })

  tags = {
    Name        = "sentinelshare-tf-${var.env_name}-${var.key_purpose}-kms"
    Environment = var.env_name
    ManagedBy   = "terraform"
  }
}

resource "aws_kms_alias" "main" {
  name          = "alias/sentinelshare-${var.env_name}-${var.key_purpose}"
  target_key_id = aws_kms_key.main.key_id
}
