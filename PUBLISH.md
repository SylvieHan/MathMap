# Publish your MathMap as a website

> **New to this folder?** See **[START-HERE.md](./START-HERE.md)** first.

Your map can live at a public link (read-only) while others use the repo locally to build their own editable maps.

---

## Option A — GitHub Pages (free, recommended)

### One-time setup

1. Create a GitHub repository and push this project.

2. In the repo, go to **Settings → Pages → Build and deployment**:
   - Source: **Deploy from a branch**
   - Branch: **`gh-pages`** / **`/ (root)`**

3. If your repo is **not** named `MathMap`, set the base path when building:
   ```bash
   VITE_BASE_PATH=/YourRepoName/ npm run build:pages
   ```

### Deploy / update the live map

From the repo root (with push access to GitHub):

```bash
npm run deploy
```

This builds the published site and pushes `dist/` to the **`gh-pages`** branch.

**Edit the live map content** in `src/data/richSeed.ts`, then run `npm run deploy` again.

Optional title override when building:

```bash
PUBLISH_MAP_TITLE="My Math Map" npm run build:pages
```

### Your public link

```
https://<your-github-username>.github.io/<repo-name>/
```

No `?view=1` needed — the published build is read-only by default and loads your full map from `bundled-map.json`.

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
| Data source | IndexedDB (starts blank) | `bundled-map.json` from `richSeed.ts` |
| Share link | Export `.mathmap` | Public URL |

Preview the published site locally:

```bash
npm run dev:site
```

Open [http://localhost:5173](http://localhost:5173) — read-only, same as the live site.
