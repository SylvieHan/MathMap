/**
 * Headless physics regression test for the unified hierarchical integrator.
 *
 * Drives the real `stepSimulation` against the bundled map at all three levels
 * (concept, subfield, field) and asserts the invariants:
 *  - nothing overlaps and nothing leaves its container, during drag AND settle
 *  - no tunneling under fast drag
 *  - every release comes to rest naturally (friction) before the safety cap
 *  - dragging a field makes other fields react (elastic bands / collision)
 *  - a field's inner cluster keeps its spread (no collapse to center)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  buildForceGraph,
  clampConceptNode,
  snapConceptsToContainers,
  stepSimulation,
  settleDamping,
  SETTLE_MAX_FRAMES,
  SLEEP_THRESHOLD,
  type ForceSimNode,
  type SimContext,
  type SimKind,
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

function containmentViolations(simNodes: ForceSimNode[], onlyFieldId?: string) {
  const fields = fieldMap(simNodes);
  const subs = subfieldMap(simNodes);
  let fieldViolations = 0;
  let subViolations = 0;
  for (const n of simNodes) {
    if (n.kind !== 'concept') continue;
    if (onlyFieldId && n.fieldId !== onlyFieldId) continue;
    const f = fields.get(n.fieldId);
    if (f) {
      const d = Math.hypot(n.x - f.x, n.y - f.y);
      if (d > Math.max(f.r - n.r - 5, 6) + FIELD_TOL) fieldViolations++;
    }
    if (n.subfieldKey) {
      const sf = subs.get(`${n.fieldId}::${n.subfieldKey}`);
      if (sf) {
        const d = Math.hypot(n.x - sf.x, n.y - sf.y);
        if (d > Math.max(sf.r - n.r - 5, 6) + SUBFIELD_TOL) subViolations++;
      }
    }
  }
  return { fieldViolations, subViolations };
}

function checkContainment(simNodes: ForceSimNode[], label: string) {
  const { fieldViolations, subViolations } = containmentViolations(simNodes);
  if (fieldViolations === 0) ok(`${label}: all concepts inside field disc`);
  else fail(`${label}: ${fieldViolations} concept(s) outside field disc`);
  if (subViolations === 0) ok(`${label}: all concepts inside subfield disc`);
  else fail(`${label}: ${subViolations} concept(s) outside subfield disc`);
}

function worstOverlapInField(simNodes: ForceSimNode[], fieldId: string): number {
  const cs = simNodes.filter((n) => n.kind === 'concept' && n.fieldId === fieldId);
  let worst = 0;
  for (let i = 0; i < cs.length; i++)
    for (let j = i + 1; j < cs.length; j++)
      worst = Math.max(worst, cs[i].r + cs[j].r - Math.hypot(cs[i].x - cs[j].x, cs[i].y - cs[j].y));
  return worst;
}

function checkNoOverlap(simNodes: ForceSimNode[], fieldId: string, label: string) {
  const cs = simNodes.filter((n) => n.kind === 'concept' && n.fieldId === fieldId);
  const worst = worstOverlapInField(simNodes, fieldId);
  if (worst <= OVERLAP_TOL) ok(`${label}: no overlaps among ${cs.length} balls in ${fieldId}`);
  else fail(`${label}: balls overlap in ${fieldId} (worst ${worst.toFixed(1)}px)`);
}

/** Largest pairwise distance among a field's concepts — their cluster spread. */
function conceptSpread(simNodes: ForceSimNode[], fieldId: string): number {
  const cs = simNodes.filter((n) => n.kind === 'concept' && n.fieldId === fieldId);
  let max = 0;
  for (let i = 0; i < cs.length; i++)
    for (let j = i + 1; j < cs.length; j++)
      max = Math.max(max, Math.hypot(cs[i].x - cs[j].x, cs[i].y - cs[j].y));
  return max;
}

function conceptsInField(fieldId: string) {
  return nodes.filter((n) => n.type === 'concept' && n.parentId === fieldId);
}

function ctxFor(
  simNodes: ForceSimNode[],
  velocities: Map<string, { vx: number; vy: number }>,
  movableKinds: SimKind[],
  activeFieldIds: Set<string>,
  fixedIds: Set<string>,
): SimContext {
  return { simNodes, edges, nodes, velocities, fixedIds, movableKinds: new Set(movableKinds), activeFieldIds };
}

/** Run a release settle to rest; return per-frame speeds and the sleep frame. */
function runSettle(
  vel: Map<string, { vx: number; vy: number }>,
  step: (frame: number) => number,
  max = SETTLE_MAX_FRAMES + 2,
) {
  void vel;
  const speeds: number[] = [];
  let sleptFrame = -1;
  for (let frame = 0; frame < max; frame++) {
    const speed = step(frame);
    speeds.push(speed);
    if (speed < SLEEP_THRESHOLD) {
      sleptFrame = frame;
      break;
    }
  }
  return { speeds, sleptFrame };
}

