import type { ReactNode } from 'react';
import type { MapEdge, MapNode } from '../types';
import type { MapSelection } from '../types/selection';
import { ContentBlocks } from './ContentBlocks';
import { TagPicker } from './TagPicker';
import { TableOfContents, conceptBreadcrumb } from './TableOfContents';
import { startEdgeFromNode } from './CircleMapCanvas';
import { colorForNode } from '../utils/colors';
import { getSubfieldGroups } from '../utils/subfieldGroups';
import { RichTextField } from './RichTextField';

interface SidePanelProps {
  selection: MapSelection | null;
  nodes: MapNode[];
  edges: MapEdge[];
  readOnly?: boolean;
  addLabel?: string;
  addTitle?: string;
  onAdd?: () => void;
  onClose: () => void;
  onSelect: (selection: MapSelection) => void;
  onFocusNode?: (nodeId: string) => void;
  onUpdate: (node: MapNode) => void;
  onUpdateEdge: (edge: MapEdge) => void;
  onDelete: (id: string) => void;
  onTogglePin: (id: string) => void;
}

function ConnectionRow({
  edge,
  nodeId,
  nodes,
  onSelect,
  onFocusNode,
}: {
  edge: MapEdge;
  nodeId: string;
  nodes: MapNode[];
  onSelect: (selection: MapSelection) => void;
  onFocusNode?: (nodeId: string) => void;
}) {
  const otherId = edge.source === nodeId ? edge.target : edge.source;
  const other = nodes.find((n) => n.id === otherId);
  const direction = edge.source === nodeId ? '→' : '←';

  return (
    <li className="connection-item">
      <div className="connection-edge-row">
        <button
          type="button"
          className="connection-edge-btn"
          onClick={() => onSelect({ kind: 'edge', id: edge.id })}
        >
          <span className="connection-direction">{direction}</span>
          {edge.label && <span className="connection-label">{edge.label}</span>}
        </button>
        <button
          type="button"
          className="connection-target-link"
          onClick={() => {
            onFocusNode?.(otherId);
            onSelect({ kind: 'node', id: otherId });
          }}
        >
          {other?.title ?? otherId}
        </button>
      </div>
      {edge.weight && edge.weight > 1 && (
        <span className="connection-weight" title="Link strength">×{edge.weight}</span>
      )}
    </li>
  );
}

function PanelShell({
  header,
  footer,
  children,
}: {
  header: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <aside className="side-panel">
      <header className="panel-header">{header}</header>
      <div className="panel-body">{children}</div>
      {footer}
    </aside>
  );
}

