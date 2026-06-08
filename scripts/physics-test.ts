/**
 * Headless physics regression test.
 *
 * Exercises the real drag/settle functions against the bundled map and asserts:
 *  - concept drag + release settles (no infinite motion)
 *  - every concept stays inside its field disc and subfield disc
 *  - no two concepts in the same field overlap (all balls have collision, linked or not)
 *  - whole-field (container) drag keeps children in bounds and settles
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  annealSettleVelocities,
  buildForceGraph,
  snapConceptsToContainers,
  stepTensionSprings,
  stepContainerDragPhysics,
  stepContainerReleasePhysics,
  simNodeIdsForDragTarget,
  SETTLE_MAX_FRAMES,
  type ForceSimNode,
} from '../src/utils/forceLayout';
import type { MapEdge, MapNode } from '../src/types';

const here = dirname(fileURLToPath(import.meta.url));
const map = JSON.parse(
  readFileSync(resolve(here, '../public/bundled-map.json'), 'utf8'),
) as { nodes: MapNode[]; edges: MapEdge[] };

const nodes = map.nodes;
const edges = map.edges;

let failures = 0;
const fail = (msg: string) => {
  failures++;
  console.error('  ✗ ' + msg);
};
const ok = (msg: string) => console.log('  ✓ ' + msg);

function fieldMap(simNodes: ForceSimNode[]) {
  return new Map(simNodes.filter((n) => n.kind === 'field').map((f) => [f.fieldId, f]));
}
function subfieldMap(simNodes: ForceSimNode[]) {
  const m = new Map<string, ForceSimNode>();
  for (const n of simNodes) {
    if (n.kind === 'subfield' && n.subfieldKey) m.set(`${n.fieldId}::${n.subfieldKey}`, n);
  }
  return m;
}

const FIELD_TOL = 1.5;
const SUBFIELD_TOL = 2.5;
const OVERLAP_TOL = 1.5;

function checkContainment(simNodes: ForceSimNode[], label: string) {
  const fields = fieldMap(simNodes);
  const subs = subfieldMap(simNodes);
  let fieldViolations = 0;
  let subViolations = 0;

  for (const n of simNodes) {
    if (n.kind !== 'concept') continue;
    const f = fields.get(n.fieldId);
    if (f) {
      const d = Math.hypot(n.x - f.x, n.y - f.y);
      const maxD = Math.max(f.r - n.r - 5, 6);
      if (d > maxD + FIELD_TOL) fieldViolations++;
    }
    if (n.subfieldKey) {
      const sf = subs.get(`${n.fieldId}::${n.subfieldKey}`);
      if (sf) {
        const d = Math.hypot(n.x - sf.x, n.y - sf.y);
        const maxD = Math.max(sf.r - n.r - 5, 6);
        if (d > maxD + SUBFIELD_TOL) subViolations++;
      }
    }
  }
  if (fieldViolations === 0) ok(`${label}: all concepts inside field disc`);
  else fail(`${label}: ${fieldViolations} concept(s) outside field disc`);
  if (subViolations === 0) ok(`${label}: all concepts inside subfield disc`);
  else fail(`${label}: ${subViolations} concept(s) outside subfield disc`);
}

function checkNoOverlap(simNodes: ForceSimNode[], fieldId: string, label: string) {
  const cs = simNodes.filter((n) => n.kind === 'concept' && n.fieldId === fieldId);
  let worst = 0;
  let count = 0;
  for (let i = 0; i < cs.length; i++) {
    for (let j = i + 1; j < cs.length; j++) {
      const d = Math.hypot(cs[i].x - cs[j].x, cs[i].y - cs[j].y);
      const min = cs[i].r + cs[j].r;
      const overlap = min - d;
      if (overlap > OVERLAP_TOL) {
        count++;
        worst = Math.max(worst, overlap);
      }
    }
  }
  if (count === 0) ok(`${label}: no overlaps among ${cs.length} balls in ${fieldId}`);
  else fail(`${label}: ${count} overlapping pair(s) in ${fieldId} (worst ${worst.toFixed(1)}px)`);
}

function conceptsInField(fieldId: string) {
  return nodes.filter((n) => n.type === 'concept' && n.parentId === fieldId);
}

// ---- Test 1: concept drag + release ---------------------------------------
function testConceptDrag(conceptId: string) {
  const node = nodes.find((n) => n.id === conceptId)!;
  const fieldId = node.parentId!;
  console.log(`\n[concept drag] ${conceptId} ("${node.title}") in ${fieldId}`);

  const { simNodes } = buildForceGraph(nodes, edges);
  const anchor = simNodes.find((n) => n.id === conceptId)!;
  const velocities = new Map<string, { vx: number; vy: number }>();

  // Drag the ball ~120px to the right over 40 frames.
  const startX = anchor.x;
  const startY = anchor.y;
  for (let frame = 1; frame <= 40; frame++) {
    anchor.x = startX + (120 * frame) / 40;
    anchor.y = startY;
    stepTensionSprings(simNodes, conceptId, edges, nodes, velocities);
  }

  checkNoOverlap(simNodes, fieldId, 'during-drag');

  // Release: mirror the hook's annealed settle loop and measure residual motion.
  const lastMaxStep = runSettle(
    (vel, frame) => {
      const moving = stepTensionSprings(simNodes, null, edges, nodes, vel);
      const cooled = annealSettleVelocities(vel, frame);
      return !moving || cooled;
    },
    velocities,
    simNodes,
  );
  snapConceptsToContainers(simNodes, velocities);

  if (lastMaxStep < 0.6) ok(`came to rest (final step ${lastMaxStep.toFixed(3)}px)`);
  else fail(`still moving at end (final step ${lastMaxStep.toFixed(2)}px) — infinite motion`);

  checkContainment(simNodes, 'after-release');
  checkNoOverlap(simNodes, fieldId, 'after-release');
}

/**
 * Run an annealed settle to completion (physics stops OR cool-down ends) and
 * return the largest per-frame concept displacement on the FINAL frame.
 */
