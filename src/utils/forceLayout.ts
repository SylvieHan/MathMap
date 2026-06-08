import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
} from 'd3-force';
import type { MapEdge, MapNode } from '../types';
import { isTagEdgeId } from './layout';
import {
  computeCircleLayout,
  getSubfieldLabel,
  type CircleItem,
} from './circleLayout';
import { colorForNode, lighten } from './colors';

export type SimKind = 'field' | 'subfield' | 'concept';

export interface ForceSimNode {
  id: string;
  kind: SimKind;
  r: number;
  fieldId: string;
  subfieldKey?: string;
  mapNode: MapNode;
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
  /** Offset from parent field center (subfields & concepts) */
  relDx?: number;
  relDy?: number;
}

export interface SimLink {
  source: string;
  target: string;
  weight: number;
}

export function zeroVelocities(nodes: ForceSimNode[]): void {
  for (const n of nodes) {
    n.vx = 0;
    n.vy = 0;
  }
}

/** Keep follower nodes inside their field disc */
export function syncChildrenToFields(simNodes: ForceSimNode[]): void {
  const fields = new Map(
    simNodes.filter((n) => n.kind === 'field').map((f) => [f.fieldId, f]),
  );

  for (const n of simNodes) {
    if (n.kind === 'field' || n.relDx === undefined || n.relDy === undefined) continue;
    const f = fields.get(n.fieldId);
    if (!f) continue;

    let dx = n.relDx;
    let dy = n.relDy;
    const dist = Math.hypot(dx, dy);
    const maxD = Math.max(f.r - n.r - 5, 8);
    if (dist > maxD && dist > 0) {
      dx = (dx / dist) * maxD;
      dy = (dy / dist) * maxD;
      n.relDx = dx;
      n.relDy = dy;
    }
    n.x = f.x + dx;
    n.y = f.y + dy;
  }
}

export function buildForceGraph(
  nodes: MapNode[],
  edges: MapEdge[],
): { simNodes: ForceSimNode[]; fieldNodes: ForceSimNode[]; fieldLinks: SimLink[] } {
  const staticLayout = computeCircleLayout(nodes, edges);
  const simNodes: ForceSimNode[] = [];
  const fieldCenters = new Map<string, CircleItem>();

  for (const item of staticLayout) {
    if (item.kind === 'field') fieldCenters.set(item.id, item);
  }

  for (const item of staticLayout) {
    const pinned =
      item.node.pinned &&
      (item.node.position.x !== 0 || item.node.position.y !== 0);
    const field = fieldCenters.get(item.kind === 'field' ? item.id : item.fieldId);
    const relDx = field && item.kind !== 'field' ? item.x - field.x : undefined;
    const relDy = field && item.kind !== 'field' ? item.y - field.y : undefined;

    simNodes.push({
      id: item.id,
      kind: item.kind,
      r: item.r,
      fieldId: item.fieldId,
      subfieldKey: item.subfieldKey,
      mapNode: item.node,
      x: item.x,
      y: item.y,
      vx: 0,
      vy: 0,
      fx: pinned ? item.x : null,
      fy: pinned ? item.y : null,
      relDx,
      relDy,
    });
  }

  syncChildrenToFields(simNodes);

  const concepts = nodes.filter((n) => n.type === 'concept');
  const fieldLinkWeight = new Map<string, number>();
  for (const edge of edges) {
    if (isTagEdgeId(edge.id)) continue;
    const a = concepts.find((c) => c.id === edge.source);
    const b = concepts.find((c) => c.id === edge.target);
    if (!a?.parentId || !b?.parentId || a.parentId === b.parentId) continue;
    const key = [a.parentId, b.parentId].sort().join('|');
    fieldLinkWeight.set(key, (fieldLinkWeight.get(key) ?? 0) + (edge.weight ?? 1));
  }

  const fieldLinks: SimLink[] = [...fieldLinkWeight.entries()].map(([key, weight]) => {
    const [source, target] = key.split('|');
    return { source, target, weight };
  });

  const fieldNodes = simNodes.filter((n) => n.kind === 'field');
  return { simNodes, fieldNodes, fieldLinks };
}

