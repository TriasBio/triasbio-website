# TriasBio website: public version

The marketing site for TriasBio: mRNA medicines that make their protein at the right hour.

The page reads as one day. Scrolling moves a clock from 00:00 at the top to 24:00 at the bottom, and the sky changes with it: night, dawn, magenta morning, cream noon in Results, dusk, and night again. A 3D mRNA strand follows along and changes form by section (strand, anatomy, protein in its window, 24-hour dial).

**Live:** https://triasbio-public.vercel.app

## Run it locally

Needs Node 20.19 or later.

```bash
npm install
npm run dev
```

Then open http://localhost:5173.

`npm run build` writes the production site to `dist/`. `npm run preview` serves that build.

## Deploying

Run `vercel deploy --prod` from this folder. It deploys to the `triasbio-public` Vercel project. Delete the `.env.local` that `vercel link` creates.

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
