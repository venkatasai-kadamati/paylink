# -----------------------------------------------------------------------------
# CloudFront + VPC Origin
# Users hit CloudFront over HTTPS; CloudFront reaches the INTERNAL ALB privately
# (no public ALB, no internet-facing origin). Matches diagram "Private connection".
# -----------------------------------------------------------------------------

resource "aws_cloudfront_vpc_origin" "alb" {
  vpc_origin_endpoint_config {
    name                   = "${var.project_name}-alb-vpc-origin"
    arn                    = aws_lb.app.arn
    http_port              = 80
    https_port             = 443
    origin_protocol_policy = "http-only"

    origin_ssl_protocols {
      items    = ["TLSv1.2"]
      quantity = 1
    }
  }

  timeouts {
    create = "20m"
    update = "20m"
    delete = "20m"
  }

  tags = {
    Name = "${var.project_name}-vpc-origin"
  }

  depends_on = [
    aws_internet_gateway.main,
    aws_lb_listener.http,
    aws_vpc_security_group_ingress_rule.alb_http_from_cloudfront,
  ]
}

locals {
  cf_origin_id = "${var.project_name}-internal-alb"
}

resource "aws_cloudfront_distribution" "app" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "${var.project_name} - CloudFront VPC origin to internal ALB"
  default_root_object = ""
  price_class         = "PriceClass_100" # US/Canada/Europe — cheaper for class

  origin {
    domain_name = aws_lb.app.dns_name
    origin_id   = local.cf_origin_id

    vpc_origin_config {
      vpc_origin_id            = aws_cloudfront_vpc_origin.alb.id
      origin_read_timeout      = 30
      origin_keepalive_timeout = 5
    }
  }

  # Dynamic app (cookies/auth) — do not cache HTML/API by default
  default_cache_behavior {
    target_origin_id       = local.cf_origin_id
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    # Legacy forwarded_values keeps dependencies simple for class projects.
    # Prefer Cache Policy + Origin Request Policy in production.
    forwarded_values {
      query_string = true
      headers      = ["*"]

      cookies {
        forward = "all"
      }
    }

    min_ttl     = 0
    default_ttl = 0
    max_ttl     = 0
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = {
    Name = "${var.project_name}-cdn"
  }

  depends_on = [aws_cloudfront_vpc_origin.alb]
}
