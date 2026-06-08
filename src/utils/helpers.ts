import { DEFAULT_LATEX_PACKAGES, renderRichText } from './latex';

/** @deprecated Use renderRichText — kept for callers without package context */
export function renderMarkdown(md: string): string {
  return renderRichText(md, DEFAULT_LATEX_PACKAGES);
}

export function generateId(): string {
  return crypto.randomUUID();
}
