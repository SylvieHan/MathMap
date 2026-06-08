export interface Transform2D {
  x: number;
  y: number;
  k: number;
}

export function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

export function easeOutQuart(t: number): number {
  return 1 - (1 - t) ** 4;
}

type EasingFn = (t: number) => number;

export function animateTransform(
  from: Transform2D,
  to: Transform2D,
  duration: number,
  onUpdate: (t: Transform2D) => void,
  onDone?: () => void,
  ease: EasingFn = easeOutQuart,
): () => void {
  const start = performance.now();
  let raf = 0;

  const tick = (now: number) => {
    const p = Math.min(1, (now - start) / duration);
    const e = ease(p);
    onUpdate({
      x: from.x + (to.x - from.x) * e,
      y: from.y + (to.y - from.y) * e,
      k: from.k + (to.k - from.k) * e,
    });
    if (p < 1) {
      raf = requestAnimationFrame(tick);
    } else {
      onDone?.();
    }
  };

  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}

export function animateOffset2D(
  from: { x: number; y: number },
  to: { x: number; y: number },
  duration: number,
  onUpdate: (offset: { x: number; y: number }) => void,
  onDone?: () => void,
  ease: EasingFn = easeOutCubic,
): () => void {
  const start = performance.now();
  let raf = 0;

  const tick = (now: number) => {
    const p = Math.min(1, (now - start) / duration);
    const e = ease(p);
    onUpdate({
      x: from.x + (to.x - from.x) * e,
      y: from.y + (to.y - from.y) * e,
    });
    if (p < 1) {
      raf = requestAnimationFrame(tick);
    } else {
      onUpdate(to);
      onDone?.();
    }
  };

  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}

export function runMomentum(
  velocity: { x: number; y: number },
  onUpdate: (delta: { x: number; y: number }) => void,
  onDone: () => void,
  friction = 0.92,
  minSpeed = 0.4,
): () => void {
  let vx = velocity.x;
  let vy = velocity.y;
  let raf = 0;

  const tick = () => {
    vx *= friction;
    vy *= friction;
    onUpdate({ x: vx, y: vy });

    if (Math.hypot(vx, vy) < minSpeed) {
      onDone();
      return;
    }
    raf = requestAnimationFrame(tick);
  };

  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}
