output "files_bucket_name" {
  description = "Files S3 bucket name"
  value       = aws_s3_bucket.files.id
}

output "files_bucket_arn" {
  description = "Files S3 bucket ARN"
  value       = aws_s3_bucket.files.arn
}

output "frontend_bucket_name" {
  description = "Frontend S3 bucket name"
  value       = aws_s3_bucket.frontend.id
}

output "frontend_bucket_arn" {
  description = "Frontend S3 bucket ARN"
  value       = aws_s3_bucket.frontend.arn
}

output "frontend_website_endpoint" {
  description = "Frontend S3 website endpoint (vulnerable only)"
  value       = var.block_public_access ? "" : try(aws_s3_bucket_website_configuration.frontend[0].website_endpoint, "")
}
