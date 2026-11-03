import { FastifyInstance } from 'fastify';
import { isValidObjectId, Types } from 'mongoose';
import { z } from 'zod';
import { requireAuthenticatedUserId } from '../auth/auth.service.js';
import { ChatModel, ChatDocument } from './chat.model.js';
import { ChunkModel } from '../chunks/chunk.model.js';
import { DocumentModel } from '../documents/document.model.js';
import {
  embedTextsWithGemini,
  EmbeddingGenerationError,
} from '../embeddings/gemini-embeddings.js';
import { MessageDocument, MessageModel, MessageRole } from '../messages/message.model.js';
import {
  rankChunksByVectorSimilarity,
  type RetrievedChunk,
  type RetrievalCandidate,
} from '../retrieval/retrieval.service.js';
import { env } from '../../shared/config/env.js';

const createChatSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  model: z.string().trim().min(1).max(120).optional(),
  systemPrompt: z.string().trim().max(4000).nullable().optional(),
});

const listChatsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

const listMessagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

const ragSettingsSchema = z.object({
  enabled: z.coerce.boolean().default(true),
  topK: z.coerce.number().int().min(1).max(20).default(env.RAG_TOP_K),
  minScore: z.coerce.number().min(-1).max(1).default(env.RAG_MIN_SCORE),
  maxCandidates: z.coerce
    .number()
    .int()
    .min(10)
    .max(5000)
    .default(env.RAG_MAX_CANDIDATES),
});

const sendMessageSchema = z.object({
  content: z.string().trim().min(1).max(12_000),
  rag: ragSettingsSchema.optional(),
  stream: z.coerce.boolean().optional().default(false),
});

const regenerateMessageSchema = z.object({
  rag: ragSettingsSchema.optional(),
  stream: z.coerce.boolean().optional().default(false),
});

const updateChatModelSchema = z.object({
  model: z.string().trim().min(1).max(120),
});

const updateChatTitleSchema = z.object({
  title: z.string().trim().min(1).max(120),
});

type ChatRole = 'system' | 'user' | 'assistant';

interface ChatMessage {
  role: ChatRole;
  content: string;
}

interface ChatCitationResponse {
  documentId: string;
  chunkId: string;
  score: number;
}

const MIN_EFFECTIVE_RAG_SCORE = 0.12;
const SMALL_TALK_PHRASES = new Set([
  'hi',
  'hii',
  'hello',
  'hey',
  'yo',
  'ok',
  'okay',
  'thanks',
  'thankyou',
  'thank you',
  'good morning',
  'good afternoon',
  'good evening',
  'how are you',
  'how are you doing',
  'hii how are you',
  'hi how are you',
  'hello how are you',
  'hey how are you',
]);

const DEFAULT_ASSISTANT_SYSTEM_PROMPT = [
  'You are a helpful, warm, and highly capable AI assistant, similar to ChatGPT.',
  'Adopt a natural, friendly, and conversational tone.',
  'Direct Intent Fulfillment: When the user asks a question, gives a prompt, or requests a task (such as building an app, writing code, or explaining a topic), jump directly into the solution. NEVER say "I am doing well", "I\'m doing well, thank you!", or "How can I help you today?" unless the user specifically and solely asked how you are feeling (e.g. "how are you"). If the prompt contains a task or request, fulfill the request immediately without chit-chat, conversational filler, or unrequested greetings.',
  'Follow user intent directly with clear, practical, and well-structured answers.',
  'When writing code, provide clean, modern, and production-ready implementations with concise explanations.',
  'MODULAR COMPONENT ARCHITECTURE: When asked to build, create, or design websites, web applications, or user interfaces (such as in React, Next.js, Vue, etc.), NEVER dump the entire application into a single monolithic file (like App.js). ALWAYS split the solution into clean, modular component format with separate code blocks for each component (e.g., `components/Navbar.jsx`, `components/Hero.jsx`, `components/Features.jsx`, `components/Footer.jsx`, and a concise `App.jsx` that imports and composes them). Label each component clearly with its file path at the top of its code block (e.g. ````jsx // components/Navbar.jsx```` or `### components/Navbar.jsx`).',
  'Do not invent facts, medical claims, measurements, options, or source citations.',
  'Do not output multiple-choice options unless the user explicitly asks for a quiz or options.',
  'If the question is health-related, provide general educational guidance only, avoid diagnosis, and recommend consulting a qualified clinician for personalized advice.',
  'When the user is a minor, avoid risky or extreme recommendations and keep guidance age-appropriate.',
  'If context is missing or uncertain, say so clearly instead of guessing.',
].join('\n');

function shouldUseGroundingForQuery(query: string): boolean {
  const trimmed = query.trim();

  if (trimmed.length === 0) {
    return false;
  }

  const normalized = trimmed.toLowerCase();
  const words = normalized.split(/\s+/).filter(Boolean);
  const alphaNumericChars = normalized.replace(/[^a-z0-9]/g, '');

  if (alphaNumericChars.length < 4) {
    return false;
  }

  if (SMALL_TALK_PHRASES.has(normalized)) {
    return false;
  }

  if (words.length <= 2 && alphaNumericChars.length <= 10) {
    return false;
  }

  return true;
}

