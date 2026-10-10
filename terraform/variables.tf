variable "aws_region" {
  description = "Region for S3 and IAM. The certificate is always in us-east-1."
  type        = string
  default     = "us-west-2"
}

variable "environment" {
  description = "Deployment environment, used in resource tags."
  type        = string
}

variable "bucket_name" {
  description = "Private bucket holding the built site. Changing it on an existing environment recreates the bucket."
  type        = string
}

variable "site_domain" {
  description = "Public hostname of the website."
  type        = string
}

variable "app_domain" {
  description = "Hostname of the mRNA design app (TriasBio/frontend). /app and /app/* on site_domain redirect there without the /app prefix."
  type        = string
}

variable "manage_dns" {
  description = "Write the DNS records into the Route 53 zone hosted_zone_name. False where DNS is at GoDaddy (prod); the records are then added by hand from the outputs."
  type        = bool
}

variable "hosted_zone_name" {
  description = "Existing Route 53 zone used when manage_dns is true."
  type        = string
  default     = null
}

variable "attach_certificate" {
  description = "Attach the site_domain certificate. Apply waits until it is issued, so in prod add its GoDaddy validation record first."
  type        = bool
}

variable "serve_site_domain" {
  description = "Serve site_domain from this Distribution. Requires attach_certificate. In prod, set it after moving www with `aws cloudfront associate-alias` (README.md)."
  type        = bool
}

variable "price_class" {
  description = "CloudFront price class. PriceClass_100 is North American and European edge locations only."
  type        = string
  default     = "PriceClass_100"
}

variable "github_repo" {
  description = "GitHub repository, as <org>/<repo>, allowed to assume the deploy role."
  type        = string
  default     = "TriasBio/triasbio-website"

  validation {
    condition     = can(regex("^[\\w.-]+/[\\w.-]+$", var.github_repo))
    error_message = "Must be <org>/<repo>."
  }
}

variable "github_environment" {
  description = "GitHub environment allowed to assume the deploy role (dev or prod), as resolved by the deploy workflow."
  type        = string
}

variable "create_oidc_provider" {
  description = "Create the GitHub OIDC provider. An account holds only one, shared with the backend and frontend repos, so leave false where it exists."
  type        = bool
  default     = false
}
