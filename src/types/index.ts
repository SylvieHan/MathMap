export type NodeType = 'concept' | 'field-folder';

export type ContentBlock =
  | { id: string; type: 'text'; markdown: string }
  | { id: string; type: 'image'; blobId: string; filename: string }
  | { id: string; type: 'pdf'; blobId: string; filename: string }
  | { id: string; type: 'link'; url: string; label: string };

export interface NodePosition {
  x: number;
  y: number;
}

export interface MapNode {
  id: string;
  title: string;
  type: NodeType;
  parentId: string | null;
  mscCodes: string[];
  customTags: string[];
  position: NodePosition;
  pinned: boolean;
  color?: string;
  /** Core definition shown in its own panel section */
  definition?: string;
  /** Origins, key figures, and common references */
  historyAndReferences?: string;
  content: ContentBlock[];
  collapsed?: boolean;
}

export interface MapEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  weight?: number;
  /** Theorem, lemma, or explanation for this link */
  theorem?: string;
}

export interface MapMeta {
  title: string;
  author: string;
  createdAt: string;
  seedVersion?: number;
  /** Bump when local editor storage rules change (e.g. drop auto-demo seed). */
  localEditorProtocol?: number;
  /** LaTeX package names enabled for math rendering (e.g. amsmath, amssymb) */
  latexPackages?: string[];
}

export interface MathMap {
  nodes: MapNode[];
  edges: MapEdge[];
  meta: MapMeta;
}

export interface TagEdge extends MapEdge {
  isTagEdge: true;
}

export type ExportManifest = MathMap & {
  assets: Record<string, string>;
};