function isSmallTalkQuery(query: string): boolean {
  const trimmed = query.trim();

  if (trimmed.length === 0) {
    return false;
  }

  const normalized = trimmed.toLowerCase();
  if (SMALL_TALK_PHRASES.has(normalized)) {
    return true;
  }

  const words = normalized.split(/\s+/).filter(Boolean);
  const alphaNumericChars = normalized.replace(/[^a-z0-9]/g, '');

  return words.length <= 2 && alphaNumericChars.length <= 10;
}

function buildSmallTalkOnlyHistory(chat: ChatDocument, userText: string): ChatMessage[] {
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: DEFAULT_ASSISTANT_SYSTEM_PROMPT,
    },
  ];

  if (chat.systemPrompt) {
    messages.push({
      role: 'system',
      content: chat.systemPrompt,
    });
  }

  messages.push({
    role: 'user',
    content: userText,
  });

  return messages;
}

function normalizeAssistantContent(content: string, userQuery?: string): string {
  let normalized = content.replace(/\r\n/g, '\n').trim();

  // Strip robotic "I am an AI and I don't have feelings" boilerplate without injecting "I'm doing well"
  normalized = normalized.replace(
    /(?:Hello!|Hi!|Hey!)?\s*I(?:'m| am) just a (?:computer program|bot|language model|AI)[^.]*?(?:feelings|emotions)[^.]*?\.\s*(?:However,?\s*)?(?:I(?:'m| am) (?:here and )?ready to help(?: you)?\.?)?/gi,
    '',
  );

  // If user did NOT explicitly ask "how are you", strip any unsolicited "I'm doing well, thank you!" at the beginning
  const isAskingHowAreYou = Boolean(userQuery && /how\s+are\s+you/i.test(userQuery));
  if (!isAskingHowAreYou) {
    normalized = normalized.replace(
      /^(?:Thinking with sources…|Thinking…|Regenerating with sources…|Regenerating…)?\s*(?:(?:Hello!|Hi!|Hey!)?\s*I(?:'m| am) doing well(?:, thank you)?!?(?:\s*How can I help you(?: today)?\??)?)\s*/i,
      '',
    );
  }

  // Also strip any accidental "Thinking with sources..." prefix
  normalized = normalized.replace(/^(?:Thinking with sources…|Thinking…|Regenerating with sources…|Regenerating…)\s*/i, '');

  const withResolvedEscapes = normalized.includes('\n')
    ? normalized
    : normalized.replace(/\\n/g, '\n');

  return withResolvedEscapes.replace(/\n{3,}/g, '\n\n').trim();
}

function getUserIdFromAuth(authorization?: string): string | null {
  try {
    return requireAuthenticatedUserId(authorization);
  } catch {
    return null;
  }
}

function toChatResponse(chat: ChatDocument) {
  return {
    id: chat._id.toString(),
    userId: chat.userId.toString(),
    title: chat.title,
    model: chat.model,
    systemPrompt: chat.systemPrompt,
    lastMessageAt: chat.lastMessageAt,
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
  };
}

function toStringId(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (value && typeof value === 'object' && 'toString' in value) {
    const stringValue = (value as { toString(): string }).toString();
    return stringValue;
  }

  return '';
}

function toMessageResponse(message: MessageDocument) {
  const citations: ChatCitationResponse[] = message.citations.map((citation) => ({
    documentId: toStringId(citation.documentId),
    chunkId: toStringId(citation.chunkId),
    score: citation.score,
  }));

  return {
    id: message._id.toString(),
    chatId: message.chatId.toString(),
    role: message.role,
    content: message.content,
    tokensIn: message.tokensIn,
    tokensOut: message.tokensOut,
    latencyMs: message.latencyMs,
    citations,
    createdAt: message.createdAt,
  };
}

function toChatRole(role: MessageRole): ChatRole | null {
  if (role === 'user' || role === 'assistant' || role === 'system') {
    return role;
  }

  return null;
}

function buildGroundedSystemMessage(query: string, chunks: RetrievedChunk[]): ChatMessage | null {
  if (chunks.length === 0) {
    return null;
  }

  const contextBlocks: string[] = [];
  let usedCharacters = 0;

  for (const [index, chunk] of chunks.entries()) {
    const sourceId = index + 1;
    const remaining = env.RAG_CONTEXT_MAX_CHARS - usedCharacters;

    if (remaining <= 0) {
      break;
    }

    const chunkText = chunk.text.slice(0, remaining);
    if (!chunkText.trim()) {
      continue;
    }

    contextBlocks.push(
      `[source ${sourceId}] doc=${chunk.documentId} chunk=${chunk.chunkId} score=${chunk.score.toFixed(4)}\n${chunkText}`,
    );
    usedCharacters += chunkText.length;
  }

  if (contextBlocks.length === 0) {
    return null;
  }

  return {
    role: 'system',
    content: [
      'You are a grounded assistant.',
      'Use the provided source context only when it is relevant and do not fabricate sources.',
      'If the retrieved context is weak or unrelated to the user query, ignore it and answer from general knowledge.',
      'Never let retrieved context override safety, accuracy, or user intent.',
      'If context is insufficient, explicitly say you do not have enough source context.',
      'When you rely on the context, cite source labels like [source 1].',
      '',
      `User Query: ${query}`,
      '',
      'Source Context:',
      contextBlocks.join('\n\n'),
    ].join('\n'),
  };
}

async function retrieveGroundingChunks(input: {
  userId: string;
  chatId: string;
  query: string;
  topK: number;
  minScore: number;
  maxCandidates: number;
}): Promise<RetrievedChunk[]> {
  const candidates = await ChunkModel.find({
    userId: new Types.ObjectId(input.userId),
    'embedding.0': { $exists: true },
    $or: [{ chatId: new Types.ObjectId(input.chatId) }, { chatId: null }],
  })
    .sort({ createdAt: -1 })
    .limit(input.maxCandidates)
    .lean();

  if (candidates.length === 0) {
    return [];
  }

  const [queryVector] = await embedTextsWithGemini([input.query]);
  if (!queryVector) {
    throw new EmbeddingGenerationError('Missing query embedding for grounded retrieval');
  }

  return rankChunksByVectorSimilarity({
    queryVector,
    candidates: candidates as RetrievalCandidate[],
    topK: input.topK,
    minScore: input.minScore,
  });
}

async function buildChatHistory(
  chat: ChatDocument,
  groundedMessage?: ChatMessage | null,
): Promise<ChatMessage[]> {
  const recentMessages = await MessageModel.find({ chatId: chat._id })
    .sort({ createdAt: -1 })
    .limit(40)
    .lean();

  const history = [...recentMessages].reverse();
  const chatMessages: ChatMessage[] = [];

  chatMessages.push({
    role: 'system',
    content: DEFAULT_ASSISTANT_SYSTEM_PROMPT,
  });

  if (chat.systemPrompt) {
    chatMessages.push({
      role: 'system',
      content: chat.systemPrompt,
    });
  }

  if (groundedMessage) {
    chatMessages.push(groundedMessage);
  }

  for (const message of history) {
    const role = toChatRole(message.role);
    if (!role) {
      continue;
    }

    chatMessages.push({
      role,
      content: message.content,
    });
  }

  return chatMessages;
}

async function buildChatHistoryUntil(
  chat: ChatDocument,
  maxCreatedAt: Date,
  groundedMessage?: ChatMessage | null,
): Promise<ChatMessage[]> {
  const recentMessages = await MessageModel.find({
    chatId: chat._id,
    createdAt: { $lte: maxCreatedAt },
  })
    .sort({ createdAt: -1 })
    .limit(40)
    .lean();

  const history = [...recentMessages].reverse();
  const chatMessages: ChatMessage[] = [];

  chatMessages.push({
    role: 'system',
    content: DEFAULT_ASSISTANT_SYSTEM_PROMPT,
  });

  if (chat.systemPrompt) {
    chatMessages.push({
      role: 'system',
      content: chat.systemPrompt,
    });
  }

  if (groundedMessage) {
    chatMessages.push(groundedMessage);
  }

  for (const message of history) {
    const role = toChatRole(message.role);
    if (!role) {
      continue;
    }

    chatMessages.push({
      role,
      content: message.content,
    });
  }

  return chatMessages;
}

function toGeminiModelName(model: string): string {
  if (!model || model.includes('qwen') || model.includes('lfm') || model.includes('llama') || !model.includes('gemini')) {
    return env.CHAT_MODEL;
  }
  return model.replace(/^models\//, '');
}

function convertToGeminiContents(messages: ChatMessage[]): {
  systemInstruction?: { parts: Array<{ text: string }> };
  contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>;
} {
  const systemParts: string[] = [];
  const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      if (msg.content.trim()) {
        systemParts.push(msg.content.trim());
      }
    } else {
      const geminiRole = msg.role === 'assistant' ? 'model' : 'user';
      const text = msg.content.trim();
      if (!text) continue;

      const last = contents[contents.length - 1];
      if (last && last.role === geminiRole) {
        last.parts[0]!.text += `\n\n${text}`;
      } else {
        contents.push({ role: geminiRole, parts: [{ text }] });
      }
    }
  }

  while (contents.length > 0 && contents[0]!.role !== 'user') {
    contents.shift();
  }

  return {
    systemInstruction:
      systemParts.length > 0
        ? { parts: [{ text: systemParts.join('\n\n') }] }
        : undefined,
    contents,
  };
}