function runSettle(
  step: (vel: Map<string, { vx: number; vy: number }>, frame: number) => boolean | undefined,
  velocities: Map<string, { vx: number; vy: number }>,
  simNodes: ForceSimNode[],
): number {
  let lastMaxStep = 0;
  for (let frame = 0; frame < SETTLE_MAX_FRAMES + 2; frame++) {
    const before = simNodes
      .filter((n) => n.kind === 'concept')
      .map((n) => ({ id: n.id, x: n.x, y: n.y }));
    const stop = step(velocities, frame);
    lastMaxStep = 0;
    for (const b of before) {
      const n = simNodes.find((s) => s.id === b.id)!;
      lastMaxStep = Math.max(lastMaxStep, Math.hypot(n.x - b.x, n.y - b.y));
    }
    if (stop) break;
  }
  return lastMaxStep;
}

// ---- Test 2: whole-field (container) drag ---------------------------------
function testFieldDrag(fieldId: string) {
  console.log(`\n[field drag] ${fieldId}`);
  const { simNodes } = buildForceGraph(nodes, edges);
  const container = simNodes.find((n) => n.id === fieldId)!;
  const childIds = simNodeIdsForDragTarget({ kind: 'field', fieldId }, simNodes).filter(
    (id) => id !== fieldId,
  );
  const velocities = new Map<string, { vx: number; vy: number }>();
  const worldPositions = new Map<string, { x: number; y: number }>();
  for (const id of childIds) {
    const n = simNodes.find((s) => s.id === id)!;
    worldPositions.set(id, { x: n.x, y: n.y });
  }

  let prev = { x: container.x, y: container.y };
  for (let f = 1; f <= 50; f++) {
    container.x += 6;
    container.y += 2;
    const fieldDelta = { dx: container.x - prev.x, dy: container.y - prev.y };
    prev = { x: container.x, y: container.y };
    stepContainerDragPhysics(simNodes, fieldId, childIds, fieldDelta, velocities, worldPositions);
  }
  // During a whole-field drag, decor only needs to stay inside the FIELD disc;
  // subfield membership is restored by the finalize snap on release.
  checkFieldContainmentOnly(simNodes, 'field-drag-during');

  const lastMaxStep = runSettle(
    (vel, frame) => {
      const moving = stepContainerReleasePhysics(simNodes, fieldId, childIds, vel);
      const cooled = annealSettleVelocities(vel, frame);
      return !moving || cooled;
    },
    velocities,
    simNodes,
  );
  snapConceptsToContainers(simNodes, velocities);
  if (lastMaxStep < 0.6) ok(`container came to rest (final step ${lastMaxStep.toFixed(3)}px)`);
  else fail(`container still moving at end (final step ${lastMaxStep.toFixed(2)}px)`);
  checkContainment(simNodes, 'field-drag-after');
}

function checkFieldContainmentOnly(simNodes: ForceSimNode[], label: string) {
  const fields = fieldMap(simNodes);
  let v = 0;
  for (const n of simNodes) {
    if (n.kind !== 'concept') continue;
    const f = fields.get(n.fieldId);
    if (!f) continue;
    const d = Math.hypot(n.x - f.x, n.y - f.y);
    const maxD = Math.max(f.r - n.r - 5, 6);
    if (d > maxD + FIELD_TOL) v++;
  }
  if (v === 0) ok(`${label}: all concepts inside field disc`);
  else fail(`${label}: ${v} concept(s) outside field disc`);
}

// Pick representative fields/concepts with multiple subfields and chained links.
const algebra = nodes.find((n) => n.type === 'field-folder' && /algebra/i.test(n.title));
const topo = nodes.find((n) => n.type === 'field-folder' && /topolog/i.test(n.title));

console.log('=== MathMap physics regression test ===');

// rep-theory (chained to galois, lie-alg) and bundles (55R) are the reported cases.
if (nodes.some((n) => n.id === 'rep-theory')) testConceptDrag('rep-theory');
if (nodes.some((n) => n.id === 'bundles')) testConceptDrag('bundles');

// Also test a concept that has NO links, to verify unconnected-ball boundary/collision.
const lonely = nodes.find(
  (n) =>
    n.type === 'concept' &&
    !edges.some((e) => e.source === n.id || e.target === n.id) &&
    conceptsInField(n.parentId!).length > 3,
);
if (lonely) testConceptDrag(lonely.id);

if (algebra) testFieldDrag(algebra.id);
if (topo) testFieldDrag(topo.id);

console.log('\n=========================================');
if (failures === 0) {
  console.log('ALL CHECKS PASSED');
  process.exit(0);
} else {
  console.error(`${failures} CHECK(S) FAILED`);
  process.exit(1);
}
