import { getSubfieldKey, getSubfieldLabel } from './circleLayout';
import type { MapNode } from '../types';

export interface SubfieldGroup {
  key: string;
  label: string;
  concepts: MapNode[];
}

export function getSubfieldGroups(fieldId: string, nodes: MapNode[]): SubfieldGroup[] {
  const concepts = nodes.filter((n) => n.type === 'concept' && n.parentId === fieldId);
  const map = new Map<string, MapNode[]>();

  for (const c of concepts) {
    const key = getSubfieldKey(c);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(c);
  }

  return [...map.entries()]
    .map(([key, group]) => ({
      key,
      label: getSubfieldLabel(key),
      concepts: group,
    }))
    .sort((a, b) => b.concepts.length - a.concepts.length);
}