async function executeGenerateAssistantReply(
  targetModel: string,
  messages: ChatMessage[],
): Promise<{ content: string; latencyMs: number }> {
  const startedAt = Date.now();
  const geminiPayload = convertToGeminiContents(messages);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${env.GEMINI_API_KEY}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...geminiPayload,
      generationConfig: {
        temperature: 0.7,
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${errorBody}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };

  const text = data.candidates?.[0]?.content?.parts
    ?.map((p) => p.text ?? '')
    .join('')
    .trim();

  if (!text) {
    throw new Error('Gemini response missing assistant content');
  }

  return {
    content: text,
    latencyMs: Date.now() - startedAt,
  };
}

async function generateAssistantReply(
  model: string,
  messages: ChatMessage[],
): Promise<{ content: string; latencyMs: number }> {
  const targetModel = toGeminiModelName(model);
  const fallbackModel = toGeminiModelName(env.FALLBACK_MODEL);

  try {
    return await executeGenerateAssistantReply(targetModel, messages);
  } catch (primaryError: unknown) {
    if (targetModel !== fallbackModel) {
      try {
        return await executeGenerateAssistantReply(fallbackModel, messages);
      } catch {
        throw primaryError;
      }
    }
    throw primaryError;
  }
}

function deriveFallbackTitle(userPrompt: string): string {
  const singleLine = userPrompt.trim().split('\n')[0]?.trim() ?? '';
  if (!singleLine) return 'New Chat';
  if (singleLine.length <= 36) return singleLine;
  return `${singleLine.slice(0, 33)}...`;
}

