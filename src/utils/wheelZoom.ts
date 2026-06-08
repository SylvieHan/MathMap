/** Scale factor for trackpad pinch (ctrl/meta + wheel on Chrome, etc.). Spread fingers → zoom in. */
export function pinchWheelZoomFactor(e: WheelEvent): number {
  let dy = e.deltaY;
  if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) dy *= 16;
  else if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) dy *= 800;

  // Negated deltaY: spread fingers (typically negative deltaY on macOS) increases k.
  return Math.exp(-dy * 0.012);
}

/** Apply zoom toward a screen point; returns the new transform. */
export function zoomTransformAtPoint(
  t: { x: number; y: number; k: number },
  newK: number,
  px: number,
  py: number,
): { x: number; y: number; k: number } {
  const wx = (px - t.x) / t.k;
  const wy = (py - t.y) / t.k;
  return {
    k: newK,
    x: px - wx * newK,
    y: py - wy * newK,
  };
}
