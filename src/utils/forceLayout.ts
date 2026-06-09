import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
} from 'd3-force';
import type { MapEdge, MapNode } from '../types';
import { isTagEdgeId } from './layout';

const COLLISION_SEPARATION_ITERS = 6;

const SPRING_K = {
  sameSubfield: 0.22,
  sameField: 0.16,
  crossField: 0.12,
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
  /** Initial layout position; field bands rest at the home spacing. */
  homeX?: number;
  homeY?: number;
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

/**
 * Sync child positions from field-relative offsets, then clamp every subfield
 * inside its field and every concept inside its subfield (all fields). Finally
 * runs a global no-overlap pass so nothing ever passes through anything — even
 * mid-drag. Nodes in `skipChildIds` keep their current position and act as fixed
 * colliders (used for the ball under the pointer).
 */
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
    }
    n.x = f.x + dx;
    n.y = f.y + dy;
  }

  for (const n of simNodes) {
    if (skipChildIds?.has(n.id)) continue;
    if (n.kind === 'subfield') {
      clampInsideFieldDisc(n, fields);
    } else if (n.kind === 'concept') {
      clampConceptContainers(n, simNodes, fields);
    }
  }

  separateConceptsInFields(simNodes, fields, skipChildIds);

  for (const n of simNodes) {
    if (skipChildIds?.has(n.id)) continue;
    if (n.kind === 'field' || n.relDx === undefined || n.relDy === undefined) continue;
    const f = fields.get(n.fieldId);
    if (!f) continue;
    n.relDx = n.x - f.x;
    n.relDy = n.y - f.y;
  }
}

/**
 * Hard no-overlap for every concept in every field. Nodes in `fixed` (pointer
 * ball, pinned) are immovable but still push others away. Runs a few rounds of
 * separate + re-clamp so balls stay inside their containers without overlapping.
 */
export function separateConceptsInFields(
  simNodes: ForceSimNode[],
  fields: Map<string, ForceSimNode>,
  fixed?: Set<string>,
): void {
  const byField = new Map<string, ForceSimNode[]>();
  for (const n of simNodes) {
    if (n.kind !== 'concept') continue;
    let arr = byField.get(n.fieldId);
    if (!arr) {
      arr = [];
      byField.set(n.fieldId, arr);
    }
    arr.push(n);
  }

  for (const cs of byField.values()) {
    if (cs.length < 2) continue;
    const movable = new Set(
      cs.filter((n) => !n.mapNode.pinned && !fixed?.has(n.id)).map((n) => n.id),
    );
    if (movable.size === 0) continue;
    // Re-clamp to the FIELD disc only between rounds. Clamping back into the
    // (small) subfield disc here would recreate overlaps and cause a
    // separate/clamp oscillation; subfield membership is restored by the
    // finalize snap once motion comes to rest.
    for (let round = 0; round < 3; round++) {
      separateCircleOverlaps(cs, movable, new Set());
      for (const n of cs) {
        if (movable.has(n.id)) clampInsideFieldDisc(n, fields);
      }
    }
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
      homeX: item.x,
      homeY: item.y,
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

export function clampInsideFieldDisc(
  n: ForceSimNode,
  fields: Map<string, ForceSimNode>,
  velocities?: Map<string, { vx: number; vy: number }>,
): void {
  if (n.kind === 'field') return;
  const f = fields.get(n.fieldId);
  if (!f) return;
  const dx = n.x - f.x;
  const dy = n.y - f.y;
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
          v.vx -= dot * nx;
          v.vy -= dot * ny;
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
  const dx = child.x - container.x;
  const dy = child.y - container.y;
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
          v.vx -= dot * nx;
          v.vy -= dot * ny;
        }
      }
    }
  }
}

function subfieldNodeFor(
  simNodes: ForceSimNode[],
  concept: ForceSimNode,
): ForceSimNode | undefined {
  if (concept.kind !== 'concept' || !concept.subfieldKey) return undefined;
  return simNodes.find(
    (n) =>
      n.kind === 'subfield' &&
      n.fieldId === concept.fieldId &&
      n.subfieldKey === concept.subfieldKey,
  );
}

