# Edge arrows — rim anchoring

**Status:** Done (2026-06-09).

## Behavior

- Line endpoints sit on **circle rims** (ray from center to the other node), not centroids.
- Fit-all field bundles use each field’s `r` from layout.
- Zoomed-in concept edges use live position + radius from `conceptCircles` (layout + force layout).
- Tension arrow marker `refX` aligned so the tip meets the rim endpoint.
- Hit-testing uses the same rim-anchored segment.

## Implementation

- `src/utils/edgeDisplay.ts` — `circleRimToward`, `anchorEdgeEndpoints`, used in `buildFieldBundleEdges` and `buildConceptLevelEdges`
- `src/components/CircleMapCanvas.tsx` — `conceptCircles` map (x, y, r) passed to `buildRenderedEdges`
