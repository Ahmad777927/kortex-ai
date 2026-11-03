'use client';

import React from 'react';
import { Button } from '../../../components/ui/button';
import type { ApiDocument, ApiChunk } from '../types';

interface DocumentPreviewModalProps {
  previewDocument: ApiDocument | null;
  previewChunks: ApiChunk[];
  isPreviewChunksLoading: boolean;
  onClose: () => void;
}

export function DocumentPreviewBanner({
  previewDocument,
  previewChunks,
  isPreviewChunksLoading,
  onClose,
}: DocumentPreviewModalProps) {
  if (!previewDocument) return null;

  return (
    <div className="border-b border-border bg-surface-2 px-4 py-3 md:px-6">
      <div className="flex items-center justify-between gap-3">
        <p className="line-clamp-1 text-sm font-medium">Preview: {previewDocument.filename}</p>
        <Button type="button" variant="outline" size="sm" onClick={onClose} className="h-7 px-2 text-xs">
          Close
        </Button>
      </div>

      <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-border bg-surface p-2 text-xs leading-6">
        {isPreviewChunksLoading ? (
          <p className="text-text-muted">Loading chunks…</p>
        ) : previewChunks.length === 0 ? (
          <p className="text-text-muted">No chunks available yet. Process and embed this document.</p>
        ) : (
          previewChunks.slice(0, 5).map((chunk) => (
            <article key={chunk.id} className="border-b border-border/60 py-1 last:border-b-0">
              <p className="font-medium text-text-muted">
                Chunk {chunk.metadata.chunkIndex} • {chunk.metadata.source}
              </p>
              <p className="line-clamp-3 whitespace-pre-wrap">{chunk.text}</p>
            </article>
          ))
        )}
      </div>
    </div>
  );
}

