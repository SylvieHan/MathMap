# MathMap

A personal, interactive 2D map for visualizing how mathematical concepts connect — fields as large discs, concepts as sized dots you can zoom, drag, link, and annotate. Fully static and free to run: no backend, no account, all data stored locally in your browser.

**Live view-only map:** [sylviehan.github.io/MathMap](https://sylviehan.github.io/MathMap/) (no install).

## Two parts, one repo

| | **Local editor** | **Published map** |
|---|------------------|-------------------|
| Who | Anyone who clones the repo | Visitors to the public link |
| Open with | A launcher / `npm run dev` | The github.io link |
| Starts with | A **blank** map you build | Sylvie's curated map |
| Editable? | Yes | No (read-only) |
| Data | Your browser (IndexedDB); share via `.mathmap` files | `public/bundled-map.json`, built from `src/data/richSeed.ts` |

A cross-platform **launcher** opens the editor with one double-click.

## Quick start

**Double-click launcher (easiest):**

| System | File |
|--------|------|
| macOS | `Start MathMap.command` |
| Windows | `start-mathmap.bat` |
| Linux | `./start-mathmap.sh` |

**Or use the terminal** (needs Node.js 20+):

```bash
npm install
npm run dev -- --open
```

The editor opens at [http://localhost:5173](http://localhost:5173) with a blank map. Add concepts with **+ Concept**, save with **Export**.

## Documentation

| Doc | For |
|-----|-----|
| **[docs/USER-GUIDE.md](docs/USER-GUIDE.md)** | Running the editor: launchers, building a map, export/import |
| **[docs/DEVELOPER.md](docs/DEVELOPER.md)** | Architecture, data model, the drag-physics engine, deployment |
| **[docs/PUBLISH.md](docs/PUBLISH.md)** | Publishing the read-only site (GitHub Pages, embeds) |

## Features

- **Interactive circle map** — fields → subfields → concepts, with zoom-based level of detail
- **Real drag physics** — Shift+drag a ball; links act as elastic bands, balls collide and settle with friction, always inside their discs (radius scales with content)
- **Rich content** — markdown notes, images, PDFs, links, and LaTeX per node
- **Connections** — manual edges plus tag-based (MSC2020 + custom) grouping
- **Search** — by title, MSC code, or tag
- **Export / import / merge** — portable `.mathmap` files (ZIP with manifest + assets)
- **Read-only viewer**, light & dark mode

## Tech stack

Vite + React + TypeScript · custom SVG circle map · `d3-force` (inter-field layout) + a unified in-house integrator (intra-field drag physics) · `idb` (IndexedDB) · `JSZip` (export) · KaTeX (math).

## Develop & test

```bash
npm run dev                  # local editor (blank, IndexedDB)
npm run build:site && npm run preview   # preview the published read-only map
npm run lint                 # ESLint (must be clean)
npm run build                # typecheck + production build
npx tsx scripts/physics-test.ts         # headless drag-physics regression test
npm run deploy               # build + push to gh-pages
```

See **[docs/DEVELOPER.md](docs/DEVELOPER.md)** for the full picture.