function assertSettled(speeds: number[], sleptFrame: number, label: string) {
  if (sleptFrame >= 0 && sleptFrame < SETTLE_MAX_FRAMES)
    ok(`${label}: came to rest naturally at frame ${sleptFrame}`);
  else fail(`${label}: still moving at safety cap (final speed ${speeds[speeds.length - 1].toFixed(3)}px)`);
  if (speeds.length > 6) {
    const mid = Math.floor(speeds.length / 2);
    const peakFront = Math.max(...speeds.slice(0, mid));
    const peakBack = Math.max(...speeds.slice(mid));
    if (peakBack <= peakFront + 1e-6) ok(`${label}: motion energy decays (friction works)`);
    else fail(`${label}: motion grows in back half (${peakFront.toFixed(2)}→${peakBack.toFixed(2)})`);
  }
}

// ---- Test 1: concept drag --------------------------------------------------
function testConceptDrag(conceptId: string) {
  const node = nodes.find((n) => n.id === conceptId)!;
  const fieldId = node.parentId!;
  console.log(`\n[concept drag] ${conceptId} ("${node.title}") in ${fieldId}`);

  const { simNodes } = buildForceGraph(nodes, edges);
  const anchor = simNodes.find((n) => n.id === conceptId)!;
  const active = new Set([fieldId]);
  const fixed = new Set([conceptId]);
  const vel = new Map<string, { vx: number; vy: number }>();
  const cx = anchor.x;
  const cy = anchor.y;

  let worstDuring = 0;
  let containDuring = 0;
  const FRAMES = 80;
  for (let frame = 1; frame <= FRAMES; frame++) {
    const t = (frame / FRAMES) * Math.PI * 2;
    anchor.x = cx + Math.cos(t) * 90;
    anchor.y = cy + Math.sin(t) * 70;
    clampConceptNode(simNodes, anchor);
    stepSimulation(ctxFor(simNodes, vel, ['concept'], active, fixed));
    worstDuring = Math.max(worstDuring, worstOverlapInField(simNodes, fieldId));
    if (containmentViolations(simNodes, fieldId).fieldViolations > 0) containDuring++;
  }
  if (worstDuring < 1.5) ok(`during-drag: boundary-aware (worst overlap ${worstDuring.toFixed(2)}px)`);
  else fail(`during-drag: balls overlap up to ${worstDuring.toFixed(1)}px`);
  if (containDuring === 0) ok(`during-drag: balls stay inside field every frame`);
  else fail(`during-drag: ${containDuring} frame(s) had a ball outside the field`);

  let worstFast = 0;
  for (let frame = 0; frame < 12; frame++) {
    anchor.x = cx + (frame % 2 === 0 ? 120 : -120);
    anchor.y = cy + (frame % 3 === 0 ? 100 : -80);
    clampConceptNode(simNodes, anchor);
    stepSimulation(ctxFor(simNodes, vel, ['concept'], active, fixed));
    worstFast = Math.max(worstFast, worstOverlapInField(simNodes, fieldId));
  }
  if (worstFast < 1.5) ok(`fast-drag: no tunneling (worst overlap ${worstFast.toFixed(2)}px)`);
  else fail(`fast-drag: balls tunnel (worst ${worstFast.toFixed(1)}px)`);

  vel.set(conceptId, { vx: 2.4, vy: -1.8 });
  const { speeds, sleptFrame } = runSettle(vel, (frame) =>
    stepSimulation(ctxFor(simNodes, vel, ['concept'], active, new Set()), { damping: settleDamping(frame) }),
  );
  snapConceptsToContainers(simNodes, vel);
  assertSettled(speeds, sleptFrame, 'after-release');
  checkContainment(simNodes, 'after-release');
  checkNoOverlap(simNodes, fieldId, 'after-release');
}

