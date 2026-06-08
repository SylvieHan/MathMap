import { getMscLabel } from '../data/msc2020';
import type { MapEdge, MapNode } from '../types';
import { colorForNode, lighten } from './colors';

export type DetailLevel = 'fields' | 'subfields' | 'concepts';

export function zoomToDetailLevel(scale: number): DetailLevel {
  if (scale < 0.55) return 'fields';
  if (scale < 1.05) return 'subfields';
  return 'concepts';
}

/** Camera transform that frames all given circles in the viewport. */
export function fitTransformToCircleItems(
  items: CircleItem[],
  viewW: number,
  viewH: number,
  padding = 56,
  minK = 0.25,
  maxK = 3.5,
): { x: number; y: number; k: number } {
  if (items.length === 0) {
    return { x: viewW / 2, y: viewH / 2, k: 0.45 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const it of items) {
    minX = Math.min(minX, it.x - it.r);
    maxX = Math.max(maxX, it.x + it.r);
    minY = Math.min(minY, it.y - it.r);
    maxY = Math.max(maxY, it.y + it.r);
  }

  const worldW = Math.max(maxX - minX, 48);
  const worldH = Math.max(maxY - minY, 48);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const k = Math.min(
    (viewW - padding * 2) / worldW,
    (viewH - padding * 2) / worldH,
    maxK,
  );
  const clampedK = Math.max(minK, k);

  return {
    k: clampedK,
    x: viewW / 2 - cx * clampedK,
    y: viewH / 2 - cy * clampedK,
  };
}

export interface CircleItem {
  id: string;
  kind: 'field' | 'subfield' | 'concept';
  x: number;
  y: number;
  r: number;
  label: string;
  color: string;
  fillOpacity: number;
  stroke: string;
  node: MapNode;
  fieldId: string;
  subfieldKey?: string;
}

export function getSubfieldKey(node: MapNode): string {
  const detailed = node.mscCodes.find((c) => /^\d{2}[A-Z]/.test(c));
  return detailed ?? node.mscCodes[0] ?? 'misc';
}

export function getSubfieldLabel(key: string): string {
  if (key === 'misc') return 'General';
  const entry = getMscLabel(key);
  const parts = entry.split(' — ');
  return parts.length > 1 ? parts[1] : key;
}

export function conceptWeight(node: MapNode, edges: MapEdge[]): number {
  const edgeCount = edges.filter(
    (e) => e.source === node.id || e.target === node.id,
  ).length;
  const content = node.content.length;
  const tags = node.mscCodes.length + node.customTags.length;
  return 1 + content * 0.8 + edgeCount * 1.2 + tags * 0.4;
}

export function conceptRadius(node: MapNode, edges: MapEdge[]): number {
  const w = conceptWeight(node, edges);
  return Math.min(18, Math.max(5, 4 + Math.sqrt(w) * 2.8));
}

/** Place circles inside a container without overlap (simple spiral pack) */
function packInCircle(
  items: { id: string; r: number }[],
  cx: number,
  cy: number,
  containerR: number,
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  if (items.length === 0) return positions;

  const sorted = [...items].sort((a, b) => b.r - a.r);
  const placed: { x: number; y: number; r: number }[] = [];

  sorted.forEach((item, i) => {
    if (i === 0) {
      positions.set(item.id, { x: cx, y: cy });
      placed.push({ x: cx, y: cy, r: item.r });
      return;
    }

    let best: { x: number; y: number } | null = null;
    let bestDist = Infinity;

    for (let t = 0; t < 720; t++) {
      const angle = (t / 720) * Math.PI * 2 * 6;
      const spiral = 4 + t * 0.15;
      const px = cx + Math.cos(angle) * spiral;
      const py = cy + Math.sin(angle) * spiral;
      const distFromCenter = Math.hypot(px - cx, py - cy) + item.r;
      if (distFromCenter > containerR) continue;

      let ok = true;
      for (const p of placed) {
        const d = Math.hypot(px - p.x, py - p.y);
        if (d < item.r + p.r + 2) {
          ok = false;
          break;
        }
      }
      if (ok) {
        const d0 = Math.hypot(px - cx, py - cy);
        if (d0 < bestDist) {
          bestDist = d0;
          best = { x: px, y: py };
        }
      }
    }

    const pos = best ?? {
      x: cx + Math.cos(i * 2.4) * (containerR * 0.5),
      y: cy + Math.sin(i * 2.4) * (containerR * 0.5),
    };
    positions.set(item.id, pos);
    placed.push({ x: pos.x, y: pos.y, r: item.r });
  });

  return positions;
}

function fieldRadius(conceptCount: number, subfieldCount: number): number {
  return Math.max(110, 55 + Math.sqrt(conceptCount) * 22 + subfieldCount * 12);
}

const GOLDEN = 2.399963229728653;
const FIELD_GAP = 22;

function enclosingRadius(
  cx: number,
  cy: number,
  children: { x: number; y: number; r: number }[],
  padding = 6,
): number {
  if (children.length === 0) return 0;
  let max = 0;
  for (const c of children) {
    const d = Math.hypot(c.x - cx, c.y - cy) + c.r + padding;
    if (d > max) max = d;
  }
  return max;
}

function clampInsideContainer(
  x: number,
  y: number,
  r: number,
  cx: number,
  cy: number,
  containerR: number,
  margin = 3,
): { x: number; y: number } {
  const dx = x - cx;
  const dy = y - cy;
  const d = Math.hypot(dx, dy);
  const maxD = Math.max(containerR - r - margin, 0);
  if (d <= maxD || d === 0) return { x, y };
  return { x: cx + (dx / d) * maxD, y: cy + (dy / d) * maxD };
}

function fieldRadiusForFolder(field: MapNode, concepts: MapNode[]): number {
  const fieldConcepts = concepts.filter((c) => c.parentId === field.id);
  const subfieldCount = new Set(fieldConcepts.map((c) => getSubfieldKey(c))).size;
  return fieldRadius(fieldConcepts.length, subfieldCount);
}

/** Pull fields with cross-links closer together */
function layoutFieldCenters(
  fields: MapNode[],
  concepts: MapNode[],
  edges: MapEdge[],
): Map<string, { x: number; y: number }> {
  type Sim = { x: number; y: number; vx: number; vy: number };
  const sim = new Map<string, Sim>();
  const radii = new Map(fields.map((f) => [f.id, fieldRadiusForFolder(f, concepts)]));
  const spread = 290 + fields.length * 12;

  fields.forEach((field, i) => {
    const pinned = field.pinned && (field.position.x !== 0 || field.position.y !== 0);
    sim.set(field.id, {
      x: pinned ? field.position.x : Math.cos(i * GOLDEN) * spread,
      y: pinned ? field.position.y : Math.sin(i * GOLDEN) * spread,
      vx: 0,
      vy: 0,
    });
  });

  const fieldLinkWeight = new Map<string, number>();
  for (const edge of edges) {
    const a = concepts.find((c) => c.id === edge.source);
    const b = concepts.find((c) => c.id === edge.target);
    if (!a?.parentId || !b?.parentId || a.parentId === b.parentId) continue;
    const key = [a.parentId, b.parentId].sort().join('|');
    fieldLinkWeight.set(key, (fieldLinkWeight.get(key) ?? 0) + (edge.weight ?? 1));
  }

  for (let iter = 0; iter < 140; iter++) {
    for (let i = 0; i < fields.length; i++) {
      for (let j = i + 1; j < fields.length; j++) {
        const pa = sim.get(fields[i].id)!;
        const pb = sim.get(fields[j].id)!;
        const rA = radii.get(fields[i].id)!;
        const rB = radii.get(fields[j].id)!;
        const minDist = rA + rB + FIELD_GAP;
        const dx = pb.x - pa.x;
        const dy = pb.y - pa.y;
        const dist = Math.max(Math.hypot(dx, dy), 1);
        let fx = 0;
        let fy = 0;
        if (dist < minDist) {
          const push = (minDist - dist) * 0.55;
          fx = (dx / dist) * push;
          fy = (dy / dist) * push;
        } else {
          const repulse = 9000 / (dist * dist);
          fx = (dx / dist) * repulse;
          fy = (dy / dist) * repulse;
        }
        if (!fields[i].pinned) { pa.vx -= fx; pa.vy -= fy; }
        if (!fields[j].pinned) { pb.vx += fx; pb.vy += fy; }
      }
    }

    for (const [key, weight] of fieldLinkWeight) {
      const [idA, idB] = key.split('|');
      const pa = sim.get(idA);
      const pb = sim.get(idB);
      if (!pa || !pb) continue;
      const fa = fields.find((f) => f.id === idA);
      const fb = fields.find((f) => f.id === idB);
      const rA = radii.get(idA) ?? 110;
      const rB = radii.get(idB) ?? 110;
      const minDist = rA + rB + FIELD_GAP * 0.45;
      const dx = pb.x - pa.x;
      const dy = pb.y - pa.y;
      const dist = Math.hypot(dx, dy) || 1;
      const ideal = Math.max(minDist, minDist + Math.max(0, 90 - weight * 12));
      const pull = (dist - ideal) * 0.008 * weight;
      const fx = (dx / dist) * pull;
      const fy = (dy / dist) * pull;
      if (!fa?.pinned) { pa.vx += fx; pa.vy += fy; }
      if (!fb?.pinned) { pb.vx -= fx; pb.vy -= fy; }
    }

    for (const field of fields) {
      const p = sim.get(field.id)!;
      if (!field.pinned) {
        p.x += p.vx * 0.35;
        p.y += p.vy * 0.35;
      }
      p.vx *= 0.82;
      p.vy *= 0.82;
    }
  }

  return new Map([...sim.entries()].map(([id, p]) => [id, { x: p.x, y: p.y }]));
}

function subfieldOf(items: CircleItem[], concept: CircleItem): CircleItem | undefined {
  return items.find(
    (it) =>
      it.kind === 'subfield' &&
      it.fieldId === concept.fieldId &&
      it.subfieldKey === concept.subfieldKey,
  );
}

/** Grow subfield discs and re-pack them so children stay nested inside the field */
function refineFieldNesting(items: CircleItem[], fieldId: string): void {
  const field = items.find((it) => it.kind === 'field' && it.id === fieldId);
  if (!field) return;

  const subfields = items.filter((it) => it.kind === 'subfield' && it.fieldId === fieldId);
  if (subfields.length === 0) return;

  for (let round = 0; round < 4; round++) {
    for (const sf of subfields) {
      const concepts = items.filter(
        (it) =>
          it.kind === 'concept' &&
          it.fieldId === fieldId &&
          it.subfieldKey === sf.subfieldKey,
      );
      const needed = enclosingRadius(sf.x, sf.y, concepts, 6);
      if (needed > sf.r) sf.r = needed;
    }

    const subPositions = packInCircle(
      subfields.map((sf) => ({ id: sf.subfieldKey!, r: sf.r })),
      field.x,
      field.y,
      field.r - 14,
    );

    for (const sf of subfields) {
      const np = subPositions.get(sf.subfieldKey!) ?? { x: sf.x, y: sf.y };
      const dx = np.x - sf.x;
      const dy = np.y - sf.y;
      if (dx === 0 && dy === 0) continue;
      sf.x = np.x;
      sf.y = np.y;
      for (const c of items) {
        if (c.kind !== 'concept' || c.subfieldKey !== sf.subfieldKey || c.fieldId !== fieldId) {
          continue;
        }
        c.x += dx;
        c.y += dy;
      }
    }
  }

  for (const sf of subfields) {
    const clamped = clampInsideContainer(sf.x, sf.y, sf.r, field.x, field.y, field.r, 10);
    const dx = clamped.x - sf.x;
    const dy = clamped.y - sf.y;
    if (dx === 0 && dy === 0) continue;
    sf.x = clamped.x;
    sf.y = clamped.y;
    for (const c of items) {
      if (c.kind !== 'concept' || c.subfieldKey !== sf.subfieldKey || c.fieldId !== fieldId) {
        continue;
      }
      c.x += dx;
      c.y += dy;
    }
  }

  for (const sf of subfields) {
    const concepts = items.filter(
      (it) =>
        it.kind === 'concept' &&
        it.fieldId === fieldId &&
        it.subfieldKey === sf.subfieldKey,
    );
    for (const c of concepts) {
      const clamped = clampInsideContainer(c.x, c.y, c.r, sf.x, sf.y, sf.r, 4);
      c.x = clamped.x;
      c.y = clamped.y;
    }
    const needed = enclosingRadius(sf.x, sf.y, concepts, 6);
    if (needed > sf.r) sf.r = needed;
  }
}

/** Nudge linked concepts; keeps each concept inside its subfield (then field) */
function nudgeLinkedConcepts(
  items: CircleItem[],
  edges: MapEdge[],
  nodes: MapNode[],
): void {
  const concepts = items.filter((it) => it.kind === 'concept');
  const byId = new Map(concepts.map((c) => [c.id, c]));

  const clampConcept = (c: CircleItem) => {
    const node = nodes.find((n) => n.id === c.id);
    if (node?.pinned) return;
    const sf = subfieldOf(items, c);
    if (sf) {
      const inSf = clampInsideContainer(c.x, c.y, c.r, sf.x, sf.y, sf.r, 4);
      c.x = inSf.x;
      c.y = inSf.y;
    }
    const field = items.find((it) => it.kind === 'field' && it.id === c.fieldId);
    if (field) {
      const inField = clampInsideContainer(c.x, c.y, c.r, field.x, field.y, field.r, 6);
      c.x = inField.x;
      c.y = inField.y;
    }
  };

  for (let iter = 0; iter < 80; iter++) {
    for (const edge of edges) {
      const a = byId.get(edge.source);
      const b = byId.get(edge.target);
      if (!a || !b) continue;
      const na = nodes.find((n) => n.id === edge.source);
      const nb = nodes.find((n) => n.id === edge.target);
      const w = edge.weight ?? 1;
      const crossField = na?.parentId !== nb?.parentId;
      const sameSubfield = a.subfieldKey === b.subfieldKey && a.fieldId === b.fieldId;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 1;
      const ideal = crossField ? 48 + 28 / w : sameSubfield ? 18 + 10 / w : 28 + 14 / w;
      const strength = crossField ? 0.035 : sameSubfield ? 0.06 : 0.04;
      const pull = (dist - ideal) * strength * w;
      const fx = (dx / dist) * pull;
      const fy = (dy / dist) * pull;
      if (!na?.pinned) { a.x += fx; a.y += fy; }
      if (!nb?.pinned) { b.x -= fx; b.y -= fy; }
    }

    for (const c of concepts) clampConcept(c);
  }

  for (const field of items.filter((it) => it.kind === 'field')) {
    refineFieldNesting(items, field.id);
  }
}

export function computeCircleLayout(nodes: MapNode[], edges: MapEdge[]): CircleItem[] {
  const fields = nodes.filter((n) => n.type === 'field-folder');
  const concepts = nodes.filter((n) => n.type === 'concept');
  const items: CircleItem[] = [];

  const fieldCenters = layoutFieldCenters(fields, concepts, edges);

  fields.forEach((field) => {
    const center = fieldCenters.get(field.id)!;
    const fieldConcepts = concepts.filter((c) => c.parentId === field.id);
    const subfieldMap = new Map<string, MapNode[]>();

    fieldConcepts.forEach((c) => {
      const key = getSubfieldKey(c);
      if (!subfieldMap.has(key)) subfieldMap.set(key, []);
      subfieldMap.get(key)!.push(c);
    });

    const subfieldKeys = [...subfieldMap.keys()];
    const fR = fieldRadius(fieldConcepts.length, subfieldKeys.length);
    const fColor = colorForNode('field-folder', field.mscCodes, field.color);

    items.push({
      id: field.id,
      kind: 'field',
      x: center.x,
      y: center.y,
      r: fR,
      label: field.title,
      color: fColor,
      fillOpacity: 0.1,
      stroke: fColor,
      node: field,
      fieldId: field.id,
    });

    const subfieldRadii = subfieldKeys.map((key) => {
      const group = subfieldMap.get(key)!;
      const totalW = group.reduce((s, n) => s + conceptWeight(n, edges), 0);
      return {
        key,
        r: Math.max(28, 18 + Math.sqrt(totalW) * 10),
        concepts: group,
      };
    });

    const subPositions = packInCircle(
      subfieldRadii.map((s) => ({ id: s.key, r: s.r })),
      center.x,
      center.y,
      fR - 18,
    );

    subfieldRadii.forEach((sf) => {
      const sp = subPositions.get(sf.key) ?? center;
      const sfColor = colorForNode('concept', [sf.key]);

      items.push({
        id: `${field.id}__sf__${sf.key}`,
        kind: 'subfield',
        x: sp.x,
        y: sp.y,
        r: sf.r,
        label: getSubfieldLabel(sf.key),
        color: sfColor,
        fillOpacity: 0.2,
        stroke: lighten(sfColor, 0.15),
        node: field,
        fieldId: field.id,
        subfieldKey: sf.key,
      });

      const conceptItems = sf.concepts.map((c) => ({
        id: c.id,
        r: conceptRadius(c, edges),
      }));

      const cPositions = packInCircle(conceptItems, sp.x, sp.y, sf.r - 6);

      sf.concepts.forEach((c) => {
        const hasCustom = c.pinned && (c.position.x !== 0 || c.position.y !== 0);
        const cp = hasCustom ? c.position : cPositions.get(c.id) ?? sp;
        const cColor = colorForNode('concept', c.mscCodes, c.color);

        items.push({
          id: c.id,
          kind: 'concept',
          x: cp.x,
          y: cp.y,
          r: conceptRadius(c, edges),
          label: c.title,
          color: cColor,
          fillOpacity: 0.85,
          stroke: lighten(cColor, 0.2),
          node: c,
          fieldId: field.id,
          subfieldKey: sf.key,
        });
      });
    });
  });

  for (const field of fields) {
    refineFieldNesting(items, field.id);
  }
  nudgeLinkedConcepts(items, edges, nodes);
  return items;
}

export function isCrossFieldEdge(
  edge: MapEdge,
  nodes: MapNode[],
): boolean {
  const a = nodes.find((n) => n.id === edge.source);
  const b = nodes.find((n) => n.id === edge.target);
  return !!a?.parentId && !!b?.parentId && a.parentId !== b.parentId;
}

export function edgeStrength(edge: MapEdge): number {
  return edge.weight ?? 1;
}

export function getVisibleItems(
  items: CircleItem[],
  level: DetailLevel,
  focusFieldId: string | null,
): CircleItem[] {
  if (focusFieldId && level !== 'fields') {
    return items.filter(
      (it) =>
        it.kind === 'field' && it.id === focusFieldId
          ? level === 'subfields'
          : it.fieldId === focusFieldId && it.kind !== 'field',
    ).concat(
      items.filter((it) => it.kind === 'field' && it.id === focusFieldId),
    );
  }

  switch (level) {
    case 'fields':
      return items.filter((it) => it.kind === 'field');
    case 'subfields':
      return items.filter((it) => it.kind === 'field' || it.kind === 'subfield');
    case 'concepts':
      return items;
  }
}

export function fieldBounds(field: CircleItem): { x: number; y: number; r: number } {
  return { x: field.x, y: field.y, r: field.r };
}
