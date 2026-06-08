import { useMemo, useState } from 'react';
import type { MapNode } from '../types';
import { searchMsc, getMscLabel } from '../data/msc2020';

interface TagPickerProps {
  node: MapNode;
  readOnly?: boolean;
  onChange: (mscCodes: string[], customTags: string[]) => void;
}

export function TagPicker({ node, readOnly, onChange }: TagPickerProps) {
  const [query, setQuery] = useState('');
  const [customInput, setCustomInput] = useState('');
  const results = useMemo(() => searchMsc(query), [query]);

  const addMsc = (code: string) => {
    if (node.mscCodes.includes(code)) return;
    onChange([...node.mscCodes, code], node.customTags);
    setQuery('');
  };

  const removeMsc = (code: string) => {
    onChange(node.mscCodes.filter((c) => c !== code), node.customTags);
  };

  const addCustom = () => {
    const tag = customInput.trim();
    if (!tag || node.customTags.includes(tag)) return;
    onChange(node.mscCodes, [...node.customTags, tag]);
    setCustomInput('');
  };

  const removeCustom = (tag: string) => {
    onChange(node.mscCodes, node.customTags.filter((t) => t !== tag));
  };

  return (
    <div className="tag-picker">
      <div className="tag-list">
        {node.mscCodes.map((code) => (
          <span key={code} className="tag msc-tag" title={getMscLabel(code)}>
            {code}
            {!readOnly && (
              <button type="button" className="tag-remove" onClick={() => removeMsc(code)} aria-label="Remove">
                ×
              </button>
            )}
          </span>
        ))}
        {node.customTags.map((tag) => (
          <span key={tag} className="tag custom-tag">
            #{tag}
            {!readOnly && (
              <button type="button" className="tag-remove" onClick={() => removeCustom(tag)} aria-label="Remove">
                ×
              </button>
            )}
          </span>
        ))}
      </div>

      {!readOnly && (
        <>
          <div className="tag-search">
            <input
              type="search"
              placeholder="Search MSC2020 codes…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && results.length > 0 && (
              <ul className="msc-results">
                {results.map((entry) => (
                  <li key={entry.code}>
                    <button type="button" onClick={() => addMsc(entry.code)}>
                      <strong>{entry.code}</strong> {entry.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="custom-tag-input">
            <input
              type="text"
              placeholder="Custom tag"
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addCustom()}
            />
            <button type="button" onClick={addCustom}>Add</button>
          </div>
        </>
      )}
    </div>
  );
}
