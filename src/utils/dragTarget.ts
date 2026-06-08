import type { CircleItem } from './circleLayout';

export type DragTarget =
  | { kind: 'concept'; nodeId: string }
  | { kind: 'field'; fieldId: string }
  | { kind: 'subfield'; fieldId: string; subfieldKey: string };

export function dragTargetFromHit(hit: CircleItem): DragTarget | null {
  if (hit.kind === 'concept') return { kind: 'concept', nodeId: hit.node.id };
  if (hit.kind === 'field') return { kind: 'field', fieldId: hit.id };
  if (hit.kind === 'subfield' && hit.subfieldKey) {
    return { kind: 'subfield', fieldId: hit.fieldId, subfieldKey: hit.subfieldKey };
  }
  return null;
}

/** Field balls are only draggable on the fit-all overview (not when drilled into a field). */
export function dragTargetFromHitInView(
  hit: CircleItem,
  drilledFieldId: string | null,
): DragTarget | null {
  const target = dragTargetFromHit(hit);
  if (target?.kind === 'field' && drilledFieldId) return null;
  return target;
}

export function itemMatchesDragTarget(item: CircleItem, target: DragTarget): boolean {
  switch (target.kind) {
    case 'concept':
      return item.kind === 'concept' && item.node.id === target.nodeId;
    case 'field':
      if (item.kind === 'field') return item.id === target.fieldId;
      return item.fieldId === target.fieldId;
    case 'subfield':
      if (item.kind === 'subfield') {
        return item.fieldId === target.fieldId && item.subfieldKey === target.subfieldKey;
      }
      if (item.kind === 'concept') {
        return item.fieldId === target.fieldId && item.subfieldKey === target.subfieldKey;
      }
      return false;
  }
}

export function dragTargetKey(target: DragTarget): string {
  switch (target.kind) {
    case 'concept':
      return `c:${target.nodeId}`;
    case 'field':
      return `f:${target.fieldId}`;
    case 'subfield':
      return `sf:${target.fieldId}:${target.subfieldKey}`;
  }
}
