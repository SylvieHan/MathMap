import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
} from 'd3-force';
import type { MapEdge, MapNode } from '../types';
import { isTagEdgeId } from './layout';

const TENSION_SUBSTEPS = 8;
const TENSION_DAMPING = 0.78;
const TENSION_SETTLE_THRESHOLD = 0.12;

const CONTAINER_DRAG_SUBSTEPS = 5;
const CONTAINER_SETTLE_THRESHOLD = 0.1;
const COLLISION_STRENGTH = 0.85;
const COLLISION_SEPARATION_ITERS = 6;

const SPRING_K = {
  sameSubfield: 0.9,
  sameField: 0.72,
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
export function syncChildrenToFields(
  simNodes: ForceSimNode[],
  skipChildIds?: Set<string>,
): void {
  const fields = new Map(
    simNodes.filter((n) => n.kind === 'field').map((f) => [f.fieldId, f]),
  );

  for (const n of simNodes) {
    if (skipChildIds?.has(n.id)) continue;
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

function innerRadius(container: ForceSimNode, child: ForceSimNode, padding = 5): number {
  return Math.max(container.r - child.r - padding, 6);
}

function clampInsideFieldDisc(
  n: ForceSimNode,
  fields: Map<string, ForceSimNode>,
  velocities?: Map<string, { vx: number; vy: number }>,
): void {
  if (n.kind === 'field') return;
  const f = fields.get(n.fieldId);
  if (!f) return;
  let dx = n.x - f.x;
  let dy = n.y - f.y;
  const dist = Math.hypot(dx, dy);
  const maxD = innerRadius(f, n);
  if (dist > maxD && dist > 0) {
    const nx = dx / dist;
    const ny = dy / dist;
    n.x = f.x + nx * maxD;
    n.y = f.y + ny * maxD;
    if (velocities) {
      const v = velocities.get(n.id);
      if (v) {
        const dot = v.vx * nx + v.vy * ny;
        if (dot > 0) {
          v.vx -= dot * nx * 1.15;
          v.vy -= dot * ny * 1.15;
        }
      }
    }
  }
}

function clampInsideContainerDisc(
  child: ForceSimNode,
  container: ForceSimNode,
  velocities?: Map<string, { vx: number; vy: number }>,
): void {
  let dx = child.x - container.x;
  let dy = child.y - container.y;
  const dist = Math.hypot(dx, dy);
  const maxD = innerRadius(container, child);
  if (dist > maxD && dist > 0) {
    const nx = dx / dist;
    const ny = dy / dist;
    child.x = container.x + nx * maxD;
    child.y = container.y + ny * maxD;
    if (velocities) {
      const v = velocities.get(child.id);
      if (v) {
        const dot = v.vx * nx + v.vy * ny;
        if (dot > 0) {
          v.vx -= dot * nx * 1.1;
          v.vy -= dot * ny * 1.1;
        }
      }
    }
  }
}

function clampConceptInField(n: ForceSimNode, fields: Map<string, ForceSimNode>): void {
  clampInsideFieldDisc(n, fields);
}

function applyFieldCollisions(
  mates: ForceSimNode[],
  movable: Set<string>,
  velocities: Map<string, { vx: number; vy: number }>,
  fixedIds: Set<string>,
): void {
  for (let i = 0; i < mates.length; i++) {
    for (let j = i + 1; j < mates.length; j++) {
      const a = mates[i];
      const b = mates[j];
      if (a.mapNode.pinned || b.mapNode.pinned) continue;
      if (!movable.has(a.id) && !movable.has(b.id)) continue;

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 0.01;
      const minDist = a.r + b.r + 3;
      if (dist >= minDist) continue;

      const overlap = minDist - dist;
      const nx = dx / dist;
      const ny = dy / dist;
      const push = overlap * COLLISION_STRENGTH * 0.5;

      if (movable.has(a.id) && !fixedIds.has(a.id)) {
        const va = velocities.get(a.id) ?? { vx: 0, vy: 0 };
        va.vx -= nx * push;
        va.vy -= ny * push;
        velocities.set(a.id, va);
      }
      if (movable.has(b.id) && !fixedIds.has(b.id)) {
        const vb = velocities.get(b.id) ?? { vx: 0, vy: 0 };
        vb.vx += nx * push;
        vb.vy += ny * push;
        velocities.set(b.id, vb);
      }
    }
  }
}

/** Hard overlap resolution — balls cannot pass through each other. */
function separateCircleOverlaps(
  mates: ForceSimNode[],
  movable: Set<string>,
  fixedIds: Set<string>,
  worldPositions?: Map<string, { x: number; y: number }>,
  iterations = COLLISION_SEPARATION_ITERS,
): void {
  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < mates.length; i++) {
      for (let j = i + 1; j < mates.length; j++) {
        const a = mates[i];
        const b = mates[j];
        if (a.mapNode.pinned || b.mapNode.pinned) continue;

        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 0.01;
        const minDist = a.r + b.r + 3;
        if (dist >= minDist) continue;

        const overlap = minDist - dist;
        const nx = dx / dist;
        const ny = dy / dist;
        const aMove = movable.has(a.id) && !fixedIds.has(a.id);
        const bMove = movable.has(b.id) && !fixedIds.has(b.id);
        if (!aMove && !bMove) continue;

        const aShare = aMove && bMove ? 0.5 : 1;
        const bShare = bMove && aMove ? 0.5 : 1;

        if (aMove) {
          a.x -= nx * overlap * aShare;
          a.y -= ny * overlap * aShare;
          worldPositions?.set(a.id, { x: a.x, y: a.y });
        }
        if (bMove) {
          b.x += nx * overlap * bShare;
          b.y += ny * overlap * bShare;
          worldPositions?.set(b.id, { x: b.x, y: b.y });
        }
      }
    }
  }
}

/**
 * Children stay in world space while the container moves; rim contact and collisions
 * impart momentum gradually.
 */
export function stepContainerDragPhysics(
  simNodes: ForceSimNode[],
  containerId: string,
  childIds: string[],
  fieldDelta: { dx: number; dy: number },
  velocities: Map<string, { vx: number; vy: number }>,
  worldPositions: Map<string, { x: number; y: number }>,
  substeps = CONTAINER_DRAG_SUBSTEPS,
): void {
  const container = simNodes.find((n) => n.id === containerId);
  if (!container) return;

  const fields = new Map(
    simNodes.filter((n) => n.kind === 'field').map((f) => [f.fieldId, f]),
  );
  const children = childIds
    .map((id) => simNodes.find((n) => n.id === id))
    .filter((n): n is ForceSimNode => !!n && !n.mapNode.pinned);
  const movable = new Set(children.map((n) => n.id));
  const fixedIds = new Set([containerId]);

  const dragSpeed = Math.hypot(fieldDelta.dx, fieldDelta.dy);

  for (let step = 0; step < substeps; step++) {
    for (const child of children) {
      const world = worldPositions.get(child.id);
      if (!world) continue;

      child.x = world.x;
      child.y = world.y;

      const cx = child.x - container.x;
      const cy = child.y - container.y;
      const dist = Math.hypot(cx, cy);
      const innerR = innerRadius(container, child);
      const penetration = dist - innerR;
      const trailDot = cx * fieldDelta.dx + cy * fieldDelta.dy;
      const isTrailing = trailDot < -0.5;
      const gapToRim = innerR - dist;

      let carry = 0;
      if (isTrailing && dragSpeed > 0.02) {
        if (penetration > 0) {
          carry = 0.52;
        } else if (innerR > 0 && gapToRim < innerR * 0.3) {
          carry = (1 - gapToRim / (innerR * 0.3)) * 0.38;
        }
      }

      if (carry > 0) {
        const lag = 0.22;
        child.x = world.x + fieldDelta.dx * carry * (1 - lag);
        child.y = world.y + fieldDelta.dy * carry * (1 - lag);
        velocities.set(child.id, {
          vx: fieldDelta.dx * carry * 0.35,
          vy: fieldDelta.dy * carry * 0.35,
        });
      } else {
        velocities.set(child.id, { vx: 0, vy: 0 });
      }

      if (penetration > 0 && dist > 0) {
        const nx = cx / dist;
        const ny = cy / dist;
        child.x -= nx * penetration * 0.55;
        child.y -= ny * penetration * 0.55;
      }

      if (container.kind === 'subfield') {
        clampInsideContainerDisc(child, container, velocities);
      }
      clampInsideFieldDisc(child, fields, velocities);
      worldPositions.set(child.id, { x: child.x, y: child.y });
    }

    if (children.length > 1) {
      separateCircleOverlaps(children, movable, fixedIds, worldPositions);
      applyFieldCollisions(children, movable, velocities, fixedIds);
    }
    for (const child of children) {
      clampInsideFieldDisc(child, fields, velocities);
      worldPositions.set(child.id, { x: child.x, y: child.y });
    }
  }
}

/** Continue interior momentum after releasing a field or subfield drag. */
export function stepContainerReleasePhysics(
  simNodes: ForceSimNode[],
  fieldId: string,
  childIds: string[],
  velocities: Map<string, { vx: number; vy: number }>,
): boolean {
  const fields = new Map(
    simNodes.filter((n) => n.kind === 'field').map((f) => [f.fieldId, f]),
  );
  const children = childIds
    .map((id) => simNodes.find((n) => n.id === id))
    .filter((n): n is ForceSimNode => !!n && !n.mapNode.pinned);
  const movable = new Set(children.map((n) => n.id));
  const fieldMates = simNodes.filter(
    (n) => n.fieldId === fieldId && n.kind !== 'field' && !n.mapNode.pinned,
  );

  let maxSpeed = 0;

  for (const child of children) {
    let v = velocities.get(child.id) ?? { vx: 0, vy: 0 };

    if (child.relDx !== undefined && child.relDy !== undefined) {
      const f = fields.get(fieldId);
      if (f) {
        const tx = f.x + child.relDx;
        const ty = f.y + child.relDy;
        v.vx += (tx - child.x) * 0.03;
        v.vy += (ty - child.y) * 0.03;
      }
    }

    v.vx *= 0.86;
    v.vy *= 0.86;
    velocities.set(child.id, v);
    child.x += v.vx;
    child.y += v.vy;
    clampInsideFieldDisc(child, fields, velocities);
    maxSpeed = Math.max(maxSpeed, Math.hypot(v.vx, v.vy));
  }

  separateCircleOverlaps(fieldMates, movable, new Set());
  applyFieldCollisions(fieldMates, movable, velocities, new Set());
  for (const child of children) {
    clampInsideFieldDisc(child, fields, velocities);
    const v = velocities.get(child.id);
    if (v) maxSpeed = Math.max(maxSpeed, Math.hypot(v.vx, v.vy));
  }

  return maxSpeed > CONTAINER_SETTLE_THRESHOLD;
}

function subfieldSimId(fieldId: string, subfieldKey: string): string {
  return `${fieldId}__sf__${subfieldKey}`;
}

function collectSubfieldAffected(
  anchor: ForceSimNode,
  edges: MapEdge[],
  simNodes: ForceSimNode[],
): Set<string> {
  const affected = new Set<string>([anchor.id]);
  const anchorKey = anchor.subfieldKey;
  if (!anchorKey) return affected;

  let grew = true;
  while (grew) {
    grew = false;
    for (const edge of edges) {
      if (isTagEdgeId(edge.id)) continue;
      const src = simNodes.find((n) => n.id === edge.source && n.kind === 'concept');
      const tgt = simNodes.find((n) => n.id === edge.target && n.kind === 'concept');
      if (!src || !tgt) continue;
      if (src.fieldId !== anchor.fieldId || tgt.fieldId !== anchor.fieldId) continue;

      const srcSf = subfieldSimId(src.fieldId, src.subfieldKey ?? '');
      const tgtSf = subfieldSimId(tgt.fieldId, tgt.subfieldKey ?? '');
      const touches =
        src.subfieldKey === anchorKey ||
        tgt.subfieldKey === anchorKey ||
        affected.has(srcSf) ||
        affected.has(tgtSf);
      if (!touches) continue;

      const before = affected.size;
      if (src.subfieldKey) affected.add(srcSf);
      if (tgt.subfieldKey) affected.add(tgtSf);
      if (affected.size > before) grew = true;
    }
  }
  return affected;
}

/** Elastic links between subfield balls while shift-dragging one subfield. */
export function stepSubfieldLinkSprings(
  simNodes: ForceSimNode[],
  anchorId: string,
  edges: MapEdge[],
  velocities: Map<string, { vx: number; vy: number }>,
  substeps = TENSION_SUBSTEPS,
): void {
  const anchor = simNodes.find((n) => n.id === anchorId && n.kind === 'subfield');
  if (!anchor) return;

  const subfields = simNodes.filter((n) => n.kind === 'subfield');
  const byId = new Map(subfields.map((n) => [n.id, n]));
  const affected = collectSubfieldAffected(anchor, edges, simNodes);
  const fields = new Map(
    simNodes.filter((n) => n.kind === 'field').map((f) => [f.fieldId, f]),
  );
  for (let step = 0; step < substeps; step++) {
    const forces = new Map<string, { fx: number; fy: number }>();
    for (const id of affected) forces.set(id, { fx: 0, fy: 0 });

    for (const edge of edges) {
      if (isTagEdgeId(edge.id)) continue;
      const src = simNodes.find((n) => n.id === edge.source && n.kind === 'concept');
      const tgt = simNodes.find((n) => n.id === edge.target && n.kind === 'concept');
      if (!src?.subfieldKey || !tgt?.subfieldKey) continue;
      if (src.fieldId !== anchor.fieldId) continue;

      const a = byId.get(subfieldSimId(src.fieldId, src.subfieldKey));
      const b = byId.get(subfieldSimId(tgt.fieldId, tgt.subfieldKey));
      if (!a || !b || a.id === b.id) continue;
      if (!affected.has(a.id) || !affected.has(b.id)) continue;

      const w = edge.weight ?? 1;
      const ideal = 36 + 18 / w;
      const k = 0.68;
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

    const fixedIds = new Set([anchorId]);
    const collisionNodes = [...affected]
      .map((id) => byId.get(id))
      .filter((n): n is ForceSimNode => !!n);
    if (collisionNodes.length > 1) {
      const movable = new Set(collisionNodes.map((n) => n.id));
      separateCircleOverlaps(collisionNodes, movable, fixedIds);
      applyFieldCollisions(collisionNodes, movable, velocities, fixedIds);
    }

    for (const id of affected) {
      const n = byId.get(id);
      if (!n || n.mapNode.pinned || id === anchorId) {
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
      clampInsideFieldDisc(n, fields, velocities);
    }

    if (collisionNodes.length > 1) {
      const movable = new Set(collisionNodes.map((n) => n.id));
      separateCircleOverlaps(collisionNodes, movable, fixedIds);
    }
  }
}

/** Free oscillation after releasing a subfield shift-drag. */
export function stepSubfieldReleaseSprings(
  simNodes: ForceSimNode[],
  edges: MapEdge[],
  velocities: Map<string, { vx: number; vy: number }>,
): boolean {
  const subfields = simNodes.filter((n) => n.kind === 'subfield');
  const byId = new Map(subfields.map((n) => [n.id, n]));
  const affected = new Set<string>();
  for (const id of velocities.keys()) {
    if (byId.has(id)) affected.add(id);
  }
  if (affected.size === 0) return false;

  const fields = new Map(
    simNodes.filter((n) => n.kind === 'field').map((f) => [f.fieldId, f]),
  );
  let maxSpeed = 0;

  for (let step = 0; step < TENSION_SUBSTEPS; step++) {
    const forces = new Map<string, { fx: number; fy: number }>();
    for (const id of affected) forces.set(id, { fx: 0, fy: 0 });

    for (const edge of edges) {
      if (isTagEdgeId(edge.id)) continue;
      const src = simNodes.find((n) => n.id === edge.source && n.kind === 'concept');
      const tgt = simNodes.find((n) => n.id === edge.target && n.kind === 'concept');
      if (!src?.subfieldKey || !tgt?.subfieldKey || src.fieldId !== tgt.fieldId) continue;

      const a = byId.get(subfieldSimId(src.fieldId, src.subfieldKey));
      const b = byId.get(subfieldSimId(tgt.fieldId, tgt.subfieldKey));
      if (!a || !b || a.id === b.id) continue;
      if (!affected.has(a.id) || !affected.has(b.id)) continue;

      const w = edge.weight ?? 1;
      const ideal = 36 + 18 / w;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 1;
      const stretch = dist - ideal;
      const mag = 0.68 * stretch * w;
      const fx = (dx / dist) * mag;
      const fy = (dy / dist) * mag;
      forces.get(a.id)!.fx += fx;
      forces.get(a.id)!.fy += fy;
      forces.get(b.id)!.fx -= fx;
      forces.get(b.id)!.fy -= fy;
    }

    const collisionNodes = [...affected]
      .map((id) => byId.get(id))
      .filter((n): n is ForceSimNode => !!n);
    if (collisionNodes.length > 1) {
      separateCircleOverlaps(collisionNodes, new Set(collisionNodes.map((n) => n.id)), new Set());
    }

    for (const id of affected) {
      const n = byId.get(id);
      if (!n || n.mapNode.pinned) continue;
      const f = forces.get(id) ?? { fx: 0, fy: 0 };
      const v = velocities.get(id) ?? { vx: 0, vy: 0 };
      v.vx = (v.vx + f.fx) * TENSION_DAMPING;
      v.vy = (v.vy + f.fy) * TENSION_DAMPING;
      velocities.set(id, v);
      n.x += v.vx;
      n.y += v.vy;
      clampInsideFieldDisc(n, fields, velocities);
      maxSpeed = Math.max(maxSpeed, Math.hypot(v.vx, v.vy));
    }
  }

  return maxSpeed > TENSION_SETTLE_THRESHOLD;
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
    const anchorNode = byId.get(anchorId);
    let grew = true;
    while (grew) {
      grew = false;
      for (const edge of edges) {
        if (isTagEdgeId(edge.id)) continue;
        const a = byId.get(edge.source);
        const b = byId.get(edge.target);
        if (!a || !b) continue;
        if (!affected.has(a.id) && !affected.has(b.id)) continue;
        if (anchorNode && (a.fieldId !== anchorNode.fieldId || b.fieldId !== anchorNode.fieldId)) {
          continue;
        }
        const before = affected.size;
        affected.add(a.id);
        affected.add(b.id);
        if (affected.size > before) grew = true;
      }
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

    const fixedIds = anchorId ? new Set([anchorId]) : new Set<string>();
    const collisionNodes = [...affected]
      .map((id) => byId.get(id))
      .filter((n): n is ForceSimNode => !!n);

    if (collisionNodes.length > 1) {
      const movable = new Set(collisionNodes.map((n) => n.id));
      separateCircleOverlaps(collisionNodes, movable, fixedIds);
      applyFieldCollisions(collisionNodes, movable, velocities, fixedIds);
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

    if (collisionNodes.length > 1) {
      const movable = new Set(collisionNodes.map((n) => n.id));
      separateCircleOverlaps(collisionNodes, movable, fixedIds);
      for (const mate of collisionNodes) {
        clampInsideFieldDisc(mate, fields, velocities);
      }
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