function clampConceptContainers(
  n: ForceSimNode,
  simNodes: ForceSimNode[],
  fields: Map<string, ForceSimNode>,
  velocities?: Map<string, { vx: number; vy: number }>,
): void {
  const sf = subfieldNodeFor(simNodes, n);
  if (sf) {
    clampInsideContainerDisc(n, sf, velocities);
  }
  clampInsideFieldDisc(n, fields, velocities);
}

/** Keep a dragged or released concept inside its subfield and field discs. */
export function clampConceptNode(
  simNodes: ForceSimNode[],
  node: ForceSimNode,
  velocities?: Map<string, { vx: number; vy: number }>,
): void {
  const fields = new Map(
    simNodes.filter((n) => n.kind === 'field').map((f) => [f.fieldId, f]),
  );
  clampConceptContainers(node, simNodes, fields, velocities);
}

/** Safety cap on settle-loop frames (the loop normally sleeps well before this). */
export const SETTLE_MAX_FRAMES = 150;
/** Frames a settle runs freely before the cool-down tail begins. */
export const SETTLE_FREE_FRAMES = 40;

/**
 * Damping for frame `frame` of a release settle. For a free period it is the
 * normal friction (so the overshoot/bounce plays out), then it ramps to 0 — at
 * damping 0 a body's velocity (and thus its motion) is forced to zero, so even a
 * coupled field network whose stretched bands keep re-injecting force is
 * guaranteed to come to rest. Fast settles sleep before the ramp even starts.
 */
export function settleDamping(
  frame: number,
  freeFrames = SETTLE_FREE_FRAMES,
  maxFrames = SETTLE_MAX_FRAMES,
): number {
  if (frame < freeFrames) return DAMPING;
  const ramp = Math.max(0, 1 - (frame - freeFrames) / (maxFrames - freeFrames));
  return DAMPING * ramp;
}

function capVelocity(v: { vx: number; vy: number }, max = 3.2): void {
  const speed = Math.hypot(v.vx, v.vy);
  if (speed > max) {
    const s = max / speed;
    v.vx *= s;
    v.vy *= s;
  }
}

/** Hard snap after settle so children rest inside field/subfield discs. */
export function snapConceptsToContainers(
  simNodes: ForceSimNode[],
  velocities: Map<string, { vx: number; vy: number }>,
): void {
  const fields = new Map(
    simNodes.filter((n) => n.kind === 'field').map((f) => [f.fieldId, f]),
  );
  for (const n of simNodes) {
    if (n.mapNode.pinned) continue;
    if (n.kind === 'concept') {
      clampConceptContainers(n, simNodes, fields, velocities);
      velocities.set(n.id, { vx: 0, vy: 0 });
    } else if (n.kind === 'subfield') {
      clampInsideFieldDisc(n, fields, velocities);
      velocities.set(n.id, { vx: 0, vy: 0 });
    }
  }
}

/**
 * Hard overlap resolution — balls cannot pass through each other. When
 * `velocities` is given, collisions are inelastic: the approaching component of
 * each body's velocity along the contact normal is removed, so a body pressed
 * against another by a stretched band loses that energy instead of jittering
 * forever (this is what lets the field-level settle reach rest).
 */
function separateCircleOverlaps(
  mates: ForceSimNode[],
  movable: Set<string>,
  fixedIds: Set<string>,
  velocities?: Map<string, { vx: number; vy: number }>,
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
          const va = velocities?.get(a.id);
          if (va) {
            const into = va.vx * nx + va.vy * ny; // velocity toward b
            if (into > 0) {
              va.vx -= into * nx;
              va.vy -= into * ny;
            }
          }
        }
        if (bMove) {
          b.x += nx * overlap * bShare;
          b.y += ny * overlap * bShare;
          worldPositions?.set(b.id, { x: b.x, y: b.y });
          const vb = velocities?.get(b.id);
          if (vb) {
            const into = -(vb.vx * nx + vb.vy * ny); // velocity toward a
            if (into > 0) {
              vb.vx += into * nx;
              vb.vy += into * ny;
            }
          }
        }
      }
    }
  }
}

