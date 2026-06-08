import { useCallback, useState } from 'react';
import { CircleMapCanvas } from './components/CircleMapCanvas';
import { SidePanel } from './components/SidePanel';
import { Toolbar } from './components/Toolbar';
import { LatexSettingsModal } from './components/LatexSettingsModal';
import { LatexConfigProvider } from './context/LatexConfigContext';
import { useMap } from './hooks/useMap';
import { usePreventBrowserZoom } from './hooks/usePreventBrowserZoom';
import { useTheme } from './hooks/useTheme';
import { DEFAULT_LATEX_PACKAGES } from './utils/latex';
import { isEmbedMode, isPublishedSite } from './utils/siteMode';
import type { DrillState, MapSelection } from './types/selection';
import { EMPTY_DRILL } from './types/selection';
function App() {
  const {
    map,
    loading,
    readOnly,
    updateMeta,
    updateLatexPackages,
    updateNode,
    addNode,
    deleteNode,
    moveNode,
    togglePin,
    addEdge,
    handleExport,
    handleImport,
    relayout,
    updateEdge,
  } = useMap();

  const { theme, toggle: toggleTheme } = useTheme();
  usePreventBrowserZoom();
  const [selection, setSelection] = useState<MapSelection | null>(null);
  const [drill, setDrill] = useState<DrillState>(EMPTY_DRILL);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightIds, setHighlightIds] = useState<Set<string> | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const handleSelect = useCallback((sel: MapSelection) => {
    setSelection(sel);
    if (sel.kind === 'subfield') {
      setDrill({ fieldId: sel.fieldId, subfieldKey: sel.subfieldKey });
    } else if (sel.kind === 'edge') {
      // keep current map drill level
    } else {
      const node = map?.nodes.find((n) => n.id === sel.id);
      if (node?.type === 'field-folder') {
        setDrill({ fieldId: sel.id, subfieldKey: null });
      }
    }
  }, [map?.nodes]);

  if (loading || !map) {
    return (
      <div className="app-loading">
        <div className="loading-spinner" />
        <p>Loading MathMap…</p>
      </div>
    );
  }

  const embed = isEmbedMode();
  const showOnboarding = !readOnly && (map.meta.seedVersion ?? 0) >= 2;
  const showPublishedHint = readOnly && isPublishedSite() && !embed;

  const latexPackages = map.meta.latexPackages ?? DEFAULT_LATEX_PACKAGES;

  return (
    <LatexConfigProvider packages={latexPackages}>
    <div className={`app${embed ? ' is-embed' : ''}`}>
      <Toolbar
        mapTitle={map.meta.title}
        readOnly={readOnly}
        onTitleChange={updateMeta}
        onAddConcept={() => addNode('concept')}
        onAddFolder={() => addNode('field-folder')}
        onRelayout={relayout}
        onExport={handleExport}
        onImport={handleImport}
        onToggleTheme={toggleTheme}
        onOpenSettings={() => setSettingsOpen(true)}
        theme={theme}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        nodes={map.nodes}
        onSearchHighlight={setHighlightIds}
      />

      <LatexSettingsModal
        open={settingsOpen}
        packages={latexPackages}
        readOnly={readOnly}
        onClose={() => setSettingsOpen(false)}
        onSave={updateLatexPackages}
      />

      {showPublishedHint && (
        <div className="published-hint">
          Interactive math concept map — click any circle to explore definitions, history, and connections.
        </div>
      )}

      {showOnboarding && (
        <div className="onboarding-banner">
          Click any circle — its <strong>table of contents</strong> opens in the side panel. Drag to pan; <strong>Shift+drag</strong> a concept to feel connection tension spring it back.
        </div>
      )}

      <div className="main-layout">
        <div className="canvas-area">
          <CircleMapCanvas
            nodes={map.nodes}
            edges={map.edges}
            selection={selection}
            drill={drill}
            highlightIds={highlightIds}
            readOnly={readOnly}
            onSelectionChange={(sel) => {
              setSelection(sel);
              if (!sel) return;
              if (sel.kind === 'subfield') {
                setDrill({ fieldId: sel.fieldId, subfieldKey: sel.subfieldKey });
              } else if (sel.kind === 'edge') {
                // keep current map drill level
              } else {
                const node = map.nodes.find((n) => n.id === sel.id);
                if (node?.type === 'field-folder') {
                  setDrill({ fieldId: sel.id, subfieldKey: null });
                } else if (node?.parentId) {
                  setDrill((d) => ({ fieldId: node.parentId, subfieldKey: d.subfieldKey }));
                }
              }
            }}
            onDrillChange={setDrill}
            onNodeMove={moveNode}
            onTogglePin={togglePin}
            onAddEdge={readOnly ? undefined : addEdge}
          />
        </div>

        <SidePanel
          selection={selection}
          nodes={map.nodes}
          edges={map.edges}
          readOnly={readOnly}
          onClose={() => {
            setSelection(null);
            setDrill(EMPTY_DRILL);
          }}
          onSelect={handleSelect}
          onUpdate={updateNode}
          onUpdateEdge={updateEdge}
          onDelete={(id) => {
            deleteNode(id);
            setSelection(null);
            setDrill(EMPTY_DRILL);
          }}
          onTogglePin={togglePin}
        />
      </div>
    </div>
    </LatexConfigProvider>
  );
}

export default App;
