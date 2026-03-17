output "bucket_id" {
  description = "S3 bucket ID (name)"
  value       = aws_s3_bucket.main.id
}

output "bucket_arn" {
  description = "S3 bucket ARN"
  value       = aws_s3_bucket.main.arn
}

output "bucket_regional_domain" {
  description = "S3 bucket regional domain name (for CloudFront OAC origin)"
  value       = aws_s3_bucket.main.bucket_regional_domain_name
}

output "website_endpoint" {
  description = "S3 static website endpoint URL (only set if enable_static_website = true)"
  value = (
    var.enable_static_website
    ? "http://${aws_s3_bucket_website_configuration.main[0].website_endpoint}"
    : ""
  )
}
