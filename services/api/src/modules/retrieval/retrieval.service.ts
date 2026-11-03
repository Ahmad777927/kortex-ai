import { Types } from 'mongoose';

export interface RetrievalCandidate {
  _id: Types.ObjectId;
  documentId: Types.ObjectId;
  userId: Types.ObjectId;
  chatId: Types.ObjectId | null;
  text: string;
  embedding: number[];
  metadata: {
    chunkIndex: number;
    start: number;
    end: number;
    source: string;
  };
  createdAt: Date;
}

export interface RetrievedChunk {
  chunkId: string;
  documentId: string;
  userId: string;
  chatId: string | null;
  text: string;
  metadata: {
    chunkIndex: number;
    start: number;
    end: number;
    source: string;
  };
  createdAt: Date;
  score: number;
}

function calculateCosineSimilarity(left: number[], right: number[]): number {
  if (left.length === 0 || right.length === 0 || left.length !== right.length) {
    return Number.NEGATIVE_INFINITY;
  }

  let dotProduct = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index]!;
    const rightValue = right[index]!;

    dotProduct += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) {
    return Number.NEGATIVE_INFINITY;
  }

  return dotProduct / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

export function rankChunksByVectorSimilarity(input: {
  queryVector: number[];
  candidates: RetrievalCandidate[];
  topK: number;
  minScore: number;
}): RetrievedChunk[] {
  const scored = input.candidates
    .map((candidate) => {
      const score = calculateCosineSimilarity(input.queryVector, candidate.embedding);

      return {
        chunkId: candidate._id.toString(),
        documentId: candidate.documentId.toString(),
        userId: candidate.userId.toString(),
        chatId: candidate.chatId?.toString() ?? null,
        text: candidate.text,
        metadata: candidate.metadata,
        createdAt: candidate.createdAt,
        score,
      };
    })
    .filter((candidate) => Number.isFinite(candidate.score) && candidate.score >= input.minScore)
    .sort((left, right) => right.score - left.score)
    .slice(0, input.topK);

  return scored;
}

