import { MSC2020 } from '../data/msc2020';
import type { MapNode } from '../types';
import type { DrillState, MapSelection } from '../types/selection';
import { getSubfieldKey, getSubfieldLabel } from './circleLayout';

export type AddIntent = 'field' | 'subfield' | 'concept';

export interface AddAction {
  intent: AddIntent;
  label: string;
  title: string;
}

export interface AddContext {
  fieldId: string | null;
  subfieldKey: string | null;
}

export function resolveAddContext(
  drill: DrillState,
  selection: MapSelection | null,
  nodes: MapNode[],
): AddContext {
  if (drill.fieldId && drill.subfieldKey) {
    return { fieldId: drill.fieldId, subfieldKey: drill.subfieldKey };
  }

  if (selection?.kind === 'subfield') {
    return { fieldId: selection.fieldId, subfieldKey: selection.subfieldKey };
  }

  if (selection?.kind === 'node') {
    const node = nodes.find((n) => n.id === selection.id);
    if (node?.type === 'concept' && node.parentId) {
      return { fieldId: node.parentId, subfieldKey: getSubfieldKey(node) };
    }
    if (node?.type === 'field-folder') {
      return { fieldId: node.id, subfieldKey: null };
    }
  }

  if (drill.fieldId) {
    return { fieldId: drill.fieldId, subfieldKey: null };
  }

  return { fieldId: null, subfieldKey: null };
}

export function resolveAddAction(
  drill: DrillState,
  selection: MapSelection | null,
  nodes: MapNode[],
): AddAction {
  const ctx = resolveAddContext(drill, selection, nodes);

  if (ctx.fieldId && ctx.subfieldKey) {
    return {
      intent: 'concept',
      label: '+ Add',
      title: 'Add a concept in this subfield',
    };
  }

  if (ctx.fieldId) {
    return {
      intent: 'subfield',
      label: '+ Add',
      title: 'Add a new subfield in this field',
    };
  }

  return {
    intent: 'field',
    label: '+ Add',
    title: 'Add a new top-level field',
  };
}

/** Pick an MSC subfield code not yet used under this field. */
export function allocateSubfieldKey(field: MapNode, nodes: MapNode[]): string {
  const existing = new Set(
    nodes
      .filter((n) => n.type === 'concept' && n.parentId === field.id)
      .map(getSubfieldKey),
  );

  const top = field.mscCodes[0] ?? '00';
  const parentDigits = top.replace(/\D/g, '').slice(0, 2).padStart(2, '0');

  for (const entry of MSC2020) {
    if (entry.parent === parentDigits && !existing.has(entry.code)) {
      return entry.code;
    }
  }

  for (const entry of MSC2020) {
    if (
      entry.code.length >= 3 &&
      entry.code.startsWith(parentDigits) &&
      !existing.has(entry.code)
    ) {
      return entry.code;
    }
  }

  let n = 1;
  while (existing.has(`sf-${n}`)) n++;
  return `sf-${n}`;
}

export function defaultSubfieldConceptTitle(subfieldKey: string): string {
  const label = getSubfieldLabel(subfieldKey);
  if (label === 'General') return 'New Subfield';
  const parts = label.split(' — ');
  return parts.length > 1 ? parts[parts.length - 1]! : 'New Subfield';
}
