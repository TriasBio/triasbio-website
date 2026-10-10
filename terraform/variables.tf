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
  description = "GitHub repository allowed to assume the deploy role, exactly as it appears in the `sub` claim of GitHub's OIDC token. For this repo GitHub includes the numeric owner and repo IDs: <org>@<org-id>/<repo>@<repo-id>."
  type        = string
  default     = "TriasBio@212801005/triasbio-website@1412503440"

  validation {
    condition     = can(regex("^[\\w.-]+(@\\d+)?/[\\w.-]+(@\\d+)?$", var.github_repo))
    error_message = "Must be <org>/<repo> or <org>@<org-id>/<repo>@<repo-id>."
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
