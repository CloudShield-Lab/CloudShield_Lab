output "ec2_instance_id" {
  description = "EC2 instance ID → GitHub Secret: SECURE_EC2_INSTANCE_ID"
  value       = module.ec2.instance_id
}

output "ec2_public_ip" {
  description = "EC2 Elastic IP address"
  value       = module.ec2.public_ip
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID → GitHub Secret: CLOUDFRONT_DISTRIBUTION_ID"
  value       = module.cloudfront.distribution_id
}

output "cloudfront_domain_name" {
  description = "CloudFront domain name (e.g., xxxxx.cloudfront.net)"
  value       = module.cloudfront.domain_name
}

output "waf_web_acl_arn" {
  description = "WAF WebACL ARN"
  value       = module.waf.web_acl_arn
}

output "storage_bucket_name" {
  description = "File storage S3 bucket name"
  value       = module.storage_s3.bucket_id
}
