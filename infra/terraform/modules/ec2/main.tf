terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

data "aws_caller_identity" "current" {}

# IAM Role for EC2
resource "aws_iam_role" "ec2" {
  name = "sentinelshare-tf-${var.env_name}-ec2-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
    }]
  })

  tags = {
    Name        = "sentinelshare-tf-${var.env_name}-ec2-role"
    Environment = var.env_name
    ManagedBy   = "terraform"
  }
}

resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.ec2.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy_attachment" "ecr" {
  role       = aws_iam_role.ec2.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
}

resource "aws_iam_role_policy" "s3_access" {
  name = "sentinelshare-tf-${var.env_name}-s3-access"
  role = aws_iam_role.ec2.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ]
      Resource = [
        "arn:aws:s3:::${var.files_bucket_name}",
        "arn:aws:s3:::${var.files_bucket_name}/*"
      ]
    }]
  })
}

resource "aws_iam_instance_profile" "ec2" {
  name = "sentinelshare-tf-${var.env_name}-instance-profile"
  role = aws_iam_role.ec2.name
}

# Security Group
resource "aws_security_group" "ec2" {
  name        = "sentinelshare-tf-${var.env_name}-sg"
  description = "Security group for SentinelShare ${var.env_name} EC2"
  vpc_id      = var.vpc_id

  # SSH (관리용 — 운영 시 제거 권장)
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "SSH"
  }

  # 취약 환경: 포트 3000을 전체 공개 / 보안 환경: CloudFront prefix list만
  dynamic "ingress" {
    for_each = var.allow_public_access ? [1] : []
    content {
      from_port   = 3000
      to_port     = 3000
      protocol    = "tcp"
      cidr_blocks = ["0.0.0.0/0"]
      description = "App port - public (vulnerable)"
    }
  }

  dynamic "ingress" {
    for_each = var.allow_public_access ? [] : [1]
    content {
      from_port       = 3000
      to_port         = 3000
      protocol        = "tcp"
      prefix_list_ids = [var.cloudfront_prefix_list_id]
      description     = "App port - CloudFront only (secure)"
    }
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "All outbound"
  }

  tags = {
    Name        = "sentinelshare-tf-${var.env_name}-sg"
    Environment = var.env_name
    ManagedBy   = "terraform"
  }
}

# EC2 Instance
resource "aws_instance" "main" {
  ami                    = var.ami_id
  instance_type          = var.instance_type
  subnet_id              = var.subnet_id
  vpc_security_group_ids = [aws_security_group.ec2.id]
  iam_instance_profile   = aws_iam_instance_profile.ec2.name

  user_data = templatefile("${path.module}/../../scripts/user_data.sh.tpl", {
    aws_region     = var.aws_region
    aws_account_id = data.aws_caller_identity.current.account_id
    ecr_registry   = "${data.aws_caller_identity.current.account_id}.dkr.ecr.${var.aws_region}.amazonaws.com"
    db_password    = var.db_password
    jwt_secret     = var.jwt_secret
    s3_bucket_name = var.files_bucket_name
    cors_origin    = var.cors_origin
    env_type       = var.env_type
  })

  root_block_device {
    volume_type = "gp3"
    volume_size = 20
  }

  tags = {
    Name        = "sentinelshare-tf-${var.env_name}-ec2"
    Environment = var.env_name
    ManagedBy   = "terraform"
  }
}

# Elastic IP
resource "aws_eip" "main" {
  domain = "vpc"

  tags = {
    Name        = "sentinelshare-tf-${var.env_name}-eip"
    Environment = var.env_name
    ManagedBy   = "terraform"
  }
}

resource "aws_eip_association" "main" {
  instance_id   = aws_instance.main.id
  allocation_id = aws_eip.main.id
}
