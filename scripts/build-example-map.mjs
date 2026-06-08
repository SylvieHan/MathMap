import JSZip from 'jszip';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const placeholderSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80" viewBox="0 0 120 80">
  <rect width="120" height="80" fill="#e2e8f0"/>
  <text x="60" y="38" text-anchor="middle" font-family="system-ui,sans-serif" font-size="12" fill="#64748b">π</text>
  <text x="60" y="56" text-anchor="middle" font-family="system-ui,sans-serif" font-size="9" fill="#94a3b8">placeholder</text>
</svg>`;

const blobId = 'seed-placeholder-image';
const manifest = {
  version: 1,
  meta: {
    title: 'Example MathMap',
    author: 'MathMap',
    createdAt: new Date().toISOString(),
  },
  nodes: [
    { id: 'folder-nt', title: 'Number Theory', type: 'field-folder', parentId: null, mscCodes: ['11'], customTags: [], position: { x: -120, y: -80 }, pinned: false, content: [], collapsed: false },
    { id: 'primes', title: 'Prime Numbers', type: 'concept', parentId: 'folder-nt', mscCodes: ['11A'], customTags: ['fundamental'], position: { x: -160, y: 20 }, pinned: false, content: [
      { id: 'primes-text', type: 'text', markdown: 'A **prime** is a natural number greater than 1 with no positive divisors other than 1 and itself.\n\nThe fundamental theorem of arithmetic states every integer factors uniquely into primes.' },
      { id: 'primes-img', type: 'image', asset: `assets/${blobId}`, filename: 'placeholder.svg' },
    ] },
    { id: 'modular', title: 'Modular Arithmetic', type: 'concept', parentId: 'folder-nt', mscCodes: ['11A', '11R'], customTags: ['algebra'], position: { x: -40, y: 20 }, pinned: false, content: [] },
    { id: 'folder-ag', title: 'Algebraic Geometry', type: 'field-folder', parentId: null, mscCodes: ['14'], customTags: [], position: { x: 140, y: -80 }, pinned: false, content: [], collapsed: false },
    { id: 'schemes', title: 'Schemes', type: 'concept', parentId: 'folder-ag', mscCodes: ['14A'], customTags: ['foundations'], position: { x: 120, y: 20 }, pinned: false, content: [
      { id: 'schemes-text', type: 'text', markdown: 'Schemes glue together affine pieces using commutative algebra, generalizing varieties.' },
    ] },
    { id: 'folder-prob', title: 'Probability', type: 'field-folder', parentId: null, mscCodes: ['60'], customTags: [], position: { x: 10, y: 140 }, pinned: false, content: [], collapsed: false },
    { id: 'markov', title: 'Markov Chains', type: 'concept', parentId: 'folder-prob', mscCodes: ['60J'], customTags: ['stochastic'], position: { x: -30, y: 240 }, pinned: false, content: [] },
    { id: 'random-walk', title: 'Random Walk', type: 'concept', parentId: 'folder-prob', mscCodes: ['60G', '60J'], customTags: ['stochastic', 'discrete'], position: { x: 110, y: 240 }, pinned: false, content: [] },
  ],
  edges: [
    { id: 'e-primes-modular', source: 'primes', target: 'modular', label: 'used in', weight: 1 },
    { id: 'e-schemes-modular', source: 'schemes', target: 'modular', label: 'connects fields', weight: 1 },
    { id: 'e-markov-rw', source: 'markov', target: 'random-walk', label: 'example of', weight: 1 },
  ],
};

const zip = new JSZip();
zip.file('manifest.json', JSON.stringify(manifest, null, 2));
zip.file(`assets/${blobId}`, placeholderSvg);

const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
const outPath = join(root, 'public', 'example.mathmap');
writeFileSync(outPath, buffer);
console.log('Wrote', outPath);
