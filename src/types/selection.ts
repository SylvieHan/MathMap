export type MapSelection =
  | { kind: 'node'; id: string }
  | { kind: 'subfield'; fieldId: string; subfieldKey: string; label: string }
  | { kind: 'edge'; id: string };

export interface DrillState {
  fieldId: string | null;
  subfieldKey: string | null;
}

export const EMPTY_DRILL: DrillState = { fieldId: null, subfieldKey: null };
