import { useMemo } from 'react';
import { useLatexPackages } from '../context/LatexConfigContext';
import { renderRichText } from '../utils/latex';

interface MarkdownPreviewProps {
  content: string;
  className?: string;
}

export function MarkdownPreview({ content, className = '' }: MarkdownPreviewProps) {
  const packages = useLatexPackages();
  const html = useMemo(() => renderRichText(content, packages), [content, packages]);

  return (
    <div
      className={`markdown-preview ${className}`.trim()}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
