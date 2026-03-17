output "distribution_id" {
  description = "CloudFront distribution ID"
  value       = aws_cloudfront_distribution.main.id
}

output "distribution_arn" {
  description = "CloudFront distribution ARN (used in S3 OAC bucket policy)"
  value       = aws_cloudfront_distribution.main.arn
}

output "domain_name" {
  description = "CloudFront domain name (e.g., xxxxx.cloudfront.net)"
  value       = aws_cloudfront_distribution.main.domain_name
}

output "oac_id" {
  description = "Origin Access Control ID"
  value       = aws_cloudfront_origin_access_control.s3.id
}
