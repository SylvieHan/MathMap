import type { MapEdge, MapNode } from '../types';
import { edgeStrength, isCrossFieldEdge, type CircleItem, type DetailLevel } from './circleLayout';
import { isTagEdgeId } from './layout';

export type EdgeLod = 'field' | 'subfield' | 'concept';

export interface RenderedEdge {
  id: string;
  sourceEdge: MapEdge;
  /** All underlying connections (length 1 for individual concept edges). */
  bundleEdges: MapEdge[];
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  crossField: boolean;
  strength: number;
  bundleSize: number;
  lod: EdgeLod;
  conceptIds: string[];
  fieldAId?: string;
  fieldBId?: string;
  label?: string;
}

export function edgeLod(level: DetailLevel): EdgeLod {
  if (level === 'concepts') return 'concept';
  if (level === 'subfields') return 'subfield';
  return 'field';
}

export interface CircleAnchor {
  x: number;
  y: number;
  r: number;
}

/** Point on a circle rim toward another center. */
export function circleRimToward(
  cx: number,
  cy: number,
  r: number,
  towardX: number,
  towardY: number,
): { x: number; y: number } {
  const dx = towardX - cx;
  const dy = towardY - cy;
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-6) return { x: cx + r, y: cy };
  return { x: cx + (dx / dist) * r, y: cy + (dy / dist) * r };
}

/** Line endpoints on both circle surfaces (ray center-to-center). */
export function anchorEdgeEndpoints(
  a: CircleAnchor,
  b: CircleAnchor,
): { x1: number; y1: number; x2: number; y2: number } {
  const start = circleRimToward(a.x, a.y, a.r, b.x, b.y);
  const end = circleRimToward(b.x, b.y, b.r, a.x, a.y);
  return { x1: start.x, y1: start.y, x2: end.x, y2: end.y };
}

/** Center-to-center — used for live tension / force lines during drag. */
export function centerEdgeEndpoints(
  a: CircleAnchor,
  b: CircleAnchor,
): { x1: number; y1: number; x2: number; y2: number } {
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
}

function fieldItem(layout: CircleItem[], fieldId: string): CircleItem | undefined {
  return layout.find((it) => it.kind === 'field' && it.id === fieldId);
}

function subfieldItem(
  layout: CircleItem[],
  fieldId: string,
  subfieldKey: string,
): CircleItem | undefined {
  return layout.find(
    (it) => it.kind === 'subfield' && it.fieldId === fieldId && it.subfieldKey === subfieldKey,
  );
}

function conceptMeta(
  nodes: MapNode[],
  layout: CircleItem[],
  conceptId: string,
): { fieldId: string; subfieldKey: string } | null {
  const node = nodes.find((n) => n.id === conceptId);
  const item = layout.find((it) => it.kind === 'concept' && it.id === conceptId);
  if (!node?.parentId || !item?.subfieldKey) return null;
  return { fieldId: node.parentId, subfieldKey: item.subfieldKey };
}

function pickRepresentativeEdge(edges: MapEdge[]): MapEdge {
  return [...edges].sort((a, b) => (b.weight ?? 1) - (a.weight ?? 1))[0];
}

function bundleStrength(edges: MapEdge[]): number {
  return edges.reduce((sum, e) => sum + edgeStrength(e), 0);
}

function edgePassesDrillFilter(
  a: { fieldId: string; subfieldKey: string },
  b: { fieldId: string; subfieldKey: string },
  drill: { fieldId: string | null; subfieldKey: string | null },
): boolean {
  if (drill.subfieldKey) {
    return a.subfieldKey === drill.subfieldKey || b.subfieldKey === drill.subfieldKey;
  }
  if (drill.fieldId) {
    return a.fieldId === drill.fieldId || b.fieldId === drill.fieldId;
  }
  return true;
}

