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

function resolvePoint(
  layout: CircleItem[],
  fieldId: string,
  subfieldKey: string | null,
): { x: number; y: number } | null {
  if (subfieldKey) {
    const sf = subfieldItem(layout, fieldId, subfieldKey);
    if (sf) return { x: sf.x, y: sf.y };
  }
  const field = fieldItem(layout, fieldId);
  return field ? { x: field.x, y: field.y } : null;
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
  conceptPositions: Map<string, { x: number; y: number }>,
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

    const s = conceptPositions.get(edge.source);
    const t = conceptPositions.get(edge.target);
    if (!s || !t) continue;

    rendered.push({
      id: edge.id,
      sourceEdge: edge,
      bundleEdges: [edge],
      x1: s.x,
      y1: s.y,
      x2: t.x,
      y2: t.y,
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
    const p1 = resolvePoint(layout, fieldAId, null);
    const p2 = resolvePoint(layout, fieldBId, null);
    if (!p1 || !p2) continue;

    const fieldA = nodes.find((n) => n.id === fieldAId);
    const fieldB = nodes.find((n) => n.id === fieldBId);

    rendered.push({
      id: `bundle-${groupKey}`,
      sourceEdge: rep,
      bundleEdges: [...bundle.edges],
      x1: p1.x,
      y1: p1.y,
      x2: p2.x,
      y2: p2.y,
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

export function buildRenderedEdges(
  edges: MapEdge[],
  nodes: MapNode[],
  layout: CircleItem[],
  level: DetailLevel,
  drill: { fieldId: string | null; subfieldKey: string | null },
  conceptPositions: Map<string, { x: number; y: number }>,
  visibleConceptIds: Set<string>,
): RenderedEdge[] {
  const realEdges = edges.filter((e) => !isTagEdgeId(e.id));
  const useFieldBundles = level === 'fields' && !drill.fieldId;

  if (useFieldBundles) {
    return buildFieldBundleEdges(realEdges, nodes, layout);
  }

  return buildConceptLevelEdges(
    realEdges,
    nodes,
    layout,
    level,
    drill,
    conceptPositions,
    visibleConceptIds,
  );
}

export function edgeTouchesConcept(edge: RenderedEdge, conceptId: string | null): boolean {
  if (!conceptId) return false;
  return edge.conceptIds.includes(conceptId);
}
