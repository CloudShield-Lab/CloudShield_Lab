data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# ─── IAM Role ───────────────────────────────────────────────
resource "aws_iam_role" "ec2" {
  name = "${var.env_name}-ec2-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
    }]
  })

  tags = { Environment = var.env_name }
}

resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.ec2.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy_attachment" "ecr" {
  role       = aws_iam_role.ec2.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
}

resource "aws_iam_role_policy_attachment" "s3" {
  role       = aws_iam_role.ec2.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonS3FullAccess"
}

resource "aws_iam_instance_profile" "ec2" {
  name = "${var.env_name}-ec2-profile"
  role = aws_iam_role.ec2.name
}

# ─── user_data 렌더링 ─────────────────────────────────────
locals {
  rendered_env = templatefile("${path.module}/templates/env.tpl", {
    jwt_secret     = var.jwt_secret
    db_password    = var.db_password
    aws_region     = var.aws_region
    s3_bucket_name = var.s3_bucket_name
    cors_origin    = var.cors_origin
  })

  user_data = templatefile("${path.module}/templates/user_data.sh.tpl", {
    aws_region   = var.aws_region
    ecr_registry = var.ecr_registry
    ecr_image    = "${var.ecr_registry}/sentinelshare-backend:latest"
    db_password  = var.db_password
    env_content  = local.rendered_env
  })
}

# ─── EC2 Instance ────────────────────────────────────────────
resource "aws_instance" "main" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  subnet_id              = var.subnet_id
  vpc_security_group_ids = [var.security_group_id]
  iam_instance_profile   = aws_iam_instance_profile.ec2.name

  user_data                   = local.user_data
  user_data_replace_on_change = false

  root_block_device {
    volume_size = 20
    volume_type = "gp3"
    encrypted   = true
  }

  tags = {
    Name        = "${var.env_name}-backend"
    Environment = var.env_name
  }
}

# ─── Elastic IP (인스턴스와 분리 할당) ───────────────────────
# instance 인수를 제거해 EIP를 인스턴스보다 먼저 생성 가능하게 함
# → CloudFront가 EIP public_ip를 참조하면서 순환 참조 없이 동작
resource "aws_eip" "main" {
  domain = "vpc"

  tags = {
    Name        = "${var.env_name}-eip"
    Environment = var.env_name
  }
}

resource "aws_eip_association" "main" {
  instance_id   = aws_instance.main.id
  allocation_id = aws_eip.main.id
}
