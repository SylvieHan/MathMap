import { useEffect, useState } from 'react';
import { loadMap, saveMap, saveBlob } from '../db';
import { createSeedMap, createNode, createEdge, createEmptyMap } from '../data/maps';
import { SEED_VERSION } from '../data/richSeed';
import { mergeMaps, replaceMap } from '../utils/merge';
import { downloadMathMap, parseMathMapFile, importMathMapToDb } from '../utils/exportImport';
import { colorForNode } from '../utils/colors';
import type { MathMap, MapEdge, MapNode } from '../types';
import { getBundledMapUrl, isReadOnlyMode } from '../utils/siteMode';

const PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80" viewBox="0 0 120 80">
  <rect width="120" height="80" fill="#e2e8f0"/>
  <text x="60" y="38" text-anchor="middle" font-family="system-ui,sans-serif" font-size="12" fill="#64748b">π</text>
  <text x="60" y="56" text-anchor="middle" font-family="system-ui,sans-serif" font-size="9" fill="#94a3b8">placeholder</text>
</svg>`;

async function createSeedMapWithAssets() {
  const blobId = 'seed-placeholder-image';
  await saveBlob(blobId, new Blob([PLACEHOLDER_SVG], { type: 'image/svg+xml' }));
  const seed = createSeedMap();
  const primes = seed.nodes.find((n) => n.id === 'primes');
  if (primes) {
    primes.content = [
      {
        id: 'primes-text',
        type: 'text',
        markdown:
          'A **prime** is a natural number greater than 1 with no positive divisors other than 1 and itself.\n\nThe fundamental theorem of arithmetic states every integer factors uniquely into primes.',
      },
      {
        id: 'primes-img',
        type: 'image',
        blobId,
        filename: 'placeholder.svg',
      },
    ];
  }
  return seed;
}

export function useMap() {
  const [map, setMap] = useState<MathMap | null>(null);
  const [loading, setLoading] = useState(true);
  const [readOnly] = useState(isReadOnlyMode);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const bundledUrl = getBundledMapUrl();

      if (bundledUrl && isReadOnlyMode()) {
        try {
          const res = await fetch(bundledUrl);
          if (res.ok) {
            const map = (await res.json()) as MathMap;
            if (!cancelled) {
              setMap(map);
              setLoading(false);
            }
            return;
          }
        } catch {
          // fall through to local
        }
      }

      let stored = await loadMap();
      const needsFreshSeed =
        !stored ||
        ((stored.meta.seedVersion ?? 0) < SEED_VERSION &&
          stored.meta.title === 'My MathMap');

      if (!stored || needsFreshSeed) {
        stored = await createSeedMapWithAssets();
        stored.meta.seedVersion = SEED_VERSION;
        await saveMap(stored);
      }

      if (!cancelled) {
        setMap(stored);
        setLoading(false);
      }
    }

    init();
    return () => { cancelled = true; };
  }, []);

  const persist = async (next: MathMap) => {
    setMap(next);
    if (!readOnly) await saveMap(next);
  };

  const updateMeta = (title: string) => {
    if (!map) return;
    persist({ ...map, meta: { ...map.meta, title } });
  };

  const updateLatexPackages = (latexPackages: string[]) => {
    if (!map) return;
    persist({ ...map, meta: { ...map.meta, latexPackages } });
  };

  const updateNode = (node: MapNode) => {
    if (!map) return;
    const nodes = map.nodes.map((n) => (n.id === node.id ? node : n));
    persist({ ...map, nodes });
  };

  const addNode = (type: 'concept' | 'field-folder') => {
    if (!map) return;
    const node = createNode({
      title: type === 'field-folder' ? 'New Field' : 'New Concept',
      type,
      position: { x: 100 + Math.random() * 200, y: 100 + Math.random() * 200 },
      mscCodes: type === 'field-folder' ? ['00'] : [],
      color: colorForNode(type, type === 'field-folder' ? ['00'] : []),
    });
    persist({ ...map, nodes: [...map.nodes, node] });
  };

  const deleteNode = (id: string) => {
    if (!map) return;
    const removeIds = new Set<string>();
    const collect = (nodeId: string) => {
      removeIds.add(nodeId);
      map.nodes.filter((n) => n.parentId === nodeId).forEach((c) => collect(c.id));
    };
    collect(id);
    persist({
      ...map,
      nodes: map.nodes.filter((n) => !removeIds.has(n.id)),
      edges: map.edges.filter((e) => !removeIds.has(e.source) && !removeIds.has(e.target)),
    });
  };

  const moveNode = (id: string, x: number, y: number) => {
    if (!map) return;
    const nodes = map.nodes.map((n) =>
      n.id === id ? { ...n, position: { x, y } } : n,
    );
    persist({ ...map, nodes });
  };

  const togglePin = (id: string) => {
    if (!map) return;
    const nodes = map.nodes.map((n) =>
      n.id === id ? { ...n, pinned: !n.pinned } : n,
    );
    persist({ ...map, nodes });
  };

  const toggleCollapse = (id: string) => {
    if (!map) return;
    const nodes = map.nodes.map((n) =>
      n.id === id ? { ...n, collapsed: !n.collapsed } : n,
    );
    persist({ ...map, nodes });
  };

  const addEdge = (source: string, target: string) => {
    if (!map) return;
    const exists = map.edges.some(
      (e) =>
        (e.source === source && e.target === target) ||
        (e.source === target && e.target === source),
    );
    if (exists) return;
    persist({ ...map, edges: [...map.edges, createEdge(source, target)] });
  };

  const removeEdge = (id: string) => {
    if (!map) return;
    persist({ ...map, edges: map.edges.filter((e) => e.id !== id) });
  };

  const updateEdge = (edge: MapEdge) => {
    if (!map) return;
    const edges = map.edges.map((e) => (e.id === edge.id ? edge : e));
    persist({ ...map, edges });
  };

  const handleExport = async () => {
    if (!map) return;
    await downloadMathMap(map);
  };

  const handleImport = async (file: File, mode: 'replace' | 'merge') => {
    const result = await parseMathMapFile(file);
    await importMathMapToDb(result);
    if (!map) {
      setMap(result.map);
      await saveMap(result.map);
      return;
    }
    const next = mode === 'merge' ? mergeMaps(map, result.map) : replaceMap(map, result.map);
    await persist(next);
  };

  const resetToEmpty = async () => {
    const empty = createEmptyMap();
    await persist(empty);
  };

  const relayout = () => {
    if (!map) return;
    const nodes = map.nodes.map((n) =>
      n.pinned ? n : { ...n, position: { x: 0, y: 0 } },
    );
    persist({ ...map, nodes });
  };

  return {
    map,
    loading,
    readOnly,
    updateMeta,
    updateLatexPackages,
    updateNode,
    addNode,
    deleteNode,
    moveNode,
    togglePin,
    toggleCollapse,
    addEdge,
    removeEdge,
    updateEdge,
    handleExport,
    handleImport,
    resetToEmpty,
    relayout,
  };
}

export type UseMapReturn = ReturnType<typeof useMap>;