async function generateChatTitle(model: string, userPrompt: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);
  const targetModel = toGeminiModelName(model);

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${env.GEMINI_API_KEY}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `Summarize the following user request into a concise 2 to 5 word title for a chat conversation. Return ONLY the title text and nothing else. Do not reply to the message.\n\nUser request: ${userPrompt.slice(0, 500)}`,
              },
            ],
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return deriveFallbackTitle(userPrompt);
    }

    const data = (await response.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string }>;
        };
      }>;
    };

    const rawTitle = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!rawTitle) {
      return deriveFallbackTitle(userPrompt);
    }

    const cleaned = rawTitle
      .replace(/^["'`#*\s]+|["'`#*\s]+$/g, '')
      .replace(/^(Title|Topic):\s*/i, '')
      .split('\n')[0]
      ?.trim();

    if (!cleaned) {
      return deriveFallbackTitle(userPrompt);
    }

    return cleaned.slice(0, 80);
  } catch {
    return deriveFallbackTitle(userPrompt);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function executeStreamAssistantReply(
  targetModel: string,
  messages: ChatMessage[],
  onChunk: (delta: string) => void,
  signal?: AbortSignal,
): Promise<{ content: string; latencyMs: number }> {
  const startedAt = Date.now();
  const geminiPayload = convertToGeminiContents(messages);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:streamGenerateContent?alt=sse&key=${env.GEMINI_API_KEY}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...geminiPayload,
      generationConfig: {
        temperature: 0.7,
      },
    }),
    signal,
  });

  if (!response.ok || !response.body) {
    const errorBody = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${errorBody}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let accumulatedContent = '';
  let buffer = '';

  try {
    while (true) {
      if (signal?.aborted) break;

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;

        const dataStr = trimmed.slice(5).trim();
        if (!dataStr) continue;

        try {
          const parsed = JSON.parse(dataStr) as {
            candidates?: Array<{
              content?: {
                parts?: Array<{ text?: string }>;
              };
            }>;
          };

          const textParts = parsed.candidates?.[0]?.content?.parts;
          if (textParts && textParts.length > 0) {
            for (const part of textParts) {
              if (part.text) {
                accumulatedContent += part.text;
                onChunk(part.text);
              }
            }
          }
        } catch {
          // ignore malformed chunk
        }
      }
    }
  } catch (readError) {
    if (signal?.aborted) {
      // Stopped by client
    } else {
      throw readError;
    }
  }

  if (buffer.trim() && !signal?.aborted && buffer.trim().startsWith('data:')) {
    try {
      const dataStr = buffer.trim().slice(5).trim();
      const parsed = JSON.parse(dataStr) as {
        candidates?: Array<{
          content?: {
            parts?: Array<{ text?: string }>;
          };
        }>;
      };
      const textParts = parsed.candidates?.[0]?.content?.parts;
      if (textParts && textParts.length > 0) {
        for (const part of textParts) {
          if (part.text) {
            accumulatedContent += part.text;
            onChunk(part.text);
          }
        }
      }
    } catch {
      // ignore
    }
  }

  return {
    content: accumulatedContent,
    latencyMs: Date.now() - startedAt,
  };
}

