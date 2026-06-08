import { useCallback, useEffect, useRef, useState } from 'react';
import type { Simulation } from 'd3-force';
import type { SimLink } from '../utils/forceLayout';
import type { MapEdge, MapNode } from '../types';
import type { DragTarget } from '../utils/dragTarget';
import type { CircleItem } from '../utils/circleLayout';
import {
  buildForceGraph,
  createFieldSimulation,
  simNodeIdsForDragTarget,
  simNodesToCircleItems,
  syncChildrenToFields,
  zeroVelocities,
  type ForceSimNode,
} from '../utils/forceLayout';

const ENTRY_ALPHA = 0.38;

export function useForceLayout(nodes: MapNode[], edges: MapEdge[]) {
  const [layout, setLayout] = useState<CircleItem[]>([]);
  const [isSettling, setIsSettling] = useState(false);
  const simRef = useRef<Simulation<ForceSimNode, SimLink> | null>(null);
  const simNodesRef = useRef<ForceSimNode[]>([]);
  const dragOriginsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const isDraggingRef = useRef(false);

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

  const reheat = useCallback((alpha = 0.32) => {
    const sim = simRef.current;
    if (!sim) return;
    setIsSettling(true);
    sim.alpha(Math.max(sim.alpha(), alpha)).restart();
  }, []);

  useEffect(() => {
    simRef.current?.stop();
    const { simNodes, fieldNodes, fieldLinks } = buildForceGraph(nodes, edges);
    simNodesRef.current = simNodes;
    dragOriginsRef.current.clear();
    isDraggingRef.current = false;

    publishLayout();

    const sim = createFieldSimulation(fieldNodes, fieldLinks);
    sim.on('tick', () => {
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
      sim.stop();
      simRef.current = null;
      setIsSettling(false);
    };
  }, [graphKey, nodes, edges, publishLayout]);

  const beginDragGroup = useCallback(
    (target: DragTarget) => {
      const ids = simNodeIdsForDragTarget(target, simNodesRef.current);
      const origins = new Map<string, { x: number; y: number }>();
      for (const id of ids) {
        const n = simNodesRef.current.find((sn) => sn.id === id);
        if (!n) continue;
        origins.set(id, { x: n.x, y: n.y });
      }
      dragOriginsRef.current = origins;
      isDraggingRef.current = true;
      stopSimulation();
    },
    [stopSimulation],
  );

  const moveDragGroup = useCallback(
    (target: DragTarget, offsetX: number, offsetY: number) => {
      const ids = simNodeIdsForDragTarget(target, simNodesRef.current);
      for (const id of ids) {
        const n = simNodesRef.current.find((sn) => sn.id === id);
        const orig = dragOriginsRef.current.get(id);
        if (!n || !orig) continue;
        n.fx = orig.x + offsetX;
        n.fy = orig.y + offsetY;
        n.x = n.fx;
        n.y = n.fy;
        if (n.kind === 'field') {
          for (const child of simNodesRef.current) {
            if (child.fieldId !== n.fieldId || child.kind === 'field') continue;
            if (child.relDx !== undefined && child.relDy !== undefined) {
              child.x = n.x + child.relDx;
              child.y = n.y + child.relDy;
            }
          }
        }
      }
      syncChildrenToFields(simNodesRef.current);
      publishLayout();
    },
    [publishLayout],
  );

  const endDragGroup = useCallback(() => {
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
    isDraggingRef.current = false;
    syncChildrenToFields(simNodesRef.current);
    publishLayout();
    reheat(0.28);
  }, [publishLayout, reheat]);

  return {
    layout,
    isSettling,
    beginDragGroup,
    moveDragGroup,
    endDragGroup,
    reheat,
  };
}
