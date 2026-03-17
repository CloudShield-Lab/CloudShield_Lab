output "ec2_instance_id" {
  description = "EC2 instance ID → GitHub Secret: VULN_EC2_INSTANCE_ID"
  value       = module.ec2.instance_id
}

output "ec2_public_ip" {
  description = "EC2 Elastic IP address"
  value       = module.ec2.public_ip
}

output "vuln_api_url" {
  description = "Backend API URL → GitHub Secret: VULN_API_URL"
  value       = "http://${module.ec2.public_ip}:3000/api"
}

output "frontend_website_url" {
  description = "Frontend S3 static website URL"
  value       = module.frontend_s3.website_endpoint
}

output "storage_bucket_name" {
  description = "File storage S3 bucket name"
  value       = module.storage_s3.bucket_id
}
