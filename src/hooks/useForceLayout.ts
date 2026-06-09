import { useCallback, useEffect, useRef, useState } from 'react';
import type { Simulation } from 'd3-force';
import type { MapEdge, MapNode } from '../types';
import type { DragTarget } from '../utils/dragTarget';
import type { CircleItem } from '../utils/circleLayout';
import {
  buildForceGraph,
  createFieldSimulation,
  primarySimNodeIdsForDragTarget,
  simNodesToCircleItems,
  clampConceptNode,
  clampInsideFieldDisc,
  snapConceptsToContainers,
  stepSimulation,
  settleDamping,
  syncChildrenToFields,
  zeroVelocities,
  SETTLE_MAX_FRAMES,
  SLEEP_THRESHOLD,
  type SimLink,
  type ForceSimNode,
  type SimKind,
} from '../utils/forceLayout';

export interface EndDragOptions {
  /** Pointer flick velocity carried into the release settle. */
  releaseVelocity?: { vx: number; vy: number };
  onSettled?: () => void;
}

const ENTRY_ALPHA = 0.38;

/** Which bodies a given drag wakes up, and which field(s) it touches. */
interface DragScope {
  movableKinds: Set<SimKind>;
  activeFieldIds: Set<string>;
  primaryId: string | null;
}

function dragScopeFor(target: DragTarget, simNodes: ForceSimNode[]): DragScope {
  const primaryId = primarySimNodeIdsForDragTarget(target)[0] ?? null;
  if (target.kind === 'concept') {
    const n = simNodes.find((s) => s.id === target.nodeId);
    return {
      movableKinds: new Set<SimKind>(['concept']),
      activeFieldIds: new Set(n ? [n.fieldId] : []),
      primaryId,
    };
  }
  if (target.kind === 'subfield') {
    return {
      // Wake subfields + concepts: the dragged subfield carries its concepts
      // (they stay inside its disc), and sibling subfields react on bands.
      movableKinds: new Set<SimKind>(['subfield', 'concept']),
      activeFieldIds: new Set([target.fieldId]),
      primaryId,
    };
  }
  // Field drag: the whole hierarchy is awake so other fields react elastically
  // and every field's interior jostles inside its moving disc.
  return {
    movableKinds: new Set<SimKind>(['field', 'subfield', 'concept']),
    activeFieldIds: new Set(simNodes.filter((s) => s.kind === 'field').map((s) => s.fieldId)),
    primaryId,
  };
}

