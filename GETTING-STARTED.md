# Getting started with MathMap (local editor)

> **First time in this folder?** See **[START-HERE.md](./START-HERE.md)** for the big picture.

Use this guide if you **cloned or unzipped the project** and want to **build your own map** on your computer.

---

## What you need once

Install **Node.js 20 or newer** (includes `npm`):

| System | Download |
|--------|----------|
| **Windows** | [nodejs.org](https://nodejs.org/) — use the LTS installer |
| **macOS** | [nodejs.org](https://nodejs.org/) or `brew install node` |
| **Linux** | [nodejs.org](https://nodejs.org/) or your package manager |

Check in a terminal:

```bash
node --version
npm --version
```

---

## Easiest way to open the editor

### macOS — double-click

1. Clone or download this repository.
2. Double-click **`Start MathMap.command`** in the project folder.
3. If macOS blocks it: right-click → **Open** → **Open** (first time only).
4. Your browser opens **automatically** when the editor is ready. You do not need to type a web address.

**Two different things (easy to mix up):**

| What | How you open it |
|------|-----------------|
| **Editor** (build your map) | Double-click **`Start MathMap.command`** — runs on your computer only |
| **Published map** (view Sylvie’s map online) | Open the **github.io** link in a browser — no install, read-only |

### Windows — double-click

1. Clone or download this repository.
2. Double-click **`start-mathmap.bat`**.
3. A terminal window opens; your browser opens **automatically** when ready.
4. **Keep the terminal window open** while you work. Close it when you are done.

### Linux (or terminal on any system)

```bash
cd path/to/MathMap
chmod +x start-mathmap.sh    # first time only
./start-mathmap.sh
```

Or manually (terminal users):

```bash
cd path/to/MathMap
npm install    # first time only
npm run dev -- --open
```

The `--open` flag opens your browser when the server is ready.

---

## First launch

- The editor opens with a **blank map** titled **Untitled Map** (no demo content).
- Your work is saved **in this browser** as you edit. Use **Import** to open a `.mathmap` file someone shared (or your own backup).
- The **example map on the website** (`github.io/...`) is separate — view-only, for visitors.

---

## Create a new map (blank)

1. In the toolbar, click **New map**.
2. Confirm — you get an empty map titled **Untitled Map**.
3. Click the title to rename it (e.g. `Algebra notes`).

---

## Build your map in the editor

| Goal | How |
|------|-----|
| Add a concept | **+ Concept** |
| Add a field folder | **+ Folder** |
| Edit text / definition | Click a circle → side panel |
| Connect two concepts | Select node → **Link from here** → click target |
| Search | Search bar in the toolbar |
| Save layout | **Re-layout** (unpinned nodes reflow) |
| Pin a node | Double-click the circle |

---

## Save as a `.mathmap` file (share or backup)

A **`.mathmap` file** is your whole map in one portable file (text + images/PDFs inside).

1. Click **Export** in the toolbar.
2. A file like `My MathMap.mathmap` downloads to your **Downloads** folder.
3. You can email it, back it up, or open it on another computer.

**Tip:** Export often — browser storage can be cleared if you reset the browser.

---

## Open an existing `.mathmap` file

1. Start the editor (`Start MathMap.command` / `start-mathmap.bat` / `npm run dev`).
2. Click **Import** in the toolbar.
3. Choose your `.mathmap` file.
4. Dialog:
   - **OK** = **Merge** — combine with the current map (duplicate names get `-2`, `-3`, …).
   - **Cancel** = **Replace** — load this file and discard what was open.

---

## Typical workflows

### A — Start from a shared file

1. Launch editor → **Import** → choose a `.mathmap` file.

### B — Start blank

1. Launch editor → **New map** → add concepts → **Export**.

### C — Continue on another computer

1. Copy your `.mathmap` file (USB, cloud, email).
2. Install MathMap on the other machine → launch editor → **Import** → **Cancel** (replace).

### D — Publish a read-only website (advanced)

See **[PUBLISH.md](./PUBLISH.md)** — for sharing a link others can view but not edit.

---

## Stop the editor

- Close the terminal window, or press **Ctrl+C** in the terminal.
- The browser tab can be closed; your map stays saved in the browser until you clear site data.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| “node is not recognized” | Install Node.js and restart the terminal |
| macOS won’t run `.command` | Right-click → Open, or `chmod +x "Start MathMap.command"` |
| Port already in use | Close other `npm run dev` windows or restart the computer |
| Map disappeared | Browser data was cleared — restore from a **Export** backup |
| Blank page | Wait for `npm install` to finish on first run |

---

## Need help?

Open an issue on the GitHub repository with your system (Windows / macOS / Linux) and what step failed.
