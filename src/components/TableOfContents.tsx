import type { MapNode } from '../types';
import type { MapSelection } from '../types/selection';
import { colorForNode } from '../utils/colors';
import { getSubfieldKey, getSubfieldLabel } from '../utils/circleLayout';
import type { SubfieldGroup } from '../utils/subfieldGroups';

interface TableOfContentsProps {
  title?: string;
  groups?: SubfieldGroup[];
  concepts?: MapNode[];
  onSelect: (selection: MapSelection) => void;
  fieldId?: string;
}

export function TableOfContents({
  title = 'Table of contents',
  groups,
  concepts,
  onSelect,
  fieldId,
}: TableOfContentsProps) {
  if (groups && groups.length > 0) {
    return (
      <nav className="panel-toc" aria-label={title}>
        <h3 className="toc-title">{title}</h3>
        <ol className="toc-list">
          {groups.map((g, idx) => (
            <li key={g.key} className="toc-section">
              <button
                type="button"
                className="toc-section-btn"
                onClick={() =>
                  fieldId &&
                  onSelect({
                    kind: 'subfield',
                    fieldId,
                    subfieldKey: g.key,
                    label: g.label,
                  })
                }
              >
                <span className="toc-num">{idx + 1}.</span>
                <span className="toc-section-label">{g.label}</span>
                <span className="toc-meta">{g.key}</span>
                <span className="toc-count">{g.concepts.length}</span>
              </button>
              {g.concepts.length > 0 && (
                <ul className="toc-entries">
                  {g.concepts.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        className="toc-entry-btn"
                        onClick={() => onSelect({ kind: 'node', id: c.id })}
                      >
                        <span
                          className="child-dot"
                          style={{ background: colorForNode('concept', c.mscCodes, c.color) }}
                        />
                        {c.title}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      </nav>
    );
  }

  if (concepts && concepts.length > 0) {
    return (
      <nav className="panel-toc" aria-label={title}>
        <h3 className="toc-title">{title}</h3>
        <ol className="toc-list toc-list-flat">
          {concepts.map((c, idx) => (
            <li key={c.id}>
              <button
                type="button"
                className="toc-entry-btn toc-entry-btn-flat"
                onClick={() => onSelect({ kind: 'node', id: c.id })}
              >
                <span className="toc-num">{idx + 1}.</span>
                <span
                  className="child-dot"
                  style={{ background: colorForNode('concept', c.mscCodes, c.color) }}
                />
                {c.title}
              </button>
            </li>
          ))}
        </ol>
      </nav>
    );
  }

  return (
    <div className="panel-toc panel-toc-empty">
      <h3 className="toc-title">{title}</h3>
      <p className="empty-hint">Nothing here yet. Add concepts to this area.</p>
    </div>
  );
}

export function conceptBreadcrumb(node: MapNode, nodes: MapNode[]): string {
  const field = node.parentId ? nodes.find((n) => n.id === node.parentId) : null;
  const subKey = getSubfieldKey(node);
  const subLabel = getSubfieldLabel(subKey);
  if (field) return `${field.title} › ${subLabel}`;
  return subLabel;
}
