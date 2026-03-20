terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

data "aws_caller_identity" "current" {}

locals {
  secret_arns = compact([
    var.db_password_secret_name != "" ? "arn:aws:secretsmanager:${var.aws_region}:${data.aws_caller_identity.current.account_id}:secret:${var.db_password_secret_name}*" : "",
    var.jwt_secret_secret_name != "" ? "arn:aws:secretsmanager:${var.aws_region}:${data.aws_caller_identity.current.account_id}:secret:${var.jwt_secret_secret_name}*" : "",
  ])
}

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

resource "aws_iam_role_policy" "secrets_access" {
  count = var.secret_delivery_mode == "secrets_manager" ? 1 : 0
  name  = "sentinelshare-tf-${var.env_name}-secrets-access"
  role  = aws_iam_role.ec2.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
        ]
        Resource = local.secret_arns
      },
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
        ]
        Resource = [
          var.secrets_kms_key_arn,
        ]
        Condition = {
          StringEquals = {
            "kms:ViaService" = "secretsmanager.${var.aws_region}.amazonaws.com"
          }
        }
      },
    ]
  })
}

resource "aws_iam_role_policy" "data_kms_access" {
  count = var.enable_data_kms_access ? 1 : 0
  name  = "sentinelshare-tf-${var.env_name}-data-kms-access"
  role  = aws_iam_role.ec2.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:DescribeKey",
          "kms:GenerateDataKey",
        ]
        Resource = [
          var.data_kms_key_arn,
        ]
        Condition = {
          StringEquals = {
            "kms:ViaService" = "s3.${var.aws_region}.amazonaws.com"
          }
        }
      },
    ]
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

  # SSH (취약 환경만 오픈 — 보안 환경은 SSM Session Manager 사용)
  dynamic "ingress" {
    for_each = var.allow_public_access ? [1] : []
    content {
      from_port   = 22
      to_port     = 22
      protocol    = "tcp"
      cidr_blocks = ["0.0.0.0/0"]
      description = "SSH - vulnerable env only"
    }
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

  # Wazuh agent → manager (1514/TCP, 1515/TCP)
  dynamic "egress" {
    for_each = var.wazuh_manager_ip != "" ? [1] : []
    content {
      from_port   = 1514
      to_port     = 1515
      protocol    = "tcp"
      cidr_blocks = ["${var.wazuh_manager_ip}/32"]
      description = "Wazuh agent to manager"
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
    secret_delivery_mode    = var.secret_delivery_mode
    aws_region              = var.aws_region
    aws_account_id          = data.aws_caller_identity.current.account_id
    ecr_registry            = "${data.aws_caller_identity.current.account_id}.dkr.ecr.${var.aws_region}.amazonaws.com"
    db_password             = jsonencode(var.secret_delivery_mode == "raw" ? var.db_password : "")
    jwt_secret              = jsonencode(var.secret_delivery_mode == "raw" ? var.jwt_secret : "")
    db_password_secret_name = jsonencode(var.secret_delivery_mode == "secrets_manager" ? var.db_password_secret_name : "")
    jwt_secret_secret_name  = jsonencode(var.secret_delivery_mode == "secrets_manager" ? var.jwt_secret_secret_name : "")
    s3_bucket_name          = var.files_bucket_name
    frontend_origin         = var.frontend_origin
    env_type                = var.env_type
    wazuh_manager_ip        = var.wazuh_manager_ip
  })

  # IMDSv2 강제 (보안 환경) / hop_limit=2: Docker 컨테이너 내 AWS SDK가 IMDS 접근 가능하도록
  lifecycle {
    precondition {
      condition = var.secret_delivery_mode == "raw" ? (
        var.db_password != "" &&
        var.jwt_secret != "" &&
        var.db_password_secret_name == "" &&
        var.jwt_secret_secret_name == "" &&
        var.secrets_kms_key_arn == ""
      ) : (
        var.db_password == "" &&
        var.jwt_secret == "" &&
        var.db_password_secret_name != "" &&
        var.jwt_secret_secret_name != "" &&
        var.secrets_kms_key_arn != ""
      )
      error_message = "EC2 secret inputs must match the selected secret_delivery_mode without mixing raw values and Secrets Manager settings."
    }
  }

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = var.allow_public_access ? "optional" : "required"
    http_put_response_hop_limit = var.allow_public_access ? 1 : 2
  }

  root_block_device {
    volume_type = "gp3"
    volume_size = 20
    encrypted   = var.root_volume_encrypted
    kms_key_id  = var.root_volume_encrypted && var.root_volume_kms_key_id != "" ? var.root_volume_kms_key_id : null
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