function subfieldSimId(fieldId: string, subfieldKey: string): string {
  return `${fieldId}__sf__${subfieldKey}`;
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
  const base = crossField ? 48 + 28 / w : sameSubfield ? 24 + 10 / w : 34 + 14 / w;
  // Rest length keeps comfortable spacing and never asks linked balls to overlap,
  // so springs and the hard no-overlap pass cannot fight.
  const ideal = Math.max(base, a.r + b.r + 12);
  return { ideal, k };
}

/**
 * Velocity-based link springs. anchorId = dragged concept (fixed); null = free release oscillation.
 * Returns true while motion is still visible.
 */
// ---- Unified simulation ---------------------------------------------------
// One semi-implicit Euler integrator that replaces the per-target step
// functions above. Springs are one-sided elastic bands (tension only, so they
// never fight the hard no-overlap pass), a single DAMPING coefficient is the
// friction, and constraints (no-overlap + boundary) are projected every substep.

/** Friction: velocity retained each substep (<1 ⇒ motion always decays to rest). */
export const DAMPING = 0.88;
/** Below this max body speed the settle loop sleeps (guarantees rest). */
export const SLEEP_THRESHOLD = 0.12;
const SIM_SUBSTEPS = 6;
const SIM_MAX_SPEED = 3.2;

export interface SimContext {
  simNodes: ForceSimNode[];
  edges: MapEdge[];
  nodes: MapNode[];
  velocities: Map<string, { vx: number; vy: number }>;
  /** Pinned to pointer / map-pinned: immovable colliders. */
  fixedIds: Set<string>;
  /**
   * Body kinds that may move this frame. A concept drag wakes only concepts; a
   * subfield drag wakes subfields + concepts; a field drag wakes all three.
   */
  movableKinds: Set<SimKind>;
  /** Restrict subfield/concept simulation to bodies in these fields. */
  activeFieldIds: Set<string>;
}

export interface StepParams {
  dt?: number;
  substeps?: number;
  damping?: number;
}

/** Field-band tuning. A field band rests at the layout (home) spacing, so it is
 *  slack in the resting map and only pulls once you drag a field away from its
 *  neighbors — which keeps the layout stable and lets releases settle fast. */
const FIELD_BAND_K = 0.03;
const FIELD_BAND_GAP = 50;

/**
 * Apply one one-sided elastic band between two bodies. A band only pulls when
 * stretched past its rest length (slack bands exert nothing), so it can never
 * ask two bodies closer than the no-overlap pass allows. Force is added only to
 * whichever endpoints are movable (present in `forces`).
 */
function applyBand(
  a: ForceSimNode,
  b: ForceSimNode,
  ideal: number,
  k: number,
  w: number,
  forces: Map<string, { fx: number; fy: number }>,
): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy) || 1;
  const stretch = dist - ideal;
  if (stretch <= 0) return;
  const mag = k * stretch * w;
  const fx = (dx / dist) * mag;
  const fy = (dy / dist) * mag;
  const fa = forces.get(a.id);
  const fb = forces.get(b.id);
  if (fa) {
    fa.fx += fx;
    fa.fy += fy;
  }
  if (fb) {
    fb.fx -= fx;
    fb.fy -= fy;
  }
}

/** Concept↔concept bands (manual edges, within each active field). */
function accumulateConceptBands(
  simNodes: ForceSimNode[],
  edges: MapEdge[],
  nodes: MapNode[],
  activeFieldIds: Set<string>,
  forces: Map<string, { fx: number; fy: number }>,
): void {
  const byId = new Map(simNodes.filter((n) => n.kind === 'concept').map((c) => [c.id, c]));
  for (const edge of edges) {
    if (isTagEdgeId(edge.id)) continue;
    const a = byId.get(edge.source);
    const b = byId.get(edge.target);
    if (!a || !b || a.fieldId !== b.fieldId || !activeFieldIds.has(a.fieldId)) continue;
    const w = edge.weight ?? 1;
    const { ideal, k } = springIdeal(a, b, nodes, w);
    applyBand(a, b, ideal, k, w, forces);
  }
}