/** One line per connection at concept positions (used whenever not in fit-all field view). */
function buildConceptLevelEdges(
  realEdges: MapEdge[],
  nodes: MapNode[],
  layout: CircleItem[],
  level: DetailLevel,
  drill: { fieldId: string | null; subfieldKey: string | null },
  conceptCircles: Map<string, CircleAnchor>,
  visibleConceptIds: Set<string>,
): RenderedEdge[] {
  const lod = edgeLod(level);
  const rendered: RenderedEdge[] = [];

  for (const edge of realEdges) {
    const a = conceptMeta(nodes, layout, edge.source);
    const b = conceptMeta(nodes, layout, edge.target);
    if (!a || !b) continue;
    if (!edgePassesDrillFilter(a, b, drill)) continue;

    if (level === 'concepts') {
      if (!visibleConceptIds.has(edge.source) || !visibleConceptIds.has(edge.target)) continue;
    }

    const s = conceptCircles.get(edge.source);
    const t = conceptCircles.get(edge.target);
    if (!s || !t) continue;

    const { x1, y1, x2, y2 } = anchorEdgeEndpoints(s, t);

    rendered.push({
      id: edge.id,
      sourceEdge: edge,
      bundleEdges: [edge],
      x1,
      y1,
      x2,
      y2,
      crossField: isCrossFieldEdge(edge, nodes),
      strength: edgeStrength(edge),
      bundleSize: 1,
      lod,
      conceptIds: [edge.source, edge.target],
    });
  }

  return rendered;
}

/** Fit-all only: one bundled line per field pair between large-ball centers. */
function buildFieldBundleEdges(
  realEdges: MapEdge[],
  nodes: MapNode[],
  layout: CircleItem[],
): RenderedEdge[] {
  type Bundle = {
    edges: MapEdge[];
    aField: string;
    bField: string;
    conceptIds: Set<string>;
  };

  const bundles = new Map<string, Bundle>();

  for (const edge of realEdges) {
    const a = conceptMeta(nodes, layout, edge.source);
    const b = conceptMeta(nodes, layout, edge.target);
    if (!a || !b) continue;
    if (a.fieldId === b.fieldId) continue;

    const groupKey = [a.fieldId, b.fieldId].sort().join('~~');
    let bundle = bundles.get(groupKey);
    if (!bundle) {
      bundle = {
        edges: [],
        aField: a.fieldId,
        bField: b.fieldId,
        conceptIds: new Set(),
      };
      bundles.set(groupKey, bundle);
    }
    bundle.edges.push(edge);
    bundle.conceptIds.add(edge.source);
    bundle.conceptIds.add(edge.target);
  }

  const rendered: RenderedEdge[] = [];

  for (const [groupKey, bundle] of bundles) {
    const rep = pickRepresentativeEdge(bundle.edges);
    const [fieldAId, fieldBId] = groupKey.split('~~');
    const fieldAItem = fieldItem(layout, fieldAId);
    const fieldBItem = fieldItem(layout, fieldBId);
    if (!fieldAItem || !fieldBItem) continue;

    const { x1, y1, x2, y2 } = anchorEdgeEndpoints(fieldAItem, fieldBItem);

    const fieldA = nodes.find((n) => n.id === fieldAId);
    const fieldB = nodes.find((n) => n.id === fieldBId);

    rendered.push({
      id: `bundle-${groupKey}`,
      sourceEdge: rep,
      bundleEdges: [...bundle.edges],
      x1,
      y1,
      x2,
      y2,
      crossField: true,
      strength: bundleStrength(bundle.edges),
      bundleSize: bundle.edges.length,
      lod: 'field',
      conceptIds: [...bundle.conceptIds],
      fieldAId,
      fieldBId,
      label: `${fieldA?.title ?? fieldAId} ↔ ${fieldB?.title ?? fieldBId}`,
    });
  }

  return rendered;
}

