import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MapEdge, MapNode } from '../types';
import { zoomToDetailLevel, type CircleItem, type DetailLevel } from '../utils/circleLayout';
import { clampInsideField } from '../utils/forceLayout';
import { useForceLayout } from '../hooks/useForceLayout';
import { buildRenderedEdges, edgeTouchesConcept, type RenderedEdge } from '../utils/edgeDisplay';
import { hitTestRenderedEdge } from '../utils/edgeHitTest';
import { animateTransform, runMomentum, type Transform2D } from '../utils/animate';
import { pinchWheelZoomFactor, zoomTransformAtPoint } from '../utils/wheelZoom';
import type { DrillState, MapSelection } from '../types/selection';
import { EMPTY_DRILL } from '../types/selection';
import {
  dragTargetFromHit,
  itemMatchesDragTarget,
  type DragTarget,
} from '../utils/dragTarget';
import { FieldLegend } from './FieldLegend';

export interface CircleMapCanvasProps {
  nodes: MapNode[];
  edges: MapEdge[];
  selection: MapSelection | null;
  drill: DrillState;
  highlightIds: Set<string> | null;
  readOnly?: boolean;
  onSelectionChange: (selection: MapSelection | null) => void;
  onDrillChange: (drill: DrillState) => void;
  onNodeMove: (id: string, x: number, y: number) => void;
  onTogglePin: (id: string) => void;
  onAddEdge?: (source: string, target: string) => void;
}

const MIN_K = 0.25;
const MAX_K = 3.5;
const DRAG_THRESHOLD = 6;
const CAMERA_MS = 520;
const ZOOM_MS = 160;
type DragState = {
  mode: 'pending' | 'pan' | 'node';
  startX: number;
  startY: number;
  panOx: number;
  panOy: number;
  hit: CircleItem | null;
  dragTarget?: DragTarget;
  anchorX?: number;
  anchorY?: number;
  grabOx?: number;
  grabOy?: number;
  lastPanX?: number;
  lastPanY?: number;
  lastPanT?: number;
  lastOffsetX?: number;
  lastOffsetY?: number;
  lastMoveT?: number;
  releaseVx?: number;
  releaseVy?: number;
};

const LEVEL_LABELS: Record<DetailLevel, string> = {
  fields: 'Fields',
  subfields: 'Subfields',
  concepts: 'Concepts',
};

function clientToWorld(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  t: Transform2D,
): { x: number; y: number } {
  const sx = clientX - rect.left;
  const sy = clientY - rect.top;
  return {
    x: (sx - t.x) / t.k,
    y: (sy - t.y) / t.k,
  };
}

function hitTest(items: CircleItem[], wx: number, wy: number): CircleItem | null {
  const kindOrder: CircleItem['kind'][] = ['concept', 'subfield', 'field'];
  for (const kind of kindOrder) {
    const candidates = items.filter((it) => it.kind === kind);
    for (let i = candidates.length - 1; i >= 0; i--) {
      const it = candidates[i];
      if (Math.hypot(wx - it.x, wy - it.y) <= it.r) return it;
    }
  }
  return null;
}

function targetTransform(
  worldX: number,
  worldY: number,
  targetK: number,
  viewW: number,
  viewH: number,
): Transform2D {
  return {
    k: targetK,
    x: viewW / 2 - worldX * targetK,
    y: viewH / 2 - worldY * targetK,
  };
}

let edgeSourceGlobal: string | null = null;

