# Prod account (480073428971).
environment        = "production"
github_environment = "prod"
bucket_name        = "trias-website-prod"

site_domain = "www.triasbio.com"
app_domain  = "app.triasbio.com"

# triasbio.com DNS, including the Google Workspace email records, is at
# GoDaddy. Records are added there by hand (README.md).
manage_dns = false

# Turned on in order during the cutover (README.md, "Prod cutover").
attach_certificate = false
serve_site_domain  = false
