import { useEffect, useState } from 'react';
import { loadMap, saveMap } from '../db';
import { createEmptyMap, createNode, createEdge } from '../data/maps';
import { mergeMaps, replaceMap } from '../utils/merge';
import { downloadMathMap, parseMathMapFile, importMathMapToDb } from '../utils/exportImport';
import { colorForNode } from '../utils/colors';
import type { MathMap, MapEdge, MapNode } from '../types';
import { getBundledMapUrl, isReadOnlyMode } from '../utils/siteMode';

/** Local editor: blank map on first open; rich seed is only for published bundled-map.json. */
const LOCAL_EDITOR_PROTOCOL = 1;

function isOldAutoDemoSeed(map: MathMap): boolean {
  return (
    map.meta.title === 'My MathMap' &&
    (map.meta.seedVersion ?? 0) >= 2 &&
    map.nodes.some((n) => n.id === 'fld-nt')
  );
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

      if (!stored) {
        stored = createEmptyMap();
        stored.meta.localEditorProtocol = LOCAL_EDITOR_PROTOCOL;
        await saveMap(stored);
      } else if ((stored.meta.localEditorProtocol ?? 0) < LOCAL_EDITOR_PROTOCOL) {
        if (isOldAutoDemoSeed(stored)) {
          stored = createEmptyMap();
        }
        stored.meta.localEditorProtocol = LOCAL_EDITOR_PROTOCOL;
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