export function createFieldSimulation(
  fieldNodes: ForceSimNode[],
  fieldLinks: SimLink[],
): Simulation<ForceSimNode, SimLink> {
  const linkForce = forceLink<ForceSimNode, SimLink>(fieldLinks)
    .id((d) => d.id)
    .distance((l) => 200 + 60 / l.weight)
    .strength((l) => 0.05 + 0.025 * l.weight);

  const sim = forceSimulation<ForceSimNode>(fieldNodes)
    .force('link', linkForce)
    .force('charge', forceManyBody<ForceSimNode>().strength(-120))
    .force(
      'collide',
      forceCollide<ForceSimNode>()
        .radius((d) => d.r + 12)
        .strength(0.9)
        .iterations(3),
    )
    .alphaDecay(0.09)
    .velocityDecay(0.62);

  return sim;
}

export function simNodesToCircleItems(simNodes: ForceSimNode[]): CircleItem[] {
  const items: CircleItem[] = [];

  for (const sn of simNodes) {
    if (sn.kind === 'field') {
      const fColor = colorForNode('field-folder', sn.mapNode.mscCodes, sn.mapNode.color);
      items.push({
        id: sn.id,
        kind: 'field',
        x: sn.x,
        y: sn.y,
        r: sn.r,
        label: sn.mapNode.title,
        color: fColor,
        fillOpacity: 0.1,
        stroke: fColor,
        node: sn.mapNode,
        fieldId: sn.fieldId,
      });
    } else if (sn.kind === 'subfield' && sn.subfieldKey) {
      const sfColor = colorForNode('concept', [sn.subfieldKey]);
      items.push({
        id: sn.id,
        kind: 'subfield',
        x: sn.x,
        y: sn.y,
        r: sn.r,
        label: getSubfieldLabel(sn.subfieldKey),
        color: sfColor,
        fillOpacity: 0.2,
        stroke: lighten(sfColor, 0.15),
        node: sn.mapNode,
        fieldId: sn.fieldId,
        subfieldKey: sn.subfieldKey,
      });
    } else if (sn.kind === 'concept') {
      const c = sn.mapNode;
      const cColor = colorForNode('concept', c.mscCodes, c.color);
      items.push({
        id: sn.id,
        kind: 'concept',
        x: sn.x,
        y: sn.y,
        r: sn.r,
        label: c.title,
        color: cColor,
        fillOpacity: 0.85,
        stroke: lighten(cColor, 0.2),
        node: c,
        fieldId: sn.fieldId,
        subfieldKey: sn.subfieldKey,
      });
    }
  }

  return items;
}

export function simNodeIdsForDragTarget(
  target: { kind: 'concept'; nodeId: string } | { kind: 'field'; fieldId: string } | { kind: 'subfield'; fieldId: string; subfieldKey: string },
  simNodes: ForceSimNode[],
): string[] {
  switch (target.kind) {
    case 'concept':
      return [target.nodeId];
    case 'field':
      return simNodes.filter((n) => n.fieldId === target.fieldId).map((n) => n.id);
    case 'subfield':
      return simNodes
        .filter(
          (n) =>
            n.fieldId === target.fieldId &&
            (n.kind === 'subfield'
              ? n.subfieldKey === target.subfieldKey
              : n.kind === 'concept' && n.subfieldKey === target.subfieldKey),
        )
        .map((n) => n.id);
  }
}

/** Clamp a circle inside a field for overview decor display */
export function clampInsideField(item: CircleItem, field: CircleItem): CircleItem {
  const dx = item.x - field.x;
  const dy = item.y - field.y;
  const dist = Math.hypot(dx, dy);
  const maxD = Math.max(field.r - item.r - 3, 4);
  if (dist <= maxD || dist === 0) return item;
  return {
    ...item,
    x: field.x + (dx / dist) * maxD,
    y: field.y + (dy / dist) * maxD,
  };
}
