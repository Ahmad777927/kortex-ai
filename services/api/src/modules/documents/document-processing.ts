import { readFile } from 'node:fs/promises';
import { DocumentDocument } from './document.model.js';

export class DocumentProcessingError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 422) {
    super(message);
    this.name = 'DocumentProcessingError';
    this.statusCode = statusCode;
  }
}

export interface ChunkingOptions {
  chunkSize: number;
  overlap: number;
  source: string;
}

export interface ExtractedChunk {
  text: string;
  metadata: {
    chunkIndex: number;
    start: number;
    end: number;
    source: string;
  };
}

function normalizeText(input: string): string {
  return input
    .replace(/\u0000/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\t/g, '  ')
    .trim();
}

function decodePdfTextToken(value: string): string {
  return value
    .replace(/\\\\/g, '\\')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\f/g, '\f');
}

function extractPdfText(buffer: Buffer): string {
  const content = buffer.toString('latin1');
  const textParts: string[] = [];

  const singleTokenRegex = /\(([^()]*)\)\s*Tj/g;
  for (const match of content.matchAll(singleTokenRegex)) {
    const token = match[1];
    if (token) {
      textParts.push(decodePdfTextToken(token));
    }
  }

  const arrayTokenRegex = /\[(.*?)\]\s*TJ/gs;
  for (const match of content.matchAll(arrayTokenRegex)) {
    const body = match[1];
    if (!body) {
      continue;
    }

    const innerTokens = [...body.matchAll(/\(([^()]*)\)/g)]
      .map((tokenMatch) => tokenMatch[1])
      .filter((token): token is string => typeof token === 'string');
    if (innerTokens.length > 0) {
      textParts.push(innerTokens.map((token) => decodePdfTextToken(token)).join(''));
    }
  }

  const extracted = normalizeText(textParts.join('\n'));
  if (!extracted) {
    throw new DocumentProcessingError(
      'No extractable text found in this PDF. Please upload text, markdown, csv, or json.',
    );
  }

  return extracted;
}

export async function extractDocumentText(document: DocumentDocument): Promise<string> {
  const fileBuffer = await readFile(document.storagePath);

  if (document.mimeType === 'text/plain') {
    return normalizeText(fileBuffer.toString('utf8'));
  }

  if (document.mimeType === 'text/markdown') {
    return normalizeText(fileBuffer.toString('utf8'));
  }

  if (document.mimeType === 'text/csv') {
    return normalizeText(fileBuffer.toString('utf8'));
  }

  if (document.mimeType === 'application/json') {
    return normalizeText(fileBuffer.toString('utf8'));
  }

  if (document.mimeType === 'application/pdf') {
    return extractPdfText(fileBuffer);
  }

  throw new DocumentProcessingError('Unsupported mime type for processing');
}

function getChunkEnd(text: string, start: number, chunkSize: number): number {
  const tentativeEnd = Math.min(text.length, start + chunkSize);
  if (tentativeEnd >= text.length) {
    return text.length;
  }

  const boundarySearchStart = Math.max(start + Math.floor(chunkSize * 0.6), tentativeEnd - 200);

  for (let index = tentativeEnd; index >= boundarySearchStart; index -= 1) {
    const character = text[index];
    if (character === '\n' || character === ' ') {
      return index;
    }
  }

  return tentativeEnd;
}

export function chunkExtractedText(text: string, options: ChunkingOptions): ExtractedChunk[] {
  const normalized = normalizeText(text);

  if (!normalized) {
    throw new DocumentProcessingError('Document text is empty after normalization');
  }

  if (options.overlap >= options.chunkSize) {
    throw new DocumentProcessingError('Chunk overlap must be smaller than chunk size', 400);
  }

  const chunks: ExtractedChunk[] = [];
  let cursor = 0;

  while (cursor < normalized.length) {
    const rawEnd = getChunkEnd(normalized, cursor, options.chunkSize);
    const segment = normalized.slice(cursor, rawEnd);
    const leftTrimCount = segment.length - segment.trimStart().length;
    const rightTrimCount = segment.length - segment.trimEnd().length;
    const start = cursor + leftTrimCount;
    const end = rawEnd - rightTrimCount;
    const chunkText = normalized.slice(start, end);

    if (chunkText.length > 0) {
      chunks.push({
        text: chunkText,
        metadata: {
          chunkIndex: chunks.length,
          start,
          end,
          source: options.source,
        },
      });
    }

    if (rawEnd >= normalized.length) {
      break;
    }

    const nextCursor = rawEnd - options.overlap;
    cursor = nextCursor > cursor ? nextCursor : cursor + 1;

    if (chunks.length > 10_000) {
      throw new DocumentProcessingError('Document generated too many chunks');
    }
  }

  if (chunks.length === 0) {
    throw new DocumentProcessingError('No valid text chunks generated from document');
  }

  return chunks;
}