export function CircleMapCanvas({
  nodes,
  edges,
  selection,
  drill,
  highlightIds,
  readOnly = false,
  onSelectionChange,
  onDrillChange,
  onNodeMove,
  onTogglePin,
  onAddEdge,
}: CircleMapCanvasProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [transform, setTransform] = useState<Transform2D>({ x: 0, y: 0, k: 0.45 });
  const transformRef = useRef(transform);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const dragRef = useRef<DragState | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [isCameraAnimating, setIsCameraAnimating] = useState(false);
  const [hoverTip, setHoverTip] = useState<{ id: string; label: string; x: number; y: number } | null>(null);
  const [hoverEdgeId, setHoverEdgeId] = useState<string | null>(null);
  const [tensionTarget, setTensionTarget] = useState<DragTarget | null>(null);
  const [isForceDragging, setIsForceDragging] = useState(false);
  const cancelCameraRef = useRef<(() => void) | null>(null);
  const cancelMomentumRef = useRef<(() => void) | null>(null);
  const drillReadyRef = useRef(false);

  useEffect(() => {
    transformRef.current = transform;
  }, [transform]);

  const { layout, isSettling, isTensionSettling, beginDragGroup, moveDragGroup, endDragGroup } =
    useForceLayout(nodes, edges);
  const level = zoomToDetailLevel(transform.k);

  const showItem = useCallback(
    (item: CircleItem): boolean => {
      if (!drill.fieldId) return item.kind === 'field';

      // Keep all fields visible when drilled — non-active ones fade in the background
      if (item.kind === 'field') return true;

      if (item.fieldId !== drill.fieldId) return false;

      if (drill.subfieldKey) {
        if (item.kind === 'subfield') {
          return item.subfieldKey === drill.subfieldKey;
        }
        if (item.kind === 'concept') {
          return item.subfieldKey === drill.subfieldKey && level === 'concepts';
        }
        return false;
      }

      if (item.kind === 'concept') {
        return level === 'concepts';
      }
      return true;
    },
    [drill, level],
  );

  const isBackgroundField = useCallback(
    (item: CircleItem) =>
      item.kind === 'field' && !!drill.fieldId && item.id !== drill.fieldId,
    [drill.fieldId],
  );

  const isOverview = !drill.fieldId;

  const visibleItems = useMemo(() => layout.filter(showItem), [layout, showItem]);

  const overviewFields = useMemo(
    () => (isOverview ? layout.filter((it) => it.kind === 'field') : []),
    [isOverview, layout],
  );

  const overviewDecorByField = useMemo(() => {
    if (!isOverview) return new Map<string, { subfields: CircleItem[]; concepts: CircleItem[] }>();
    const map = new Map<string, { subfields: CircleItem[]; concepts: CircleItem[] }>();
    for (const field of overviewFields) {
      map.set(field.id, { subfields: [], concepts: [] });
    }
    for (const item of layout) {
      if (item.kind !== 'subfield' && item.kind !== 'concept') continue;
      const bucket = map.get(item.fieldId);
      if (!bucket) continue;
      const field = overviewFields.find((f) => f.id === item.fieldId);
      if (!field) continue;
      const placed = clampInsideField(item, field);
      if (item.kind === 'subfield') {
        bucket.subfields.push(placed);
      } else {
        bucket.concepts.push(placed);
      }
    }
    return map;
  }, [isOverview, layout, overviewFields]);

  const displayItems = visibleItems;

  const focusNodeId = useMemo(() => {
    if (hoverTip?.id && visibleItems.some((it) => it.kind === 'concept' && it.id === hoverTip.id)) {
      return hoverTip.id;
    }
    if (selection?.kind === 'node') {
      const n = nodes.find((x) => x.id === selection.id);
      if (n?.type === 'concept') return selection.id;
    }
    if (tensionTarget?.kind === 'concept') return tensionTarget.nodeId;
    return null;
  }, [hoverTip, selection, visibleItems, nodes, tensionTarget]);

  const visibleConceptIds = useMemo(
    () => new Set(visibleItems.filter((it) => it.kind === 'concept').map((it) => it.node.id)),
    [visibleItems],
  );

  const conceptPositions = useMemo(() => {
    const m = new Map<string, { x: number; y: number }>();
    for (const it of layout) {
      if (it.kind === 'concept') m.set(it.id, { x: it.x, y: it.y });
    }
    for (const it of displayItems) {
      if (it.kind === 'concept') m.set(it.id, { x: it.x, y: it.y });
    }
    return m;
  }, [displayItems, layout]);

  const renderedEdges = useMemo(
    () =>
      buildRenderedEdges(
        edges,
        nodes,
        layout,
        level,
        drill,
        conceptPositions,
        visibleConceptIds,
      ),
    [edges, nodes, layout, level, drill, conceptPositions, visibleConceptIds],
  );

  const selectedEdgeId = selection?.kind === 'edge' ? selection.id : null;

  const edgeHitThreshold = useCallback(
    (lod: RenderedEdge['lod'], k: number) => {
      const base = lod === 'field' ? 22 : lod === 'subfield' ? 17 : 14;
      return base / k;
    },
    [],
  );

  const anchorById = useMemo(() => {
    const m = new Map<string, { x: number; y: number; r: number }>();
    layout.forEach((it) => {
      const anchor = { x: it.x, y: it.y, r: it.r };
      m.set(it.id, anchor);
      if (it.kind === 'concept') m.set(it.node.id, anchor);
    });
    return m;
  }, [layout]);

  const tensionConceptIds = useMemo(() => {
    if (!tensionTarget) return null;
    if (tensionTarget.kind === 'concept') return new Set([tensionTarget.nodeId]);
    if (tensionTarget.kind === 'field') {
      return new Set(
        nodes.filter((n) => n.parentId === tensionTarget.fieldId).map((n) => n.id),
      );
    }
    return new Set(
      layout
        .filter(
          (it) =>
            it.kind === 'concept' &&
            it.fieldId === tensionTarget.fieldId &&
            it.subfieldKey === tensionTarget.subfieldKey,
        )
        .map((it) => it.id),
    );
  }, [tensionTarget, nodes, layout]);

  const cancelCamera = useCallback(() => {
    cancelCameraRef.current?.();
    cancelCameraRef.current = null;
    setIsCameraAnimating(false);
  }, []);

  const animateTo = useCallback(
    (target: Transform2D, duration = CAMERA_MS) => {
      cancelMomentumRef.current?.();
      cancelMomentumRef.current = null;
      cancelCamera();
      setIsCameraAnimating(true);
      const from = { ...transformRef.current };
      cancelCameraRef.current = animateTransform(
        from,
        target,
        duration,
        (t) => {
          transformRef.current = t;
          setTransform(t);
        },
        () => {
          cancelCameraRef.current = null;
          setIsCameraAnimating(false);
        },
      );
    },
    [cancelCamera],
  );

  const centerOn = useCallback(
    (x: number, y: number, targetK: number, duration = CAMERA_MS) => {
      const rect = svgRef.current?.getBoundingClientRect();
      const w = rect?.width ?? size.w;
      const h = rect?.height ?? size.h;
      animateTo(targetTransform(x, y, targetK, w, h), duration);
    },
    [animateTo, size.w, size.h],
  );

  useEffect(() => {
    const el = svgRef.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setSize({
        w: entry.contentRect.width,
        h: entry.contentRect.height,
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setTransform((t) => ({
      ...t,
      x: size.w / 2,
      y: size.h / 2,
    }));
  }, [size.w, size.h]);

  const drillToField = useCallback(
    (fieldId: string) => {
      const field = layout.find((it) => it.id === fieldId && it.kind === 'field');
      if (!field) return;
      onDrillChange({ fieldId, subfieldKey: null });
      centerOn(field.x, field.y, 0.88);
    },
    [layout, onDrillChange, centerOn],
  );

  const drillToSubfield = useCallback(
    (fieldId: string, subfieldKey: string) => {
      const sf = layout.find(
        (it) => it.kind === 'subfield' && it.fieldId === fieldId && it.subfieldKey === subfieldKey,
      );
      if (!sf) return;
      onDrillChange({ fieldId, subfieldKey });
      centerOn(sf.x, sf.y, 1.45);
    },
    [layout, onDrillChange, centerOn],
  );

  const fitAll = useCallback(() => {
    onDrillChange(EMPTY_DRILL);
    animateTo({ x: size.w / 2, y: size.h / 2, k: 0.45 });
  }, [size.w, size.h, onDrillChange, animateTo]);

  useEffect(() => {
    if (!drill.fieldId) return;
    const duration = drillReadyRef.current ? CAMERA_MS : 0;
    if (drill.subfieldKey) {
      const sf = layout.find(
        (it) =>
          it.kind === 'subfield' &&
          it.fieldId === drill.fieldId &&
          it.subfieldKey === drill.subfieldKey,
      );
      if (sf) centerOn(sf.x, sf.y, 1.45, duration);
    } else {
      const field = layout.find((it) => it.id === drill.fieldId && it.kind === 'field');
      if (field) centerOn(field.x, field.y, 0.88, duration);
    }
    drillReadyRef.current = true;
  }, [drill.fieldId, drill.subfieldKey, layout, centerOn]);

  const zoomTo = useCallback(
    (newK: number, cx?: number, cy?: number, duration = ZOOM_MS) => {
      const t = transformRef.current;
      const px = cx ?? size.w / 2;
      const py = cy ?? size.h / 2;
      const wx = (px - t.x) / t.k;
      const wy = (py - t.y) / t.k;
      const target = {
        k: newK,
        x: px - wx * newK,
        y: py - wy * newK,
      };
      animateTo(target, duration);
      if (newK < 0.55) onDrillChange(EMPTY_DRILL);
    },
    [animateTo, size.w, size.h, onDrillChange],
  );

  const zoomBy = useCallback(
    (delta: number, cx?: number, cy?: number) => {
      const t = transformRef.current;
      const newK = Math.min(MAX_K, Math.max(MIN_K, t.k * delta));
      zoomTo(newK, cx, cy);
    },
    [zoomTo],
  );

  const applyPinchZoom = useCallback(
    (clientX: number, clientY: number, factor: number) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;

      const px = clientX - rect.left;
      const py = clientY - rect.top;
      const t = transformRef.current;
      const newK = Math.min(MAX_K, Math.max(MIN_K, t.k * factor));

      cancelMomentumRef.current?.();
      cancelMomentumRef.current = null;
      cancelCamera();
      const next = zoomTransformAtPoint(t, newK, px, py);
      transformRef.current = next;
      setTransform(next);
      if (newK < 0.55) onDrillChange(EMPTY_DRILL);
    },
    [cancelCamera, onDrillChange],
  );

  const applyPinchScale = useCallback(
    (clientX: number, clientY: number, scale: number, baseK: number) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;

      const px = clientX - rect.left;
      const py = clientY - rect.top;
      const t = transformRef.current;
      const newK = Math.min(MAX_K, Math.max(MIN_K, baseK * scale));

      cancelMomentumRef.current?.();
      cancelMomentumRef.current = null;
      cancelCamera();
      const next = zoomTransformAtPoint(t, newK, px, py);
      transformRef.current = next;
      setTransform(next);
      if (newK < 0.55) onDrillChange(EMPTY_DRILL);
    },
    [cancelCamera, onDrillChange],
  );

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    let pinchBaseK = transformRef.current.k;

    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      applyPinchZoom(e.clientX, e.clientY, pinchWheelZoomFactor(e));
    };

    const onGestureStart = (e: Event) => {
      e.preventDefault();
      pinchBaseK = transformRef.current.k;
    };

    const onGestureChange = (e: Event) => {
      e.preventDefault();
      const g = e as Event & { scale: number; clientX: number; clientY: number };
      if (!g.scale) return;
      applyPinchScale(g.clientX, g.clientY, g.scale, pinchBaseK);
    };

    const onGestureEnd = (e: Event) => {
      e.preventDefault();
    };

    wrap.addEventListener('wheel', onWheel, { passive: false });
    wrap.addEventListener('gesturestart', onGestureStart, { passive: false } as AddEventListenerOptions);
    wrap.addEventListener('gesturechange', onGestureChange, { passive: false } as AddEventListenerOptions);
    wrap.addEventListener('gestureend', onGestureEnd, { passive: false } as AddEventListenerOptions);
    return () => {
      wrap.removeEventListener('wheel', onWheel);
      wrap.removeEventListener('gesturestart', onGestureStart);
      wrap.removeEventListener('gesturechange', onGestureChange);
      wrap.removeEventListener('gestureend', onGestureEnd);
    };
  }, [applyPinchZoom, applyPinchScale]);

  const handleClick = useCallback(
    (hit: CircleItem | null) => {
      if (hit?.kind === 'concept' && edgeSourceGlobal && onAddEdge) {
        if (edgeSourceGlobal !== hit.node.id) onAddEdge(edgeSourceGlobal, hit.node.id);
        edgeSourceGlobal = null;
        onSelectionChange({ kind: 'node', id: hit.node.id });
        return;
      }

      if (hit?.kind === 'field') {
        onSelectionChange({ kind: 'node', id: hit.node.id });
        if (isBackgroundField(hit)) {
          onDrillChange({ fieldId: hit.id, subfieldKey: null });
          centerOn(hit.x, hit.y, transformRef.current.k);
        } else {
          drillToField(hit.id);
        }
        return;
      }

      if (hit?.kind === 'subfield' && hit.subfieldKey) {
        onSelectionChange({
          kind: 'subfield',
          fieldId: hit.fieldId,
          subfieldKey: hit.subfieldKey,
          label: hit.label,
        });
        drillToSubfield(hit.fieldId, hit.subfieldKey);
        return;
      }

      if (hit?.kind === 'concept') {
        onSelectionChange({ kind: 'node', id: hit.node.id });
        return;
      }

      onSelectionChange(null);
    },
    [onAddEdge, onSelectionChange, drillToField, drillToSubfield, isBackgroundField, onDrillChange, centerOn],
  );

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!svgRef.current || e.button !== 0) return;
    cancelMomentumRef.current?.();
    cancelMomentumRef.current = null;

    const rect = svgRef.current.getBoundingClientRect();
    const world = clientToWorld(e.clientX, e.clientY, rect, transformRef.current);
    const hit = hitTest(displayItems, world.x, world.y);

    const dragTarget = hit ? dragTargetFromHit(hit) : undefined;
    const anchor = hit
      ? anchorById.get(hit.kind === 'concept' ? hit.node.id : hit.id)
      : undefined;

    dragRef.current = {
      mode: 'pending',
      startX: e.clientX,
      startY: e.clientY,
      panOx: transformRef.current.x,
      panOy: transformRef.current.y,
      hit,
      dragTarget: dragTarget ?? undefined,
      anchorX: anchor?.x,
      anchorY: anchor?.y,
      grabOx: hit ? world.x - hit.x : undefined,
      grabOy: hit ? world.y - hit.y : undefined,
      lastPanX: e.clientX,
      lastPanY: e.clientY,
      lastPanT: performance.now(),
    };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };

  const updateHover = useCallback(
    (clientX: number, clientY: number) => {
      if (!svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const t = transformRef.current;
      const world = clientToWorld(clientX, clientY, rect, t);
      const hit = hitTest(displayItems, world.x, world.y);

      if (hit && (hit.kind === 'concept' || hit.kind === 'subfield' || hit.kind === 'field')) {
        const sx = hit.x * t.k + t.x;
        const sy = hit.y * t.k + t.y - hit.r * t.k - 6;
        setHoverTip({ id: hit.id, label: hit.label, x: sx, y: sy });
        setHoverEdgeId(null);
        return;
      }

      const hitEdge = hitTestRenderedEdge(
        renderedEdges,
        world.x,
        world.y,
        edgeHitThreshold(level === 'concepts' ? 'concept' : level === 'subfields' ? 'subfield' : 'field', t.k),
      );
      if (hitEdge) {
        const mx = (hitEdge.x1 + hitEdge.x2) / 2;
        const my = (hitEdge.y1 + hitEdge.y2) / 2;
        const rep = hitEdge.sourceEdge;
        const bundleNote =
          hitEdge.bundleSize > 1 ? ` (${hitEdge.bundleSize} links)` : '';
        setHoverTip({
          id: rep.id,
          label: `${rep.label ?? 'Connection'}${bundleNote} — click for theorem`,
          x: mx * t.k + t.x,
          y: my * t.k + t.y - 10,
        });
        setHoverEdgeId(rep.id);
        return;
      }

      setHoverTip(null);
      setHoverEdgeId(null);
    },
    [displayItems, renderedEdges, level, edgeHitThreshold],
  );

  const handlePointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (d) {
      const dist = Math.hypot(e.clientX - d.startX, e.clientY - d.startY);

      if (d.mode === 'pending' && dist >= DRAG_THRESHOLD) {
        if (
          e.shiftKey &&
          d.dragTarget &&
          d.anchorX !== undefined &&
          d.anchorY !== undefined
        ) {
          d.mode = 'node';
          setTensionTarget(d.dragTarget);
          setIsForceDragging(true);
          beginDragGroup(d.dragTarget);
        } else {
          d.mode = 'pan';
          setIsPanning(true);
          cancelCamera();
        }
      }

      if (d.mode === 'pan') {
        d.lastPanX = e.clientX;
        d.lastPanY = e.clientY;
        d.lastPanT = performance.now();
        setTransform((t) => ({
          ...t,
          x: d.panOx + (e.clientX - d.startX),
          y: d.panOy + (e.clientY - d.startY),
        }));
      } else if (
        d.mode === 'node' &&
        d.dragTarget &&
        d.anchorX !== undefined &&
        d.anchorY !== undefined &&
        d.grabOx !== undefined &&
        d.grabOy !== undefined
      ) {
        const rect = svgRef.current!.getBoundingClientRect();
        const world = clientToWorld(e.clientX, e.clientY, rect, transformRef.current);
        const offsetX = world.x - d.grabOx - d.anchorX;
        const offsetY = world.y - d.grabOy - d.anchorY;
        const now = performance.now();
        const prevT = d.lastMoveT ?? now;
        const dt = Math.max(1, now - prevT);
        const prevOx = d.lastOffsetX ?? offsetX;
        const prevOy = d.lastOffsetY ?? offsetY;
        d.releaseVx = ((offsetX - prevOx) / dt) * 16;
        d.releaseVy = ((offsetY - prevOy) / dt) * 16;
        d.lastOffsetX = offsetX;
        d.lastOffsetY = offsetY;
        d.lastMoveT = now;
        moveDragGroup(d.dragTarget, offsetX, offsetY, {
          tensionLinks: d.dragTarget.kind === 'concept',
        });
      }

      if (d.mode !== 'pending') {
        setHoverTip(null);
        setHoverEdgeId(null);
      }
      return;
    }
    updateHover(e.clientX, e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (d) {
      const dist = Math.hypot(e.clientX - d.startX, e.clientY - d.startY);
      if (d.mode === 'pending' && dist < DRAG_THRESHOLD) {
        if (d.hit) {
          handleClick(d.hit);
        } else if (svgRef.current) {
          const rect = svgRef.current.getBoundingClientRect();
          const world = clientToWorld(e.clientX, e.clientY, rect, transformRef.current);
          const hitEdge = hitTestRenderedEdge(
            renderedEdges,
            world.x,
            world.y,
            edgeHitThreshold(
              level === 'concepts' ? 'concept' : level === 'subfields' ? 'subfield' : 'field',
              transformRef.current.k,
            ),
          );
          if (hitEdge) {
            onSelectionChange({ kind: 'edge', id: hitEdge.sourceEdge.id });
          } else {
            onSelectionChange(null);
          }
        } else {
          handleClick(null);
        }
      } else if (
        d.mode === 'node' &&
        d.dragTarget &&
        d.anchorX !== undefined &&
        d.anchorY !== undefined &&
        d.grabOx !== undefined &&
        d.grabOy !== undefined &&
        svgRef.current
      ) {
        const isConceptTension = d.dragTarget.kind === 'concept';
        setIsForceDragging(false);
        endDragGroup(d.dragTarget, {
          releaseTension: isConceptTension,
          releaseVelocity: {
            vx: (d.releaseVx ?? 0) * 2.4,
            vy: (d.releaseVy ?? 0) * 2.4,
          },
          onSettled: () => setTensionTarget(null),
        });
        if (!isConceptTension) setTensionTarget(null);
      } else if (d.mode === 'pan') {
        const elapsed = Math.max(1, performance.now() - (d.lastPanT ?? performance.now()));
        const vx = ((e.clientX - (d.lastPanX ?? e.clientX)) / elapsed) * 16;
        const vy = ((e.clientY - (d.lastPanY ?? e.clientY)) / elapsed) * 16;
        if (Math.hypot(vx, vy) > 2) {
          let px = transformRef.current.x;
          let py = transformRef.current.y;
          cancelMomentumRef.current = runMomentum(
            { x: vx, y: vy },
            (delta) => {
              px += delta.x;
              py += delta.y;
              const next = { ...transformRef.current, x: px, y: py };
              transformRef.current = next;
              setTransform(next);
            },
            () => {
              cancelMomentumRef.current = null;
            },
          );
        }
      }
    }
    dragRef.current = null;
    setIsPanning(false);
    (e.currentTarget as Element).releasePointerCapture(e.pointerId);
  };

  const handlePointerLeave = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (
      d?.mode === 'node' &&
      d.dragTarget &&
      d.anchorX !== undefined &&
      d.anchorY !== undefined &&
      d.grabOx !== undefined &&
      d.grabOy !== undefined &&
      svgRef.current
    ) {
      const isConceptTension = d.dragTarget.kind === 'concept';
      setIsForceDragging(false);
      endDragGroup(d.dragTarget, {
        releaseTension: isConceptTension,
        releaseVelocity: {
          vx: (d.releaseVx ?? 0) * 2.4,
          vy: (d.releaseVy ?? 0) * 2.4,
        },
        onSettled: () => setTensionTarget(null),
      });
      if (!isConceptTension) setTensionTarget(null);
    }
    if (dragRef.current) {
      dragRef.current = null;
      setIsPanning(false);
      (e.currentTarget as Element).releasePointerCapture(e.pointerId);
    }
    setHoverTip(null);
    setHoverEdgeId(null);
  };

  useEffect(() => () => {
    cancelCameraRef.current?.();
    cancelMomentumRef.current?.();
  }, []);

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (readOnly || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const world = clientToWorld(e.clientX, e.clientY, rect, transformRef.current);
    const hit = hitTest(displayItems, world.x, world.y);
    if (hit?.kind === 'concept') {
      const anchor = anchorById.get(hit.node.id);
      if (anchor) onNodeMove(hit.node.id, anchor.x, anchor.y);
      onTogglePin(hit.node.id);
    }
  };

  const isDimmed = (item: CircleItem) => {
    if (!highlightIds) return false;
    if (item.kind === 'concept') return !highlightIds.has(item.node.id);
    if (item.kind === 'field') return !highlightIds.has(item.id);
    return false;
  };

  const labelVisible = (item: CircleItem) => {
    if (item.kind === 'field') return true;
    if (item.kind !== 'subfield' || !drill.fieldId) return false;
    if (drill.subfieldKey) {
      return item.subfieldKey === drill.subfieldKey;
    }
    return level === 'subfields' || level === 'concepts';
  };

  const isSelected = (item: CircleItem) => {
    if (!selection) return false;
    if (selection.kind === 'node') {
      return item.id === selection.id || (item.kind === 'concept' && item.node.id === selection.id);
    }
    if (selection.kind === 'subfield') {
      return (
        item.kind === 'subfield' &&
        item.fieldId === selection.fieldId &&
        item.subfieldKey === selection.subfieldKey
      );
    }
    return false;
  };

  const isHovered = (item: CircleItem) => hoverTip?.id === item.id;
  const tensionActive = !!tensionTarget && (isForceDragging || isTensionSettling);
  const isDragging = (item: CircleItem) =>
    tensionActive && itemMatchesDragTarget(item, tensionTarget!);

  const renderLayers = useMemo(() => {
    const backgroundFields: CircleItem[] = [];
    const midLayer: CircleItem[] = [];
    const concepts: CircleItem[] = [];

    for (const item of displayItems) {
      if (isBackgroundField(item)) {
        backgroundFields.push(item);
      } else if (item.kind === 'concept') {
        concepts.push(item);
      } else {
        midLayer.push(item);
      }
    }

    return { backgroundFields, midLayer, concepts };
  }, [displayItems, isBackgroundField]);

  const renderOverviewDecor = () => {
    if (!isOverview) return null;
    return (
      <g className="overview-decor" pointerEvents="none">
        {overviewFields.map((field) => {
          const decor = overviewDecorByField.get(field.id);
          if (!decor) return null;
          const clipId = `overview-clip-${field.id}`;
          return (
            <g key={field.id} clipPath={`url(#${clipId})`}>
              {decor.subfields.map((item) => (
                <circle
                  key={item.id}
                  cx={item.x}
                  cy={item.y}
                  r={item.r}
                  fill={item.color}
                  fillOpacity={0.14}
                  stroke={item.color}
                  strokeOpacity={0.28}
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {decor.concepts.map((item) => (
                <circle
                  key={item.id}
                  cx={item.x}
                  cy={item.y}
                  r={Math.max(2.2, item.r * 0.42)}
                  fill={item.color}
                  fillOpacity={0.42}
                  stroke={item.color}
                  strokeOpacity={0.2}
                  strokeWidth={0.6}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </g>
          );
        })}
      </g>
    );
  };

  const renderCircleItem = (item: CircleItem, layerOpacity = 1) => {
    const dimmed = isDimmed(item);
    const selected = isSelected(item);
    const bgField = isBackgroundField(item);
    const overviewField = isOverview && item.kind === 'field';
    const subfieldContainer =
      item.kind === 'subfield' && !!drill.fieldId && level === 'concepts' && !bgField;
    const showLabel = labelVisible(item);
    const hovered = isHovered(item);
    const dragging = isDragging(item);
    const anchor = anchorById.get(item.kind === 'concept' ? item.node.id : item.id) ?? null;
    const displayR = hovered && item.kind === 'concept' ? item.r * 1.35 : item.r;
    const itemOpacity = dimmed ? 0.2 : bgField ? 0.22 * layerOpacity : layerOpacity;

    return (
      <g
        key={item.id}
        className={`circle-item circle-${item.kind}${dimmed ? ' dimmed' : ''}${selected ? ' selected' : ''}${hovered ? ' hovered' : ''}${dragging ? ' dragging' : ''}${bgField ? ' background-field' : ''}${overviewField ? ' overview-field' : ''}${subfieldContainer ? ' subfield-container' : ''} clickable`}
        style={{ opacity: itemOpacity }}
      >
        {dragging && anchor && (
          <circle
            cx={anchor.x}
            cy={anchor.y}
            r={item.r}
            className="drag-anchor-ghost"
            fill={item.color}
            fillOpacity={0.12}
            stroke="var(--accent)"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />
        )}
        {overviewField ? (
          <>
            <circle
              cx={item.x}
              cy={item.y}
              r={displayR}
              fill="none"
              stroke="var(--canvas-bg)"
              strokeWidth={7}
              vectorEffect="non-scaling-stroke"
              className="field-boundary-halo"
            />
            <circle
              cx={item.x}
              cy={item.y}
              r={displayR}
              fill={item.color}
              fillOpacity={0.1}
              stroke="none"
            />
            <circle
              cx={item.x}
              cy={item.y}
              r={displayR}
              fill="none"
              stroke={item.color}
              strokeWidth={2.2}
              strokeOpacity={0.82}
              vectorEffect="non-scaling-stroke"
              className="field-boundary-ring"
            />
          </>
        ) : subfieldContainer ? (
          <>
            <circle
              cx={item.x}
              cy={item.y}
              r={displayR}
              fill={item.color}
              fillOpacity={0.06}
              stroke="none"
            />
            <circle
              cx={item.x}
              cy={item.y}
              r={displayR}
              fill="none"
              stroke={item.color}
              strokeWidth={1.6}
              strokeOpacity={selected || hovered ? 0.9 : 0.55}
              vectorEffect="non-scaling-stroke"
            />
          </>
        ) : (
          <circle
            cx={item.x}
            cy={item.y}
            r={displayR}
            fill={item.color}
            fillOpacity={
              bgField ? 0.1
                : dragging ? 1
                  : hovered && item.kind === 'concept' ? 1
                    : item.kind === 'subfield' && level === 'subfields' ? 0.16
                      : item.fillOpacity
            }
            stroke={dragging || selected || hovered ? 'var(--accent)' : item.stroke}
            strokeWidth={
              dragging ? 3
                : selected || hovered ? 2.5
                  : bgField ? 1
                    : item.kind === 'field' ? 2
                      : item.kind === 'subfield' ? 1.5
                        : 1.2
            }
            strokeOpacity={bgField ? 0.35 : item.kind === 'subfield' ? 0.7 : 1}
            vectorEffect="non-scaling-stroke"
          />
        )}
        {showLabel && (
          <text
            x={item.x}
            y={item.y}
            textAnchor="middle"
            dominantBaseline="middle"
            className={`circle-label circle-label-${item.kind}${bgField ? ' circle-label-faded' : ''}`}
            style={{
              fontSize: Math.max(
                8,
                item.kind === 'field' ? 14 : item.kind === 'subfield' ? 10 : 11,
              ),
              opacity: bgField ? 0.45 : item.kind === 'subfield' ? 0.85 : 1,
            }}
          >
            {item.label.length > 28 ? `${item.label.slice(0, 26)}…` : item.label}
          </text>
        )}
      </g>
    );
  };

  const fieldTitle = drill.fieldId
    ? nodes.find((n) => n.id === drill.fieldId)?.title
    : null;
  const subfieldTitle =
    drill.subfieldKey && drill.fieldId
      ? visibleItems.find(
          (it) => it.kind === 'subfield' && it.subfieldKey === drill.subfieldKey,
        )?.label
      : null;

  const tensionEdges = useMemo(() => {
    if (!tensionConceptIds) return [];
    return renderedEdges.filter((e) =>
      e.conceptIds.some((id) => tensionConceptIds.has(id)),
    );
  }, [tensionConceptIds, renderedEdges]);

  return (
    <div
      ref={wrapRef}
      className={`circle-map-wrap${drill.fieldId ? ' is-drilled' : ' is-overview'}${tensionActive ? ' is-tension' : ''}${isForceDragging ? ' is-force-dragging' : ''}${isTensionSettling ? ' is-tension-settling' : ''}${isSettling ? ' is-settling' : ''}`}
    >
      <div className="zoom-hud">
        <button type="button" onClick={() => zoomBy(1.25)} aria-label="Zoom in">+</button>
        <button type="button" onClick={() => zoomBy(0.8)} aria-label="Zoom out">−</button>
        <button type="button" onClick={fitAll}>Fit all</button>
        {drill.fieldId && (
          <nav className="drill-breadcrumb" aria-label="Map location">
            <button type="button" onClick={fitAll}>All fields</button>
            <span className="crumb-sep">›</span>
            <button
              type="button"
              onClick={() => {
                if (drill.fieldId) {
                  onSelectionChange({ kind: 'node', id: drill.fieldId });
                  drillToField(drill.fieldId);
                }
              }}
            >
              {fieldTitle ?? 'Field'}
            </button>
            {drill.subfieldKey && (
              <>
                <span className="crumb-sep">›</span>
                <span className="crumb-current">{subfieldTitle ?? drill.subfieldKey}</span>
              </>
            )}
          </nav>
        )}
        <span className="zoom-level">{LEVEL_LABELS[level]}</span>
        <span className="zoom-scale">{Math.round(transform.k * 100)}%</span>
      </div>

      <FieldLegend
        nodes={nodes}
        onSelectField={(fieldId) => {
          onSelectionChange({ kind: 'node', id: fieldId });
          drillToField(fieldId);
        }}
      />

      <svg
        ref={svgRef}
        className={`circle-map-svg${isPanning ? ' is-panning' : ''}${hoverEdgeId ? ' edge-hover' : ''}${isCameraAnimating ? ' is-camera-animating' : ''}${tensionActive ? ' is-tension' : ''}`}
        width={size.w}
        height={size.h}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onDoubleClick={handleDoubleClick}
      >
        <defs>
          <marker
            id="tension-arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--accent)" />
          </marker>
          {isOverview &&
            overviewFields.map((field) => (
              <clipPath key={`clip-${field.id}`} id={`overview-clip-${field.id}`}>
                <circle cx={field.x} cy={field.y} r={field.r * 0.92} />
              </clipPath>
            ))}
        </defs>
        <rect width="100%" height="100%" fill="transparent" />
        <g
          className="circle-map-world"
          transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}
        >
          {renderOverviewDecor()}
          {renderLayers.backgroundFields.map((item) => renderCircleItem(item))}
          {renderLayers.midLayer.map((item) => renderCircleItem(item))}

          {renderedEdges.map((edge) => {
              const rep = edge.sourceEdge;
              const isTension = tensionEdges.some((te) => te.sourceEdge.id === rep.id);
              const searchDimmed =
                highlightIds &&
                !edge.conceptIds.some((id) => highlightIds.has(id));
              const nodeHighlighted =
                !searchDimmed &&
                focusNodeId !== null &&
                edgeTouchesConcept(edge, focusNodeId);
              const edgeActive =
                isTension ||
                selectedEdgeId === rep.id ||
                hoverEdgeId === rep.id ||
                nodeHighlighted;
              const highlighted = !searchDimmed && edgeActive;
              const crossField = edge.crossField;
              const mx = (edge.x1 + edge.x2) / 2;
              const my = (edge.y1 + edge.y2) / 2;
              const lod = edge.lod;
              const baseOpacity = searchDimmed
                ? 0.06
                : isTension
                  ? 1
                  : highlighted
                    ? 0.92
                    : lod === 'field'
                      ? crossField ? 0.32 : 0.24
                      : lod === 'subfield'
                        ? crossField ? 0.44 : 0.52
                        : crossField
                          ? 0.55
                          : 0.65;
              const width = isTension
                ? 4
                : highlighted
                  ? 2.8
                  : lod === 'field'
                    ? 1 + Math.min(edge.strength, 4) * 0.2
                    : lod === 'subfield'
                      ? 1.2 + Math.min(edge.strength, 4) * 0.3
                      : 1.6 + edge.strength * 0.4;
              const hitWidth = Math.max(
                lod === 'field' ? 18 : lod === 'subfield' ? 16 : 14,
                width * 5,
              );
              const dash =
                isTension || highlighted
                  ? undefined
                  : lod === 'field'
                    ? '8 6'
                    : crossField
                      ? '5 4'
                      : lod === 'subfield'
                        ? '4 3'
                        : undefined;

              return (
                <g
                  key={edge.id}
                  className={`map-edge-group map-edge-lod-${lod}${highlighted ? ' highlighted' : ''}${isTension ? ' tension' : ''}${selectedEdgeId === rep.id ? ' selected' : ''}`}
                >
                  <line
                    x1={edge.x1}
                    y1={edge.y1}
                    x2={edge.x2}
                    y2={edge.y2}
                    className="map-edge-hit"
                    stroke="transparent"
                    strokeWidth={hitWidth}
                    vectorEffect="non-scaling-stroke"
                  />
                  <line
                    x1={edge.x1}
                    y1={edge.y1}
                    x2={edge.x2}
                    y2={edge.y2}
                    className="map-edge"
                    stroke={
                      isTension || highlighted
                        ? 'var(--accent)'
                        : crossField
                          ? 'var(--edge-cross)'
                          : 'var(--edge-color)'
                    }
                    strokeWidth={width}
                    strokeOpacity={baseOpacity}
                    vectorEffect="non-scaling-stroke"
                    strokeDasharray={dash}
                    markerEnd={isTension ? 'url(#tension-arrow)' : undefined}
                  />
                  {highlighted && rep.label && lod === 'concept' && (
                    <g className="map-edge-label">
                      <rect
                        x={mx - (rep.label.length * 3.2) / transform.k}
                        y={my - 8 / transform.k}
                        width={(rep.label.length * 6.4) / transform.k}
                        height={14 / transform.k}
                        rx={3 / transform.k}
                        fill="var(--bg-elevated)"
                        stroke="var(--accent)"
                        strokeWidth={0.8 / transform.k}
                        opacity={0.95}
                      />
                      <text
                        x={mx}
                        y={my}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill="var(--text)"
                        style={{ fontSize: 9 / transform.k, fontWeight: 500 }}
                      >
                        {rep.label}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

          {renderLayers.concepts.map((item) => renderCircleItem(item))}
        </g>
      </svg>

      {hoverTip && (
        <div
          className="map-hover-tooltip"
          style={{ left: hoverTip.x, top: hoverTip.y }}
          role="tooltip"
        >
          {hoverTip.label}
        </div>
      )}
    </div>
  );
}

export function startEdgeFromNode(nodeId: string): void {
  edgeSourceGlobal = nodeId;
}
