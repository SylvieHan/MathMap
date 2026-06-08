/** True when built as the public read-only website (GitHub Pages, etc.). */
export function isPublishedSite(): boolean {
  return import.meta.env.VITE_PUBLISHED_SITE === 'true';
}

/** Read-only viewer: published site, ?view=1, or ?readonly=1 (never in local dev). */
export function isReadOnlyMode(): boolean {
  if (import.meta.env.DEV) return false;
  if (isPublishedSite()) return true;
  const params = new URLSearchParams(window.location.search);
  return params.get('view') === '1' || params.get('readonly') === '1';
}

/** Compact layout for iframe embeds (e.g. Google Sites). */
export function isEmbedMode(): boolean {
  return new URLSearchParams(window.location.search).get('embed') === '1';
}

export function getBundledMapUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  const mapParam = params.get('map');
  if (mapParam) return mapParam;
  if (!isReadOnlyMode()) return null;
  if (isPublishedSite() || params.get('view') === '1' || params.get('readonly') === '1') {
    return import.meta.env.BASE_URL + 'bundled-map.json';
  }
  return null;
}
