output "instance_id" {
  description = "EC2 instance ID"
  value       = aws_instance.main.id
}

output "public_ip" {
  description = "Elastic IP address"
  value       = aws_eip.main.public_ip
}

output "public_dns" {
  description = "EIP DNS hostname for CloudFront custom origin (IP 주소는 CloudFront origin에 사용 불가)"
  value       = "ec2-${replace(aws_eip.main.public_ip, ".", "-")}.${var.aws_region}.compute.amazonaws.com"
}

output "iam_role_arn" {
  description = "IAM role ARN for EC2 (used in S3 bucket policy)"
  value       = aws_iam_role.ec2.arn
}

output "instance_profile_name" {
  description = "IAM instance profile name"
  value       = aws_iam_instance_profile.ec2.name
}
