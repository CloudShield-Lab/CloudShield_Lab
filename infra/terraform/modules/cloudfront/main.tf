terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# OAC (Origin Access Control) for S3
resource "aws_cloudfront_origin_access_control" "s3" {
  name                              = "sentinelshare-tf-${var.env_name}-oac"
  description                       = "OAC for SentinelShare ${var.env_name} frontend S3"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# CloudFront Distribution
resource "aws_cloudfront_distribution" "main" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "SentinelShare TF ${var.env_name}"
  default_root_object = "index.html"
  web_acl_id          = var.waf_acl_arn
  price_class         = "PriceClass_200"

  # Origin 1: S3 프론트엔드 버킷
  origin {
    domain_name              = var.s3_bucket_regional_domain
    origin_id                = "S3-${var.s3_bucket_name}"
    origin_access_control_id = aws_cloudfront_origin_access_control.s3.id
  }

  # Origin 2: EC2 백엔드 (HTTP:3000)
  origin {
    domain_name = var.ec2_ip
    origin_id   = "EC2-Backend"

    custom_origin_config {
      http_port              = 3000
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  # Behavior: /api/* → EC2
  ordered_cache_behavior {
    path_pattern     = "/api/*"
    target_origin_id = "EC2-Backend"
    allowed_methods  = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods   = ["GET", "HEAD"]
    compress         = false

    forwarded_values {
      query_string = true
      headers      = ["Authorization", "Content-Type", "Origin"]
      cookies {
        forward = "all"
      }
    }

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 0
    max_ttl                = 0
  }

  # Default: /* → S3
  default_cache_behavior {
    target_origin_id       = "S3-${var.s3_bucket_name}"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    viewer_protocol_policy = "redirect-to-https"

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    min_ttl     = 0
    default_ttl = 86400
    max_ttl     = 31536000
  }

  # SPA 라우팅: 403/404 → /index.html
  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = {
    Name        = "sentinelshare-tf-${var.env_name}-cf"
    Environment = var.env_name
    ManagedBy   = "terraform"
  }
}

# S3 버킷 정책: CloudFront OAC 허용
resource "aws_s3_bucket_policy" "frontend_oac" {
  bucket = var.s3_bucket_name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid    = "AllowCloudFrontOAC"
      Effect = "Allow"
      Principal = {
        Service = "cloudfront.amazonaws.com"
      }
      Action   = "s3:GetObject"
      Resource = "${var.s3_bucket_arn}/*"
      Condition = {
        StringEquals = {
          "AWS:SourceArn" = aws_cloudfront_distribution.main.arn
        }
      }
    }]
  })
}
