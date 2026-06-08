import { useCallback, useEffect, useRef, useState } from 'react';
import type { Simulation } from 'd3-force';
import type { SimLink } from '../utils/forceLayout';
import type { MapEdge, MapNode } from '../types';
import type { DragTarget } from '../utils/dragTarget';
import type { CircleItem } from '../utils/circleLayout';
import {
  annealSettleVelocities,
  buildForceGraph,
  createFieldSimulation,
  primarySimNodeIdsForDragTarget,
  simNodeIdsForDragTarget,
  simNodesToCircleItems,
  stepContainerDragPhysics,
  stepContainerReleasePhysics,
  stepSubfieldLinkSprings,
  stepSubfieldReleaseSprings,
  clampConceptNode,
  snapConceptsToContainers,
  stepTensionSprings,
  syncChildrenToFields,
  zeroVelocities,
  type ForceSimNode,
} from '../utils/forceLayout';

export interface BeginDragOptions {
  /** Keep d3 field-field simulation alive (fit-all field drag). */
  keepFieldSim?: boolean;
}

export interface MoveDragOptions {
  /** Shift-drag: pull connected nodes on springs. */
  tensionLinks?: boolean;
}

export interface EndDragOptions {
  /** Run spring settle after releasing a concept. */
  releaseTension?: boolean;
  /** Run interior momentum settle after releasing a field or subfield. */
  releaseContainer?: boolean;
  releaseVelocity?: { vx: number; vy: number };
  onSettled?: () => void;
}

const ENTRY_ALPHA = 0.38;

