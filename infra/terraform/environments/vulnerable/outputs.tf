output "ec2_instance_id" {
  description = "EC2 instance ID"
  value       = module.ec2.instance_id
}

output "elastic_ip" {
  description = "EC2 Elastic IP"
  value       = module.ec2.elastic_ip
}

output "files_bucket_name" {
  description = "S3 files bucket name"
  value       = module.s3.files_bucket_name
}

output "frontend_bucket_name" {
  description = "S3 frontend bucket name"
  value       = module.s3.frontend_bucket_name
}

output "frontend_url" {
  description = "Frontend URL (S3 website)"
  value       = "http://${module.s3.frontend_website_endpoint}"
}

output "backend_url" {
  description = "Backend API URL"
  value       = "http://${module.ec2.elastic_ip}:3000"
}
