import type { MathMap, MapNode } from '../types';

function uniqueId(base: string, existing: Set<string>): string {
  if (!existing.has(base)) return base;
  let i = 2;
  while (existing.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

export function mergeMaps(current: MathMap, incoming: MathMap): MathMap {
  const nodeIds = new Set(current.nodes.map((n) => n.id));
  const edgeIds = new Set(current.edges.map((e) => e.id));
  const idRemap = new Map<string, string>();

  const mergedNodes: MapNode[] = [...current.nodes];

  for (const node of incoming.nodes) {
    if (!nodeIds.has(node.id)) {
      mergedNodes.push(node);
      nodeIds.add(node.id);
      continue;
    }

    const newId = uniqueId(node.id, nodeIds);
    idRemap.set(node.id, newId);
    mergedNodes.push({ ...node, id: newId });
    nodeIds.add(newId);
  }

  const remap = (id: string) => idRemap.get(id) ?? id;

  const mergedEdges = [...current.edges];
  for (const edge of incoming.edges) {
    const source = remap(edge.source);
    const target = remap(edge.target);
    const newEdgeId = uniqueId(
      idRemap.has(edge.id) ? `${edge.id}-merged` : edge.id,
      edgeIds,
    );
    if (!edgeIds.has(newEdgeId)) {
      mergedEdges.push({
        ...edge,
        id: newEdgeId === edge.id && !idRemap.has(edge.id) ? edge.id : newEdgeId,
        source,
        target,
      });
      edgeIds.add(newEdgeId);
    }
  }

  return {
    nodes: mergedNodes,
    edges: mergedEdges.filter((e) => !e.id.startsWith('__tag__')),
    meta: {
      title: `${current.meta.title} + ${incoming.meta.title}`,
      author: current.meta.author || incoming.meta.author,
      createdAt: current.meta.createdAt,
    },
  };
}

export function replaceMap(_current: MathMap, incoming: MathMap): MathMap {
  return incoming;
}
