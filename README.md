# MathMap

A personal, interactive 2D map for visualizing how mathematical concepts connect — how fields relate, how concepts bridge fields, and how ideas cluster together. Fully static, free to run and host, with all data stored locally in your browser.

**New here?** Read **[GETTING-STARTED.md](./GETTING-STARTED.md)** — install, double-click launchers (Windows / macOS / Linux), create a map, save `.mathmap` files, and import them back.

**View-only website:** [sylviehan.github.io/MathMap](https://sylviehan.github.io/MathMap/) (no install).  
**Publish your own site:** [PUBLISH.md](./PUBLISH.md).

## Quick start

**Double-click launcher (easiest):**

| System | File |
|--------|------|
| macOS | `Start MathMap.command` |
| Windows | `start-mathmap.bat` |
| Linux | `./start-mathmap.sh` |

**Or use the terminal:**

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The app works offline after the first load.

## Features

- **Interactive circle map** — fields as large circles, concepts as sized dots inside; zoom out for fields only, zoom in for subfields and concepts (datamapplot-style LOD)
- **Nodes & folders** — concepts and nested field folders (expand/collapse)
- **Rich content** — markdown notes, images, PDFs (inline viewer), links per node
- **Two connection types** — manual edges + implicit tag-based attraction (MSC2020 + custom tags)
- **Search** — filter by title, MSC code, or tag; highlights matches, dims others
- **Pin & re-layout** — drag nodes, double-click to pin, re-run layout for unpinned nodes
- **Export/import** — portable `.mathmap` files (ZIP with manifest + assets)
- **Merge import** — combine maps from different people (conflicts get `-2`, `-3` suffixes)
- **Read-only viewer** — share a published map via URL
- **Light & dark mode**

## How to use

See **[GETTING-STARTED.md](./GETTING-STARTED.md)** for the full walkthrough. Short version:

1. **Launch** — double-click `Start MathMap.command` (Mac) or `start-mathmap.bat` (Windows), or run `npm run dev`.
2. **New blank map** — toolbar **New map**.
3. **Save a file** — **Export** → downloads `YourTitle.mathmap`.
4. **Open a file** — **Import** → pick a `.mathmap` file (OK = merge, Cancel = replace).
5. **Add nodes** — **+ Concept** or **+ Folder**; click circles to edit in the side panel.
6. **Connect** — select a node → **Link from here** → click target.
7. **Search** — toolbar search bar.

### Field folders

Click a folder node to expand/collapse its children. Folders group concepts visually as compound nodes in the layout.

## `.mathmap` file format

A `.mathmap` file is a ZIP archive:

```
my-map.mathmap (ZIP)
├── manifest.json      # nodes, edges, meta (content blocks reference assets by path)
└── assets/
    ├── {blob-id}      # embedded images and PDFs
    └── ...
```

**manifest.json** contains:

- `version`: `1`
- `meta`: `{ title, author, createdAt }`
- `nodes`: array of node objects; `content` blocks use `asset` paths for binary types
- `edges`: manual edges only (tag edges are recomputed on load)

Binary content is stored under `assets/` keyed by blob ID. Export is fully self-contained; import restores the map exactly.

## Read-only viewer mode

**Published website** (GitHub Pages, etc.): build with `npm run build:site` — the site is read-only at the root URL with no query string. See **[PUBLISH.md](./PUBLISH.md)** for full deployment and Google Sites embed instructions.

**Local preview of published site:**

```bash
npm run dev:site
```

**Ad-hoc view mode** (load bundled map while running the editor build):

```
http://localhost:5173/?view=1
```

To use a different bundled map file:

```
?view=1&map=/my-map.json
```

Place JSON or `.mathmap` files in `public/` before building.

## Publish to GitHub Pages (free)

See **[PUBLISH.md](./PUBLISH.md)** for step-by-step setup, embed code for Google Sites, and other hosts.

Quick version:

1. Push to GitHub and enable **Pages → GitHub Actions**.
2. Push to `main` — the workflow deploys automatically.
3. Visit `https://<username>.github.io/<repo-name>/`.

To build manually:

```bash
npm run build:pages   # if repo is named MathMap
# or, for another repo name:
VITE_BASE_PATH=/YourRepoName/ VITE_PUBLISHED_SITE=true npm run build
npx gh-pages -d dist
```

## Tech stack

| Piece | Library |
|-------|---------|
| Build | Vite + React + TypeScript |
| Graph | Custom SVG circle map with zoom-based detail levels (fields → subfields → concepts) |
| Storage | [idb](https://github.com/jakearchibald/idb) (IndexedDB) |
| Export | [JSZip](https://stuk.github.io/jszip/) |

**Why a custom SVG circle map?** The [arXiv math datamapplot](https://lmcinnes.github.io/datamapplot_examples/arXiv_math/) style calls for nested circles with zoom-based level-of-detail — large field discs, medium subfield clusters (from MSC second-level codes), and small concept dots sized by content/links. A custom SVG renderer with circle packing achieves this without a backend. Optional [D3](https://d3js.org/) (`d3-zoom`, `d3-hierarchy`) can be added later for smoother packing if you approve the extra dependency.

Markdown rendering uses a small built-in parser (no extra dependency).

## Project structure

```
src/
  components/     # GraphCanvas, SidePanel, Toolbar, TagPicker, ContentBlocks, SearchBar
  data/           # MSC2020 vocabulary, seed map
  db/             # IndexedDB wrapper
  hooks/          # useMap, useTheme
  utils/          # colors, layout, export/import, merge
public/
  bundled-map.json  # full read-only map (generated from richSeed at build)
```
