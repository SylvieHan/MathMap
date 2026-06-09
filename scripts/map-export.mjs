// Build an editable .mathmap file from the published map (public/bundled-map.json),
// so you can Import it into the editor, edit visually, and Export it again.
//
//   npm run map:export                 -> writes <map-title>.mathmap in the project root
//   npm run map:export -- some/path.mathmap
//
// The format matches exactly what the editor's Import expects (manifest.json + assets/).
import JSZip from 'jszip';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const bundled = JSON.parse(readFileSync(join(root, 'public', 'bundled-map.json'), 'utf8'));

const manifest = {
  version: 1,
  meta: bundled.meta,
  nodes: bundled.nodes,
  edges: bundled.edges ?? [],
};

const zip = new JSZip();
zip.file('manifest.json', JSON.stringify(manifest, null, 2));
zip.folder('assets');

const slug = (bundled.meta?.title ?? 'map').replace(/\s+/g, '-').toLowerCase() || 'map';
const out = process.argv[2] ?? join(root, `${slug}.mathmap`);
const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
writeFileSync(out, buf);
console.log(`Wrote ${out}`);
console.log('Import this file in the editor (Import button) to edit your map.');
