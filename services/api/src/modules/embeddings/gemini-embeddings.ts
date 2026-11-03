import { env } from '../../shared/config/env.js';

export class EmbeddingGenerationError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 502) {
    super(message);
    this.name = 'EmbeddingGenerationError';
    this.statusCode = statusCode;
  }
}

export async function embedTextsWithGemini(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  const modelName = env.EMBED_MODEL.startsWith('models/')
    ? env.EMBED_MODEL
    : `models/${env.EMBED_MODEL}`;

  const cleanModelForUrl = modelName.replace(/^models\//, '');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModelForUrl}:batchEmbedContents?key=${env.GEMINI_API_KEY}`;

  const requests = texts.map((text) => ({
    model: modelName,
    content: {
      parts: [{ text }],
    },
    outputDimensionality: 768,
  }));

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new EmbeddingGenerationError(
      `Gemini embedding request failed (${response.status}): ${errorBody}`,
    );
  }

  const payload = (await response.json()) as {
    embeddings?: Array<{ values?: number[] }>;
  };

  if (!payload.embeddings || !Array.isArray(payload.embeddings)) {
    throw new EmbeddingGenerationError('Gemini response missing embeddings array');
  }

  return payload.embeddings.map((item) => {
    if (!item.values || !Array.isArray(item.values)) {
      throw new EmbeddingGenerationError('Gemini returned an invalid embedding vector');
    }
    return item.values;
  });
}