export function SidePanel({
  selection,
  nodes,
  edges,
  readOnly,
  addLabel = '+ Add',
  addTitle = 'Add',
  onAdd,
  onClose,
  onSelect,
  onFocusNode,
  onUpdate,
  onUpdateEdge,
  onDelete,
  onTogglePin,
}: SidePanelProps) {
  const closeBtn = (
    <button type="button" className="panel-close" onClick={onClose} aria-label="Close">×</button>
  );

  const addBtn = !readOnly && onAdd ? (
    <button type="button" className="panel-add-btn" onClick={onAdd} title={addTitle}>
      {addLabel}
    </button>
  ) : null;

  if (!selection) {
    return (
      <aside className="side-panel side-panel-empty">
        <h2>Node details</h2>
        {addBtn}
        <p className="empty-hint">
          Click any circle on the map — its <strong>table of contents</strong> appears here.
          Click a <strong>connection</strong> (sidebar or map) to read its theorem.
        </p>
        <ul className="onboarding-hints">
          <li>Field → list of subfields and their concepts</li>
          <li>Concept → definition, history &amp; references, notes, and connections</li>
          <li>Connection → theorem linking two concepts</li>
        </ul>
      </aside>
    );
  }

  if (selection.kind === 'edge-bundle') {
    const fieldA = nodes.find((n) => n.id === selection.fieldAId);
    const fieldB = nodes.find((n) => n.id === selection.fieldBId);
    const bundleEdges = edges.filter((e) => selection.edgeIds.includes(e.id));

    return (
      <PanelShell
        header={
          <>
            {closeBtn}
            <h2>{selection.label}</h2>
            <span className="node-type-badge edge">Cross-field links</span>
            <p className="panel-hint">
              {bundleEdges.length} connection{bundleEdges.length === 1 ? '' : 's'} between{' '}
              <strong>{fieldA?.title ?? 'Field A'}</strong> and{' '}
              <strong>{fieldB?.title ?? 'Field B'}</strong>. Click a link for its theorem; click a
              concept name to fly the map there.
            </p>
          </>
        }
      >
        <div className="panel-section">
          <ul className="connection-list bundle-link-list">
            {bundleEdges.map((edge) => {
              const source = nodes.find((n) => n.id === edge.source);
              const target = nodes.find((n) => n.id === edge.target);
              return (
                <li key={edge.id} className="bundle-link-item">
                  <button
                    type="button"
                    className="edge-endpoint-btn"
                    onClick={() => {
                      onFocusNode?.(edge.source);
                      onSelect({ kind: 'node', id: edge.source });
                    }}
                  >
                    {source?.title ?? edge.source}
                  </button>
                  <button
                    type="button"
                    className="bundle-link-theorem"
                    onClick={() => onSelect({ kind: 'edge', id: edge.id })}
                  >
                    {edge.label ?? 'Connection'}
                  </button>
                  <button
                    type="button"
                    className="edge-endpoint-btn"
                    onClick={() => {
                      onFocusNode?.(edge.target);
                      onSelect({ kind: 'node', id: edge.target });
                    }}
                  >
                    {target?.title ?? edge.target}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </PanelShell>
    );
  }

  if (selection.kind === 'edge') {
    const edge = edges.find((e) => e.id === selection.id);
    if (!edge) {
      return (
        <aside className="side-panel side-panel-empty">
          <p className="empty-hint">Connection not found.</p>
        </aside>
      );
    }
    const source = nodes.find((n) => n.id === edge.source);
    const target = nodes.find((n) => n.id === edge.target);
    const updateEdge = (patch: Partial<MapEdge>) => onUpdateEdge({ ...edge, ...patch });

    return (
      <PanelShell
        header={
          <>
            {closeBtn}
            <h2>{edge.label ?? 'Connection'}</h2>
            <span className="node-type-badge edge">Connection</span>
          </>
        }
      >
        <div className="panel-section">
          <h3>Between</h3>
          <div className="edge-endpoints">
            <button
              type="button"
              className="edge-endpoint-btn"
              onClick={() => {
                onFocusNode?.(edge.source);
                onSelect({ kind: 'node', id: edge.source });
              }}
            >
              {source?.title ?? edge.source}
            </button>
            <span className="edge-arrow">↔</span>
            <button
              type="button"
              className="edge-endpoint-btn"
              onClick={() => {
                onFocusNode?.(edge.target);
                onSelect({ kind: 'node', id: edge.target });
              }}
            >
              {target?.title ?? edge.target}
            </button>
          </div>
        </div>

        <div className="panel-section">
          <h3>Theorem / explanation</h3>
          <RichTextField
            value={edge.theorem ?? ''}
            onChange={(theorem) => updateEdge({ theorem })}
            readOnly={readOnly}
            placeholder="State the theorem, lemma, or how these concepts relate…"
            rows={10}
            previewClassName="theorem-preview"
          />
        </div>
      </PanelShell>
    );
  }

  if (selection.kind === 'subfield') {
    const field = nodes.find((n) => n.id === selection.fieldId);
    const groupConcepts =
      getSubfieldGroups(selection.fieldId, nodes).find((g) => g.key === selection.subfieldKey)
        ?.concepts ?? [];

    return (
      <PanelShell
        header={
          <>
            {closeBtn}
            {addBtn}
            {field && (
              <button
                type="button"
                className="panel-breadcrumb-link"
                onClick={() => onSelect({ kind: 'node', id: field.id })}
              >
                {field.title}
              </button>
            )}
            <h2>{selection.label}</h2>
            <span className="node-type-badge subfield">Subfield · {selection.subfieldKey}</span>
          </>
        }
      >
        <div className="panel-section panel-toc-section">
          <TableOfContents
            title="Concepts in this subfield"
            concepts={groupConcepts}
            onSelect={onSelect}
          />
        </div>
      </PanelShell>
    );
  }

  const node = nodes.find((n) => n.id === selection.id);
  if (!node) {
    return (
      <aside className="side-panel side-panel-empty">
        <p className="empty-hint">Selection not found.</p>
      </aside>
    );
  }

  const update = (patch: Partial<MapNode>) => {
    onUpdate({ ...node, ...patch });
  };

  const subfieldGroups = node.type === 'field-folder' ? getSubfieldGroups(node.id, nodes) : [];
  const nodeEdges = edges.filter((e) => e.source === node.id || e.target === node.id);

  const actionsFooter = !readOnly ? (
    <footer className="panel-actions">
      <button type="button" onClick={() => onTogglePin(node.id)}>
        {node.pinned ? 'Unpin' : 'Pin'} node
      </button>
      {node.type === 'concept' && (
        <button type="button" onClick={() => startEdgeFromNode(node.id)}>
          Link from here
        </button>
      )}
      <button type="button" className="danger" onClick={() => onDelete(node.id)}>
        Delete node
      </button>
    </footer>
  ) : undefined;

  return (
    <PanelShell
      footer={actionsFooter}
      header={
        <>
          {closeBtn}
          {addBtn}
          {readOnly ? (
            <h2>{node.title}</h2>
          ) : (
            <input
              className="panel-title-input"
              value={node.title}
              onChange={(e) => update({ title: e.target.value })}
            />
          )}
          <span className={`node-type-badge ${node.type}`}>
            {node.type === 'field-folder' ? 'Field' : 'Concept'}
          </span>
          {node.type === 'concept' && (
            <p className="panel-context">{conceptBreadcrumb(node, nodes)}</p>
          )}
        </>
      }
    >
      {node.type === 'field-folder' && (
        <div className="panel-section panel-toc-section">
          <TableOfContents
            title="Table of contents"
            groups={subfieldGroups}
            fieldId={node.id}
            onSelect={onSelect}
          />
        </div>
      )}

      {node.type === 'concept' && (
        <div className="panel-section">
          <h3>Definition</h3>
          <RichTextField
            value={readOnly && !node.definition?.trim() ? '_No definition yet._' : (node.definition ?? '')}
            onChange={(definition) => update({ definition })}
            readOnly={readOnly}
            placeholder="Precise definition of this concept…"
            rows={4}
            previewClassName="definition-preview"
          />
        </div>
      )}

      <div className="panel-section">
        <h3>History &amp; references</h3>
        <p className="panel-hint">
          Who introduced this {node.type === 'field-folder' ? 'field' : 'concept'}, when, and books or papers to read.
        </p>
        <RichTextField
          value={
            readOnly && !node.historyAndReferences?.trim()
              ? '_No history or references yet._'
              : (node.historyAndReferences ?? '')
          }
          onChange={(historyAndReferences) => update({ historyAndReferences })}
          readOnly={readOnly}
          placeholder="e.g. Eilenberg & Mac Lane (1945); Mac Lane, Categories for the Working Mathematician…"
          rows={5}
          previewClassName="history-preview"
        />
      </div>

      {node.type === 'concept' && nodeEdges.length > 0 && (
        <div className="panel-section">
          <h3>Connections</h3>
          <p className="panel-hint">Click a connection to read its theorem.</p>
          <ul className="connection-list">
            {nodeEdges.map((edge) => (
              <ConnectionRow
                key={edge.id}
                edge={edge}
                nodeId={node.id}
                nodes={nodes}
                onSelect={onSelect}
                onFocusNode={onFocusNode}
              />
            ))}
          </ul>
        </div>
      )}

      <div className="panel-section">
        <h3>{node.type === 'field-folder' ? 'Field notes' : 'Notes'}</h3>
        <TagPicker
          node={node}
          readOnly={readOnly}
          onChange={(mscCodes, customTags) => {
            update({
              mscCodes,
              customTags,
              color: colorForNode(node.type, mscCodes, node.color),
            });
          }}
        />
        {!readOnly && node.type === 'concept' && (
          <div className="parent-select">
            <label htmlFor="parent-folder">Field folder</label>
            <select
              id="parent-folder"
              value={node.parentId ?? ''}
              onChange={(e) => update({ parentId: e.target.value || null })}
            >
              <option value="">None (top level)</option>
              {nodes
                .filter((n) => n.type === 'field-folder' && n.id !== node.id)
                .map((f) => (
                  <option key={f.id} value={f.id}>{f.title}</option>
                ))}
            </select>
          </div>
        )}
        <ContentBlocks
          blocks={node.content}
          readOnly={readOnly}
          onChange={(content) => update({ content })}
        />
      </div>
    </PanelShell>
  );
}
