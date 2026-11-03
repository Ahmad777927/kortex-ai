import assert from 'node:assert/strict';
import test from 'node:test';
import { Types } from 'mongoose';
import {
  rankChunksByVectorSimilarity,
  type RetrievalCandidate,
} from './retrieval.service.js';

function buildCandidate(input: {
  text: string;
  embedding: number[];
  chunkIndex: number;
}): RetrievalCandidate {
  const baseId = new Types.ObjectId();

  return {
    _id: baseId,
    documentId: new Types.ObjectId(),
    userId: new Types.ObjectId(),
    chatId: null,
    text: input.text,
    embedding: input.embedding,
    metadata: {
      chunkIndex: input.chunkIndex,
      start: input.chunkIndex * 10,
      end: input.chunkIndex * 10 + input.text.length,
      source: 'unit-test',
    },
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

test('rankChunksByVectorSimilarity returns top matches by cosine score', () => {
  const candidates = [
    buildCandidate({ text: 'perfect', embedding: [1, 0], chunkIndex: 0 }),
    buildCandidate({ text: 'partial', embedding: [0.6, 0.8], chunkIndex: 1 }),
    buildCandidate({ text: 'orthogonal', embedding: [0, 1], chunkIndex: 2 }),
  ];

  const result = rankChunksByVectorSimilarity({
    queryVector: [1, 0],
    candidates,
    topK: 2,
    minScore: 0.5,
  });

  assert.equal(result.length, 2);
  assert.equal(result[0]?.text, 'perfect');
  assert.equal(result[1]?.text, 'partial');
  assert.ok((result[0]?.score ?? 0) > (result[1]?.score ?? 0));
  assert.ok(Math.abs((result[0]?.score ?? 0) - 1) < 1e-9);
});

test('rankChunksByVectorSimilarity excludes invalid vectors and low scores', () => {
  const candidates = [
    buildCandidate({ text: 'dimension mismatch', embedding: [1, 0, 0], chunkIndex: 0 }),
    buildCandidate({ text: 'empty vector', embedding: [], chunkIndex: 1 }),
    buildCandidate({ text: 'below threshold', embedding: [0.2, 0.98], chunkIndex: 2 }),
  ];

  const result = rankChunksByVectorSimilarity({
    queryVector: [1, 0],
    candidates,
    topK: 5,
    minScore: 0.5,
  });

  assert.deepEqual(result, []);
});
