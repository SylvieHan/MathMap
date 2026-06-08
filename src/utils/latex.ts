import katex from 'katex';

export const DEFAULT_LATEX_PACKAGES = ['amsmath', 'amssymb'];

/** Packages that work in-browser via KaTeX */
export const SUPPORTED_PACKAGE_HINTS: Record<string, string> = {
  amsmath: 'Align, matrix, and equation environments',
  amssymb: 'Extra symbols (ℝ, ℕ, ⊕, …)',
  amsfonts: 'Fraktur and blackboard-bold',
  bm: 'Bold math via \\bm{...}',
  mathtools: 'Some \\DeclareMathOperator support',
  physics: 'Braket and derivative shorthands (partial)',
};

/** Packages that cannot run in the browser */
export const UNSUPPORTED_PACKAGES = new Set(['tikz', 'pgf', 'pgfplots', 'pstricks', 'xy']);

type MathSegment = { kind: 'text'; value: string } | { kind: 'math'; value: string; display: boolean };

export function parsePackageList(input: string): string[] {
  const raw = input
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const usepackage = s.match(/^\\usepackage(?:\[[^\]]*\])?\{([^}]+)\}$/i);
      if (usepackage) return usepackage[1].split(',').map((p) => p.trim());
      return [s.replace(/^\{|\}$/g, '')];
    })
    .flat()
    .map((s) => s.toLowerCase());

  return [...new Set(raw)];
}

export function formatPackageList(packages: string[]): string {
  return packages.join('\n');
}

export function buildKatexMacros(packages: string[]): Record<string, string> {
  const macros: Record<string, string> = {};

  if (packages.includes('physics')) {
    macros['\\dd'] = '\\mathrm{d}';
  }

  return macros;
}

function splitMath(md: string): MathSegment[] {
  const segments: MathSegment[] = [];
  let i = 0;
  let textStart = 0;

  const pushText = (end: number) => {
    if (end > textStart) {
      segments.push({ kind: 'text', value: md.slice(textStart, end) });
    }
    textStart = end;
  };

  while (i < md.length) {
    if (md.startsWith('$$', i)) {
      const end = md.indexOf('$$', i + 2);
      if (end !== -1) {
        pushText(i);
        segments.push({ kind: 'math', value: md.slice(i + 2, end).trim(), display: true });
        i = end + 2;
        textStart = i;
        continue;
      }
    }

    if (md.startsWith('\\[', i)) {
      const end = md.indexOf('\\]', i + 2);
      if (end !== -1) {
        pushText(i);
        segments.push({ kind: 'math', value: md.slice(i + 2, end).trim(), display: true });
        i = end + 2;
        textStart = i;
        continue;
      }
    }

    if (md.startsWith('\\(', i)) {
      const end = md.indexOf('\\)', i + 2);
      if (end !== -1) {
        pushText(i);
        segments.push({ kind: 'math', value: md.slice(i + 2, end).trim(), display: false });
        i = end + 2;
        textStart = i;
        continue;
      }
    }

    if (md[i] === '$' && md[i + 1] !== '$') {
      let j = i + 1;
      while (j < md.length) {
        if (md[j] === '$' && md[j - 1] !== '\\') break;
        j++;
      }
      if (j < md.length && md[j] === '$') {
        pushText(i);
        segments.push({ kind: 'math', value: md.slice(i + 1, j).trim(), display: false });
        i = j + 1;
        textStart = i;
        continue;
      }
    }

    i++;
  }

  pushText(md.length);
  return segments.length ? segments : [{ kind: 'text', value: md }];
}

function renderMath(tex: string, display: boolean, packages: string[]): string {
  if (!tex) return '';
  try {
    return katex.renderToString(tex, {
      displayMode: display,
      throwOnError: false,
      strict: 'ignore',
      trust: false,
      macros: buildKatexMacros(packages),
    });
  } catch {
    return `<span class="latex-error">${escapeHtml(tex)}</span>`;
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Render markdown + inline/display LaTeX to HTML */
export function renderRichText(md: string, packages: string[] = DEFAULT_LATEX_PACKAGES): string {
  const segments = splitMath(md);
  return segments
    .map((seg) => {
      if (seg.kind === 'math') {
        const html = renderMath(seg.value, seg.display, packages);
        return seg.display
          ? `<div class="latex-block">${html}</div>`
          : `<span class="latex-inline">${html}</span>`;
      }
      return renderMarkdownSegment(seg.value);
    })
    .join('');
}

function renderMarkdownSegment(md: string): string {
  let html = escapeHtml(md);

  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
  );
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`);
  html = html.replace(/\n\n/g, '</p><p>');
  html = `<p>${html}</p>`;
  html = html.replace(/<p><\/p>/g, '');

  return html;
}

// fix typo - used `display` instead of `seg.display`