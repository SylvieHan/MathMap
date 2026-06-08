import { useMemo } from 'react';
import type { MapNode } from '../types';
import { getTopLevelCode, MSC2020 } from '../data/msc2020';
import { colorForNode } from '../utils/colors';

interface FieldLegendProps {
  nodes: MapNode[];
  onSelectField?: (fieldId: string) => void;
}

function topLevelLabel(mscCode: string): string {
  const top = getTopLevelCode(mscCode);
  const entry = MSC2020.find((e) => e.code === top);
  return entry?.label ?? top;
}

export function FieldLegend({ nodes, onSelectField }: FieldLegendProps) {
  const entries = useMemo(() => {
    return nodes
      .filter((n) => n.type === 'field-folder')
      .map((field) => {
        const msc = field.mscCodes[0] ?? '00';
        const top = getTopLevelCode(msc);
        return {
          id: field.id,
          top,
          label: topLevelLabel(msc),
          color: colorForNode('field-folder', field.mscCodes, field.color),
        };
      })
      .sort((a, b) => a.top.localeCompare(b.top, undefined, { numeric: true }));
  }, [nodes]);

  if (entries.length === 0) return null;

  return (
    <aside className="field-legend" aria-label="Field color key">
      <h3 className="field-legend-title">Fields</h3>
      <ul className="field-legend-list">
        {entries.map((entry) => (
          <li key={entry.id}>
            <button
              type="button"
              className="field-legend-item"
              onClick={() => onSelectField?.(entry.id)}
              title={`${entry.top} — ${entry.label}`}
            >
              <span
                className="field-legend-swatch"
                style={{ backgroundColor: entry.color }}
                aria-hidden
              />
              <span className="field-legend-code">{entry.top}</span>
              <span className="field-legend-label">{entry.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
