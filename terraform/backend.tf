# Bucket and key come from environments/<env>.backend.hcl, so dev and prod
# state stay in their own accounts.
terraform {
  backend "s3" {
    use_lockfile = true
    encrypt      = true
  }
}