async function streamAssistantReply(
  model: string,
  messages: ChatMessage[],
  onChunk: (delta: string) => void,
  signal?: AbortSignal,
): Promise<{ content: string; latencyMs: number }> {
  const targetModel = toGeminiModelName(model);
  const fallbackModel = toGeminiModelName(env.FALLBACK_MODEL);

  let streamYieldedChunk = false;
  const wrappedOnChunk = (delta: string) => {
    streamYieldedChunk = true;
    onChunk(delta);
  };

  try {
    return await executeStreamAssistantReply(targetModel, messages, wrappedOnChunk, signal);
  } catch (primaryError: unknown) {
    if (!streamYieldedChunk && targetModel !== fallbackModel && !signal?.aborted) {
      try {
        return await executeStreamAssistantReply(fallbackModel, messages, onChunk, signal);
      } catch {
        throw primaryError;
      }
    }
    throw primaryError;
  }
}

export async function chatsRoutes(app: FastifyInstance): Promise<void> {
  app.post('/', async (request, reply) => {
    const userId = getUserIdFromAuth(request.headers.authorization);
    if (!userId) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Missing or invalid authorization token',
      });
    }

    const parsed = createChatSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'ValidationError',
        message: parsed.error.flatten(),
      });
    }

    const chat = await ChatModel.create({
      userId: new Types.ObjectId(userId),
      title: parsed.data.title ?? 'New Chat',
      model: parsed.data.model ?? env.CHAT_MODEL,
      systemPrompt: parsed.data.systemPrompt ?? null,
      lastMessageAt: new Date(),
    });

    return reply.status(201).send({
      chat: toChatResponse(chat),
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

    const query = listChatsQuerySchema.safeParse(request.query ?? {});
    if (!query.success) {
      return reply.status(400).send({
        error: 'ValidationError',
        message: query.error.flatten(),
      });
    }

    const chats = await ChatModel.find({ userId: new Types.ObjectId(userId) })
      .sort({ lastMessageAt: -1 })
      .limit(query.data.limit);

    return reply.status(200).send({
      chats: chats.map(toChatResponse),
    });
  });

  app.get('/:chatId/messages', async (request, reply) => {
    const userId = getUserIdFromAuth(request.headers.authorization);
    if (!userId) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Missing or invalid authorization token',
      });
    }

    const { chatId } = request.params as { chatId: string };
    if (!isValidObjectId(chatId)) {
      return reply.status(400).send({
        error: 'ValidationError',
        message: 'Invalid chatId',
      });
    }

    const query = listMessagesQuerySchema.safeParse(request.query ?? {});
    if (!query.success) {
      return reply.status(400).send({
        error: 'ValidationError',
        message: query.error.flatten(),
      });
    }

    const chat = await ChatModel.findOne({
      _id: new Types.ObjectId(chatId),
      userId: new Types.ObjectId(userId),
    });

    if (!chat) {
      return reply.status(404).send({
        error: 'ChatNotFound',
        message: 'Chat not found',
      });
    }

    const messages = await MessageModel.find({ chatId: chat._id })
      .sort({ createdAt: -1 })
      .limit(query.data.limit);

    return reply.status(200).send({
      messages: messages.reverse().map(toMessageResponse),
    });
  });

  app.put('/:chatId/model', async (request, reply) => {
    const userId = getUserIdFromAuth(request.headers.authorization);
    if (!userId) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Missing or invalid authorization token',
      });
    }

    const { chatId } = request.params as { chatId: string };
    if (!isValidObjectId(chatId)) {
      return reply.status(400).send({
        error: 'ValidationError',
        message: 'Invalid chatId',
      });
    }

    const parsed = updateChatModelSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'ValidationError',
        message: parsed.error.flatten(),
      });
    }

    const chat = await ChatModel.findOne({
      _id: new Types.ObjectId(chatId),
      userId: new Types.ObjectId(userId),
    });

    if (!chat) {
      return reply.status(404).send({
        error: 'ChatNotFound',
        message: 'Chat not found',
      });
    }

    chat.set('model', parsed.data.model);
    await chat.save();

    return reply.status(200).send({
      chat: toChatResponse(chat),
    });
  });

  app.put('/:chatId/title', async (request, reply) => {
    const userId = getUserIdFromAuth(request.headers.authorization);
    if (!userId) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Missing or invalid authorization token',
      });
    }

    const { chatId } = request.params as { chatId: string };
    if (!isValidObjectId(chatId)) {
      return reply.status(400).send({
        error: 'ValidationError',
        message: 'Invalid chatId',
      });
    }

    const parsed = updateChatTitleSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'ValidationError',
        message: parsed.error.flatten(),
      });
    }

    const chat = await ChatModel.findOne({
      _id: new Types.ObjectId(chatId),
      userId: new Types.ObjectId(userId),
    });

    if (!chat) {
      return reply.status(404).send({
        error: 'ChatNotFound',
        message: 'Chat not found',
      });
    }

    chat.set('title', parsed.data.title);
    await chat.save();

    return reply.status(200).send({
      chat: toChatResponse(chat),
    });
  });

  app.put('/:chatId/system-prompt', async (request, reply) => {
    const userId = getUserIdFromAuth(request.headers.authorization);
    if (!userId) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Missing or invalid authorization token',
      });
    }

    const { chatId } = request.params as { chatId: string };
    if (!isValidObjectId(chatId)) {
      return reply.status(400).send({
        error: 'ValidationError',
        message: 'Invalid chatId',
      });
    }

    const bodySchema = z.object({
      systemPrompt: z.string().trim().max(4000).nullable().optional(),
    });

    const parsed = bodySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'ValidationError',
        message: parsed.error.flatten(),
      });
    }

    const chat = await ChatModel.findOne({
      _id: new Types.ObjectId(chatId),
      userId: new Types.ObjectId(userId),
    });

    if (!chat) {
      return reply.status(404).send({
        error: 'ChatNotFound',
        message: 'Chat not found',
      });
    }

    chat.set('systemPrompt', parsed.data.systemPrompt || null);
    await chat.save();

    return reply.status(200).send({
      chat: toChatResponse(chat),
    });
  });

  app.delete('/:chatId', async (request, reply) => {
    const userId = getUserIdFromAuth(request.headers.authorization);
    if (!userId) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Missing or invalid authorization token',
      });
    }

    const { chatId } = request.params as { chatId: string };
    if (!isValidObjectId(chatId)) {
      return reply.status(400).send({
        error: 'ValidationError',
        message: 'Invalid chatId',
      });
    }

    const chatObjectId = new Types.ObjectId(chatId);

    const chat = await ChatModel.findOne({
      _id: chatObjectId,
      userId: new Types.ObjectId(userId),
    });

    if (!chat) {
      return reply.status(404).send({
        error: 'ChatNotFound',
        message: 'Chat not found',
      });
    }

    const [removedMessages, detachedDocuments, detachedChunks] = await Promise.all([
      MessageModel.deleteMany({ chatId: chatObjectId }),
      DocumentModel.updateMany(
        {
          userId: new Types.ObjectId(userId),
          chatId: chatObjectId,
        },
        {
          $set: {
            chatId: null,
          },
        },
      ),
      ChunkModel.updateMany(
        {
          userId: new Types.ObjectId(userId),
          chatId: chatObjectId,
        },
        {
          $set: {
            chatId: null,
          },
        },
      ),
    ]);

    await chat.deleteOne();

    return reply.status(200).send({
      deletedChatId: chatId,
      removedMessages: removedMessages.deletedCount ?? 0,
      detachedDocuments: detachedDocuments.modifiedCount ?? 0,
      detachedChunks: detachedChunks.modifiedCount ?? 0,
    });
  });

  app.post('/:chatId/messages/regenerate', async (request, reply) => {
    const userId = getUserIdFromAuth(request.headers.authorization);
    if (!userId) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Missing or invalid authorization token',
      });
    }

    const { chatId } = request.params as { chatId: string };
    if (!isValidObjectId(chatId)) {
      return reply.status(400).send({
        error: 'ValidationError',
        message: 'Invalid chatId',
      });
    }

    const parsed = regenerateMessageSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'ValidationError',
        message: parsed.error.flatten(),
      });
    }

    const chat = await ChatModel.findOne({
      _id: new Types.ObjectId(chatId),
      userId: new Types.ObjectId(userId),
    });

    if (!chat) {
      return reply.status(404).send({
        error: 'ChatNotFound',
        message: 'Chat not found',
      });
    }

    const latestUserMessage = await MessageModel.findOne({
      chatId: chat._id,
      role: 'user',
    }).sort({ createdAt: -1 });

    if (!latestUserMessage) {
      return reply.status(400).send({
        error: 'RegenerateUnavailable',
        message: 'No user message found to regenerate from',
      });
    }

    const ragConfig = {
      enabled: parsed.data.rag?.enabled ?? true,
      topK: parsed.data.rag?.topK ?? env.RAG_TOP_K,
      minScore: Math.max(parsed.data.rag?.minScore ?? env.RAG_MIN_SCORE, MIN_EFFECTIVE_RAG_SCORE),
      maxCandidates: parsed.data.rag?.maxCandidates ?? env.RAG_MAX_CANDIDATES,
    };

    const groundingEnabled =
      ragConfig.enabled && shouldUseGroundingForQuery(latestUserMessage.content);
    const isSmallTalk = isSmallTalkQuery(latestUserMessage.content);

    try {
      const groundingChunks = groundingEnabled
        ? await retrieveGroundingChunks({
            userId,
            chatId,
            query: latestUserMessage.content,
            topK: ragConfig.topK,
            minScore: ragConfig.minScore,
            maxCandidates: ragConfig.maxCandidates,
          })
        : [];

      const groundedSystemMessage = buildGroundedSystemMessage(
        latestUserMessage.content,
        groundingChunks,
      );

      const chatMessages = isSmallTalk
        ? buildSmallTalkOnlyHistory(chat, latestUserMessage.content)
        : await buildChatHistoryUntil(chat, latestUserMessage.createdAt, groundedSystemMessage);

      const isStreaming = Boolean(
        parsed.data.stream || request.headers.accept?.includes('text/event-stream'),
      );

      if (isStreaming) {
        reply.raw.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
        reply.raw.setHeader('Connection', 'keep-alive');
        reply.raw.flushHeaders?.();

        const abortController = new AbortController();
        request.raw.on('close', () => {
          if (!reply.raw.writableEnded) {
            abortController.abort();
          }
        });

        const sendEvent = (event: string, data: unknown) => {
          reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        };

        try {
          const assistantReply = await streamAssistantReply(
            chat.model,
            chatMessages,
            (delta) => {
              sendEvent('token', { delta });
            },
            abortController.signal,
          );

          const citations = groundingChunks
            .filter((chunk) => isValidObjectId(chunk.documentId) && isValidObjectId(chunk.chunkId))
            .map((chunk) => ({
              documentId: new Types.ObjectId(chunk.documentId),
              chunkId: new Types.ObjectId(chunk.chunkId),
              score: chunk.score,
            }));

          const assistantMessage = await MessageModel.create({
            chatId: chat._id,
            role: 'assistant',
            content: normalizeAssistantContent(assistantReply.content, latestUserMessage.content),
            tokensIn: null,
            tokensOut: null,
            latencyMs: assistantReply.latencyMs,
            citations,
            createdAt: new Date(),
          });

          const cleanupResult = await MessageModel.deleteMany({
            chatId: chat._id,
            role: 'assistant',
            createdAt: { $gt: latestUserMessage.createdAt },
            _id: { $ne: assistantMessage._id },
          });

          chat.lastMessageAt = assistantMessage.createdAt;
          await chat.save();

          sendEvent('done', {
            userMessage: toMessageResponse(latestUserMessage),
            assistantMessage: toMessageResponse(assistantMessage),
            regenerated: true,
            removedAssistantMessages: cleanupResult.deletedCount ?? 0,
            grounding: {
              enabled: groundingEnabled,
              contextChunks: citations.length,
            },
          });
          reply.raw.end();
          return reply;
        } catch (streamError) {
          app.log.error(streamError);
          sendEvent('error', {
            error: 'ModelRequestFailed',
            message: 'Failed to regenerate assistant response from Gemini',
          });
          reply.raw.end();
          return reply;
        }
      }

      const assistantReply = await generateAssistantReply(chat.model, chatMessages);

      const citations = groundingChunks
        .filter((chunk) => isValidObjectId(chunk.documentId) && isValidObjectId(chunk.chunkId))
        .map((chunk) => ({
          documentId: new Types.ObjectId(chunk.documentId),
          chunkId: new Types.ObjectId(chunk.chunkId),
          score: chunk.score,
        }));

      const assistantMessage = await MessageModel.create({
        chatId: chat._id,
        role: 'assistant',
        content: normalizeAssistantContent(assistantReply.content, latestUserMessage.content),
        tokensIn: null,
        tokensOut: null,
        latencyMs: assistantReply.latencyMs,
        citations,
        createdAt: new Date(),
      });

      const cleanupResult = await MessageModel.deleteMany({
        chatId: chat._id,
        role: 'assistant',
        createdAt: { $gt: latestUserMessage.createdAt },
        _id: { $ne: assistantMessage._id },
      });

      chat.lastMessageAt = assistantMessage.createdAt;
      await chat.save();

      return reply.status(201).send({
        userMessage: toMessageResponse(latestUserMessage),
        assistantMessage: toMessageResponse(assistantMessage),
        regenerated: true,
        removedAssistantMessages: cleanupResult.deletedCount ?? 0,
        grounding: {
          enabled: groundingEnabled,
          contextChunks: citations.length,
        },
      });
    } catch (error: unknown) {
      app.log.error(error);

      return reply.status(502).send({
        error: 'ModelRequestFailed',
        message: 'Failed to regenerate assistant response from Gemini',
      });
    }
  });

  app.post('/:chatId/messages', async (request, reply) => {
    const userId = getUserIdFromAuth(request.headers.authorization);
    if (!userId) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Missing or invalid authorization token',
      });
    }

    const { chatId } = request.params as { chatId: string };
    if (!isValidObjectId(chatId)) {
      return reply.status(400).send({
        error: 'ValidationError',
        message: 'Invalid chatId',
      });
    }

    const parsed = sendMessageSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'ValidationError',
        message: parsed.error.flatten(),
      });
    }

    const chat = await ChatModel.findOne({
      _id: new Types.ObjectId(chatId),
      userId: new Types.ObjectId(userId),
    });

    if (!chat) {
      return reply.status(404).send({
        error: 'ChatNotFound',
        message: 'Chat not found',
      });
    }

    const now = new Date();

    const ragConfig = {
      enabled: parsed.data.rag?.enabled ?? true,
      topK: parsed.data.rag?.topK ?? env.RAG_TOP_K,
      minScore: Math.max(parsed.data.rag?.minScore ?? env.RAG_MIN_SCORE, MIN_EFFECTIVE_RAG_SCORE),
      maxCandidates: parsed.data.rag?.maxCandidates ?? env.RAG_MAX_CANDIDATES,
    };

    const groundingEnabled = ragConfig.enabled && shouldUseGroundingForQuery(parsed.data.content);
    const isSmallTalk = isSmallTalkQuery(parsed.data.content);

    const userMessage = await MessageModel.create({
      chatId: chat._id,
      role: 'user',
      content: parsed.data.content,
      tokensIn: null,
      tokensOut: null,
      latencyMs: null,
      citations: [],
      createdAt: now,
    });

    try {
      const groundingChunks = groundingEnabled
        ? await retrieveGroundingChunks({
            userId,
            chatId,
            query: parsed.data.content,
            topK: ragConfig.topK,
            minScore: ragConfig.minScore,
            maxCandidates: ragConfig.maxCandidates,
          })
        : [];

      const groundedSystemMessage = buildGroundedSystemMessage(parsed.data.content, groundingChunks);
      const chatMessages = isSmallTalk
        ? buildSmallTalkOnlyHistory(chat, parsed.data.content)
        : await buildChatHistory(chat, groundedSystemMessage);

      const isStreaming = Boolean(
        parsed.data.stream || request.headers.accept?.includes('text/event-stream'),
      );

      if (isStreaming) {
        reply.raw.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
        reply.raw.setHeader('Connection', 'keep-alive');
        reply.raw.flushHeaders?.();

        const abortController = new AbortController();
        request.raw.on('close', () => {
          if (!reply.raw.writableEnded) {
            abortController.abort();
          }
        });

        const sendEvent = (event: string, data: unknown) => {
          reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        };

        sendEvent('user_message', toMessageResponse(userMessage));

        try {
          const assistantReply = await streamAssistantReply(
            chat.model,
            chatMessages,
            (delta) => {
              sendEvent('token', { delta });
            },
            abortController.signal,
          );

          const citations = groundingChunks
            .filter((chunk) => isValidObjectId(chunk.documentId) && isValidObjectId(chunk.chunkId))
            .map((chunk) => ({
              documentId: new Types.ObjectId(chunk.documentId),
              chunkId: new Types.ObjectId(chunk.chunkId),
              score: chunk.score,
            }));

          const assistantMessage = await MessageModel.create({
            chatId: chat._id,
            role: 'assistant',
            content: normalizeAssistantContent(assistantReply.content, parsed.data.content),
            tokensIn: null,
            tokensOut: null,
            latencyMs: assistantReply.latencyMs,
            citations,
            createdAt: new Date(),
          });

          let updatedTitle: string | undefined;
          if (chat.title === 'New Chat' || !chat.title) {
            try {
              const newTitle = await generateChatTitle(chat.model, parsed.data.content);
              if (newTitle) {
                chat.title = newTitle;
                updatedTitle = newTitle;
              }
            } catch {
              // Ignore title generation failure
            }
          }

          chat.lastMessageAt = new Date();
          await chat.save();

          sendEvent('done', {
            userMessage: toMessageResponse(userMessage),
            assistantMessage: toMessageResponse(assistantMessage),
            chatTitle: updatedTitle,
            grounding: {
              enabled: groundingEnabled,
              contextChunks: citations.length,
            },
          });
          reply.raw.end();
          return reply;
        } catch (streamError) {
          app.log.error(streamError);
          sendEvent('error', {
            error: 'ModelRequestFailed',
            message: 'Failed to generate assistant response from Gemini',
          });
          reply.raw.end();
          return reply;
        }
      }

      const assistantReply = await generateAssistantReply(chat.model, chatMessages);

      const citations = groundingChunks
        .filter((chunk) => isValidObjectId(chunk.documentId) && isValidObjectId(chunk.chunkId))
        .map((chunk) => ({
          documentId: new Types.ObjectId(chunk.documentId),
          chunkId: new Types.ObjectId(chunk.chunkId),
          score: chunk.score,
        }));

      const assistantMessage = await MessageModel.create({
        chatId: chat._id,
        role: 'assistant',
        content: normalizeAssistantContent(assistantReply.content, parsed.data.content),
        tokensIn: null,
        tokensOut: null,
        latencyMs: assistantReply.latencyMs,
        citations,
        createdAt: new Date(),
      });

      let updatedTitle: string | undefined;
      if (chat.title === 'New Chat' || !chat.title) {
        try {
          const newTitle = await generateChatTitle(chat.model, parsed.data.content);
          if (newTitle) {
            chat.title = newTitle;
            updatedTitle = newTitle;
          }
        } catch {
          // Ignore title generation failure
        }
      }

      chat.lastMessageAt = new Date();
      await chat.save();

      return reply.status(201).send({
        userMessage: toMessageResponse(userMessage),
        assistantMessage: toMessageResponse(assistantMessage),
        chatTitle: updatedTitle,
        grounding: {
          enabled: groundingEnabled,
          contextChunks: citations.length,
        },
      });
    } catch (error: unknown) {
      app.log.error(error);

      return reply.status(502).send({
        error: 'ModelRequestFailed',
        message: 'Failed to generate assistant response from Gemini',
      });
    }
  });
}

