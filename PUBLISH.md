# Publish your MathMap as a website

Your map can live at a public link (read-only) while others use the npm package locally to build their own editable maps.

## Option A — GitHub Pages (free, recommended)

### One-time setup

1. Create a GitHub repository and push this project.

2. In the repo, go to **Settings → Pages → Build and deployment**:
   - Source: **GitHub Actions**

3. If your repo is **not** named `MathMap`, set the base path when building:
   ```bash
   VITE_BASE_PATH=/YourRepoName/ npm run build:pages
   ```
   Or edit `.github/workflows/deploy-pages.yml` — it auto-uses the repo name.

4. Push to `main`. The **Deploy published map to GitHub Pages** workflow runs automatically.

### Your public link

```
https://<your-github-username>.github.io/<repo-name>/
```

No `?view=1` needed — the published build is read-only by default and loads your full map from `bundled-map.json`.

### Update the live map

Edit `src/data/richSeed.ts` (or export a `.mathmap` and replace the seed), then push to `main`. The site rebuilds on every push.

Optional: set a custom title on the live site when building:

```bash
PUBLISH_MAP_TITLE="Sylvie's Math Map" npm run build:site
```

---

## Option B — Embed in Google Sites

1. Publish with GitHub Pages (or Netlify/Cloudflare — any static host).

2. In Google Sites: **Insert → Embed → Embed code**, paste:

```html
<iframe
  src="https://<your-username>.github.io/<repo-name>/?embed=1"
  width="100%"
  height="720"
  style="border:0;border-radius:8px;max-width:100%;"
  loading="lazy"
  title="MathMap"
></iframe>
```

3. Adjust `height` (720–900 px works well). The `?embed=1` mode trims chrome for a cleaner iframe.

**Tip:** Link the iframe URL in a button (“Open full map”) so visitors can explore on a full screen tab.

---

## Option C — Other hosts (Netlify, Cloudflare Pages, Vercel)

Build command:

```bash
npm run build:site
```

Publish directory: `dist`

Set environment variable: `VITE_PUBLISHED_SITE=true`

For a root domain (not subpath), no `GITHUB_PAGES` or `VITE_BASE_PATH` is needed.

---

## Local vs published

| | Local editor (`npm run dev`) | Published site (`npm run build:site`) |
|---|---|---|
| Edit map | Yes | No (view only) |
| Data source | IndexedDB + seed | `bundled-map.json` |
| Share link | Export `.mathmap` | Public URL |

Preview the published site locally:

```bash
npm run dev:site
```

Open [http://localhost:5173](http://localhost:5173) — read-only, same as the live site.