/** Subfield↔subfield bands (from concept edges crossing subfields, within each active field). */
function accumulateSubfieldBands(
  simNodes: ForceSimNode[],
  edges: MapEdge[],
  nodes: MapNode[],
  activeFieldIds: Set<string>,
  forces: Map<string, { fx: number; fy: number }>,
): void {
  const subById = new Map(simNodes.filter((n) => n.kind === 'subfield').map((s) => [s.id, s]));
  const conceptById = new Map(simNodes.filter((n) => n.kind === 'concept').map((c) => [c.id, c]));
  for (const edge of edges) {
    if (isTagEdgeId(edge.id)) continue;
    const cs = conceptById.get(edge.source);
    const ct = conceptById.get(edge.target);
    if (!cs?.subfieldKey || !ct?.subfieldKey || cs.fieldId !== ct.fieldId) continue;
    if (!activeFieldIds.has(cs.fieldId)) continue;
    const a = subById.get(subfieldSimId(cs.fieldId, cs.subfieldKey));
    const b = subById.get(subfieldSimId(ct.fieldId, ct.subfieldKey));
    if (!a || !b || a.id === b.id) continue;
    const w = edge.weight ?? 1;
    const { ideal, k } = springIdeal(a, b, nodes, w);
    applyBand(a, b, ideal, k, w, forces);
  }
}

/** Field↔field bands (from cross-field concept edges, aggregated). */
function accumulateFieldBands(
  simNodes: ForceSimNode[],
  edges: MapEdge[],
  forces: Map<string, { fx: number; fy: number }>,
): void {
  const fieldById = new Map(simNodes.filter((n) => n.kind === 'field').map((f) => [f.fieldId, f]));
  const conceptById = new Map(simNodes.filter((n) => n.kind === 'concept').map((c) => [c.id, c]));
  const weights = new Map<string, number>();
  for (const edge of edges) {
    if (isTagEdgeId(edge.id)) continue;
    const cs = conceptById.get(edge.source);
    const ct = conceptById.get(edge.target);
    if (!cs || !ct || cs.fieldId === ct.fieldId) continue;
    const key = [cs.fieldId, ct.fieldId].sort().join('|');
    weights.set(key, (weights.get(key) ?? 0) + (edge.weight ?? 1));
  }
  for (const [key, w] of weights) {
    const [fa, fb] = key.split('|');
    const a = fieldById.get(fa);
    const b = fieldById.get(fb);
    if (!a || !b) continue;
    // Rest at the layout spacing (slack in the resting map); never below the
    // no-overlap minimum so the band and collision pass never fight.
    const home =
      a.homeX !== undefined && a.homeY !== undefined && b.homeX !== undefined && b.homeY !== undefined
        ? Math.hypot(a.homeX - b.homeX, a.homeY - b.homeY)
        : 0;
    const ideal = Math.max(a.r + b.r + FIELD_BAND_GAP, home);
    applyBand(a, b, ideal, FIELD_BAND_K, w, forces);
  }
}

/**
 * One frame of the unified hierarchical integrator. The same loop drives every
 * drag and every release; the drag only decides which kinds are awake
 * (`movableKinds`) and which body is pinned (`fixedIds`). Each substep:
 *   1. accumulate elastic-band forces for each awake kind,
 *   2. integrate velocity with a single friction coefficient,
 *   3. integrate position,
 *   4. project hard constraints outer→inner: fields don't overlap; subfields
 *      don't overlap and stay inside their field; concepts don't overlap and
 *      stay inside their subfield + field (killing the normal velocity on
 *      contact). A child follows a moving parent because the parent's disc
 *      contains it, so it rides along and jostles, then friction brings it to
 *      rest. Returns the largest body speed this frame (for the sleep test).
 */
