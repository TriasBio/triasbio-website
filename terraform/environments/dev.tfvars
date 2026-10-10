# Dev account (016491065848).
environment        = "development"
github_environment = "dev"
bucket_name        = "trias-website-dev"

# Apply TriasBio/frontend first: it moves the app off dev.triasbio.com, and
# CloudFront rejects a name another Distribution still uses.
site_domain      = "dev.triasbio.com"
app_domain       = "app.dev.triasbio.com"
manage_dns       = true
hosted_zone_name = "dev.triasbio.com"

attach_certificate = true
serve_site_domain  = true
