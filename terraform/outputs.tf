output "deploy_role_arn" {
  description = "GitHub environment secret AWS_ROLE_ARN."
  value       = aws_iam_role.deploy.arn
}

output "bucket_name" {
  description = "GitHub environment variable ASSET_BUCKET_NAME."
  value       = aws_s3_bucket.site.bucket
}

output "distribution_id" {
  description = "GitHub environment variable CLOUDFRONT_DISTRIBUTION_ID."
  value       = aws_cloudfront_distribution.site.id
}

output "distribution_domain_name" {
  description = "dxxxx.cloudfront.net name: test the site here before cutover; in prod it is also the value of the GoDaddy www CNAME and _www TXT records."
  value       = aws_cloudfront_distribution.site.domain_name
}

output "certificate_validation_records" {
  description = "CNAME that proves ownership of site_domain to ACM. In prod, add it in GoDaddy (Name without the trailing .triasbio.com.)."
  value = [
    for dvo in aws_acm_certificate.site.domain_validation_options : {
      name  = dvo.resource_record_name
      type  = dvo.resource_record_type
      value = dvo.resource_record_value
    }
  ]
}
