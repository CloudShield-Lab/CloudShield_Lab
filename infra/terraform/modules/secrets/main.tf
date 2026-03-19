terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

resource "aws_secretsmanager_secret" "db_password" {
  name                    = "sentinelshare/${var.env_name}/db-password"
  description             = "Database password for SentinelShare ${var.env_name}"
  kms_key_id              = var.kms_key_arn
  recovery_window_in_days = 7

  tags = {
    Name        = "sentinelshare-${var.env_name}-db-password"
    Environment = var.env_name
    ManagedBy   = "terraform"
  }
}

resource "aws_secretsmanager_secret_version" "db_password" {
  secret_id     = aws_secretsmanager_secret.db_password.id
  secret_string = var.db_password
}

resource "aws_secretsmanager_secret" "jwt_secret" {
  name                    = "sentinelshare/${var.env_name}/jwt-secret"
  description             = "JWT secret for SentinelShare ${var.env_name}"
  kms_key_id              = var.kms_key_arn
  recovery_window_in_days = 7

  tags = {
    Name        = "sentinelshare-${var.env_name}-jwt-secret"
    Environment = var.env_name
    ManagedBy   = "terraform"
  }
}

resource "aws_secretsmanager_secret_version" "jwt_secret" {
  secret_id     = aws_secretsmanager_secret.jwt_secret.id
  secret_string = var.jwt_secret
}