export function useForceLayout(nodes: MapNode[], edges: MapEdge[]) {
  const [layout, setLayout] = useState<CircleItem[]>([]);
  const [isSettling, setIsSettling] = useState(false);
  const [isTensionSettling, setIsTensionSettling] = useState(false);
  const simRef = useRef<Simulation<ForceSimNode, SimLink> | null>(null);
  const simNodesRef = useRef<ForceSimNode[]>([]);
  const dragPrimaryIdRef = useRef<string | null>(null);
  const dragPrimaryOriginRef = useRef<{ x: number; y: number } | null>(null);
  const dragScopeRef = useRef<DragScope | null>(null);
  const velocitiesRef = useRef<Map<string, { vx: number; vy: number }>>(new Map());
  const settleRafRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);
  const isSettlingRef = useRef(false);

  const graphKey = `${nodes.length}:${edges.length}:${nodes.map((n) => `${n.id}:${n.position.x},${n.position.y}:${n.pinned}`).join(';')}`;

  /** Render current sim-node positions (no repositioning — the sim owns them). */
  const renderLayout = useCallback(() => {
    setLayout(simNodesToCircleItems(simNodesRef.current));
  }, []);

  const stopFieldSim = useCallback(() => {
    const sim = simRef.current;
    if (!sim) return;
    sim.stop();
    zeroVelocities(simNodesRef.current);
    setIsSettling(false);
  }, []);

  const cancelSettle = useCallback(() => {
    if (settleRafRef.current !== null) {
      cancelAnimationFrame(settleRafRef.current);
      settleRafRef.current = null;
    }
    isSettlingRef.current = false;
    setIsTensionSettling(false);
  }, []);

  /** Capture child positions as field-relative offsets (for the d3 follow). */
  const syncRelOffsetsFromField = useCallback(() => {
    const fields = new Map(
      simNodesRef.current.filter((n) => n.kind === 'field').map((f) => [f.fieldId, f]),
    );
    for (const n of simNodesRef.current) {
      if (n.kind === 'field' || n.relDx === undefined || n.relDy === undefined) continue;
      const f = fields.get(n.fieldId);
      if (!f) continue;
      n.relDx = n.x - f.x;
      n.relDy = n.y - f.y;
    }
  }, []);

  /** Final tidy after a settle: snap children into discs, refresh offsets. */
  const finalize = useCallback(() => {
    snapConceptsToContainers(simNodesRef.current, velocitiesRef.current);
    syncRelOffsetsFromField();
    velocitiesRef.current.clear();
  }, [syncRelOffsetsFromField]);

  /**
   * Release settle: run the unified integrator (nothing fixed) until motion
   * falls below the sleep threshold or the safety cap. The released body is
   * pulled back by its elastic bands and bled off by friction until it rests.
   */
  const runSettle = useCallback(
    (onSettled?: () => void) => {
      cancelSettle();
      const scope = dragScopeRef.current;
      if (!scope) {
        onSettled?.();
        return;
      }
      isSettlingRef.current = true;
      setIsTensionSettling(true);

      let frame = 0;
      const tick = () => {
        const speed = stepSimulation({
          simNodes: simNodesRef.current,
          edges,
          nodes,
          velocities: velocitiesRef.current,
          fixedIds: new Set(),
          movableKinds: scope.movableKinds,
          activeFieldIds: scope.activeFieldIds,
        }, { damping: settleDamping(frame) });
        renderLayout();
        frame += 1;

        if (speed > SLEEP_THRESHOLD && frame < SETTLE_MAX_FRAMES) {
          settleRafRef.current = requestAnimationFrame(tick);
        } else {
          settleRafRef.current = null;
          isSettlingRef.current = false;
          setIsTensionSettling(false);
          finalize();
          renderLayout();
          onSettled?.();
        }
      };

      settleRafRef.current = requestAnimationFrame(tick);
    },
    [cancelSettle, edges, nodes, finalize, renderLayout],
  );

  useEffect(() => {
    cancelSettle();
    simRef.current?.stop();
    const { simNodes, fieldNodes, fieldLinks } = buildForceGraph(nodes, edges);
    simNodesRef.current = simNodes;
    dragPrimaryIdRef.current = null;
    dragPrimaryOriginRef.current = null;
    dragScopeRef.current = null;
    velocitiesRef.current.clear();
    isDraggingRef.current = false;

    renderLayout();

    // d3 only lays out the fields initially; all dragging/settling goes through
    // the unified integrator. While dragging or settling, the d3 tick is idle.
    const sim = createFieldSimulation(fieldNodes, fieldLinks);
    sim.on('tick', () => {
      if (isSettlingRef.current || isDraggingRef.current) return;
      syncChildrenToFields(simNodesRef.current);
      renderLayout();
    });
    sim.on('end', () => {
      syncChildrenToFields(simNodesRef.current);
      zeroVelocities(simNodesRef.current);
      renderLayout();
      setIsSettling(false);
    });

    setIsSettling(true);
    sim.alpha(ENTRY_ALPHA).restart();
    simRef.current = sim;

    return () => {
      cancelSettle();
      sim.stop();
      simRef.current = null;
      setIsSettling(false);
    };
  }, [graphKey, nodes, edges, renderLayout, cancelSettle]);

  const beginDragGroup = useCallback(
    (target: DragTarget) => {
      cancelSettle();
      const simNodes = simNodesRef.current;
      const scope = dragScopeFor(target, simNodes);
      dragScopeRef.current = scope;
      dragPrimaryIdRef.current = scope.primaryId;
      const primary = scope.primaryId
        ? simNodes.find((s) => s.id === scope.primaryId)
        : null;
      dragPrimaryOriginRef.current = primary ? { x: primary.x, y: primary.y } : null;
      velocitiesRef.current.clear();
      isDraggingRef.current = true;
      // Stop the d3 field sim — the unified integrator owns positions during a drag.
      stopFieldSim();
    },
    [cancelSettle, stopFieldSim],
  );

  const moveDragGroup = useCallback(
    (target: DragTarget, offsetX: number, offsetY: number) => {
      const simNodes = simNodesRef.current;
      const scope = dragScopeRef.current;
      const primaryId = dragPrimaryIdRef.current;
      const origin = dragPrimaryOriginRef.current;
      if (!scope || !primaryId || !origin) return;
      const primary = simNodes.find((s) => s.id === primaryId);
      if (!primary) return;

      // Place the dragged body at the pointer, clamped to its container so it
      // can never be dragged out of its parent disc.
      primary.x = origin.x + offsetX;
      primary.y = origin.y + offsetY;
      if (target.kind === 'concept') {
        clampConceptNode(simNodes, primary, velocitiesRef.current);
      } else if (target.kind === 'subfield') {
        const fields = new Map(
          simNodes.filter((n) => n.kind === 'field').map((f) => [f.fieldId, f]),
        );
        clampInsideFieldDisc(primary, fields);
      }
      primary.fx = primary.x;
      primary.fy = primary.y;

      // One frame of physics with the dragged body held fixed: bands pull
      // neighbors, collisions push them apart, children ride their parent.
      stepSimulation({
        simNodes,
        edges,
        nodes,
        velocities: velocitiesRef.current,
        fixedIds: new Set([primaryId]),
        movableKinds: scope.movableKinds,
        activeFieldIds: scope.activeFieldIds,
      });
      renderLayout();
    },
    [edges, nodes, renderLayout],
  );

  const endDragGroup = useCallback(
    (target: DragTarget | null, options?: EndDragOptions) => {
      // Restore map-pinned bodies to their stored position; free everything else.
      for (const n of simNodesRef.current) {
        const pinned =
          n.mapNode.pinned &&
          (n.mapNode.position.x !== 0 || n.mapNode.position.y !== 0);
        if (pinned) {
          n.x = n.mapNode.position.x;
          n.y = n.mapNode.position.y;
          n.fx = n.x;
          n.fy = n.y;
        } else {
          n.fx = null;
          n.fy = null;
        }
      }
      isDraggingRef.current = false;

      const primaryId = dragPrimaryIdRef.current;
      const scope = dragScopeRef.current;
      dragPrimaryIdRef.current = null;
      dragPrimaryOriginRef.current = null;

      if (!target || !scope || !primaryId) {
        finalize();
        renderLayout();
        options?.onSettled?.();
        return;
      }

      // Seed the pointer flick onto the released body, then settle with friction.
      const rv = options?.releaseVelocity ?? { vx: 0, vy: 0 };
      const existing = velocitiesRef.current.get(primaryId) ?? { vx: 0, vy: 0 };
      velocitiesRef.current.set(primaryId, {
        vx: existing.vx + rv.vx,
        vy: existing.vy + rv.vy,
      });
      runSettle(options?.onSettled);
    },
    [finalize, renderLayout, runSettle],
  );

  return {
    layout,
    isSettling,
    isTensionSettling,
    beginDragGroup,
    moveDragGroup,
    endDragGroup,
  };
}
