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

output "cloudfront_domain" {
  description = "CloudFront distribution domain"
  value       = module.cloudfront.cloudfront_domain
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID"
  value       = module.cloudfront.distribution_id
}

output "backend_url" {
  description = "Backend API URL (via CloudFront)"
  value       = "https://${module.cloudfront.cloudfront_domain}/api"
}

output "frontend_url" {
  description = "Frontend URL (via CloudFront)"
  value       = "https://${module.cloudfront.cloudfront_domain}"
}

output "secrets_kms_key_arn" {
  description = "KMS key ARN for secure environment application secrets"
  value       = data.terraform_remote_state.secure_kms.outputs.secrets_kms_key_arn
}

output "data_kms_key_arn" {
  description = "KMS key ARN for secure environment files bucket encryption"
  value       = data.terraform_remote_state.secure_kms.outputs.data_kms_key_arn
}

output "ebs_kms_key_arn" {
  description = "KMS key ARN for secure environment root volume encryption"
  value       = data.terraform_remote_state.secure_kms.outputs.ebs_kms_key_arn
}

output "db_password_secret_name" {
  description = "Secrets Manager secret name for secure DB password"
  value       = data.terraform_remote_state.secure_kms.outputs.db_password_secret_name
}

output "jwt_secret_secret_name" {
  description = "Secrets Manager secret name for secure JWT secret"
  value       = data.terraform_remote_state.secure_kms.outputs.jwt_secret_secret_name
}
