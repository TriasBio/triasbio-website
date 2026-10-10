# Dev only. In prod the www CNAME is in GoDaddy (README.md).

resource "aws_route53_record" "site_a" {
  count = var.manage_dns && var.serve_site_domain ? 1 : 0

  zone_id = data.aws_route53_zone.site[0].zone_id
  name    = var.site_domain
  type    = "A"

  alias {
    name = aws_cloudfront_distribution.site.domain_name
    # CloudFront's hosted zone id, the same for every Distribution.
    zone_id                = "Z2FDTNDATAQYW2"
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "site_aaaa" {
  count = var.manage_dns && var.serve_site_domain ? 1 : 0

  zone_id = data.aws_route53_zone.site[0].zone_id
  name    = var.site_domain
  type    = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.site.domain_name
    zone_id                = "Z2FDTNDATAQYW2"
    evaluate_target_health = false
  }
}