/** Drilled field at subfields zoom: one bundled line per subfield pair (not per concept). */
function buildSubfieldBundleEdges(
  realEdges: MapEdge[],
  nodes: MapNode[],
  layout: CircleItem[],
  drill: { fieldId: string | null; subfieldKey: string | null },
): RenderedEdge[] {
  type SubfieldEnd = { fieldId: string; subfieldKey: string };
  type Bundle = { edges: MapEdge[]; a: SubfieldEnd; b: SubfieldEnd; conceptIds: Set<string> };

  const bundles = new Map<string, Bundle>();

  for (const edge of realEdges) {
    const a = conceptMeta(nodes, layout, edge.source);
    const b = conceptMeta(nodes, layout, edge.target);
    if (!a || !b) continue;
    if (a.fieldId === b.fieldId && a.subfieldKey === b.subfieldKey) continue;
    if (!edgePassesDrillFilter(a, b, drill)) continue;

    const endA: SubfieldEnd = { fieldId: a.fieldId, subfieldKey: a.subfieldKey };
    const endB: SubfieldEnd = { fieldId: b.fieldId, subfieldKey: b.subfieldKey };
    const groupKey = [
      `${endA.fieldId}|${endA.subfieldKey}`,
      `${endB.fieldId}|${endB.subfieldKey}`,
    ]
      .sort()
      .join('~~');

    let bundle = bundles.get(groupKey);
    if (!bundle) {
      bundle = { edges: [], a: endA, b: endB, conceptIds: new Set() };
      bundles.set(groupKey, bundle);
    }
    bundle.edges.push(edge);
    bundle.conceptIds.add(edge.source);
    bundle.conceptIds.add(edge.target);
  }

  const rendered: RenderedEdge[] = [];

  for (const [groupKey, bundle] of bundles) {
    const rep = pickRepresentativeEdge(bundle.edges);
    const crossField = bundle.a.fieldId !== bundle.b.fieldId;

    const circleA =
      subfieldItem(layout, bundle.a.fieldId, bundle.a.subfieldKey) ??
      fieldItem(layout, bundle.a.fieldId);
    const circleB =
      subfieldItem(layout, bundle.b.fieldId, bundle.b.subfieldKey) ??
      fieldItem(layout, bundle.b.fieldId);
    if (!circleA || !circleB) continue;

    const { x1, y1, x2, y2 } = anchorEdgeEndpoints(circleA, circleB);

    rendered.push({
      id: `sf-bundle-${groupKey}`,
      sourceEdge: rep,
      bundleEdges: [...bundle.edges],
      x1,
      y1,
      x2,
      y2,
      crossField,
      strength: bundleStrength(bundle.edges),
      bundleSize: bundle.edges.length,
      lod: 'subfield',
      conceptIds: [...bundle.conceptIds],
      fieldAId: bundle.a.fieldId,
      fieldBId: bundle.b.fieldId,
      label: crossField ? undefined : rep.label,
    });
  }

  return rendered;
}

export function buildRenderedEdges(
  edges: MapEdge[],
  nodes: MapNode[],
  layout: CircleItem[],
  level: DetailLevel,
  drill: { fieldId: string | null; subfieldKey: string | null },
  conceptCircles: Map<string, CircleAnchor>,
  visibleConceptIds: Set<string>,
): RenderedEdge[] {
  const realEdges = edges.filter((e) => !isTagEdgeId(e.id));
  /** Fit-all (no drill): always one bundled link per field pair, at any zoom. */
  const useFieldBundles = !drill.fieldId;
  const useSubfieldBundles = !!drill.fieldId && level !== 'concepts';

  if (useFieldBundles) {
    return buildFieldBundleEdges(realEdges, nodes, layout);
  }

  if (useSubfieldBundles) {
    return buildSubfieldBundleEdges(realEdges, nodes, layout, drill);
  }

  return buildConceptLevelEdges(
    realEdges,
    nodes,
    layout,
    level,
    drill,
    conceptCircles,
    visibleConceptIds,
  );
}

export function edgeTouchesConcept(edge: RenderedEdge, conceptId: string | null): boolean {
  if (!conceptId) return false;
  return edge.conceptIds.includes(conceptId);
}
