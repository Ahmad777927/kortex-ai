import { readFile } from 'node:fs/promises';
import { inflateRawSync, inflateSync } from 'node:zlib';
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

function decodePdfEscapedString(raw: string): string {
  const withOctal = raw.replace(/\\([0-7]{1,3})/g, (_, oct: string) => {
    return String.fromCharCode(parseInt(oct, 8));
  });

  return withOctal
    .replace(/\\r\\n/g, '\n')
    .replace(/\\r/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\b/g, '\b')
    .replace(/\\f/g, '\f')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\');
}

function decodeUtf16be(buf: Buffer): string {
  const swapped = Buffer.alloc(buf.length);
  for (let i = 0; i < buf.length - 1; i += 2) {
    swapped[i] = buf[i + 1]!;
    swapped[i + 1] = buf[i]!;
  }
  return swapped.toString('utf16le');
}

function decodePdfHexString(hex: string): string {
  const cleanHex = hex.replace(/[\s\r\n]/g, '');
  if (cleanHex.length === 0) return '';
  const padded = cleanHex.length % 2 !== 0 ? cleanHex + '0' : cleanHex;
  try {
    const buf = Buffer.from(padded, 'hex');
    if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
      return decodeUtf16be(buf.subarray(2));
    }
    if (buf.length >= 4 && buf[0] === 0 && buf[2] === 0 && buf[1] !== 0 && buf[3] !== 0) {
      return decodeUtf16be(buf);
    }
    return buf.toString('latin1');
  } catch {
    return '';
  }
}

function extractTextFromStreamContent(streamText: string): string[] {
  const textParts: string[] = [];

  const singleTokenRegex = /(?:\(([^()]*)\)|<([0-9a-fA-F\s]+)>)\s*Tj/g;
  for (const match of streamText.matchAll(singleTokenRegex)) {
    if (match[1] !== undefined) {
      textParts.push(decodePdfEscapedString(match[1]));
    } else if (match[2] !== undefined) {
      const hexDecoded = decodePdfHexString(match[2]);
      if (hexDecoded) textParts.push(hexDecoded);
    }
  }

  const arrayTokenRegex = /\[(.*?)\]\s*TJ/gs;
  for (const match of streamText.matchAll(arrayTokenRegex)) {
    const body = match[1];
    if (!body) continue;

    const innerTokens = [...body.matchAll(/(?:\(([^()]*)\)|<([0-9a-fA-F\s]+)>)/g)];
    let combined = '';
    for (const tokenMatch of innerTokens) {
      if (tokenMatch[1] !== undefined) {
        combined += decodePdfEscapedString(tokenMatch[1]);
      } else if (tokenMatch[2] !== undefined) {
        combined += decodePdfHexString(tokenMatch[2]);
      }
    }
    if (combined.trim().length > 0) {
      textParts.push(combined);
    }
  }

  const quoteRegex = /(?:\(([^()]*)\)|<([0-9a-fA-F\s]+)>)\s*['"]/g;
  for (const match of streamText.matchAll(quoteRegex)) {
    if (match[1] !== undefined) {
      textParts.push(decodePdfEscapedString(match[1]));
    } else if (match[2] !== undefined) {
      const hexDecoded = decodePdfHexString(match[2]);
      if (hexDecoded) textParts.push(hexDecoded);
    }
  }

  return textParts;
}

export function extractPdfTextFromBuffer(buffer: Buffer): string {
  const textParts: string[] = [];
  const streamKeyword = Buffer.from('stream');
  const endStreamKeyword = Buffer.from('endstream');

  let searchPos = 0;
  let foundStreams = 0;

  while (searchPos < buffer.length) {
    const streamIndex = buffer.indexOf(streamKeyword, searchPos);
    if (streamIndex === -1) break;

    foundStreams += 1;
    let dataStart = streamIndex + 6;
    if (buffer[dataStart] === 0x0d && buffer[dataStart + 1] === 0x0a) {
      dataStart += 2;
    } else if (buffer[dataStart] === 0x0a || buffer[dataStart] === 0x0d) {
      dataStart += 1;
    }

    const endStreamIndex = buffer.indexOf(endStreamKeyword, dataStart);
    if (endStreamIndex === -1) break;

    let dataEnd = endStreamIndex;
    while (dataEnd > dataStart && (buffer[dataEnd - 1] === 0x0a || buffer[dataEnd - 1] === 0x0d)) {
      dataEnd -= 1;
    }

    const streamSlice = buffer.subarray(dataStart, dataEnd);
    const dictSlice = buffer.subarray(Math.max(0, streamIndex - 350), streamIndex).toString('latin1');

    let streamStr = '';
    if (/FlateDecode/i.test(dictSlice)) {
      try {
        streamStr = inflateSync(streamSlice).toString('latin1');
      } catch {
        try {
          streamStr = inflateRawSync(streamSlice).toString('latin1');
        } catch {
          streamStr = streamSlice.toString('latin1');
        }
      }
    } else {
      streamStr = streamSlice.toString('latin1');
    }

    const extracted = extractTextFromStreamContent(streamStr);
    if (extracted.length > 0) {
      textParts.push(...extracted);
    }

    searchPos = endStreamIndex + 9;
  }

  if (textParts.length === 0) {
    const fallbackContent = buffer.toString('latin1');
    const fallbackExtracted = extractTextFromStreamContent(fallbackContent);
    if (fallbackExtracted.length > 0) {
      textParts.push(...fallbackExtracted);
    }
  }

  const result = normalizeText(textParts.join('\n'));
  if (!result) {
    throw new DocumentProcessingError(
      'No extractable text found in this PDF. Please upload text, markdown, csv, or json.',
    );
  }

  return result;
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
    return extractPdfTextFromBuffer(fileBuffer);
  }

  throw new DocumentProcessingError('Unsupported mime type for processing');
}

function getChunkEnd(text: string, start: number, chunkSize: number): number {
  const tentativeEnd = Math.min(text.length, start + chunkSize);
  if (tentativeEnd >= text.length) {
    return text.length;
  }

  const boundarySearchStart = Math.max(start + Math.floor(chunkSize * 0.5), tentativeEnd - 300);

  // Priority 1: Paragraph boundary (\n\n)
  for (let index = tentativeEnd; index >= boundarySearchStart; index -= 1) {
    if (text[index] === '\n' && text[index - 1] === '\n') {
      return index + 1;
    }
  }

  // Priority 2: Sentence boundary (. or ? or ! followed by space or newline)
  for (let index = tentativeEnd; index >= boundarySearchStart; index -= 1) {
    const char = text[index];
    const prevChar = text[index - 1];
    if ((char === ' ' || char === '\n') && (prevChar === '.' || prevChar === '?' || prevChar === '!')) {
      return index + 1;
    }
  }

  // Priority 3: Line break (\n)
  for (let index = tentativeEnd; index >= boundarySearchStart; index -= 1) {
    if (text[index] === '\n') {
      return index + 1;
    }
  }

  // Priority 4: Word boundary (' ')
  for (let index = tentativeEnd; index >= boundarySearchStart; index -= 1) {
    if (text[index] === ' ') {
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

