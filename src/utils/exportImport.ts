import JSZip from 'jszip';
import type { ContentBlock, MathMap } from '../types';
import { importBlobs, loadAllBlobs, saveBlob } from '../db';

const MANIFEST = 'manifest.json';
const ASSETS_DIR = 'assets/';

type SerializedBlock =
  | { id: string; type: 'text'; markdown: string }
  | { id: string; type: 'image'; asset: string; filename: string }
  | { id: string; type: 'pdf'; asset: string; filename: string }
  | { id: string; type: 'link'; url: string; label: string };

interface SerializedMap extends Omit<MathMap, 'nodes'> {
  nodes: Array<Omit<MathMap['nodes'][0], 'content'> & { content: SerializedBlock[] }>;
  version: 1;
}

function serializeContent(block: ContentBlock): SerializedBlock {
  switch (block.type) {
    case 'text':
      return block;
    case 'image':
      return { id: block.id, type: 'image', asset: `${ASSETS_DIR}${block.blobId}`, filename: block.filename };
    case 'pdf':
      return { id: block.id, type: 'pdf', asset: `${ASSETS_DIR}${block.blobId}`, filename: block.filename };
    case 'link':
      return block;
  }
}

function deserializeContent(block: SerializedBlock, blobIdFromAsset: (asset: string) => string): ContentBlock {
  switch (block.type) {
    case 'text':
    case 'link':
      return block;
    case 'image':
      return {
        id: block.id,
        type: 'image',
        blobId: blobIdFromAsset(block.asset),
        filename: block.filename,
      };
    case 'pdf':
      return {
        id: block.id,
        type: 'pdf',
        blobId: blobIdFromAsset(block.asset),
        filename: block.filename,
      };
  }
}

export async function exportMathMap(map: MathMap): Promise<Blob> {
  const zip = new JSZip();
  const blobs = await loadAllBlobs();
  const referenced = new Set<string>();

  for (const node of map.nodes) {
    for (const block of node.content) {
      if (block.type === 'image' || block.type === 'pdf') {
        referenced.add(block.blobId);
      }
    }
  }

  const serialized: SerializedMap = {
    version: 1,
    nodes: map.nodes.map((n) => ({
      ...n,
      content: n.content.map(serializeContent),
    })),
    edges: map.edges,
    meta: map.meta,
  };

  zip.file(MANIFEST, JSON.stringify(serialized, null, 2));

  const assets = zip.folder('assets');
  for (const blobId of referenced) {
    const blob = blobs.get(blobId);
    if (blob) {
      assets?.file(blobId, blob);
    }
  }

  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

export async function downloadMathMap(map: MathMap, filename?: string): Promise<void> {
  const blob = await exportMathMap(map);
  const name = filename ?? `${map.meta.title.replace(/\s+/g, '-').toLowerCase() || 'map'}.mathmap`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name.endsWith('.mathmap') ? name : `${name}.mathmap`;
  a.click();
  URL.revokeObjectURL(url);
}

export interface ImportResult {
  map: MathMap;
  blobs: Map<string, Blob>;
}

export async function parseMathMapFile(file: File | Blob): Promise<ImportResult> {
  const zip = await JSZip.loadAsync(file);
  const manifestFile = zip.file(MANIFEST);
  if (!manifestFile) throw new Error('Invalid .mathmap file: missing manifest.json');

  const raw = JSON.parse(await manifestFile.async('string')) as SerializedMap;
  const blobs = new Map<string, Blob>();

  const assetFiles = zip.folder('assets');
  if (assetFiles) {
    const names = Object.keys(assetFiles.files).filter((n) => !n.endsWith('/'));
    for (const path of names) {
      const f = zip.file(path);
      if (f) {
        const blobId = path.replace(ASSETS_DIR, '');
        blobs.set(blobId, await f.async('blob'));
      }
    }
  }

  const blobIdFromAsset = (asset: string) => asset.replace(ASSETS_DIR, '');

  const map: MathMap = {
    nodes: raw.nodes.map((n) => ({
      ...n,
      content: n.content.map((b) => deserializeContent(b, blobIdFromAsset)),
    })),
    edges: raw.edges.filter((e) => !e.id.startsWith('__tag__')),
    meta: raw.meta,
  };

  return { map, blobs };
}

export async function importMathMapToDb(result: ImportResult): Promise<void> {
  await importBlobs(result.blobs);
}

export async function loadBundledMap(url: string): Promise<ImportResult> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load bundled map: ${res.statusText}`);
  return parseMathMapFile(await res.blob());
}

export async function storeContentBlob(blob: Blob): Promise<string> {
  const id = crypto.randomUUID();
  await saveBlob(id, blob);
  return id;
}