export function useForceLayout(nodes: MapNode[], edges: MapEdge[]) {
  const [layout, setLayout] = useState<CircleItem[]>([]);
  const [isSettling, setIsSettling] = useState(false);
  const [isTensionSettling, setIsTensionSettling] = useState(false);
  const simRef = useRef<Simulation<ForceSimNode, SimLink> | null>(null);
  const simNodesRef = useRef<ForceSimNode[]>([]);
  const dragOriginsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const dragChildIdsRef = useRef<string[]>([]);
  const dragChildWorldRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const dragPrimaryIdRef = useRef<string | null>(null);
  const lastContainerPosRef = useRef<{ x: number; y: number } | null>(null);
  const tensionVelocitiesRef = useRef<Map<string, { vx: number; vy: number }>>(new Map());
  const tensionRafRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);
  const isTensionSettlingRef = useRef(false);
  const keepFieldSimRef = useRef(false);
  const pinnedFieldIdsRef = useRef<Set<string>>(new Set());
  const skipSyncChildIdsRef = useRef<Set<string>>(new Set());

  const graphKey = `${nodes.length}:${edges.length}:${nodes.map((n) => `${n.id}:${n.position.x},${n.position.y}:${n.pinned}`).join(';')}`;

  const publishLayout = useCallback(() => {
    syncChildrenToFields(simNodesRef.current, skipSyncChildIdsRef.current);
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
    sim.velocityDecay(0.62);
    sim.alpha(Math.max(sim.alpha(), alpha)).alphaTarget(0).restart();
  }, []);

  /** Immediate spring-back for large field balls after release. */
  const releaseFieldSprings = useCallback(() => {
    const sim = simRef.current;
    if (!sim) return;
    setIsSettling(true);
    sim.velocityDecay(0.4);
    sim.alpha(0.92).alphaTarget(0).restart();
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

  /** Snap all children into containers and sync offsets (every field/subfield). */
  const finalizeChildLayout = useCallback(() => {
    snapConceptsToContainers(simNodesRef.current, tensionVelocitiesRef.current);
    syncRelOffsetsFromField();
    tensionVelocitiesRef.current.clear();
  }, [syncRelOffsetsFromField]);

  const runContainerSettle = useCallback(
    (fieldId: string, childIds: string[], onSettled?: () => void) => {
      cancelTensionSettle();

      let frame = 0;
      const tick = () => {
        const moving = stepContainerReleasePhysics(
          simNodesRef.current,
          fieldId,
          childIds,
          tensionVelocitiesRef.current,
        );
        const cooled = annealSettleVelocities(tensionVelocitiesRef.current, frame++);
        syncRelOffsetsFromField();
        publishLayout();

        if (moving && !cooled) {
          tensionRafRef.current = requestAnimationFrame(tick);
        } else {
          tensionRafRef.current = null;
          finalizeChildLayout();
          publishLayout();
          onSettled?.();
        }
      };

      tensionRafRef.current = requestAnimationFrame(tick);
    },
    [cancelTensionSettle, finalizeChildLayout, publishLayout, syncRelOffsetsFromField],
  );

  const runSubfieldSettle = useCallback(
    (subfieldSimId: string, releaseVelocity: { vx: number; vy: number }, onSettled?: () => void) => {
      cancelTensionSettle();
      const existing = tensionVelocitiesRef.current.get(subfieldSimId) ?? { vx: 0, vy: 0 };
      tensionVelocitiesRef.current.set(subfieldSimId, {
        vx: existing.vx + releaseVelocity.vx,
        vy: existing.vy + releaseVelocity.vy,
      });

      isTensionSettlingRef.current = true;
      setIsTensionSettling(true);

      let frame = 0;
      const tick = () => {
        const moving = stepSubfieldReleaseSprings(
          simNodesRef.current,
          edges,
          tensionVelocitiesRef.current,
        );
        const cooled = annealSettleVelocities(tensionVelocitiesRef.current, frame++);
        syncRelOffsetsFromField();
        publishLayout();

        if (moving && !cooled) {
          tensionRafRef.current = requestAnimationFrame(tick);
        } else {
          tensionRafRef.current = null;
          isTensionSettlingRef.current = false;
          setIsTensionSettling(false);
          finalizeChildLayout();
          publishLayout();
          reheat(0.22);
          onSettled?.();
        }
      };

      tensionRafRef.current = requestAnimationFrame(tick);
    },
    [cancelTensionSettle, edges, finalizeChildLayout, publishLayout, reheat, syncRelOffsetsFromField],
  );

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

      let frame = 0;
      const tick = () => {
        const moving = stepTensionSprings(
          simNodesRef.current,
          null,
          edges,
          nodes,
          velocities,
        );
        const cooled = annealSettleVelocities(velocities, frame++);
        syncRelOffsetsFromField();
        publishLayout();

        if (moving && !cooled) {
          tensionRafRef.current = requestAnimationFrame(tick);
        } else {
          tensionRafRef.current = null;
          isTensionSettlingRef.current = false;
          setIsTensionSettling(false);
          finalizeChildLayout();
          publishLayout();
          reheat(0.22);
          onSettled?.();
        }
      };

      tensionRafRef.current = requestAnimationFrame(tick);
    },
    [cancelTensionSettle, edges, finalizeChildLayout, nodes, publishLayout, reheat, syncRelOffsetsFromField],
  );

  useEffect(() => {
    cancelTensionSettle();
    simRef.current?.stop();
    const { simNodes, fieldNodes, fieldLinks } = buildForceGraph(nodes, edges);
    simNodesRef.current = simNodes;
    dragOriginsRef.current.clear();
    dragChildIdsRef.current = [];
    dragChildWorldRef.current.clear();
    dragPrimaryIdRef.current = null;
    lastContainerPosRef.current = null;
    tensionVelocitiesRef.current.clear();
    isDraggingRef.current = false;

    publishLayout();

    const sim = createFieldSimulation(fieldNodes, fieldLinks);
    sim.on('tick', () => {
      if (isTensionSettlingRef.current) return;
      if (isDraggingRef.current && !keepFieldSimRef.current) return;
      syncChildrenToFields(simNodesRef.current, skipSyncChildIdsRef.current);
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
    (target: DragTarget, options?: BeginDragOptions) => {
      cancelTensionSettle();
      const simNodes = simNodesRef.current;
      keepFieldSimRef.current = options?.keepFieldSim ?? false;
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

      if (primaryId && (target.kind === 'field' || target.kind === 'subfield')) {
        const anchor = simNodes.find((sn) => sn.id === primaryId);
        const childIds = groupIds.filter((id) => !primaryIds.includes(id));
        dragChildIdsRef.current = childIds;
        const world = new Map<string, { x: number; y: number }>();
        for (const id of childIds) {
          const n = simNodes.find((sn) => sn.id === id);
          if (n) world.set(id, { x: n.x, y: n.y });
        }
        dragChildWorldRef.current = world;
        skipSyncChildIdsRef.current = new Set(childIds);
        lastContainerPosRef.current = anchor ? { x: anchor.x, y: anchor.y } : null;
      } else {
        dragChildIdsRef.current = [];
        dragChildWorldRef.current.clear();
        skipSyncChildIdsRef.current = new Set();
        lastContainerPosRef.current = null;
      }

      isDraggingRef.current = true;
      pinnedFieldIdsRef.current.clear();
      if (keepFieldSimRef.current && target.kind === 'field' && primaryId) {
        const sim = simRef.current;
        if (sim) {
          for (const n of simNodes) {
            if (n.kind === 'field' && n.id !== primaryId) {
              n.fx = n.x;
              n.fy = n.y;
              pinnedFieldIdsRef.current.add(n.id);
            }
          }
          setIsSettling(true);
          sim.alpha(0.48).restart();
        }
      } else {
        stopSimulation();
      }
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
        if (target.kind === 'concept') {
          clampConceptNode(simNodes, n, tensionVelocitiesRef.current);
          n.fx = n.x;
          n.fy = n.y;
        }
      }

      const anchor = primaryId ? simNodes.find((sn) => sn.id === primaryId) : null;
      if (
        primaryId &&
        anchor &&
        (target.kind === 'field' || target.kind === 'subfield') &&
        dragChildIdsRef.current.length > 0
      ) {
        const prev = lastContainerPosRef.current ?? { x: anchor.x, y: anchor.y };
        const fieldDelta = { dx: anchor.x - prev.x, dy: anchor.y - prev.y };
        lastContainerPosRef.current = { x: anchor.x, y: anchor.y };
        stepContainerDragPhysics(
          simNodes,
          primaryId,
          dragChildIdsRef.current,
          fieldDelta,
          tensionVelocitiesRef.current,
          dragChildWorldRef.current,
        );
      }

      if (options?.tensionLinks && target.kind === 'concept') {
        stepTensionSprings(
          simNodes,
          target.nodeId,
          edges,
          nodes,
          tensionVelocitiesRef.current,
        );
      } else if (options?.tensionLinks && target.kind === 'subfield' && primaryId) {
        stepSubfieldLinkSprings(
          simNodes,
          primaryId,
          edges,
          tensionVelocitiesRef.current,
        );
      }

      if (keepFieldSimRef.current) {
        simRef.current?.tick();
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
      pinnedFieldIdsRef.current.clear();

      dragOriginsRef.current.clear();
      const containerChildIds = [...dragChildIdsRef.current];
      const containerFieldId =
        target?.kind === 'field'
          ? target.fieldId
          : target?.kind === 'subfield'
            ? target.fieldId
            : null;
      dragChildIdsRef.current = [];
      dragChildWorldRef.current.clear();
      skipSyncChildIdsRef.current = new Set();
      keepFieldSimRef.current = false;
      lastContainerPosRef.current = null;
      dragPrimaryIdRef.current = null;
      isDraggingRef.current = false;

      if (target?.kind === 'field') {
        releaseFieldSprings();
      }

      const releaseContainer =
        options?.releaseContainer &&
        containerFieldId &&
        (target?.kind === 'field' || target?.kind === 'subfield');
      const hasContainerMotion = [...tensionVelocitiesRef.current.values()].some(
        (v) => Math.hypot(v.vx, v.vy) > 0.08,
      );

      if (releaseContainer && hasContainerMotion) {
        syncRelOffsetsFromField();
        publishLayout();
        const afterContainer = () => {
          if (options?.releaseTension && target?.kind === 'subfield') {
            runSubfieldSettle(
              `${target.fieldId}__sf__${target.subfieldKey}`,
              options.releaseVelocity ?? { vx: 0, vy: 0 },
              options.onSettled,
            );
          } else {
            options?.onSettled?.();
          }
        };
        runContainerSettle(containerFieldId, containerChildIds, afterContainer);
        return;
      }

      if (options?.releaseTension && target?.kind === 'concept') {
        syncRelOffsetsFromField();
        publishLayout();
        runTensionSettle(
          target.nodeId,
          options.releaseVelocity ?? { vx: 0, vy: 0 },
          options.onSettled,
        );
        return;
      }

      if (options?.releaseTension && target?.kind === 'subfield') {
        syncRelOffsetsFromField();
        publishLayout();
        runSubfieldSettle(
          `${target.fieldId}__sf__${target.subfieldKey}`,
          options.releaseVelocity ?? { vx: 0, vy: 0 },
          options.onSettled,
        );
        return;
      }

      finalizeChildLayout();
      publishLayout();
      if (target?.kind !== 'field') {
        reheat(0.28);
      }
      options?.onSettled?.();
    },
    [
      finalizeChildLayout,
      publishLayout,
      reheat,
      releaseFieldSprings,
      runContainerSettle,
      runSubfieldSettle,
      runTensionSettle,
      syncRelOffsetsFromField,
    ],
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
