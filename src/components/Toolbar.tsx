import { isPublishedSite } from '../utils/siteMode';
import type { MapNode } from '../types';
import { SearchBar } from './SearchBar';

interface ToolbarProps {
  mapTitle: string;
  readOnly?: boolean;
  onTitleChange: (title: string) => void;
  addLabel: string;
  addTitle: string;
  onAdd: () => void;
  onNewMap: () => void;
  onRelayout: () => void;
  onExport: () => void;
  onImport: (file: File, mode: 'replace' | 'merge') => void;
  onToggleTheme: () => void;
  onOpenSettings?: () => void;
  theme: 'light' | 'dark';
  searchQuery: string;
  onSearchChange: (query: string) => void;
  nodes: MapNode[];
  onSearchHighlight: (ids: Set<string> | null) => void;
}

export function Toolbar({
  mapTitle,
  readOnly,
  onTitleChange,
  addLabel,
  addTitle,
  onAdd,
  onNewMap,
  onRelayout,
  onExport,
  onImport,
  onToggleTheme,
  onOpenSettings,
  theme,
  searchQuery,
  onSearchChange,
  nodes,
  onSearchHighlight,
}: ToolbarProps) {
  return (
    <header className="toolbar">
      <div className="toolbar-left">
        <span className="app-logo">MathMap</span>
        {readOnly ? (
          <span className="map-title-readonly">{mapTitle}</span>
        ) : (
          <input
            className="map-title-input"
            value={mapTitle}
            onChange={(e) => onTitleChange(e.target.value)}
            aria-label="Map title"
          />
        )}
        {readOnly && !isPublishedSite() && <span className="readonly-badge">View only</span>}
      </div>

      <div className="toolbar-center">
        <SearchBar
          query={searchQuery}
          onChange={onSearchChange}
          nodes={nodes}
          onHighlight={onSearchHighlight}
        />
      </div>

      <div className="toolbar-right">
        {!readOnly && (
          <>
            <button type="button" onClick={onNewMap} title="Start a blank map">
              New map
            </button>
            <button type="button" className="toolbar-add-btn" onClick={onAdd} title={addTitle}>
              {addLabel}
            </button>
            <button type="button" onClick={onRelayout} title="Re-pack circles for unpinned nodes">
              Re-layout
            </button>
            <button type="button" onClick={onExport} title="Download .mathmap file">Export</button>
            <label className="import-btn">
              Import
              <input
                type="file"
                accept=".mathmap,application/zip"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const merge = window.confirm('Merge into current map? Click Cancel to replace.');
                    onImport(file, merge ? 'merge' : 'replace');
                  }
                  e.target.value = '';
                }}
              />
            </label>
          </>
        )}
        <button
          type="button"
          onClick={onOpenSettings}
          title="LaTeX packages and rendering settings"
        >
          LaTeX settings
        </button>
        <button type="button" className="theme-toggle" onClick={onToggleTheme} title="Toggle theme">
          {theme === 'light' ? '☾' : '☀'}
        </button>
      </div>
    </header>
  );
}
