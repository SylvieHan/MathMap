import { useCallback, useEffect, useRef, useState } from 'react';
import type { Simulation } from 'd3-force';
import type { SimLink } from '../utils/forceLayout';
import type { MapEdge, MapNode } from '../types';
import type { DragTarget } from '../utils/dragTarget';
import type { CircleItem } from '../utils/circleLayout';
import {
  buildForceGraph,
  createFieldSimulation,
  primarySimNodeIdsForDragTarget,
  simNodeIdsForDragTarget,
  simNodesToCircleItems,
  stepTensionSprings,
  syncChildrenToFields,
  zeroVelocities,
  type ForceSimNode,
} from '../utils/forceLayout';

export interface MoveDragOptions {
  /** Shift-drag: pull connected concepts on springs. */
  tensionLinks?: boolean;
}

export interface EndDragOptions {
  /** Run spring settle after releasing a concept. */
  releaseTension?: boolean;
  releaseVelocity?: { vx: number; vy: number };
  onSettled?: () => void;
}

const ENTRY_ALPHA = 0.38;
/** How quickly children catch up when dragging a field or subfield (0–1 per move). */
const CHILD_FOLLOW_SPRING = 0.48;

export function useForceLayout(nodes: MapNode[], edges: MapEdge[]) {
  const [layout, setLayout] = useState<CircleItem[]>([]);
  const [isSettling, setIsSettling] = useState(false);
  const [isTensionSettling, setIsTensionSettling] = useState(false);
  const simRef = useRef<Simulation<ForceSimNode, SimLink> | null>(null);
  const simNodesRef = useRef<ForceSimNode[]>([]);
  const dragOriginsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const dragFollowOffsetsRef = useRef<Map<string, { dx: number; dy: number }>>(new Map());
  const dragPrimaryIdRef = useRef<string | null>(null);
  const tensionVelocitiesRef = useRef<Map<string, { vx: number; vy: number }>>(new Map());
  const tensionRafRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);
  const isTensionSettlingRef = useRef(false);

  const graphKey = `${nodes.length}:${edges.length}:${nodes.map((n) => `${n.id}:${n.position.x},${n.position.y}:${n.pinned}`).join(';')}`;

  const publishLayout = useCallback(() => {
    syncChildrenToFields(simNodesRef.current);
    setLayout(simNodesToCircleItems(simNodesRef.current));
  }, []);

  const stopSimulation = useCallback(() => {
    const sim = simRef.current;
    if (!sim) return;
    sim.stop();
    zeroVelocities(simNodesRef.current);
    setIsSettling(false);
  }, []);

  const cancelTensionSettle = useCallback(() => {
    if (tensionRafRef.current !== null) {
      cancelAnimationFrame(tensionRafRef.current);
      tensionRafRef.current = null;
    }
    isTensionSettlingRef.current = false;
    setIsTensionSettling(false);
  }, []);

  const reheat = useCallback((alpha = 0.32) => {
    const sim = simRef.current;
    if (!sim) return;
    setIsSettling(true);
    sim.alpha(Math.max(sim.alpha(), alpha)).restart();
  }, []);

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

  const runTensionSettle = useCallback(
    (conceptId: string, releaseVelocity: { vx: number; vy: number }, onSettled?: () => void) => {
      cancelTensionSettle();
      const velocities = tensionVelocitiesRef.current;
      const existing = velocities.get(conceptId) ?? { vx: 0, vy: 0 };
      velocities.set(conceptId, {
        vx: existing.vx + releaseVelocity.vx,
        vy: existing.vy + releaseVelocity.vy,
      });

      isTensionSettlingRef.current = true;
      setIsTensionSettling(true);

      const tick = () => {
        const moving = stepTensionSprings(
          simNodesRef.current,
          null,
          edges,
          nodes,
          velocities,
        );
        syncRelOffsetsFromField();
        publishLayout();

        if (moving) {
          tensionRafRef.current = requestAnimationFrame(tick);
        } else {
          tensionRafRef.current = null;
          velocities.clear();
          isTensionSettlingRef.current = false;
          setIsTensionSettling(false);
          syncChildrenToFields(simNodesRef.current);
          publishLayout();
          reheat(0.22);
          onSettled?.();
        }
      };

      tensionRafRef.current = requestAnimationFrame(tick);
    },
    [cancelTensionSettle, edges, nodes, publishLayout, reheat, syncRelOffsetsFromField],
  );

  useEffect(() => {
    cancelTensionSettle();
    simRef.current?.stop();
    const { simNodes, fieldNodes, fieldLinks } = buildForceGraph(nodes, edges);
    simNodesRef.current = simNodes;
    dragOriginsRef.current.clear();
    dragFollowOffsetsRef.current.clear();
    dragPrimaryIdRef.current = null;
    tensionVelocitiesRef.current.clear();
    isDraggingRef.current = false;

    publishLayout();

    const sim = createFieldSimulation(fieldNodes, fieldLinks);
    sim.on('tick', () => {
      if (isDraggingRef.current || isTensionSettlingRef.current) return;
      syncChildrenToFields(simNodesRef.current);
      publishLayout();
    });
    sim.on('end', () => {
      syncChildrenToFields(simNodesRef.current);
      zeroVelocities(simNodesRef.current);
      publishLayout();
      setIsSettling(false);
    });

    setIsSettling(true);
    sim.alpha(ENTRY_ALPHA).restart();
    simRef.current = sim;

    return () => {
      cancelTensionSettle();
      sim.stop();
      simRef.current = null;
      setIsSettling(false);
    };
  }, [graphKey, nodes, edges, publishLayout, cancelTensionSettle]);

  const beginDragGroup = useCallback(
    (target: DragTarget) => {
      cancelTensionSettle();
      const simNodes = simNodesRef.current;
      const primaryIds = primarySimNodeIdsForDragTarget(target);
      const groupIds = simNodeIdsForDragTarget(target, simNodes);
      const primaryId = primaryIds[0] ?? null;
      dragPrimaryIdRef.current = primaryId;

      const origins = new Map<string, { x: number; y: number }>();
      for (const id of groupIds) {
        const n = simNodes.find((sn) => sn.id === id);
        if (!n) continue;
        origins.set(id, { x: n.x, y: n.y });
      }
      dragOriginsRef.current = origins;
      tensionVelocitiesRef.current.clear();

      const followOffsets = new Map<string, { dx: number; dy: number }>();
      if (primaryId && (target.kind === 'field' || target.kind === 'subfield')) {
        const anchor = simNodes.find((sn) => sn.id === primaryId);
        if (anchor) {
          for (const id of groupIds) {
            if (primaryIds.includes(id)) continue;
            const n = simNodes.find((sn) => sn.id === id);
            if (!n) continue;
            followOffsets.set(id, { dx: n.x - anchor.x, dy: n.y - anchor.y });
          }
        }
      }
      dragFollowOffsetsRef.current = followOffsets;

      isDraggingRef.current = true;
      stopSimulation();
    },
    [cancelTensionSettle, stopSimulation],
  );

  const moveDragGroup = useCallback(
    (target: DragTarget, offsetX: number, offsetY: number, options?: MoveDragOptions) => {
      const simNodes = simNodesRef.current;
      const primaryIds = primarySimNodeIdsForDragTarget(target);
      const primaryId = dragPrimaryIdRef.current;

      for (const id of primaryIds) {
        const n = simNodes.find((sn) => sn.id === id);
        const orig = dragOriginsRef.current.get(id);
        if (!n || !orig) continue;
        n.fx = orig.x + offsetX;
        n.fy = orig.y + offsetY;
        n.x = n.fx;
        n.y = n.fy;
      }

      const anchor = primaryId ? simNodes.find((sn) => sn.id === primaryId) : null;
      if (anchor && dragFollowOffsetsRef.current.size > 0) {
        for (const [id, off] of dragFollowOffsetsRef.current) {
          const n = simNodes.find((sn) => sn.id === id);
          if (!n) continue;
          const tx = anchor.x + off.dx;
          const ty = anchor.y + off.dy;
          n.x += (tx - n.x) * CHILD_FOLLOW_SPRING;
          n.y += (ty - n.y) * CHILD_FOLLOW_SPRING;
        }
      }

      if (options?.tensionLinks && target.kind === 'concept') {
        stepTensionSprings(
          simNodes,
          target.nodeId,
          edges,
          nodes,
          tensionVelocitiesRef.current,
        );
      }

      syncRelOffsetsFromField();
      publishLayout();
    },
    [edges, nodes, publishLayout, syncRelOffsetsFromField],
  );

  const endDragGroup = useCallback(
    (target: DragTarget | null, options?: EndDragOptions) => {
      const fields = new Map(
        simNodesRef.current.filter((n) => n.kind === 'field').map((f) => [f.fieldId, f]),
      );

      for (const n of simNodesRef.current) {
        const pinned =
          n.mapNode.pinned &&
          (n.mapNode.position.x !== 0 || n.mapNode.position.y !== 0);
        if (pinned) {
          const px = n.mapNode.position.x;
          const py = n.mapNode.position.y;
          n.fx = px;
          n.fy = py;
          n.x = px;
          n.y = py;
        } else {
          n.fx = null;
          n.fy = null;
        }

        if (n.kind !== 'field' && n.relDx !== undefined && n.relDy !== undefined) {
          const f = fields.get(n.fieldId);
          if (f) {
            n.relDx = n.x - f.x;
            n.relDy = n.y - f.y;
          }
        }
      }

      dragOriginsRef.current.clear();
      dragFollowOffsetsRef.current.clear();
      dragPrimaryIdRef.current = null;
      isDraggingRef.current = false;

      const releaseTension =
        options?.releaseTension && target?.kind === 'concept';

      if (releaseTension) {
        syncRelOffsetsFromField();
        publishLayout();
        runTensionSettle(
          target.nodeId,
          options.releaseVelocity ?? { vx: 0, vy: 0 },
          options.onSettled,
        );
        return;
      }

      tensionVelocitiesRef.current.clear();
      syncChildrenToFields(simNodesRef.current);
      publishLayout();
      reheat(0.28);
      options?.onSettled?.();
    },
    [publishLayout, reheat, runTensionSettle, syncRelOffsetsFromField],
  );

  return {
    layout,
    isSettling,
    isTensionSettling,
    beginDragGroup,
    moveDragGroup,
    endDragGroup,
    reheat,
  };
}
