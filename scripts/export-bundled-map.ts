import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { RICH_SEED } from '../src/data/richSeed';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Static JSON bundled into the published read-only site. */
const bundled = {
  meta: {
    ...RICH_SEED.meta,
    title: process.env.PUBLISH_MAP_TITLE ?? RICH_SEED.meta.title,
    author: process.env.PUBLISH_MAP_AUTHOR ?? RICH_SEED.meta.author ?? '',
  },
  nodes: RICH_SEED.nodes.map((n) => ({
    ...n,
    position: { x: 0, y: 0 },
  })),
  edges: RICH_SEED.edges.map((e) => ({ ...e })),
};

writeFileSync(join(root, 'public', 'bundled-map.json'), JSON.stringify(bundled, null, 2));
console.log('Wrote public/bundled-map.json');
