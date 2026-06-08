import { useEffect, useState } from 'react';
import type { ContentBlock } from '../types';
import { loadBlob } from '../db';
import { storeContentBlob } from '../utils/exportImport';
import { generateId } from '../utils/helpers';
import { RichTextField } from './RichTextField';

interface ContentBlocksProps {
  blocks: ContentBlock[];
  readOnly?: boolean;
  onChange: (blocks: ContentBlock[]) => void;
}

function BlobImage({ blobId, alt }: { blobId: string; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    loadBlob(blobId).then((blob) => {
      if (active && blob) setUrl(URL.createObjectURL(blob));
    });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blobId]);

  if (!url) return <div className="blob-loading">Loading image…</div>;
  return <img src={url} alt={alt} className="content-image" />;
}

function PdfViewer({ blobId, filename }: { blobId: string; filename: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    loadBlob(blobId).then((blob) => {
      if (active && blob) setUrl(URL.createObjectURL(blob));
    });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blobId]);

  if (!url) return <div className="blob-loading">Loading PDF…</div>;
  return (
    <div className="pdf-viewer">
      <div className="pdf-name">{filename}</div>
      <iframe src={url} title={filename} className="pdf-frame" />
    </div>
  );
}

export function ContentBlocks({ blocks, readOnly, onChange }: ContentBlocksProps) {
  const addText = () => {
    onChange([...blocks, { id: generateId(), type: 'text', markdown: '' }]);
  };

  const addLink = () => {
    onChange([...blocks, { id: generateId(), type: 'link', url: '', label: '' }]);
  };

  const handleFile = async (file: File, type: 'image' | 'pdf') => {
    const blobId = await storeContentBlob(file);
    onChange([
      ...blocks,
      {
        id: generateId(),
        type,
        blobId,
        filename: file.name,
      },
    ]);
  };

  const updateBlock = (id: string, updated: ContentBlock) => {
    onChange(blocks.map((b) => (b.id === id ? updated : b)));
  };

  const removeBlock = (id: string) => {
    onChange(blocks.filter((b) => b.id !== id));
  };

  return (
    <div className="content-blocks">
      {blocks.length === 0 && (
        <p className="empty-hint">No content yet. Add notes, images, PDFs, or links below.</p>
      )}

      {blocks.map((block) => (
        <div key={block.id} className={`content-block content-block-${block.type}`}>
          {!readOnly && (
            <button type="button" className="block-remove" onClick={() => removeBlock(block.id)} aria-label="Remove block">
              ×
            </button>
          )}

          {block.type === 'text' && (
            <RichTextField
              value={block.markdown}
              onChange={(markdown) => updateBlock(block.id, { ...block, markdown })}
              readOnly={readOnly}
              placeholder="Notes…"
              rows={6}
            />
          )}

          {block.type === 'image' && (
            <BlobImage blobId={block.blobId} alt={block.filename} />
          )}

          {block.type === 'pdf' && (
            <PdfViewer blobId={block.blobId} filename={block.filename} />
          )}

          {block.type === 'link' && (
            readOnly ? (
              <a href={block.url} target="_blank" rel="noopener noreferrer">{block.label || block.url}</a>
            ) : (
              <div className="link-fields">
                <input
                  type="text"
                  placeholder="Label"
                  value={block.label}
                  onChange={(e) => updateBlock(block.id, { ...block, label: e.target.value })}
                />
                <input
                  type="url"
                  placeholder="URL"
                  value={block.url}
                  onChange={(e) => updateBlock(block.id, { ...block, url: e.target.value })}
                />
              </div>
            )
          )}
        </div>
      ))}

      {!readOnly && (
        <div className="content-add-buttons">
          <button type="button" onClick={addText}>+ Text</button>
          <label className="file-btn">
            + Image
            <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0], 'image')} />
          </label>
          <label className="file-btn">
            + PDF
            <input type="file" accept="application/pdf" hidden onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0], 'pdf')} />
          </label>
          <button type="button" onClick={addLink}>+ Link</button>
        </div>
      )}
    </div>
  );
}
