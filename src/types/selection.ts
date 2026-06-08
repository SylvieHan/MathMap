export type MapSelection =
  | { kind: 'node'; id: string }
  | { kind: 'subfield'; fieldId: string; subfieldKey: string; label: string }
  | { kind: 'edge'; id: string }
  | {
      kind: 'edge-bundle';
      bundleId: string;
      edgeIds: string[];
      fieldAId: string;
      fieldBId: string;
      label: string;
    };

export interface DrillState {
  fieldId: string | null;
  subfieldKey: string | null;
}

export const EMPTY_DRILL: DrillState = { fieldId: null, subfieldKey: null };
