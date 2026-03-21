terraform {
  required_providers {
    aws = {
      source                = "hashicorp/aws"
      version               = "~> 5.0"
      configuration_aliases = [aws.us_east_1]
    }
  }
}

resource "aws_wafv2_regex_pattern_set" "sqli_xss_query" {
  provider    = aws.us_east_1
  name        = "sentinelshare-tf-${var.env_name}-sqli-xss-query"
  description = "Suspicious SQLi/XSS query patterns for SentinelShare"
  scope       = "CLOUDFRONT"

  regular_expression {
    regex_string = "(<script|javascript:|onerror=|onload=|union\\s+select|'\\s*or\\s*1=1|drop\\s+table|alert\\s*\\()"
  }
}

resource "aws_wafv2_regex_pattern_set" "suspicious_paths" {
  provider    = aws.us_east_1
  name        = "sentinelshare-tf-${var.env_name}-suspicious-paths"
  description = "Suspicious scan paths for SentinelShare"
  scope       = "CLOUDFRONT"

  regular_expression {
    regex_string = "(/wp-login\\.php|/phpmyadmin|/server-status|/\\.env|/admin)"
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

  # Rate-based rule A: 브루트포스 전용 — /api/auth/login 5분당 IP당 20 요청
  rule {
    name     = "BruteforceRateLimitRule"
    priority = 1

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit              = 20
        aggregate_key_type = "IP"

        scope_down_statement {
          byte_match_statement {
            search_string = "/api/auth/login"
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
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "sentinelshare-tf-${var.env_name}-bruteforce-rate-limit"
      sampled_requests_enabled   = true
    }
  }

  # Rate-based rule B: 일반 API flood 전용 — /api/auth/login, /api/files/, /api/logs 제외한 /api/ 경로
  # ratelimit 시나리오(/api/auth/signup 등)가 대상이며 브루트포스 버킷과 완전히 분리됨
  rule {
    name     = "ApiFloodRateLimitRule"
    priority = 2

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit              = 30
        aggregate_key_type = "IP"

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
                    search_string = "/api/auth/login"
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
                    text_transformation {
                      priority = 0
                      type     = "NONE"
                    }
                    positional_constraint = "STARTS_WITH"
                  }
                }
              }
            }
            statement {
              not_statement {
                statement {
                  byte_match_statement {
                    search_string = "/api/logs"
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
              }
            }
          }
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "sentinelshare-tf-${var.env_name}-api-flood-rate-limit"
      sampled_requests_enabled   = true
    }
  }

  # AWS Managed: Common Rule Set
  rule {
    name     = "SuspiciousQueryPatternRule"
    priority = 3

    action {
      block {}
    }

    statement {
      regex_pattern_set_reference_statement {
        arn = aws_wafv2_regex_pattern_set.sqli_xss_query.arn

        field_to_match {
          query_string {}
        }

        text_transformation {
          priority = 0
          type     = "URL_DECODE"
        }

        text_transformation {
          priority = 1
          type     = "HTML_ENTITY_DECODE"
        }

        text_transformation {
          priority = 2
          type     = "LOWERCASE"
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "sentinelshare-tf-${var.env_name}-sqli-xss-query"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "SuspiciousPathScanRule"
    priority = 4

    action {
      block {}
    }

    statement {
      regex_pattern_set_reference_statement {
        arn = aws_wafv2_regex_pattern_set.suspicious_paths.arn

        field_to_match {
          uri_path {}
        }

        text_transformation {
          priority = 0
          type     = "URL_DECODE"
        }

        text_transformation {
          priority = 1
          type     = "LOWERCASE"
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "sentinelshare-tf-${var.env_name}-suspicious-paths"
      sampled_requests_enabled   = true
    }
  }

  # AWS Managed: Common Rule Set
  rule {
    name     = "AllowFilesApiPath"
    priority = 5

    action {
      allow {}
    }

    statement {
      byte_match_statement {
        search_string = "/api/files/"

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

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "sentinelshare-tf-${var.env_name}-allow-files-api"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 6

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
    priority = 7

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
