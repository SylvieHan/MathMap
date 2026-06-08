import type { MapEdge, MapNode } from '../types';

export function sharedTagCount(a: MapNode, b: MapNode): number {
  const tagsA = new Set([...a.mscCodes, ...a.customTags.map((t) => t.toLowerCase())]);
  const tagsB = new Set([...b.mscCodes, ...b.customTags.map((t) => t.toLowerCase())]);
  let count = 0;
  for (const t of tagsA) {
    if (tagsB.has(t)) count++;
  }
  return count;
}

/** Implicit soft edges for shared tags (layout-only) */
export function computeTagEdges(nodes: MapNode[]): MapEdge[] {
  const concepts = nodes.filter((n) => n.type === 'concept');
  const edges: MapEdge[] = [];

  for (let i = 0; i < concepts.length; i++) {
    for (let j = i + 1; j < concepts.length; j++) {
      const shared = sharedTagCount(concepts[i], concepts[j]);
      if (shared > 0) {
        edges.push({
          id: `__tag__${concepts[i].id}__${concepts[j].id}`,
          source: concepts[i].id,
          target: concepts[j].id,
          weight: shared * 2,
        });
      }
    }
  }
  return edges;
}

export function isTagEdgeId(id: string): boolean {
  return id.startsWith('__tag__');
}

export function allLayoutEdges(manualEdges: MapEdge[], nodes: MapNode[]): MapEdge[] {
  return [...manualEdges, ...computeTagEdges(nodes)];
}

export const FCoseLayoutOptions = {
  name: 'fcose',
  quality: 'default',
  randomize: false,
  animate: true,
  animationDuration: 500,
  fit: true,
  padding: 40,
  nodeDimensionsIncludeLabels: true,
  uniformNodeDimensions: false,
  packComponents: true,
  nodeRepulsion: () => 5500,
  idealEdgeLength: (edge: { data: (key: string) => unknown }) => {
    const w = edge.data('weight') as number | undefined;
    if (typeof w === 'number' && w > 0) return Math.max(40, 120 - w * 10);
    return 80;
  },
  edgeElasticity: () => 0.45,
  nestingFactor: 0.2,
  gravity: 0.35,
  numIter: 2500,
  tile: true,
  tilingPaddingVertical: 20,
  tilingPaddingHorizontal: 20,
} as const;
