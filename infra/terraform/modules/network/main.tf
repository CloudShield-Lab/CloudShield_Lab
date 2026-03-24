terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name        = "sentinelshare-tf-${var.env_name}-vpc"
    Environment = var.env_name
    ManagedBy   = "terraform"
  }
}

resource "aws_subnet" "public" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = var.subnet_cidr
  availability_zone       = "${var.aws_region}a"
  map_public_ip_on_launch = true

  tags = {
    Name        = "sentinelshare-tf-${var.env_name}-public-subnet"
    Environment = var.env_name
    ManagedBy   = "terraform"
  }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name        = "sentinelshare-tf-${var.env_name}-igw"
    Environment = var.env_name
    ManagedBy   = "terraform"
  }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  dynamic "route" {
    for_each = var.wazuh_vpc_id != "" ? [1] : []
    content {
      cidr_block                = var.wazuh_vpc_cidr
      vpc_peering_connection_id = aws_vpc_peering_connection.wazuh[0].id
    }
  }

  tags = {
    Name        = "sentinelshare-tf-${var.env_name}-public-rt"
    Environment = var.env_name
    ManagedBy   = "terraform"
  }
}

resource "aws_route_table_association" "public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}

# ─── Wazuh Manager VPC 피어링 ───
resource "aws_vpc_peering_connection" "wazuh" {
  count       = var.wazuh_vpc_id != "" ? 1 : 0
  vpc_id      = aws_vpc.main.id
  peer_vpc_id = var.wazuh_vpc_id
  auto_accept = true

  tags = {
    Name        = "sentinelshare-tf-${var.env_name}-wazuh-peering"
    Environment = var.env_name
    ManagedBy   = "terraform"
  }
}

# Wazuh Manager VPC 라우트 테이블에 SentinelShare VPC로 돌아오는 경로 추가
data "aws_route_tables" "wazuh" {
  count  = var.wazuh_vpc_id != "" ? 1 : 0
  vpc_id = var.wazuh_vpc_id
}

resource "aws_route" "wazuh_to_sentinelshare" {
  count                     = var.wazuh_vpc_id != "" ? length(data.aws_route_tables.wazuh[0].ids) : 0
  route_table_id            = tolist(data.aws_route_tables.wazuh[0].ids)[count.index]
  destination_cidr_block    = var.vpc_cidr
  vpc_peering_connection_id = aws_vpc_peering_connection.wazuh[0].id
}
