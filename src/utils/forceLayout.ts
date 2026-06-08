import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
} from 'd3-force';
import type { MapEdge, MapNode } from '../types';
import { isTagEdgeId } from './layout';

const TENSION_SUBSTEPS = 6;
const TENSION_DAMPING = 0.76;
const TENSION_SETTLE_THRESHOLD = 0.12;

const SPRING_K = {
  sameSubfield: 0.85,
  sameField: 0.55,
  crossField: 0.32,
} as const;
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

export type DragTargetShape =
  | { kind: 'concept'; nodeId: string }
  | { kind: 'field'; fieldId: string }
  | { kind: 'subfield'; fieldId: string; subfieldKey: string };

/** Nodes moved directly under the pointer (field, subfield, or concept). */
export function primarySimNodeIdsForDragTarget(target: DragTargetShape): string[] {
  switch (target.kind) {
    case 'concept':
      return [target.nodeId];
    case 'field':
      return [target.fieldId];
    case 'subfield':
      return [`${target.fieldId}__sf__${target.subfieldKey}`];
  }
}

/** All nodes in the dragged group (for follower offsets and tension). */
export function simNodeIdsForDragTarget(
  target: DragTargetShape,
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

function clampConceptInField(n: ForceSimNode, fields: Map<string, ForceSimNode>): void {
  const f = fields.get(n.fieldId);
  if (!f) return;
  let dx = n.x - f.x;
  let dy = n.y - f.y;
  const dist = Math.hypot(dx, dy);
  const maxD = Math.max(f.r - n.r - 5, 8);
  if (dist > maxD && dist > 0) {
    dx = (dx / dist) * maxD;
    dy = (dy / dist) * maxD;
    n.x = f.x + dx;
    n.y = f.y + dy;
  }
}

function collectTensionAffected(
  anchorId: string | null,
  edges: MapEdge[],
  byId: Map<string, ForceSimNode>,
  velocities: Map<string, { vx: number; vy: number }>,
): Set<string> {
  const affected = new Set<string>();
  if (anchorId) {
    affected.add(anchorId);
    for (const edge of edges) {
      if (isTagEdgeId(edge.id)) continue;
      if (edge.source === anchorId) affected.add(edge.target);
      if (edge.target === anchorId) affected.add(edge.source);
    }
    return affected;
  }

  for (const id of velocities.keys()) {
    if (byId.has(id)) affected.add(id);
  }
  let grew = true;
  while (grew) {
    grew = false;
    for (const edge of edges) {
      if (isTagEdgeId(edge.id)) continue;
      if (!byId.has(edge.source) || !byId.has(edge.target)) continue;
      const touches = affected.has(edge.source) || affected.has(edge.target);
      if (!touches) continue;
      const before = affected.size;
      affected.add(edge.source);
      affected.add(edge.target);
      if (affected.size > before) grew = true;
    }
  }
  return affected;
}

function springIdeal(
  a: ForceSimNode,
  b: ForceSimNode,
  nodes: MapNode[],
  w: number,
): { ideal: number; k: number } {
  const na = nodes.find((n) => n.id === a.id);
  const nb = nodes.find((n) => n.id === b.id);
  const crossField = na?.parentId !== nb?.parentId;
  const sameSubfield = a.subfieldKey === b.subfieldKey && a.fieldId === b.fieldId;
  const k = crossField
    ? SPRING_K.crossField
    : sameSubfield
      ? SPRING_K.sameSubfield
      : SPRING_K.sameField;
  const ideal = crossField ? 48 + 28 / w : sameSubfield ? 18 + 10 / w : 28 + 14 / w;
  return { ideal, k };
}

/**
 * Velocity-based link springs. anchorId = dragged concept (fixed); null = free release oscillation.
 * Returns true while motion is still visible.
 */
export function stepTensionSprings(
  simNodes: ForceSimNode[],
  anchorId: string | null,
  edges: MapEdge[],
  nodes: MapNode[],
  velocities: Map<string, { vx: number; vy: number }>,
  substeps = TENSION_SUBSTEPS,
): boolean {
  const concepts = simNodes.filter((n) => n.kind === 'concept');
  const byId = new Map(concepts.map((n) => [n.id, n]));
  const fields = new Map(
    simNodes.filter((n) => n.kind === 'field').map((f) => [f.fieldId, f]),
  );
  const affected = collectTensionAffected(anchorId, edges, byId, velocities);
  if (affected.size === 0) return false;

  let maxSpeed = 0;

  for (let step = 0; step < substeps; step++) {
    const forces = new Map<string, { fx: number; fy: number }>();
    for (const id of affected) forces.set(id, { fx: 0, fy: 0 });

    for (const edge of edges) {
      if (isTagEdgeId(edge.id)) continue;
      const a = byId.get(edge.source);
      const b = byId.get(edge.target);
      if (!a || !b) continue;
      if (!affected.has(a.id) || !affected.has(b.id)) continue;
      if (anchorId && edge.source !== anchorId && edge.target !== anchorId) continue;

      const w = edge.weight ?? 1;
      const { ideal, k } = springIdeal(a, b, nodes, w);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 1;
      const stretch = dist - ideal;
      const mag = k * stretch * w;
      const fx = (dx / dist) * mag;
      const fy = (dy / dist) * mag;

      forces.get(a.id)!.fx += fx;
      forces.get(a.id)!.fy += fy;
      forces.get(b.id)!.fx -= fx;
      forces.get(b.id)!.fy -= fy;
    }

    for (const id of affected) {
      const n = byId.get(id);
      if (!n || n.mapNode.pinned) continue;

      if (anchorId === id) {
        velocities.set(id, { vx: 0, vy: 0 });
        continue;
      }

      const f = forces.get(id) ?? { fx: 0, fy: 0 };
      const v = velocities.get(id) ?? { vx: 0, vy: 0 };
      v.vx = (v.vx + f.fx) * TENSION_DAMPING;
      v.vy = (v.vy + f.fy) * TENSION_DAMPING;
      velocities.set(id, v);

      n.x += v.vx;
      n.y += v.vy;
      clampConceptInField(n, fields);
      maxSpeed = Math.max(maxSpeed, Math.hypot(v.vx, v.vy));
    }
  }

  return maxSpeed > TENSION_SETTLE_THRESHOLD;
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