export function stepSimulation(ctx: SimContext, params: StepParams = {}): number {
  const { simNodes, edges, nodes, velocities, fixedIds, movableKinds, activeFieldIds } = ctx;
  const substeps = params.substeps ?? SIM_SUBSTEPS;
  const damping = params.damping ?? DAMPING;
  const dt = params.dt ?? 1;

  const fields = new Map(
    simNodes.filter((n) => n.kind === 'field').map((f) => [f.fieldId, f]),
  );

  const simField = movableKinds.has('field');
  const simSub = movableKinds.has('subfield');
  const simConcept = movableKinds.has('concept');

  const fieldBodies = simField ? simNodes.filter((n) => n.kind === 'field') : [];
  const subBodies = simSub
    ? simNodes.filter((n) => n.kind === 'subfield' && activeFieldIds.has(n.fieldId))
    : [];
  const conceptBodies = simConcept
    ? simNodes.filter((n) => n.kind === 'concept' && activeFieldIds.has(n.fieldId))
    : [];
  const allBodies = [...fieldBodies, ...subBodies, ...conceptBodies];

  const movable = new Set(
    allBodies.filter((n) => !n.mapNode.pinned && !fixedIds.has(n.id)).map((n) => n.id),
  );
  if (movable.size === 0) return 0;

  // Group subfields/concepts by field once for the per-field constraint passes.
  const subsByField = new Map<string, ForceSimNode[]>();
  for (const n of subBodies) {
    (subsByField.get(n.fieldId) ?? subsByField.set(n.fieldId, []).get(n.fieldId)!).push(n);
  }
  const conceptsByField = new Map<string, ForceSimNode[]>();
  for (const n of conceptBodies) {
    (conceptsByField.get(n.fieldId) ?? conceptsByField.set(n.fieldId, []).get(n.fieldId)!).push(n);
  }

  // Measure actual displacement this frame, not velocity: a body pressed
  // against a wall by a stretched band has velocity but doesn't move, and is
  // visually at rest — so the settle loop should sleep on it.
  const startPos = new Map<string, { x: number; y: number }>();
  for (const n of allBodies) {
    if (movable.has(n.id)) startPos.set(n.id, { x: n.x, y: n.y });
  }

  for (let step = 0; step < substeps; step++) {
    const forces = new Map<string, { fx: number; fy: number }>();
    for (const id of movable) forces.set(id, { fx: 0, fy: 0 });

    if (simField) accumulateFieldBands(simNodes, edges, forces);
    if (simSub) accumulateSubfieldBands(simNodes, edges, nodes, activeFieldIds, forces);
    if (simConcept) accumulateConceptBands(simNodes, edges, nodes, activeFieldIds, forces);

    for (const n of allBodies) {
      if (!movable.has(n.id)) continue;
      const f = forces.get(n.id) ?? { fx: 0, fy: 0 };
      const v = velocities.get(n.id) ?? { vx: 0, vy: 0 };
      v.vx = (v.vx + f.fx * dt) * damping;
      v.vy = (v.vy + f.fy * dt) * damping;
      capVelocity(v, SIM_MAX_SPEED);
      velocities.set(n.id, v);
      n.x += v.vx * dt;
      n.y += v.vy * dt;
    }

    // Constraints, outer → inner. Fields collide (no container). Subfields
    // collide within their field and stay inside it. Concepts collide within
    // their field and stay inside their subfield + field.
    if (simField && fieldBodies.length > 1) {
      separateCircleOverlaps(fieldBodies, movable, fixedIds, velocities);
    }
    if (simSub) {
      for (const subs of subsByField.values()) {
        if (subs.length > 1) separateCircleOverlaps(subs, movable, fixedIds, velocities);
        for (const n of subs) if (movable.has(n.id)) clampInsideFieldDisc(n, fields, velocities);
      }
    }
    if (simConcept) {
      for (const cs of conceptsByField.values()) {
        if (cs.length > 1) separateCircleOverlaps(cs, movable, fixedIds, velocities);
        for (const n of cs) if (movable.has(n.id)) clampConceptContainers(n, simNodes, fields, velocities);
      }
    }

  }

  let maxMove = 0;
  for (const n of allBodies) {
    const s = startPos.get(n.id);
    if (s) maxMove = Math.max(maxMove, Math.hypot(n.x - s.x, n.y - s.y));
  }
  return maxMove;
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
