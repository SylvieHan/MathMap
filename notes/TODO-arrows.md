# TODO — Edge arrows (fix tomorrow)

**Status:** Not started. No code changes yet (noted 2026-06-08).

## Problem

Connection arrows/lines currently meet at the **center** of circles — especially wrong for **large** balls (fields, subfields), where the line looks like it pierces through the middle instead of attaching to the rim.

## Desired behavior

- Arrows should **link to the balls** — line endpoints on the **edge** of each circle (where the ray from center to the other node hits the circumference).
- Should work for **concepts** (small balls) and **larger** containers (fields/subfields) at different zoom LODs.
- Arrowheads should sit on/near the surface, not float toward the centroid.

## Progress (2026-06-08)

- Fit-all uses field-center bundles only; zoomed-in uses one line per concept connection.
- Bundle click opens full link list in sidebar (`edge-bundle` selection).
- Hyperlink navigation: click concept names in panel to animate camera (`focusNode`).

## Still to do

- `src/utils/edgeDisplay.ts` — anchor line endpoints on **circle rims**, not centers (`x1`, `y1`, `x2`, `y2`)
- `src/components/CircleMapCanvas.tsx` — edge rendering / tension lines
- May need circle radius per endpoint from `CircleItem` / `conceptPositions` / layout

## Related

- Shift-drag tension springs use the same edge endpoints — fix should improve tension visuals too.

---

*Sylvie: pick this up tomorrow; arrows are a known follow-up.*
