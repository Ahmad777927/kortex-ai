import { mkdir, writeFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { FastifyInstance } from 'fastify';
import { isValidObjectId, Types } from 'mongoose';
import { z } from 'zod';
import { requireAuthenticatedUserId } from '../auth/auth.service.js';
import { ChatModel } from '../chats/chat.model.js';
import { ChunkModel } from '../chunks/chunk.model.js';
import {
  embedTextsWithGemini,
  EmbeddingGenerationError,
} from '../embeddings/gemini-embeddings.js';
import { env } from '../../shared/config/env.js';
import { DocumentDocument, DocumentModel } from './document.model.js';
import {
  chunkExtractedText,
  DocumentProcessingError,
  extractDocumentText,
} from './document-processing.js';

const listDocumentsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

const processDocumentBodySchema = z.object({
  chunkSize: z.coerce.number().int().min(300).max(5000).default(env.CHUNK_SIZE_CHARS),
  overlap: z.coerce.number().int().min(0).max(1200).default(env.CHUNK_OVERLAP_CHARS),
});

const listChunksQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

const embedDocumentBodySchema = z.object({
  batchSize: z.coerce.number().int().min(1).max(64).default(12),
  force: z.coerce.boolean().default(false),
});

const uploadDocumentSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(120),
  chatId: z.string().trim().optional().nullable(),
  contentBase64: z.string().min(1),
});

const allowedMimeTypes = new Set([
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
  'application/pdf',
]);

const maxFileSizeBytes = Math.floor(env.MAX_FILE_SIZE_MB * 1024 * 1024);

function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[\\/]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[^a-zA-Z0-9._ -]/g, '_')
    .slice(0, 180);
}

function getUserIdFromAuth(authorization?: string): string | null {
  try {
    return requireAuthenticatedUserId(authorization);
  } catch {
    return null;
  }
}

