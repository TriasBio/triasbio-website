data "aws_cloudfront_cache_policy" "caching_optimized" {
  name = "Managed-CachingOptimized"
}

data "aws_cloudfront_response_headers_policy" "security_headers" {
  name = "Managed-SecurityHeadersPolicy"
}

resource "aws_cloudfront_origin_access_control" "site" {
  name                              = "${var.bucket_name}-oac"
  description                       = "OAC for the website bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_function" "viewer_request" {
  name    = "${var.bucket_name}-viewer-request"
  runtime = "cloudfront-js-2.0"
  comment = "Redirect /app and /app/* to https://${var.app_domain}"
  publish = true
  code    = templatefile("${path.module}/functions/viewer-request.js", { app_domain = var.app_domain })
}

resource "aws_cloudfront_distribution" "site" {
  enabled             = true
  is_ipv6_enabled     = true
  http_version        = "http2and3"
  comment             = "TriasBio website (${var.site_domain})"
  default_root_object = "index.html"
  price_class         = var.price_class

  aliases = var.serve_site_domain ? [var.site_domain] : []

  origin {
    domain_name              = aws_s3_bucket.site.bucket_regional_domain_name
    origin_id                = "site-s3-origin"
    origin_access_control_id = aws_cloudfront_origin_access_control.site.id
  }

  default_cache_behavior {
    target_origin_id           = "site-s3-origin"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD", "OPTIONS"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = data.aws_cloudfront_cache_policy.caching_optimized.id
    response_headers_policy_id = data.aws_cloudfront_response_headers_policy.security_headers.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.viewer_request.arn
    }
  }

  # One-page site: an unknown path shows the page with a 404 status, so
  # crawlers do not index broken links.
  custom_error_response {
    error_code            = 403
    response_code         = 404
    response_page_path    = "/index.html"
    error_caching_min_ttl = 10
  }

  custom_error_response {
    error_code            = 404
    response_code         = 404
    response_page_path    = "/index.html"
    error_caching_min_ttl = 10
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  # Without the certificate it answers only on its dxxxx.cloudfront.net name.
  viewer_certificate {
    cloudfront_default_certificate = var.attach_certificate ? null : true
    acm_certificate_arn            = var.attach_certificate ? aws_acm_certificate_validation.site[0].certificate_arn : null
    ssl_support_method             = var.attach_certificate ? "sni-only" : null
    minimum_protocol_version       = var.attach_certificate ? "TLSv1.2_2021" : null
  }

  lifecycle {
    precondition {
      condition     = !var.serve_site_domain || var.attach_certificate
      error_message = "serve_site_domain needs attach_certificate: CloudFront refuses an alternate domain name without a certificate covering it."
    }
  }
}
