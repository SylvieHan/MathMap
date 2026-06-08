import { useEffect, useRef, useState } from 'react';
import { MarkdownPreview } from './MarkdownPreview';

interface RichTextFieldProps {
  value: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  rows?: number;
  readOnly?: boolean;
  className?: string;
  previewClassName?: string;
}

export function RichTextField({
  value,
  onChange,
  placeholder = 'Click to add Markdown & LaTeX…',
  rows = 6,
  readOnly,
  className = '',
  previewClassName = '',
}: RichTextFieldProps) {
  const [editing, setEditing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) textareaRef.current?.focus();
  }, [editing]);

  if (readOnly) {
    return (
      <MarkdownPreview
        content={value.trim() ? value : placeholder}
        className={`rich-text-readonly ${previewClassName}`.trim()}
      />
    );
  }

  if (editing) {
    return (
      <textarea
        ref={textareaRef}
        className={`markdown-input rich-text-input rich-text-editing ${className}`.trim()}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            setEditing(false);
          }
        }}
        placeholder={`${placeholder} — $E=mc^2$, $$\\int_0^1 f(x)\\,dx$$`}
        rows={rows}
      />
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      className={`rich-text-display ${previewClassName} ${!value.trim() ? 'is-empty' : ''} ${className}`.trim()}
      onClick={() => setEditing(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setEditing(true);
        }
      }}
    >
      {value.trim() ? (
        <MarkdownPreview content={value} />
      ) : (
        <span className="rich-text-placeholder">{placeholder}</span>
      )}
    </div>
  );
}