function toDocumentResponse(document: DocumentDocument) {
  return {
    id: document._id.toString(),
    userId: document.userId.toString(),
    chatId: document.chatId?.toString() ?? null,
    filename: document.filename,
    mimeType: document.mimeType,
    sizeBytes: document.sizeBytes,
    status: document.status,
    error: document.error,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

function toChunkResponse(chunk: {
  _id: { toString(): string };
  documentId: { toString(): string };
  userId: { toString(): string };
  chatId: { toString(): string } | null;
  text: string;
  metadata: { chunkIndex: number; start: number; end: number; source: string };
  createdAt: Date;
}) {
  return {
    id: chunk._id.toString(),
    documentId: chunk.documentId.toString(),
    userId: chunk.userId.toString(),
    chatId: chunk.chatId?.toString() ?? null,
    text: chunk.text,
    metadata: chunk.metadata,
    createdAt: chunk.createdAt,
  };
}

function decodeBase64Payload(contentBase64: string): Buffer | null {
  try {
    const normalized = contentBase64.includes(',')
      ? contentBase64.slice(contentBase64.indexOf(',') + 1)
      : contentBase64;

    const buffer = Buffer.from(normalized, 'base64');
    return buffer.length > 0 ? buffer : null;
  } catch {
    return null;
  }
}

async function ensureChatAccess(userId: string, chatId: string): Promise<boolean> {
  if (!isValidObjectId(chatId)) {
    return false;
  }

  const chat = await ChatModel.findOne({
    _id: new Types.ObjectId(chatId),
    userId: new Types.ObjectId(userId),
  }).lean();

  return Boolean(chat);
}

export async function documentsRoutes(app: FastifyInstance): Promise<void> {
  app.post('/upload', async (request, reply) => {
    const userId = getUserIdFromAuth(request.headers.authorization);

    if (!userId) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Missing or invalid authorization token',
      });
    }

    const parsed = uploadDocumentSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        error: 'ValidationError',
        message: parsed.error.flatten(),
      });
    }

    const { filename, mimeType, contentBase64, chatId } = parsed.data;

    if (!allowedMimeTypes.has(mimeType)) {
      return reply.status(400).send({
        error: 'UnsupportedFileType',
        message: 'Only txt, md, csv, json, and pdf documents are supported',
      });
    }

    if (chatId) {
      const hasAccess = await ensureChatAccess(userId, chatId);
      if (!hasAccess) {
        return reply.status(404).send({
          error: 'ChatNotFound',
          message: 'Chat not found',
        });
      }
    }

    const binary = decodeBase64Payload(contentBase64);

    if (!binary) {
      return reply.status(400).send({
        error: 'InvalidFilePayload',
        message: 'contentBase64 is not valid base64 content',
      });
    }

    if (binary.length > maxFileSizeBytes) {
      return reply.status(413).send({
        error: 'FileTooLarge',
        message: `File exceeds max size of ${env.MAX_FILE_SIZE_MB} MB`,
      });
    }

    const cleanFilename = sanitizeFilename(filename);
    const documentId = new Types.ObjectId();

    const userUploadDir = resolve(process.cwd(), env.UPLOAD_DIR, userId);
    await mkdir(userUploadDir, { recursive: true });

    const fileExtension = extname(cleanFilename);
    const storageFilename = `${documentId.toString()}${fileExtension}`;
    const storagePath = resolve(userUploadDir, storageFilename);

    await writeFile(storagePath, binary);

    const document = await DocumentModel.create({
      _id: documentId,
      userId: new Types.ObjectId(userId),
      chatId: chatId ? new Types.ObjectId(chatId) : null,
      filename: cleanFilename,
      mimeType,
      sizeBytes: binary.length,
      storagePath,
      status: 'uploaded',
      error: null,
    });

    return reply.status(201).send({
      document: toDocumentResponse(document),
    });
  });

  app.get('/', async (request, reply) => {
    const userId = getUserIdFromAuth(request.headers.authorization);

    if (!userId) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Missing or invalid authorization token',
      });
    }

    const query = listDocumentsQuerySchema.safeParse(request.query ?? {});
    if (!query.success) {
      return reply.status(400).send({
        error: 'ValidationError',
        message: query.error.flatten(),
      });
    }

    const documents = await DocumentModel.find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .limit(query.data.limit);

    return reply.status(200).send({
      documents: documents.map(toDocumentResponse),
    });
  });

  app.post('/:documentId/process', async (request, reply) => {
    const userId = getUserIdFromAuth(request.headers.authorization);

    if (!userId) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Missing or invalid authorization token',
      });
    }

    const { documentId } = request.params as { documentId: string };
    if (!isValidObjectId(documentId)) {
      return reply.status(400).send({
        error: 'ValidationError',
        message: 'Invalid documentId',
      });
    }

    const parsed = processDocumentBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'ValidationError',
        message: parsed.error.flatten(),
      });
    }

    const { chunkSize, overlap } = parsed.data;
    if (overlap >= chunkSize) {
      return reply.status(400).send({
        error: 'ValidationError',
        message: 'overlap must be smaller than chunkSize',
      });
    }

    const document = await DocumentModel.findOne({
      _id: new Types.ObjectId(documentId),
      userId: new Types.ObjectId(userId),
    });

    if (!document) {
      return reply.status(404).send({
        error: 'DocumentNotFound',
        message: 'Document not found',
      });
    }

    document.status = 'processing';
    document.error = null;
    await document.save();

    try {
      const extractedText = await extractDocumentText(document);
      const chunks = chunkExtractedText(extractedText, {
        chunkSize,
        overlap,
        source: document.filename,
      });

      await ChunkModel.deleteMany({ documentId: document._id });
      await ChunkModel.insertMany(
        chunks.map((chunk) => ({
          documentId: document._id,
          userId: document.userId,
          chatId: document.chatId,
          text: chunk.text,
          embedding: [],
          metadata: chunk.metadata,
          createdAt: new Date(),
        })),
      );

      document.status = 'ready';
      document.error = null;
      await document.save();

      return reply.status(200).send({
        document: toDocumentResponse(document),
        processing: {
          extractedChars: extractedText.length,
          chunksCreated: chunks.length,
          chunkSize,
          overlap,
        },
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : 'Failed to process document';

      document.status = 'failed';
      document.error = message.slice(0, 1000);
      await document.save();

      const statusCode =
        error instanceof DocumentProcessingError && error.statusCode >= 400
          ? error.statusCode
          : 500;

      return reply.status(statusCode).send({
        error: 'DocumentProcessingFailed',
        message,
      });
    }
  });

  app.post('/:documentId/embed', async (request, reply) => {
    const userId = getUserIdFromAuth(request.headers.authorization);

    if (!userId) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Missing or invalid authorization token',
      });
    }

    const { documentId } = request.params as { documentId: string };
    if (!isValidObjectId(documentId)) {
      return reply.status(400).send({
        error: 'ValidationError',
        message: 'Invalid documentId',
      });
    }

    const parsed = embedDocumentBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'ValidationError',
        message: parsed.error.flatten(),
      });
    }

    const { batchSize, force } = parsed.data;

    const document = await DocumentModel.findOne({
      _id: new Types.ObjectId(documentId),
      userId: new Types.ObjectId(userId),
    });

    if (!document) {
      return reply.status(404).send({
        error: 'DocumentNotFound',
        message: 'Document not found',
      });
    }

    if (document.status !== 'ready') {
      return reply.status(409).send({
        error: 'DocumentNotReady',
        message: 'Document must be processed before generating embeddings',
      });
    }

    const chunks = await ChunkModel.find({
      documentId: document._id,
      userId: document.userId,
    }).sort({ 'metadata.chunkIndex': 1 });

    if (chunks.length === 0) {
      return reply.status(409).send({
        error: 'NoChunks',
        message: 'No chunks found for this document. Process the document first.',
      });
    }

    const targetChunks = force
      ? chunks
      : chunks.filter((chunk) => !Array.isArray(chunk.embedding) || chunk.embedding.length === 0);

    if (targetChunks.length === 0) {
      return reply.status(200).send({
        document: toDocumentResponse(document),
        embedding: {
          model: env.EMBED_MODEL,
          force,
          batchSize,
          totalChunks: chunks.length,
          embeddedChunks: 0,
          skippedChunks: chunks.length,
          embeddingDimensions: null,
        },
      });
    }

    document.status = 'processing';
    document.error = null;
    await document.save();

    let embeddedChunks = 0;
    let embeddingDimensions: number | null = null;

    try {
      for (let startIndex = 0; startIndex < targetChunks.length; startIndex += batchSize) {
        const batch = targetChunks.slice(startIndex, startIndex + batchSize);
        const vectors = await embedTextsWithGemini(batch.map((chunk) => chunk.text));

        if (vectors.length !== batch.length) {
          throw new EmbeddingGenerationError('Embedding result count does not match chunk batch');
        }

        const updates = batch.map((chunk, index) => ({
          updateOne: {
            filter: { _id: chunk._id, userId: chunk.userId },
            update: { $set: { embedding: vectors[index] } },
          },
        }));

        await ChunkModel.bulkWrite(updates, { ordered: true });

        embeddedChunks += batch.length;
        if (embeddingDimensions === null && vectors[0]) {
          embeddingDimensions = vectors[0].length;
        }
      }

      document.status = 'ready';
      document.error = null;
      await document.save();

      return reply.status(200).send({
        document: toDocumentResponse(document),
        embedding: {
          model: env.EMBED_MODEL,
          force,
          batchSize,
          totalChunks: chunks.length,
          embeddedChunks,
          skippedChunks: chunks.length - targetChunks.length,
          embeddingDimensions,
        },
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : 'Failed to generate embeddings';

      document.status = 'failed';
      document.error = message.slice(0, 1000);
      await document.save();

      const statusCode =
        error instanceof EmbeddingGenerationError && error.statusCode >= 400
          ? error.statusCode
          : 500;

      return reply.status(statusCode).send({
        error: 'EmbeddingGenerationFailed',
        message,
      });
    }
  });

  app.get('/:documentId/chunks', async (request, reply) => {
    const userId = getUserIdFromAuth(request.headers.authorization);

    if (!userId) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Missing or invalid authorization token',
      });
    }

    const { documentId } = request.params as { documentId: string };
    if (!isValidObjectId(documentId)) {
      return reply.status(400).send({
        error: 'ValidationError',
        message: 'Invalid documentId',
      });
    }

    const query = listChunksQuerySchema.safeParse(request.query ?? {});
    if (!query.success) {
      return reply.status(400).send({
        error: 'ValidationError',
        message: query.error.flatten(),
      });
    }

    const document = await DocumentModel.findOne({
      _id: new Types.ObjectId(documentId),
      userId: new Types.ObjectId(userId),
    }).lean();

    if (!document) {
      return reply.status(404).send({
        error: 'DocumentNotFound',
        message: 'Document not found',
      });
    }

    const chunks = await ChunkModel.find({
      documentId: new Types.ObjectId(documentId),
      userId: new Types.ObjectId(userId),
    })
      .sort({ 'metadata.chunkIndex': 1 })
      .limit(query.data.limit);

    return reply.status(200).send({
      chunks: chunks.map(toChunkResponse),
    });
  });
}