// ---- Test 2: subfield drag -------------------------------------------------
function testSubfieldDrag(fieldId: string) {
  const { simNodes } = buildForceGraph(nodes, edges);
  const subfield = simNodes.find((n) => n.kind === 'subfield' && n.fieldId === fieldId);
  if (!subfield) return;
  console.log(`\n[subfield drag] ${subfield.id} in ${fieldId}`);

  const active = new Set([fieldId]);
  const fixed = new Set([subfield.id]);
  const vel = new Map<string, { vx: number; vy: number }>();
  const f = fieldMap(simNodes).get(fieldId)!;

  // Sweep the subfield around inside its field; concepts follow via containment.
  const cx = subfield.x;
  const cy = subfield.y;
  let containDuring = 0;
  for (let frame = 1; frame <= 60; frame++) {
    const t = (frame / 60) * Math.PI * 2;
    subfield.x = cx + Math.cos(t) * 40;
    subfield.y = cy + Math.sin(t) * 30;
    // keep dragged subfield inside its field (mirror the hook's clamp)
    const d = Math.hypot(subfield.x - f.x, subfield.y - f.y);
    const maxD = Math.max(f.r - subfield.r - 5, 6);
    if (d > maxD) {
      subfield.x = f.x + ((subfield.x - f.x) / d) * maxD;
      subfield.y = f.y + ((subfield.y - f.y) / d) * maxD;
    }
    stepSimulation(ctxFor(simNodes, vel, ['subfield', 'concept'], active, fixed));
    if (containmentViolations(simNodes, fieldId).fieldViolations > 0) containDuring++;
  }
  if (containDuring === 0) ok(`subfield-drag-during: concepts stay inside the field`);
  else fail(`subfield-drag-during: ${containDuring} frame(s) had a concept escape the field`);

  const { speeds, sleptFrame } = runSettle(vel, (frame) =>
    stepSimulation(ctxFor(simNodes, vel, ['subfield', 'concept'], active, new Set()), { damping: settleDamping(frame) }),
  );
  snapConceptsToContainers(simNodes, vel);
  assertSettled(speeds, sleptFrame, 'subfield after-release');
  checkContainment(simNodes, 'subfield after-release');
  checkNoOverlap(simNodes, fieldId, 'subfield after-release');
}

// ---- Test 3: field drag (full hierarchy) -----------------------------------
function testFieldDrag(fieldId: string) {
  console.log(`\n[field drag] ${fieldId}`);
  const { simNodes } = buildForceGraph(nodes, edges);
  const field = simNodes.find((n) => n.id === fieldId && n.kind === 'field')!;
  const allFields = new Set(simNodes.filter((n) => n.kind === 'field').map((n) => n.fieldId));
  const fixed = new Set([fieldId]);
  const vel = new Map<string, { vx: number; vy: number }>();

  const otherFields = simNodes.filter((n) => n.kind === 'field' && n.id !== fieldId);
  const before = new Map(otherFields.map((n) => [n.id, { x: n.x, y: n.y }]));
  const spreadBefore = conceptSpread(simNodes, fieldId);

  // Drag the field a realistic distance; other fields should react (bands /
  // collision), and the dragged field's interior should ride along, contained.
  for (let frame = 1; frame <= 32; frame++) {
    field.x += 5;
    field.y += 2;
    stepSimulation(ctxFor(simNodes, vel, ['field', 'subfield', 'concept'], allFields, fixed));
  }

  const maxOtherMoved = Math.max(
    ...otherFields.map((n) => {
      const b = before.get(n.id)!;
      return Math.hypot(n.x - b.x, n.y - b.y);
    }),
  );
  if (maxOtherMoved > 5) ok(`field-drag: other fields react (max moved ${maxOtherMoved.toFixed(0)}px)`);
  else fail(`field-drag: other fields did not react (max moved ${maxOtherMoved.toFixed(1)}px)`);

  const spreadAfter = conceptSpread(simNodes, fieldId);
  if (spreadAfter > spreadBefore * 0.8)
    ok(`field-drag: cluster keeps its spread (${spreadBefore.toFixed(0)}→${spreadAfter.toFixed(0)}px)`);
  else fail(`field-drag: cluster collapsed (${spreadBefore.toFixed(0)}→${spreadAfter.toFixed(0)}px)`);

  checkContainment(simNodes, 'field-drag-during');
  checkNoOverlap(simNodes, fieldId, 'field-drag-during');

  const { speeds, sleptFrame } = runSettle(vel, (frame) =>
    stepSimulation(ctxFor(simNodes, vel, ['field', 'subfield', 'concept'], allFields, new Set()), { damping: settleDamping(frame) }),
  );
  snapConceptsToContainers(simNodes, vel);
  assertSettled(speeds, sleptFrame, 'field after-release');
  checkContainment(simNodes, 'field-drag-after');
  checkNoOverlap(simNodes, fieldId, 'field-drag-after');
}

const algebra = nodes.find((n) => n.type === 'field-folder' && /algebra/i.test(n.title));
const topo = nodes.find((n) => n.type === 'field-folder' && /topolog/i.test(n.title));

console.log('=== MathMap physics regression test (unified engine) ===');

if (nodes.some((n) => n.id === 'rep-theory')) testConceptDrag('rep-theory');
if (nodes.some((n) => n.id === 'bundles')) testConceptDrag('bundles');
const lonely = nodes.find(
  (n) =>
    n.type === 'concept' &&
    !edges.some((e) => e.source === n.id || e.target === n.id) &&
    conceptsInField(n.parentId!).length > 3,
);
if (lonely) testConceptDrag(lonely.id);

if (algebra) testSubfieldDrag(algebra.id);
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
