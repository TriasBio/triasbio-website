# TriasBio website: public version

The marketing site for TriasBio: mRNA medicines that make their protein at the right hour.

The page reads as one day. Scrolling moves a clock from 00:00 at the top to 24:00 at the bottom, and the sky changes with it: night, dawn, magenta morning, cream noon in Results, dusk, and night again. A 3D mRNA strand follows along and changes form by section (strand, anatomy, protein in its window, 24-hour dial).

**Live:** https://www.triasbio.com (prod, `main`) and https://dev.triasbio.com (dev, `dev`)

## Run it locally

Needs Node 20.19 or later.

```bash
npm install
npm run dev
```

Then open http://localhost:5173.

`npm run build` writes the production site to `dist/`. `npm run preview` serves that build.

## Deploying

Pushing to `dev` deploys to dev.triasbio.com; merging into `main` deploys to www.triasbio.com. `.github/workflows/deploy.yml` builds the site, uploads `dist/` to a private S3 bucket and refreshes CloudFront. The hosting itself (bucket, CloudFront, certificate, the deploy role) is Terraform in `terraform/`, one root module for both AWS accounts:

```bash
cd terraform
terraform init -backend-config=environments/dev.backend.hcl
terraform apply -var-file=environments/dev.tfvars

terraform init -reconfigure -backend-config=environments/prod.backend.hcl
terraform apply -var-file=environments/prod.tfvars
```

After the first apply in an environment, copy `deploy_role_arn` (secret `AWS_ROLE_ARN`), `bucket_name` (variable `ASSET_BUCKET_NAME`) and `distribution_id` (variable `CLOUDFRONT_DISTRIBUTION_ID`) from `terraform output` into the GitHub environment of the same name (`dev` or `prod`), and set `SITE_URL` for the post-deploy check.

The mRNA design app (TriasBio/frontend) has its own domain: app.dev.triasbio.com and app.triasbio.com. The header and footer "Log in" links go there directly (`VITE_APP_URL`, set per branch in the deploy workflow; local builds link to app.triasbio.com). CloudFront also redirects `/app` and `/app/*` on this site there, without the `/app` prefix, for bookmarks from when the app was served under www.triasbio.com/app.

### DNS

dev.triasbio.com is a Route 53 zone in the dev account, and Terraform writes its records. triasbio.com is hosted at **GoDaddy** together with the Google Workspace email records, so prod records are added there by hand. Only ever add or edit records named `www`, `app` or starting with `_`. The `@` records (MX, the SPF TXT, the forwarding A records), `google._domainkey` and `_dmarc` carry email and the bare-domain redirect, and must not change.

### Prod cutover

`www.triasbio.com` was first served by the app's CloudFront Distribution. Moving it to this site, without downtime:

1. Apply prod with `attach_certificate = false` and `serve_site_domain = false`. Test the site on `distribution_domain_name`.
2. In GoDaddy, add the CNAME from `certificate_validation_records` (Name without the trailing `.triasbio.com.`). Wait for the certificate to show as Issued in ACM (us-east-1), then set `attach_certificate = true` and apply.
3. In GoDaddy, add a TXT record named `_www` whose value is `distribution_domain_name`, then move the name: `aws cloudfront associate-alias --target-distribution-id <distribution_id> --alias www.triasbio.com`.
4. Set `serve_site_domain = true` and apply, so Terraform records the alias.
5. In GoDaddy, point the `www` CNAME at `distribution_domain_name`, then delete the `_www` TXT record.

CloudFront routes by hostname, so www.triasbio.com follows the alias the moment step 3 runs, whichever Distribution the CNAME names. Rolling back therefore means moving the alias back: set `serve_site_domain = false` and apply, point `_www` at the previous Distribution, and run `associate-alias` with that Distribution's id.

## Where things live

| Path | What it holds |
| --- | --- |
| `index.html` | The page shell. Each `<!-- include:name -->` pulls in `partials/name.html` at build time, so every section ships as plain HTML. |
| `partials/` | One file per section: the copy and markup. Most text edits happen here. |
| `src/css/` | Styles, one file per section plus `base.css` (fonts, color tokens, type sizes). |
| `src/core/` | The scroll clock (`scroll.js`), shared state, and reveal animations. |
| `src/chrome/` | Header, clock menu, and the page sky (`sky.js`, the color for each hour). |
| `src/hero/` | The opening screen: the 24-hour ring and the rotating headline. |
| `src/sections/` | Behavior for each section (charts, the dose slider, the team bios). |
| `src/three/` | The 3D strand (three.js). `stage.js` decides where it sits and which form it takes; `scene.js` draws it. |
| `public/` | Images served as is: team photos, backer logos, icons, the link-preview image. |
| `scripts/` | One-off generators for the link-preview image, the strand's still images, and the favicons. |

## Common edits

- **Change copy:** edit the section's file in `partials/`. Section hours come from each section's `data-time` attribute.
- **Change the sky colors:** the `DAY` list in `src/chrome/sky.js` sets the page color by hour. The sunrise and sunset bands are gradients on `.results` in `src/css/results.css`.
- **Add or swap a backer logo:** add a single-color PNG with a transparent background to `public/backers/`, then add an entry in `partials/team.html`. The CSS paints each logo in the page's text color, so the source color does not matter.
- **Regenerate the strand stills** after changing the strand's geometry: `npm run helix`.
- **Regenerate the link-preview image:** `node scripts/gen-og.mjs`.

## Data notes

- The Hugging Face download count updates live in the browser from the Hugging Face API. The number in `partials/results.html` is only the fallback for when that call fails.
- The 08:00 dose chart is a schematic of the design goal. No measured data sits behind its curves, and its caption says so.
