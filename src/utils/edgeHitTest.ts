import type { MapEdge } from '../types';
import type { CircleItem } from './circleLayout';
import type { RenderedEdge } from './edgeDisplay';

function distToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

export function hitTestRenderedEdge(
  edges: RenderedEdge[],
  wx: number,
  wy: number,
  threshold: number,
): RenderedEdge | null {
  let best: { edge: RenderedEdge; dist: number } | null = null;

  for (const edge of edges) {
    const dist = distToSegment(wx, wy, edge.x1, edge.y1, edge.x2, edge.y2);
    if (dist <= threshold && (!best || dist < best.dist)) {
      best = { edge, dist };
    }
  }

  return best?.edge ?? null;
}

/** @deprecated Use hitTestRenderedEdge for LOD-aware edges */
export function hitTestEdge(
  edges: MapEdge[],
  posById: Map<string, CircleItem>,
  wx: number,
  wy: number,
  threshold: number,
): MapEdge | null {
  let best: { edge: MapEdge; dist: number } | null = null;

  for (const edge of edges) {
    const s = posById.get(edge.source);
    const t = posById.get(edge.target);
    if (!s || !t || s.kind !== 'concept' || t.kind !== 'concept') continue;
    const dist = distToSegment(wx, wy, s.x, s.y, t.x, t.y);
    if (dist <= threshold && (!best || dist < best.dist)) {
      best = { edge, dist };
    }
  }

  return best?.edge ?? null;
}
