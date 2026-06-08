import { useMemo } from 'react';
import type { MapNode } from '../types';

interface SearchBarProps {
  query: string;
  onChange: (query: string) => void;
  nodes: MapNode[];
  onHighlight: (ids: Set<string> | null) => void;
}

export function SearchBar({ query, onChange, nodes, onHighlight }: SearchBarProps) {
  const handleChange = (value: string) => {
    onChange(value);
    if (!value.trim()) {
      onHighlight(null);
      return;
    }
    const q = value.trim().toLowerCase();
    const matching = nodes.filter((n) => {
      if (n.title.toLowerCase().includes(q)) return true;
      if (n.mscCodes.some((c) => c.toLowerCase().includes(q))) return true;
      if (n.customTags.some((t) => t.toLowerCase().includes(q))) return true;
      return false;
    });
    const ids = new Set(matching.map((n) => n.id));
    // Include parent folders of matches
    for (const n of matching) {
      let pid = n.parentId;
      while (pid) {
        ids.add(pid);
        pid = nodes.find((x) => x.id === pid)?.parentId ?? null;
      }
    }
    onHighlight(ids.size > 0 ? ids : new Set());
  };

  const matchCount = useMemo(() => {
    if (!query.trim()) return null;
    const q = query.trim().toLowerCase();
    return nodes.filter((n) =>
      n.title.toLowerCase().includes(q) ||
      n.mscCodes.some((c) => c.toLowerCase().includes(q)) ||
      n.customTags.some((t) => t.toLowerCase().includes(q)),
    ).length;
  }, [query, nodes]);

  return (
    <div className="search-bar">
      <input
        type="search"
        placeholder="Search title, MSC, or tag…"
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        aria-label="Search nodes"
      />
      {matchCount !== null && (
        <span className="search-count">{matchCount} match{matchCount !== 1 ? 'es' : ''}</span>
      )}
    </div>
  );
}
