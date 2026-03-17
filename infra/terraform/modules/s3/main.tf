terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# ─── 파일 버킷 ───────────────────────────────────────────────

resource "aws_s3_bucket" "files" {
  bucket        = "sentinelshare-tf-${var.env_name}-files"
  force_destroy = true

  tags = {
    Name        = "sentinelshare-tf-${var.env_name}-files"
    Environment = var.env_name
    ManagedBy   = "terraform"
  }
}

resource "aws_s3_bucket_public_access_block" "files" {
  bucket = aws_s3_bucket.files.id

  block_public_acls       = var.block_public_access
  block_public_policy     = var.block_public_access
  ignore_public_acls      = var.block_public_access
  restrict_public_buckets = var.block_public_access
}

# 취약 환경: 퍼블릭 read 정책
resource "aws_s3_bucket_policy" "files_public" {
  count  = var.block_public_access ? 0 : 1
  bucket = aws_s3_bucket.files.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "PublicRead"
      Effect    = "Allow"
      Principal = "*"
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.files.arn}/*"
    }]
  })

  depends_on = [aws_s3_bucket_public_access_block.files]
}

# 보안 환경: EC2 IAM Role만 허용
resource "aws_s3_bucket_policy" "files_private" {
  count  = var.block_public_access ? 1 : 0
  bucket = aws_s3_bucket.files.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid    = "EC2RoleAccess"
      Effect = "Allow"
      Principal = {
        AWS = var.ec2_role_arn
      }
      Action = [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ]
      Resource = [
        aws_s3_bucket.files.arn,
        "${aws_s3_bucket.files.arn}/*"
      ]
    }]
  })

  depends_on = [aws_s3_bucket_public_access_block.files]
}

resource "aws_s3_bucket_cors_configuration" "files" {
  bucket = aws_s3_bucket.files.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "POST", "DELETE"]
    allowed_origins = [var.cors_origin]
    max_age_seconds = 3000
  }
}

# ─── 프론트엔드 버킷 ─────────────────────────────────────────

resource "aws_s3_bucket" "frontend" {
  bucket        = "sentinelshare-tf-${var.env_name}-frontend"
  force_destroy = true

  tags = {
    Name        = "sentinelshare-tf-${var.env_name}-frontend"
    Environment = var.env_name
    ManagedBy   = "terraform"
  }
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  # 취약 환경: 퍼블릭 접근 허용 (static website hosting)
  # 보안 환경: CloudFront OAC 통해서만 접근 (퍼블릭 차단)
  block_public_acls       = var.block_public_access
  block_public_policy     = var.block_public_access
  ignore_public_acls      = var.block_public_access
  restrict_public_buckets = var.block_public_access
}

# 취약 환경: S3 웹사이트 호스팅
resource "aws_s3_bucket_website_configuration" "frontend" {
  count  = var.block_public_access ? 0 : 1
  bucket = aws_s3_bucket.frontend.id

  index_document { suffix = "index.html" }
  error_document { key    = "index.html" }
}

resource "aws_s3_bucket_policy" "frontend_public" {
  count  = var.block_public_access ? 0 : 1
  bucket = aws_s3_bucket.frontend.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "PublicRead"
      Effect    = "Allow"
      Principal = "*"
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.frontend.arn}/*"
    }]
  })

  depends_on = [aws_s3_bucket_public_access_block.frontend]
}
