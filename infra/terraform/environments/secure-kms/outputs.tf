output "secrets_kms_key_arn" {
  description = "KMS key ARN for secure environment application secrets"
  value       = module.kms.key_arn
}

output "secrets_kms_alias_name" {
  description = "KMS alias name for secure environment application secrets"
  value       = module.kms.alias_name
}

output "data_kms_key_arn" {
  description = "KMS key ARN for secure environment files bucket encryption"
  value       = module.kms_data.key_arn
}

output "data_kms_alias_name" {
  description = "KMS alias name for secure environment files bucket encryption"
  value       = module.kms_data.alias_name
}

output "ebs_kms_key_arn" {
  description = "KMS key ARN for secure environment root volume encryption"
  value       = module.kms_ebs.key_arn
}

output "ebs_kms_alias_name" {
  description = "KMS alias name for secure environment root volume encryption"
  value       = module.kms_ebs.alias_name
}

output "db_password_secret_name" {
  description = "Persistent secret name for the secure database password"
  value       = module.secrets.db_password_secret_name
}

output "db_password_secret_arn" {
  description = "Persistent secret ARN for the secure database password"
  value       = module.secrets.db_password_secret_arn
}

output "jwt_secret_secret_name" {
  description = "Persistent secret name for the secure JWT secret"
  value       = module.secrets.jwt_secret_secret_name
}

output "jwt_secret_secret_arn" {
  description = "Persistent secret ARN for the secure JWT secret"
  value       = module.secrets.jwt_secret_secret_arn
}
