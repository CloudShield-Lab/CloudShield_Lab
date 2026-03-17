resource "aws_s3_bucket" "main" {
  bucket        = var.bucket_name
  force_destroy = true

  tags = {
    Name        = var.bucket_name
    Environment = var.env_name
  }
}

resource "aws_s3_bucket_public_access_block" "main" {
  bucket = aws_s3_bucket.main.id

  block_public_acls       = var.block_public_access
  block_public_policy     = var.block_public_access
  ignore_public_acls      = var.block_public_access
  restrict_public_buckets = var.block_public_access
}

# 정적 웹사이트 호스팅 (취약 환경 프론트엔드용)
resource "aws_s3_bucket_website_configuration" "main" {
  count  = var.enable_static_website ? 1 : 0
  bucket = aws_s3_bucket.main.id

  index_document { suffix = "index.html" }
  error_document { key = "index.html" }
}

# 퍼블릭 읽기 정책 (취약 환경 프론트엔드 + 파일 버킷)
resource "aws_s3_bucket_policy" "public_read" {
  count  = var.enable_public_read_policy ? 1 : 0
  bucket = aws_s3_bucket.main.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "PublicReadGetObject"
      Effect    = "Allow"
      Principal = "*"
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.main.arn}/*"
    }]
  })

  depends_on = [aws_s3_bucket_public_access_block.main]
}
