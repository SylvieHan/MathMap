import { useEffect } from 'react';

/** Block browser pinch/Cmd-zoom so layout (sidebar, toolbar) stays fixed. */
export function usePreventBrowserZoom() {
  useEffect(() => {
    const blockPinchZoom = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) e.preventDefault();
    };

    const blockGesture = (e: Event) => {
      // Let the map handle its own pinch; block page zoom elsewhere.
      if ((e.target as Element | null)?.closest?.('.circle-map-wrap')) return;
      e.preventDefault();
    };

    const blockKeyboardZoom = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === '+' || e.key === '-' || e.key === '=' || e.key === '0') {
        e.preventDefault();
      }
    };

    document.addEventListener('wheel', blockPinchZoom, { passive: false, capture: true });
    document.addEventListener('gesturestart', blockGesture);
    document.addEventListener('gesturechange', blockGesture);
    document.addEventListener('gestureend', blockGesture);
    document.addEventListener('keydown', blockKeyboardZoom);

    return () => {
      document.removeEventListener('wheel', blockPinchZoom, { capture: true });
      document.removeEventListener('gesturestart', blockGesture);
      document.removeEventListener('gesturechange', blockGesture);
      document.removeEventListener('gestureend', blockGesture);
      document.removeEventListener('keydown', blockKeyboardZoom);
    };
  }, []);
}
