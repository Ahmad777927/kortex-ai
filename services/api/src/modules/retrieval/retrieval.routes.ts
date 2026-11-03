import { FastifyInstance } from 'fastify';
import { isValidObjectId, Types } from 'mongoose';
import { z } from 'zod';
import { requireAuthenticatedUserId } from '../auth/auth.service.js';
import { ChatModel } from '../chats/chat.model.js';
import { ChunkModel } from '../chunks/chunk.model.js';
import { DocumentModel } from '../documents/document.model.js';
import {
  embedTextsWithGemini,
  EmbeddingGenerationError,
} from '../embeddings/gemini-embeddings.js';
import { env } from '../../shared/config/env.js';
import { rankChunksByVectorSimilarity } from './retrieval.service.js';

const searchSchema = z.object({
  query: z.string().trim().min(1).max(4000),
  topK: z.coerce.number().int().min(1).max(20).default(5),
  minScore: z.coerce.number().min(-1).max(1).default(0),
  chatId: z.string().trim().optional().nullable(),
  documentId: z.string().trim().optional().nullable(),
  maxCandidates: z.coerce.number().int().min(10).max(5000).default(1000),
});

function getUserIdFromAuth(authorization?: string): string | null {
  try {
    return requireAuthenticatedUserId(authorization);
  } catch {
    return null;
  }
}

async function verifyChatAccess(userId: string, chatId: string): Promise<boolean> {
  if (!isValidObjectId(chatId)) {
    return false;
  }

  const chat = await ChatModel.findOne({
    _id: new Types.ObjectId(chatId),
    userId: new Types.ObjectId(userId),
  }).lean();

  return Boolean(chat);
}

async function verifyDocumentAccess(userId: string, documentId: string): Promise<boolean> {
  if (!isValidObjectId(documentId)) {
    return false;
  }

  const document = await DocumentModel.findOne({
    _id: new Types.ObjectId(documentId),
    userId: new Types.ObjectId(userId),
  }).lean();

  return Boolean(document);
}

export async function retrievalRoutes(app: FastifyInstance): Promise<void> {
  app.post('/search', async (request, reply) => {
    const userId = getUserIdFromAuth(request.headers.authorization);

    if (!userId) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Missing or invalid authorization token',
      });
    }

    const parsed = searchSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'ValidationError',
        message: parsed.error.flatten(),
      });
    }

    const { query, topK, minScore, chatId, documentId, maxCandidates } = parsed.data;

    if (chatId) {
      const hasChatAccess = await verifyChatAccess(userId, chatId);
      if (!hasChatAccess) {
        return reply.status(404).send({
          error: 'ChatNotFound',
          message: 'Chat not found',
        });
      }
    }

    if (documentId) {
      const hasDocumentAccess = await verifyDocumentAccess(userId, documentId);
      if (!hasDocumentAccess) {
        return reply.status(404).send({
          error: 'DocumentNotFound',
          message: 'Document not found',
        });
      }
    }

    const chunkFilter: {
      userId: Types.ObjectId;
      documentId?: Types.ObjectId;
      chatId?: Types.ObjectId;
      'embedding.0': { $exists: true };
    } = {
      userId: new Types.ObjectId(userId),
      'embedding.0': { $exists: true },
    };

    if (documentId) {
      chunkFilter.documentId = new Types.ObjectId(documentId);
    }

    if (chatId) {
      chunkFilter.chatId = new Types.ObjectId(chatId);
    }

    const candidates = await ChunkModel.find(chunkFilter)
      .sort({ createdAt: -1 })
      .limit(maxCandidates)
      .lean();

    if (candidates.length === 0) {
      return reply.status(200).send({
        query,
        results: [],
        retrieval: {
          model: env.EMBED_MODEL,
          topK,
          minScore,
          totalCandidates: 0,
          consideredCandidates: 0,
          returnedResults: 0,
        },
      });
    }

    try {
      const [queryVector] = await embedTextsWithGemini([query]);

      if (!queryVector) {
        throw new EmbeddingGenerationError('Missing query embedding vector from Gemini');
      }

      const results = rankChunksByVectorSimilarity({
        queryVector,
        candidates,
        topK,
        minScore,
      });

      return reply.status(200).send({
        query,
        results,
        retrieval: {
          model: env.EMBED_MODEL,
          topK,
          minScore,
          totalCandidates: candidates.length,
          consideredCandidates: candidates.length,
          returnedResults: results.length,
        },
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : 'Retrieval search failed';

      const statusCode =
        error instanceof EmbeddingGenerationError && error.statusCode >= 400
          ? error.statusCode
          : 500;

      return reply.status(statusCode).send({
        error: 'RetrievalSearchFailed',
        message,
      });
    }
  });
}

