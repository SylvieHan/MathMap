# MathMap — User Guide (local editor)

> **New here?** See the **[README](../README.md)** for the big picture.

Use this guide if you **cloned or unzipped the project** and want to **build your own map** on your computer. The editor runs entirely in your browser — no server, no account. Your map is saved locally and shared as a portable `.mathmap` file.

> **Editor vs. published map (don't mix these up):**
>
> | What | How you open it |
> |------|-----------------|
> | **Editor** (build your own map) | Double-click the launcher / `npm run dev` — runs on your computer, starts blank |
> | **Published map** (view Sylvie's map online) | Open the **github.io** link in a browser — no install, read-only |

---

## What you need once

Install **Node.js 20 or newer** (includes `npm`) from [nodejs.org](https://nodejs.org/) (use the LTS installer; on macOS `brew install node` also works). Check in a terminal:

```bash
node --version
npm --version
```

---

## Open the editor

### macOS — double-click

1. Clone or download this repository.
2. Double-click **`Start MathMap.command`** in the project folder.
3. If macOS blocks it: right-click → **Open** → **Open** (first time only).
4. Your browser opens **automatically** when the editor is ready.

### Windows — double-click

1. Clone or download this repository.
2. Double-click **`start-mathmap.bat`**.
3. A terminal window opens; your browser opens **automatically** when ready.
4. **Keep the terminal window open** while you work; close it when done.

### Linux / terminal (any system)

```bash
cd path/to/MathMap
chmod +x start-mathmap.sh    # first time only
./start-mathmap.sh
```

Or manually:

```bash
cd path/to/MathMap
npm install            # first time only
npm run dev -- --open  # --open launches your browser when ready
```

---

## First launch

- The editor opens with a **blank map** titled **Untitled Map** (no demo content).
- Your work is saved **in this browser** as you edit. Use **Import** to open a `.mathmap` file someone shared (or your own backup).
- The example map on the website (github.io link) is separate — view-only, for visitors.

---

## Build your map

| Goal | How |
|------|-----|
| New blank map | **New map** in the toolbar (titled *Untitled Map*) |
| Rename the map | Click the title and type |
| Add a concept | **+ Concept** |
| Add a field folder | **+ Folder** |
| Edit text / definition | Click a circle → side panel |
| Connect two concepts | Select a node → **Link from here** → click the target |
| Search | Search bar in the toolbar (title, MSC code, or tag) |
| Re-flow layout | **Re-layout** (unpinned nodes reflow) |
| Pin a node | Double-click the circle (pinned nodes stay put) |
| Move a ball | **Shift+drag** it (plain drag pans the view) |

When you **Shift+drag** a concept, its links act like elastic bands: release it and it pulls back toward what it's connected to, bumps into neighbors, and settles — all balls stay inside their field and subfield discs.

---

## Save / open `.mathmap` files

A **`.mathmap` file** is your whole map in one portable file (text + images/PDFs inside).

- **Export** → downloads a file like `My MathMap.mathmap` to your Downloads folder. Email it, back it up, or open it elsewhere. **Export often** — browser storage can be cleared.
- **Import** → choose a `.mathmap` file. The dialog offers:
  - **OK** = **Merge** — combine with the current map (duplicate names get `-2`, `-3`, …).
  - **Cancel** = **Replace** — load this file and discard what was open.

To continue on another computer: copy your `.mathmap` (USB, cloud, email), launch the editor there, **Import** → **Cancel** (replace).

---

## Stop the editor

Close the terminal window or press **Ctrl+C** in it. The browser tab can be closed; your map stays saved in the browser until you clear site data.

---

## Publish a read-only website (advanced)

See **[PUBLISH.md](./PUBLISH.md)** to share a public link others can view but not edit.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "node is not recognized" | Install Node.js and restart the terminal |
| macOS won't run `.command` | Right-click → Open, or `chmod +x "Start MathMap.command"` |
| Port already in use | Close other `npm run dev` windows or restart the computer |
| Map disappeared | Browser data was cleared — restore from an **Export** backup |
| Blank page on first run | Wait for `npm install` to finish |

Still stuck? Open an issue on the GitHub repository with your system (Windows / macOS / Linux) and the step that failed.
