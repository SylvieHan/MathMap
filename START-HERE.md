# MathMap — start here

You opened the **MathMap** project folder. This file tells you **what this is**, **what to read**, and **what to do first**.

---

## What is this?

**MathMap** is a free, local web app for building an interactive map of math concepts (circles you can zoom, connect, and annotate). There is no server and no account — everything runs in your browser.

This folder contains:

- The **editor** (build your own map on your computer)
- Everything needed to **publish a read-only website** (optional)
- Guides for **users** and **developers**

---

## What should I do first?

### I want to **use** the editor (most people)

1. Install **Node.js 20+** from [nodejs.org](https://nodejs.org/) if you don’t have it.
2. **Double-click** the launcher for your system:

   | System | File |
   |--------|------|
   | **macOS** | `Start MathMap.command` |
   | **Windows** | `start-mathmap.bat` |
   | **Linux** | `./start-mathmap.sh` (run `chmod +x start-mathmap.sh` once) |

3. Your browser opens automatically. You get a **blank map** — add concepts with **+ Concept**, save with **Export**.
4. Read **[GETTING-STARTED.md](./GETTING-STARTED.md)** for the full walkthrough (import, merge, troubleshooting).

**Do not** open the github.io link if you want to edit — that is the public view-only site.

---

### I am a **developer** taking over the project

1. Read this file (you are here).
2. Read **[DEVELOPER.md](./DEVELOPER.md)** — architecture, data model, editor vs published site, key files.
3. In a terminal:

   ```bash
   npm install
   npm run dev -- --open
   ```

4. Skim these files in order:
   - `src/hooks/useMap.ts` — data loading and persistence
   - `src/utils/siteMode.ts` — editor vs read-only
   - `src/components/CircleMapCanvas.tsx` — the map UI
   - `src/data/richSeed.ts` — content for the **published** website only

5. Before big changes: `npm run lint` and `npm run build`.

---

### I want to **publish / update the public website**

1. Read **[PUBLISH.md](./PUBLISH.md)**.
2. Edit the live map content in **`src/data/richSeed.ts`**.
3. Deploy:

   ```bash
   npm install
   npm run deploy
   ```

   Live site (example): [sylviehan.github.io/MathMap](https://sylviehan.github.io/MathMap/)

---

## What to read (in order)

| Order | File | Who |
|-------|------|-----|
| **1** | **START-HERE.md** (this file) | Everyone |
| 2 | [GETTING-STARTED.md](./GETTING-STARTED.md) | People using the editor |
| 3 | [DEVELOPER.md](./DEVELOPER.md) | Developers maintaining the code |
| 4 | [PUBLISH.md](./PUBLISH.md) | Publishing the read-only site |
| 5 | [README.md](./README.md) | Short overview and feature list |

---

## Important ideas (don’t mix these up)

| | **Local editor** | **Published website** |
|---|------------------|------------------------|
| **Open with** | `Start MathMap.command` / `start-mathmap.bat` | Browser link (github.io) |
| **Starts with** | Blank map | Sylvie’s curated map |
| **Can edit?** | Yes | No (view only) |
| **Data stored** | In your browser (IndexedDB) | Static file `bundled-map.json` |

---

## Folder map (where things live)

```
MathMap/
├── START-HERE.md              ← you are here
├── GETTING-STARTED.md         ← user guide
├── DEVELOPER.md               ← developer handoff
├── PUBLISH.md                 ← deploy the website
├── README.md                  ← project summary
│
├── Start MathMap.command        ← macOS: double-click to open editor
├── start-mathmap.bat            ← Windows
├── start-mathmap.sh             ← Linux / terminal
│
├── package.json               ← npm scripts and dependencies
├── src/                       ← application source code
│   ├── App.tsx                ← main UI shell
│   ├── components/            ← map, toolbar, side panel, …
│   ├── hooks/useMap.ts        ← map data + save/load
│   ├── data/richSeed.ts       ← published site content only
│   └── …
├── scripts/
│   ├── export-bundled-map.ts  ← builds public/bundled-map.json
│   └── deploy-site.mjs        ← npm run deploy
└── public/
    └── bundled-map.json       ← generated; used by published site
```

**Not included in a handoff zip:** `node_modules/` (run `npm install`), `dist/` (run `npm run build`).

---

## Quick commands

```bash
npm install              # first time only
npm run dev -- --open    # local editor
npm run dev:site         # preview read-only site locally
npm run build            # production build
npm run deploy           # update GitHub Pages site
npm run lint             # check code style
```

---

## Need help?

- **Editor won’t start** → [GETTING-STARTED.md § Troubleshooting](./GETTING-STARTED.md)
- **How the code works** → [DEVELOPER.md](./DEVELOPER.md)
- **GitHub:** [github.com/SylvieHan/MathMap](https://github.com/SylvieHan/MathMap)

---

*MathMap — handoff package. Open this file first whenever you’re unsure where to go next.*
