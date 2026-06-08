import { useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_LATEX_PACKAGES,
  formatPackageList,
  parsePackageList,
  SUPPORTED_PACKAGE_HINTS,
  UNSUPPORTED_PACKAGES,
} from '../utils/latex';

interface LatexSettingsModalProps {
  open: boolean;
  packages: string[];
  readOnly?: boolean;
  onClose: () => void;
  onSave: (packages: string[]) => void;
}

const PRESET_PACKAGES = ['amsmath', 'amssymb', 'amsfonts', 'bm', 'mathtools', 'physics'];

export function LatexSettingsModal({
  open,
  packages,
  readOnly,
  onClose,
  onSave,
}: LatexSettingsModalProps) {
  const [text, setText] = useState(formatPackageList(packages));

  useEffect(() => {
    if (open) setText(formatPackageList(packages.length ? packages : DEFAULT_LATEX_PACKAGES));
  }, [open, packages]);

  const parsed = useMemo(() => parsePackageList(text), [text]);
  const unsupported = parsed.filter((p) => UNSUPPORTED_PACKAGES.has(p));

  if (!open) return null;

  const addPreset = (pkg: string) => {
    const next = [...new Set([...parsePackageList(text), pkg])];
    setText(formatPackageList(next));
  };

  const handleSave = () => {
    onSave(parsed.length ? parsed : DEFAULT_LATEX_PACKAGES);
    onClose();
  };

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="modal-panel latex-settings-modal"
        role="dialog"
        aria-labelledby="latex-settings-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2 id="latex-settings-title">LaTeX settings</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </header>

        <div className="modal-body">
          <p className="modal-intro">
            All text fields (definitions, history &amp; references, theorems, notes) support <strong>Markdown</strong> and{' '}
            <strong>LaTeX</strong>. Use <code>$...$</code> for inline math and <code>$$...$$</code> for display math.
          </p>

          <label className="settings-label" htmlFor="latex-packages-input">
            LaTeX packages <span className="label-hint">(one per line, or comma-separated)</span>
          </label>
          <textarea
            id="latex-packages-input"
            className="markdown-input latex-packages-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            readOnly={readOnly}
            placeholder={'amsmath\namssymb\namsfonts'}
            rows={6}
          />

          {!readOnly && (
            <div className="latex-presets">
              <span className="presets-label">Quick add:</span>
              {PRESET_PACKAGES.map((pkg) => (
                <button
                  key={pkg}
                  type="button"
                  className={`preset-chip${parsed.includes(pkg) ? ' active' : ''}`}
                  onClick={() => addPreset(pkg)}
                >
                  {pkg}
                </button>
              ))}
            </div>
          )}

          <div className="latex-supported-list">
            <h3>Supported in-browser</h3>
            <ul>
              {Object.entries(SUPPORTED_PACKAGE_HINTS).map(([pkg, hint]) => (
                <li key={pkg}>
                  <code>{pkg}</code> — {hint}
                </li>
              ))}
            </ul>
          </div>

          {unsupported.length > 0 && (
            <p className="latex-warning">
              <strong>Note:</strong> {unsupported.join(', ')} require a full LaTeX compiler and are not available
              in the browser preview. Use an external tool for TikZ/PGF diagrams and embed as images instead.
            </p>
          )}
        </div>

        <footer className="modal-footer">
          <button type="button" onClick={onClose}>Cancel</button>
          {!readOnly && (
            <button type="button" className="primary" onClick={handleSave}>Save</button>
          )}
        </footer>
      </div>
    </div>
  );
}
