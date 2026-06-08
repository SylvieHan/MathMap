import type { MathMap, MapEdge, MapNode } from '../types';
import { DEFAULT_LATEX_PACKAGES } from '../utils/latex';
import { RICH_SEED } from './richSeed';

export function createSeedMap(): MathMap {
  return {
    meta: { ...RICH_SEED.meta },
    nodes: RICH_SEED.nodes.map((n) => ({ ...n, position: { x: 0, y: 0 } })),
    edges: [...RICH_SEED.edges],
  };
}

export function createEmptyMap(): MathMap {
  return {
    meta: {
      title: 'Untitled Map',
      author: '',
      createdAt: new Date().toISOString(),
      seedVersion: 0,
      latexPackages: [...DEFAULT_LATEX_PACKAGES],
    },
    nodes: [],
    edges: [],
  };
}

export function createNode(partial: Partial<MapNode> & Pick<MapNode, 'title' | 'type'>): MapNode {
  return {
    id: partial.id ?? crypto.randomUUID(),
    title: partial.title,
    type: partial.type,
    parentId: partial.parentId ?? null,
    mscCodes: partial.mscCodes ?? [],
    customTags: partial.customTags ?? [],
    position: partial.position ?? { x: 0, y: 0 },
    pinned: partial.pinned ?? false,
    color: partial.color,
    definition: partial.definition ?? '',
    historyAndReferences: partial.historyAndReferences ?? '',
    content: partial.content ?? [],
    collapsed: partial.collapsed ?? false,
  };
}

export function createEdge(source: string, target: string, label?: string): MapEdge {
  return {
    id: crypto.randomUUID(),
    source,
    target,
    label,
    theorem: '',
    weight: 1,
  };
}
