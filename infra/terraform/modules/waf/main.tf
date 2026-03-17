# WAF WebACL — CloudFront scope이므로 반드시 us-east-1 provider로 호출해야 함
# 호출 시: providers = { aws = aws.us_east_1 }

terraform {
  required_providers {
    aws = {
      source = "hashicorp/aws"
    }
  }
}

resource "aws_wafv2_web_acl" "main" {
  name        = "${var.env_name}-web-acl"
  description = "WAF WebACL for ${var.env_name} CloudFront distribution"
  scope       = "CLOUDFRONT"

  default_action {
    allow {}
  }

  # ── Rate-based rule ───────────────────────────────────────
  rule {
    name     = "RateLimitRule"
    priority = 1

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit              = var.rate_limit
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.env_name}-rate-limit"
      sampled_requests_enabled   = true
    }
  }

  # ── AWS Managed Rules: Common Rule Set ────────────────────
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
      metric_name                = "${var.env_name}-common-rules"
      sampled_requests_enabled   = true
    }
  }

  # ── AWS Managed Rules: Known Bad Inputs ───────────────────
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
      metric_name                = "${var.env_name}-bad-inputs"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.env_name}-web-acl"
    sampled_requests_enabled   = true
  }

  tags = {
    Environment = var.env_name
  }
}
