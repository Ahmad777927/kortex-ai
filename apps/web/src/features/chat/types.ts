export type UserRole = 'user' | 'admin';

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export type DocumentStatus = 'uploaded' | 'processing' | 'ready' | 'failed';

export interface ApiCitation {
  documentId: string;
  chunkId: string;
  score: number;
}

export interface ApiUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

export interface ApiChat {
  id: string;
  userId: string;
  title: string;
  model: string;
  systemPrompt: string | null;
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiMessage {
  id: string;
  chatId: string;
  role: MessageRole;
  content: string;
  tokensIn: number | null;
  tokensOut: number | null;
  latencyMs: number | null;
  citations: ApiCitation[];
  createdAt: string;
}

export interface ApiDocument {
  id: string;
  userId: string;
  chatId: string | null;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  status: DocumentStatus;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiChunk {
  id: string;
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
  createdAt: string;
}

export interface AuthResponse {
  token: string;
  user: ApiUser;
}

export interface MeResponse {
  user: ApiUser;
}

export interface ChatsResponse {
  chats: ApiChat[];
}

export interface CreateChatResponse {
  chat: ApiChat;
}

export interface DeleteChatResponse {
  deletedChatId: string;
  removedMessages: number;
  detachedDocuments: number;
  detachedChunks: number;
}

export interface MessagesResponse {
  messages: ApiMessage[];
}

export interface SendMessageResponse {
  userMessage: ApiMessage;
  assistantMessage: ApiMessage;
  chatTitle?: string;
  grounding?: {
    enabled: boolean;
    contextChunks: number;
  };
}

export interface RegenerateMessageResponse {
  userMessage: ApiMessage;
  assistantMessage: ApiMessage;
  regenerated: boolean;
  removedAssistantMessages: number;
  grounding?: {
    enabled: boolean;
    contextChunks: number;
  };
}

export interface DocumentsResponse {
  documents: ApiDocument[];
}

export interface UploadDocumentResponse {
  document: ApiDocument;
}

export interface ProcessDocumentResponse {
  document: ApiDocument;
  processing: {
    extractedChars: number;
    chunksCreated: number;
    chunkSize: number;
    overlap: number;
  };
}

export interface EmbedDocumentResponse {
  document: ApiDocument;
  embedding: {
    model: string;
    force: boolean;
    batchSize: number;
    totalChunks: number;
    embeddedChunks: number;
    skippedChunks: number;
    embeddingDimensions: number | null;
  };
}

export interface ChunksResponse {
  chunks: ApiChunk[];
}

export interface ApiAvailableModel {
  name: string;
  sizeBytes: number | null;
  modifiedAt: string | null;
}

export interface ModelsResponse {
  models: ApiAvailableModel[];
  defaultModel: string;
  fallbackModel: string;
  source: 'gemini' | 'fallback';
}
