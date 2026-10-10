data "aws_route53_zone" "site" {
  count = var.manage_dns ? 1 : 0

  name = var.hosted_zone_name
}

resource "aws_acm_certificate" "site" {
  provider = aws.us_east_1

  domain_name       = var.site_domain
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "cert_validation" {
  for_each = var.manage_dns ? {
    for dvo in aws_acm_certificate.site.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  } : {}

  zone_id         = data.aws_route53_zone.site[0].zone_id
  name            = each.value.name
  type            = each.value.type
  records         = [each.value.record]
  ttl             = 60
  allow_overwrite = true
}

# Waits until the certificate is issued; in prod, that needs the GoDaddy record.
resource "aws_acm_certificate_validation" "site" {
  count    = var.attach_certificate ? 1 : 0
  provider = aws.us_east_1

  certificate_arn         = aws_acm_certificate.site.arn
  validation_record_fqdns = var.manage_dns ? [for r in aws_route53_record.cert_validation : r.fqdn] : null
}
