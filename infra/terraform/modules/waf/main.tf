terraform {
  required_providers {
    aws = {
      source                = "hashicorp/aws"
      version               = "~> 5.0"
      configuration_aliases = [aws.us_east_1]
    }
  }
}

resource "aws_wafv2_web_acl" "main" {
  provider    = aws.us_east_1
  name        = "sentinelshare-tf-${var.env_name}-waf"
  description = "WAF for SentinelShare ${var.env_name} environment"
  scope       = "CLOUDFRONT"

  default_action {
    allow {}
  }

  # Rate-based rule: 5분당 IP당 20 요청
  rule {
    name     = "RateLimitRule"
    priority = 1

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit              = 20
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "sentinelshare-tf-${var.env_name}-rate-limit"
      sampled_requests_enabled   = true
    }
  }

  # AWS Managed: Common Rule Set
  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 2

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "sentinelshare-tf-${var.env_name}-common-rules"
      sampled_requests_enabled   = true
    }
  }

  # AWS Managed: Known Bad Inputs
  rule {
    name     = "AWSManagedRulesKnownBadInputsRuleSet"
    priority = 3

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "sentinelshare-tf-${var.env_name}-bad-inputs"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "sentinelshare-tf-${var.env_name}-waf"
    sampled_requests_enabled   = true
  }

  tags = {
    Name        = "sentinelshare-tf-${var.env_name}-waf"
    Environment = var.env_name
    ManagedBy   = "terraform"
  }
}
