import assert from 'node:assert/strict';
import test from 'node:test';
import {
  chunkExtractedText,
  DocumentProcessingError,
} from './document-processing.js';

test('chunkExtractedText splits text with deterministic overlap', () => {
  const chunks = chunkExtractedText('abcdefghijklmnopqrst', {
    chunkSize: 8,
    overlap: 2,
    source: 'manual-note.txt',
  });

  assert.equal(chunks.length, 3);
  assert.equal(chunks[0]?.text, 'abcdefgh');
  assert.equal(chunks[1]?.text, 'ghijklmn');
  assert.equal(chunks[2]?.text, 'mnopqrst');

  assert.deepEqual(chunks.map((chunk) => chunk.metadata.start), [0, 6, 12]);
  assert.deepEqual(chunks.map((chunk) => chunk.metadata.end), [8, 14, 20]);
  assert.deepEqual(chunks.map((chunk) => chunk.metadata.source), [
    'manual-note.txt',
    'manual-note.txt',
    'manual-note.txt',
  ]);
});

test('chunkExtractedText rejects invalid overlap settings', () => {
  assert.throws(
    () =>
      chunkExtractedText('abcdef', {
        chunkSize: 4,
        overlap: 4,
        source: 'manual-note.txt',
      }),
    (error: unknown) => {
      assert.ok(error instanceof DocumentProcessingError);
      assert.equal(error.message, 'Chunk overlap must be smaller than chunk size');
      assert.equal(error.statusCode, 400);
      return true;
    },
  );
});

test('chunkExtractedText rejects empty normalized text', () => {
  assert.throws(
    () =>
      chunkExtractedText('   \n\t   ', {
        chunkSize: 8,
        overlap: 1,
        source: 'manual-note.txt',
      }),
    (error: unknown) => {
      assert.ok(error instanceof DocumentProcessingError);
      assert.equal(error.message, 'Document text is empty after normalization');
      return true;
    },
  );
});
