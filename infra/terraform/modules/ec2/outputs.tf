output "instance_id" {
  description = "EC2 instance ID"
  value       = aws_instance.main.id
}

output "elastic_ip" {
  description = "Elastic IP address"
  value       = aws_eip.main.public_ip
}

output "public_dns" {
  description = "EC2 public DNS"
  value       = aws_instance.main.public_dns
}

output "role_arn" {
  description = "IAM role ARN for EC2"
  value       = aws_iam_role.ec2.arn
}

output "instance_profile_name" {
  description = "IAM instance profile name"
  value       = aws_iam_instance_profile.ec2.name
}
