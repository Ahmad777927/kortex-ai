import type {
  ApiMessage,
  AuthResponse,
  ChatsResponse,
  ChunksResponse,
  CreateChatResponse,
  DeleteChatResponse,
  DocumentsResponse,
  EmbedDocumentResponse,
  MeResponse,
  MessagesResponse,
  ModelsResponse,
  ProcessDocumentResponse,
  RegenerateMessageResponse,
  SendMessageResponse,
  UploadDocumentResponse,
} from '../types';

export interface StreamCallbacks {
  onUserMessage?: (userMessage: ApiMessage) => void;
  onToken: (delta: string) => void;
  onDone: (data: SendMessageResponse) => void;
  onError: (error: Error) => void;
}

async function handleStreamResponse(
  response: Response,
  callbacks: StreamCallbacks,
) {
  if (!response.body) {
    throw new Error('Streaming response missing body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';

    for (const part of parts) {
      const lines = part.split('\n');
      let eventType = 'message';
      let eventData = '';

      for (const line of lines) {
        if (line.startsWith('event:')) {
          eventType = line.replace(/^event:\s?/, '').trim();
        } else if (line.startsWith('data:')) {
          eventData = line.replace(/^data:\s?/, '');
        }
      }

      if (!eventData) continue;

      try {
        const parsed = JSON.parse(eventData);
        if (eventType === 'user_message') {
          callbacks.onUserMessage?.(parsed as ApiMessage);
        } else if (eventType === 'token') {
          callbacks.onToken((parsed as { delta?: string }).delta ?? '');
        } else if (eventType === 'done') {
          callbacks.onDone(parsed as SendMessageResponse);
        } else if (eventType === 'error') {
          callbacks.onError(new Error((parsed as { message?: string }).message || 'Stream error'));
        }
      } catch {
        // ignore malformed event payload
      }
    }
  }
}

const API_PROXY_PREFIX = '/api/backend';
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

interface RequestOptions {
  timeoutMs?: number;
}

function getErrorMessage(payload: unknown, fallback = 'Request failed'): string {
  if (typeof payload === 'string' && payload.trim().length > 0) {
    return payload;
  }

  if (payload && typeof payload === 'object') {
    const objectPayload = payload as { message?: unknown; error?: unknown };

    if (typeof objectPayload.message === 'string' && objectPayload.message.trim().length > 0) {
      return objectPayload.message;
    }

    if (typeof objectPayload.error === 'string' && objectPayload.error.trim().length > 0) {
      return objectPayload.error;
    }
  }

  return fallback;
}

async function parseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    return response.json();
  }

  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

