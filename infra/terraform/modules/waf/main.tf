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

  # Rate-based rule: 5분당 IP당 20 요청 (공격 시뮬레이션용 — 파일 업로드 경로 제외)
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

        # 정적 파일(JS/CSS 등) 요청은 카운트 제외 — /api/ 경로만 rate limit 대상
        # /api/files/ 도 제외 — 파일 업로드/다운로드는 공격 시나리오 대상 아님
        scope_down_statement {
          and_statement {
            statement {
              byte_match_statement {
                search_string = "/api/"
                field_to_match {
                  uri_path {}
                }
                text_transformation {
                  priority = 0
                  type     = "NONE"
                }
                positional_constraint = "STARTS_WITH"
              }
            }
            statement {
              not_statement {
                statement {
                  byte_match_statement {
                    search_string = "/api/files/"
                    field_to_match {
                      uri_path {}
                    }
                    text_transformations {
                      priority = 0
                      type     = "NONE"
                    }
                    positional_constraint = "STARTS_WITH"
                  }
                }
              }
            }
          }
        }
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

        # 파일 업로드는 본문이 8KB를 초과하므로 SizeRestrictions_BODY를 count로 전환
        rule_action_override {
          name = "SizeRestrictions_BODY"
          action_to_use {
            count {}
          }
        }
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
