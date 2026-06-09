// Fold an edited .mathmap (exported from the editor) back into the published map
// (public/bundled-map.json). Run this after editing your map in the editor:
//
//   npm run map:import -- ~/Downloads/your-map.mathmap
//
// Then commit public/bundled-map.json and run `npm run deploy` to refresh the site.
import JSZip from 'jszip';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const file = process.argv[2];
if (!file) {
  console.error('Usage: npm run map:import -- <file.mathmap>');
  process.exit(1);
}

const zip = await JSZip.loadAsync(readFileSync(file));
const manifestFile = zip.file('manifest.json');
if (!manifestFile) {
  console.error(`Invalid .mathmap (no manifest.json): ${file}`);
  process.exit(1);
}
const manifest = JSON.parse(await manifestFile.async('string'));

// The published site loads plain JSON and re-runs layout, so positions are reset.
// Tag edges (auto-generated) are dropped — they are recomputed at load.
const bundled = {
  meta: manifest.meta,
  nodes: (manifest.nodes ?? []).map((n) => ({ ...n, position: { x: 0, y: 0 } })),
  edges: (manifest.edges ?? []).filter((e) => !String(e.id).startsWith('__tag__')),
};

writeFileSync(join(root, 'public', 'bundled-map.json'), JSON.stringify(bundled, null, 2));
console.log(`Updated public/bundled-map.json from ${file}`);
console.log('Next: git commit public/bundled-map.json, then `npm run deploy`.');