async function request<TResponse>(
  path: string,
  init: RequestInit,
  accessToken?: string,
  options?: RequestOptions,
): Promise<TResponse> {
  const headers = new Headers(init.headers);

  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const controller = new AbortController();
  const timeoutMs = options?.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;

  const timeout =
    timeoutMs > 0
      ? setTimeout(() => {
          controller.abort();
        }, timeoutMs)
      : null;

  let response: Response;

  try {
    response = await fetch(`${API_PROXY_PREFIX}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Request timed out. Please try again.');
    }

    throw error;
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }

  const body = await parseBody(response);

  if (!response.ok) {
    throw new Error(getErrorMessage(body, `Request failed with status ${response.status}`));
  }

  return body as TResponse;
}

export const authApi = {
  signup(input: { name: string; email: string; password: string }) {
    return request<AuthResponse>(
      '/auth/signup',
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
      undefined,
    );
  },

  login(input: { email: string; password: string }) {
    return request<AuthResponse>(
      '/auth/login',
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
      undefined,
    );
  },

  me(accessToken: string) {
    return request<MeResponse>(
      '/auth/me',
      {
        method: 'GET',
      },
      accessToken,
    );
  },

  logout(accessToken: string) {
    return request<{ success: boolean }>(
      '/auth/logout',
      {
        method: 'POST',
      },
      accessToken,
    );
  },
};

export const chatsApi = {
  list(accessToken: string, limit = 30) {
    return request<ChatsResponse>(
      `/chats?limit=${limit}`,
      {
        method: 'GET',
      },
      accessToken,
    );
  },

  create(
    accessToken: string,
    input?: {
      title?: string;
      model?: string;
      systemPrompt?: string | null;
    },
  ) {
    return request<CreateChatResponse>(
      '/chats',
      {
        method: 'POST',
        body: JSON.stringify(input ?? {}),
      },
      accessToken,
    );
  },

  listMessages(accessToken: string, chatId: string, limit = 100) {
    return request<MessagesResponse>(
      `/chats/${chatId}/messages?limit=${limit}`,
      {
        method: 'GET',
      },
      accessToken,
    );
  },

  sendMessage(
    accessToken: string,
    chatId: string,
    content: string,
    options?: {
      rag?: {
        enabled?: boolean;
      };
    },
  ) {
    return request<SendMessageResponse>(
      `/chats/${chatId}/messages`,
      {
        method: 'POST',
        body: JSON.stringify({
          content,
          rag: options?.rag,
        }),
      },
      accessToken,
      {
        timeoutMs: 300_000,
      },
    );
  },

  regenerateMessage(
    accessToken: string,
    chatId: string,
    options?: {
      rag?: {
        enabled?: boolean;
      };
    },
  ) {
    return request<RegenerateMessageResponse>(
      `/chats/${chatId}/messages/regenerate`,
      {
        method: 'POST',
        body: JSON.stringify({
          rag: options?.rag,
        }),
      },
      accessToken,
      {
        timeoutMs: 300_000,
      },
    );
  },

  async sendMessageStream(
    accessToken: string,
    chatId: string,
    content: string,
    callbacks: StreamCallbacks,
    options?: {
      rag?: { enabled?: boolean };
      signal?: AbortSignal;
    },
  ) {
    const headers = new Headers({
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    });
    if (accessToken) {
      headers.set('Authorization', `Bearer ${accessToken}`);
    }

    try {
      const response = await fetch(`${API_PROXY_PREFIX}/chats/${chatId}/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          content,
          rag: options?.rag,
          stream: true,
        }),
        signal: options?.signal,
      });

      if (!response.ok) {
        const body = await parseBody(response);
        throw new Error(getErrorMessage(body, `Request failed with status ${response.status}`));
      }

      await handleStreamResponse(response, callbacks);
    } catch (err) {
      callbacks.onError(err instanceof Error ? err : new Error(String(err)));
    }
  },

  async regenerateMessageStream(
    accessToken: string,
    chatId: string,
    callbacks: StreamCallbacks,
    options?: {
      rag?: { enabled?: boolean };
      signal?: AbortSignal;
    },
  ) {
    const headers = new Headers({
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    });
    if (accessToken) {
      headers.set('Authorization', `Bearer ${accessToken}`);
    }

    try {
      const response = await fetch(`${API_PROXY_PREFIX}/chats/${chatId}/messages/regenerate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          rag: options?.rag,
          stream: true,
        }),
        signal: options?.signal,
      });

      if (!response.ok) {
        const body = await parseBody(response);
        throw new Error(getErrorMessage(body, `Request failed with status ${response.status}`));
      }

      await handleStreamResponse(response, callbacks);
    } catch (err) {
      callbacks.onError(err instanceof Error ? err : new Error(String(err)));
    }
  },

  updateModel(accessToken: string, chatId: string, model: string) {
    return request<CreateChatResponse>(
      `/chats/${chatId}/model`,
      {
        method: 'PUT',
        body: JSON.stringify({ model }),
      },
      accessToken,
    );
  },

  updateTitle(accessToken: string, chatId: string, title: string) {
    return request<CreateChatResponse>(
      `/chats/${chatId}/title`,
      {
        method: 'PUT',
        body: JSON.stringify({ title }),
      },
      accessToken,
    );
  },

  updateSystemPrompt(accessToken: string, chatId: string, systemPrompt: string | null) {
    return request<CreateChatResponse>(
      `/chats/${chatId}/system-prompt`,
      {
        method: 'PUT',
        body: JSON.stringify({ systemPrompt }),
      },
      accessToken,
    );
  },

  delete(accessToken: string, chatId: string) {
    return request<DeleteChatResponse>(
      `/chats/${chatId}`,
      {
        method: 'DELETE',
      },
      accessToken,
    );
  },
};

export const modelsApi = {
  list(accessToken: string) {
    return request<ModelsResponse>(
      '/models',
      {
        method: 'GET',
      },
      accessToken,
    );
  },
};

export const documentsApi = {
  list(accessToken: string, limit = 100) {
    return request<DocumentsResponse>(
      `/documents?limit=${limit}`,
      {
        method: 'GET',
      },
      accessToken,
    );
  },

  upload(
    accessToken: string,
    input: {
      filename: string;
      mimeType: string;
      contentBase64: string;
      chatId?: string | null;
    },
  ) {
    return request<UploadDocumentResponse>(
      '/documents/upload',
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
      accessToken,
    );
  },

  process(
    accessToken: string,
    documentId: string,
    input?: {
      chunkSize?: number;
      overlap?: number;
    },
  ) {
    return request<ProcessDocumentResponse>(
      `/documents/${documentId}/process`,
      {
        method: 'POST',
        body: JSON.stringify(input ?? {}),
      },
      accessToken,
    );
  },

  embed(
    accessToken: string,
    documentId: string,
    input?: {
      batchSize?: number;
      force?: boolean;
    },
  ) {
    return request<EmbedDocumentResponse>(
      `/documents/${documentId}/embed`,
      {
        method: 'POST',
        body: JSON.stringify(input ?? {}),
      },
      accessToken,
    );
  },

  listChunks(accessToken: string, documentId: string, limit = 100) {
    return request<ChunksResponse>(
      `/documents/${documentId}/chunks?limit=${limit}`,
      {
        method: 'GET',
      },
      accessToken,
    );
  },

  delete(accessToken: string, documentId: string) {
    return request<{ deletedDocumentId: string; removedChunks: number }>(
      `/documents/${documentId}`,
      {
        method: 'DELETE',
      },
      accessToken,
    );
  },
};
