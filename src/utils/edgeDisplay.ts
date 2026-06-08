import type { MapEdge, MapNode } from '../types';
import { edgeStrength, isCrossFieldEdge, type CircleItem, type DetailLevel } from './circleLayout';
import { isTagEdgeId } from './layout';

export type EdgeLod = 'field' | 'subfield' | 'concept';

export interface RenderedEdge {
  id: string;
  sourceEdge: MapEdge;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  crossField: boolean;
  strength: number;
  bundleSize: number;
  lod: EdgeLod;
  conceptIds: string[];
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

type EndpointKey = string;

function endpointKey(fieldId: string, subfieldKey: string | null): EndpointKey {
  return subfieldKey ? `${fieldId}::${subfieldKey}` : fieldId;
}

function parseEndpointKey(key: EndpointKey): { fieldId: string; subfieldKey: string | null } {
  const idx = key.indexOf('::');
  if (idx === -1) return { fieldId: key, subfieldKey: null };
  return { fieldId: key.slice(0, idx), subfieldKey: key.slice(idx + 2) };
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

export function buildRenderedEdges(
  edges: MapEdge[],
  nodes: MapNode[],
  layout: CircleItem[],
  level: DetailLevel,
  drill: { fieldId: string | null; subfieldKey: string | null },
  conceptPositions: Map<string, { x: number; y: number }>,
  visibleConceptIds: Set<string>,
): RenderedEdge[] {
  const lod = edgeLod(level);
  const realEdges = edges.filter((e) => !isTagEdgeId(e.id));

  if (lod === 'concept') {
    const rendered: RenderedEdge[] = [];
    for (const edge of realEdges) {
      if (!visibleConceptIds.has(edge.source) || !visibleConceptIds.has(edge.target)) continue;
      const s = conceptPositions.get(edge.source);
      const t = conceptPositions.get(edge.target);
      if (!s || !t) continue;
      rendered.push({
        id: edge.id,
        sourceEdge: edge,
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

  type Bundle = {
    edges: MapEdge[];
    aField: string;
    bField: string;
    aSubfield: string | null;
    bSubfield: string | null;
    conceptIds: Set<string>;
  };

  const bundles = new Map<string, Bundle>();

  for (const edge of realEdges) {
    const a = conceptMeta(nodes, layout, edge.source);
    const b = conceptMeta(nodes, layout, edge.target);
    if (!a || !b) continue;

    if (drill.subfieldKey) {
      const inScope =
        a.subfieldKey === drill.subfieldKey || b.subfieldKey === drill.subfieldKey;
      if (!inScope) continue;
    } else if (drill.fieldId) {
      const inActiveField = a.fieldId === drill.fieldId || b.fieldId === drill.fieldId;
      if (!inActiveField) continue;
    }

    let aKey: EndpointKey;
    let bKey: EndpointKey;
    let aSub: string | null;
    let bSub: string | null;

    if (lod === 'field') {
      if (a.fieldId === b.fieldId) continue;
      aKey = a.fieldId;
      bKey = b.fieldId;
      aSub = null;
      bSub = null;
    } else {
      const sameField = a.fieldId === b.fieldId;
      aSub = sameField ? a.subfieldKey : null;
      bSub = sameField ? b.subfieldKey : null;
      aKey = endpointKey(a.fieldId, aSub);
      bKey = endpointKey(b.fieldId, bSub);
      if (aKey === bKey) continue;
    }

    const groupKey = [aKey, bKey].sort().join('~~');
    let bundle = bundles.get(groupKey);
    if (!bundle) {
      bundle = {
        edges: [],
        aField: a.fieldId,
        bField: b.fieldId,
        aSubfield: aSub,
        bSubfield: bSub,
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
    const crossField = bundle.aField !== bundle.bField;

    const [keyA, keyB] = groupKey.split('~~');
    const epA = parseEndpointKey(keyA);
    const epB = parseEndpointKey(keyB);
    const p1 = resolvePoint(layout, epA.fieldId, epA.subfieldKey);
    const p2 = resolvePoint(layout, epB.fieldId, epB.subfieldKey);

    if (!p1 || !p2) continue;

    rendered.push({
      id: `bundle-${groupKey}`,
      sourceEdge: rep,
      x1: p1.x,
      y1: p1.y,
      x2: p2.x,
      y2: p2.y,
      crossField,
      strength: bundleStrength(bundle.edges),
      bundleSize: bundle.edges.length,
      lod,
      conceptIds: [...bundle.conceptIds],
    });
  }

  return rendered;
}

export function edgeTouchesConcept(edge: RenderedEdge, conceptId: string | null): boolean {
  if (!conceptId) return false;
  return edge.conceptIds.includes(conceptId);
}
