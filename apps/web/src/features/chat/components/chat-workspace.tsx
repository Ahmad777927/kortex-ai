'use client';

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { authApi, chatsApi, documentsApi, modelsApi } from '../lib/api-client';
import { AuthCard, type AuthMode } from './auth-card';
import { ChatHeader } from './chat-header';
import { ChatSidebar } from './chat-sidebar';
import { MessageList } from './message-list';
import { MessageComposer } from './message-composer';
import { DeleteChatModal } from './delete-chat-modal';
import { DocumentPreviewBanner } from './document-preview-modal';
import { UniqueAiLogo } from '../../../components/chat/ai-logo';
import { cn } from '../../../lib/utils';
import type {
  ApiAvailableModel,
  ApiChat,
  ApiChunk,
  ApiDocument,
  ApiMessage,
  ApiUser,
  AuthResponse,
} from '../types';

const TOKEN_STORAGE_KEY = 'ai_chat_token_v1';
const USER_STORAGE_KEY = 'ai_chat_user_v1';
const PREFERRED_DEFAULT_MODEL = 'gemini-3.5-flash-lite';

const supportedUploadMimeTypes = new Set([
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
  'application/pdf',
]);

type ToastKind = 'success' | 'error' | 'info';

interface ToastMessage {
  id: string;
  kind: ToastKind;
  message: string;
}

function formatChatTime(value: string): string {
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatMessageTime(value: string): string {
  return new Date(value).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDocumentTime(value: string): string {
  return new Date(value).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }

  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

function cleanStreamingContent(text: string, userQuery?: string): string {
  let cleaned = text.replace(/^(?:Thinking with sources…|Thinking…|Regenerating with sources…|Regenerating…)\s*/i, '');
  const isAskingHowAreYou = Boolean(userQuery && /how\s+are\s+you/i.test(userQuery));
  if (!isAskingHowAreYou) {
    cleaned = cleaned.replace(
      /^(?:(?:Hello!|Hi!|Hey!)?\s*I(?:'m| am) doing well(?:, thank you)?!?(?:\s*How can I help you(?: today)?\??)?)\s*/i,
      '',
    );
  }
  return cleaned;
}

function statusBadgeVariant(
  status: ApiDocument['status'],
): 'default' | 'secondary' | 'success' | 'destructive' | 'outline' {
  if (status === 'ready') {
    return 'success';
  }

  if (status === 'processing') {
    return 'secondary';
  }

  if (status === 'failed') {
    return 'destructive';
  }

  return 'outline';
}

function resolveUploadMimeType(file: File): string | null {
  if (supportedUploadMimeTypes.has(file.type)) {
    return file.type;
  }

  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith('.txt')) {
    return 'text/plain';
  }
  if (lowerName.endsWith('.md') || lowerName.endsWith('.markdown')) {
    return 'text/markdown';
  }
  if (lowerName.endsWith('.csv')) {
    return 'text/csv';
  }
  if (lowerName.endsWith('.json')) {
    return 'application/json';
  }
  if (lowerName.endsWith('.pdf')) {
    return 'application/pdf';
  }

  return null;
}

function normalizeChats(chats: ApiChat[]): ApiChat[] {
  return [...chats].sort(
    (left, right) => new Date(right.lastMessageAt).getTime() - new Date(left.lastMessageAt).getTime(),
  );
}

function findLatestUserMessage(messages: ApiMessage[]): ApiMessage | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message && message.role === 'user') {
      return message;
    }
  }

  return null;
}

function stripAssistantMessagesAfter(messages: ApiMessage[], cutoffCreatedAt: string): ApiMessage[] {
  const cutoffTime = new Date(cutoffCreatedAt).getTime();

  return messages.filter((message) => {
    if (message.role !== 'assistant') {
      return true;
    }

    return new Date(message.createdAt).getTime() <= cutoffTime;
  });
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (typeof error === 'string' && error.trim().length > 0) {
    return error;
  }

  return fallback;
}

function toastBadgeVariant(kind: ToastKind): 'default' | 'success' | 'destructive' {
  if (kind === 'success') {
    return 'success';
  }

  if (kind === 'error') {
    return 'destructive';
  }

  return 'default';
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string' && result.length > 0) {
        resolve(result);
        return;
      }

      reject(new Error('Unable to read selected file'));
    };

    reader.onerror = () => {
      reject(new Error('Unable to read selected file'));
    };

    reader.readAsDataURL(file);
  });
}

export function ChatWorkspace() {
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<ApiUser | null>(null);

  const [chats, setChats] = useState<ApiChat[]>([]);
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const [chatModelFilter, setChatModelFilter] = useState('all');
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ApiMessage[]>([]);
  const [composer, setComposer] = useState('');
  const [isRagEnabled, setIsRagEnabled] = useState(true);
  const [groundingNotice, setGroundingNotice] = useState<string | null>(null);

  const [documents, setDocuments] = useState<ApiDocument[]>([]);
  const [availableModels, setAvailableModels] = useState<ApiAvailableModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>(PREFERRED_DEFAULT_MODEL);
  const [modelsSource, setModelsSource] = useState<'gemini' | 'fallback' | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);

  const [previewDocumentId, setPreviewDocumentId] = useState<string | null>(null);
  const [previewChunks, setPreviewChunks] = useState<ApiChunk[]>([]);

  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
  const [isChatsLoading, setIsChatsLoading] = useState(false);
  const [isMessagesLoading, setIsMessagesLoading] = useState(false);
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  const [isDeletingChatId, setIsDeletingChatId] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isDocumentsLoading, setIsDocumentsLoading] = useState(false);
  const [isModelsLoading, setIsModelsLoading] = useState(false);
  const [isUpdatingModel, setIsUpdatingModel] = useState(false);
  const [isUploadingDocument, setIsUploadingDocument] = useState(false);
  const [processingDocumentId, setProcessingDocumentId] = useState<string | null>(null);
  const [embeddingDocumentId, setEmbeddingDocumentId] = useState<string | null>(null);
  const [isPreviewChunksLoading, setIsPreviewChunksLoading] = useState(false);

  const [documentsNotice, setDocumentsNotice] = useState<string | null>(null);
  const [modelNotice, setModelNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [pendingDeleteChat, setPendingDeleteChat] = useState<ApiChat | null>(null);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  const [isDeletingDocumentId, setIsDeletingDocumentId] = useState<string | null>(null);
  const [messageSearchQuery, setMessageSearchQuery] = useState('');
  const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);
  const [customSystemPrompt, setCustomSystemPrompt] = useState('');
  const [isSavingSystemPrompt, setIsSavingSystemPrompt] = useState(false);

  const messagesBottomRef = useRef<HTMLDivElement | null>(null);
  const activeAbortControllerRef = useRef<AbortController | null>(null);
  const toastCounterRef = useRef(0);
  const toastTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const activeChat = useMemo(
    () => chats.find((chat) => chat.id === selectedChatId) ?? null,
    [chats, selectedChatId],
  );

  const visibleMessages = useMemo(() => {
    const q = messageSearchQuery.trim().toLowerCase();
    if (!q) return messages;
    return messages.filter((m) => m.content.toLowerCase().includes(q));
  }, [messages, messageSearchQuery]);

  const chatModelFilters = useMemo(() => {
    const models = new Set(chats.map((chat) => chat.model));
    return [...models].sort((left, right) => left.localeCompare(right));
  }, [chats]);

  const visibleChats = useMemo(() => {
    const normalizedQuery = chatSearchQuery.trim().toLowerCase();

    return chats.filter((chat) => {
      const matchesQuery =
        normalizedQuery.length === 0 ||
        chat.title.toLowerCase().includes(normalizedQuery) ||
        chat.model.toLowerCase().includes(normalizedQuery);

      const matchesModel = chatModelFilter === 'all' || chat.model === chatModelFilter;

      return matchesQuery && matchesModel;
    });
  }, [chats, chatSearchQuery, chatModelFilter]);

  const visibleDocuments = useMemo(() => {
    if (!selectedChatId) {
      return documents;
    }

    return documents.filter((document) => document.chatId === selectedChatId || document.chatId === null);
  }, [documents, selectedChatId]);

  const previewDocument = useMemo(
    () => documents.find((document) => document.id === previewDocumentId) ?? null,
    [documents, previewDocumentId],
  );

  const modelOptions = useMemo(() => {
    const map = new Map<string, ApiAvailableModel>();

    for (const model of availableModels) {
      map.set(model.name, model);
    }

    if (activeChat && !map.has(activeChat.model)) {
      map.set(activeChat.model, {
        name: activeChat.model,
        sizeBytes: null,
        modifiedAt: null,
      });
    }

    if (selectedModel && !map.has(selectedModel)) {
      map.set(selectedModel, {
        name: selectedModel,
        sizeBytes: null,
        modifiedAt: null,
      });
    }

    return [...map.values()].sort((left, right) => left.name.localeCompare(right.name));
  }, [availableModels, activeChat, selectedModel]);

  const chatFilterOptions = useMemo(
    () => [
      {
        value: 'all',
        label: 'All models',
      },
      ...chatModelFilters.map((modelName) => ({
        value: modelName,
        label: modelName,
      })),
    ],
    [chatModelFilters],
  );

  const modelDropdownOptions = useMemo(
    () =>
      modelOptions.map((model) => ({
        value: model.name,
        label: model.name,
      })),
    [modelOptions],
  );

  const preferredCreateModel = useMemo(() => {
    return (
      modelOptions.find((model) => model.name === PREFERRED_DEFAULT_MODEL)?.name ??
      modelOptions[0]?.name ??
      PREFERRED_DEFAULT_MODEL
    );
  }, [modelOptions]);

  const canRegenerateLastResponse = useMemo(
    () => selectedChatId !== null && findLatestUserMessage(messages) !== null,
    [messages, selectedChatId],
  );

  const isNoChatSelected = chats.length > 0 && !selectedChatId;

  function removeToast(toastId: string) {
    const timeout = toastTimeoutsRef.current.get(toastId);
    if (timeout) {
      clearTimeout(timeout);
      toastTimeoutsRef.current.delete(toastId);
    }

    setToasts((previousToasts) => previousToasts.filter((toast) => toast.id !== toastId));
  }

  function handleStopGenerating() {
    if (activeAbortControllerRef.current) {
      activeAbortControllerRef.current.abort();
      activeAbortControllerRef.current = null;
    }
    setIsSending(false);
    setIsRegenerating(false);
    pushToast('info', 'Generation stopped.');
  }

  function pushToast(kind: ToastKind, message: string, durationMs = 4000) {
    toastCounterRef.current += 1;
    const toastId = `toast-${Date.now()}-${toastCounterRef.current}`;

    setToasts((previousToasts) => [...previousToasts, { id: toastId, kind, message }]);

    const timeout = setTimeout(() => {
      setToasts((previousToasts) => previousToasts.filter((toast) => toast.id !== toastId));
      toastTimeoutsRef.current.delete(toastId);
    }, durationMs);

    toastTimeoutsRef.current.set(toastId, timeout);
  }

  const lastScrollTimeRef = useRef(0);

  useEffect(() => {
    if (!messagesBottomRef.current) return;
    const isBusy = isSending || isRegenerating;
    if (isBusy) {
      const now = performance.now();
      if (now - lastScrollTimeRef.current >= 120) {
        lastScrollTimeRef.current = now;
        messagesBottomRef.current.scrollIntoView({ behavior: 'auto', block: 'end' });
      }
    } else {
      messagesBottomRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages, selectedChatId, isSending, isRegenerating]);

  useEffect(() => {
    if (activeChat?.model) {
      setSelectedModel(activeChat.model);
    }
  }, [activeChat?.id, activeChat?.model]);

  // Auto-dismiss grounding and model notices after 4.5 seconds
  useEffect(() => {
    if (!groundingNotice) return;
    const timer = setTimeout(() => {
      setGroundingNotice(null);
    }, 4500);
    return () => clearTimeout(timer);
  }, [groundingNotice]);

  useEffect(() => {
    if (!modelNotice) return;
    const timer = setTimeout(() => {
      setModelNotice(null);
    }, 4500);
    return () => clearTimeout(timer);
  }, [modelNotice]);

  useEffect(() => {
    return () => {
      for (const timeout of toastTimeoutsRef.current.values()) {
        clearTimeout(timeout);
      }

      toastTimeoutsRef.current.clear();
    };
  }, []);

  function handleAuthSuccess(authResponse: AuthResponse) {
    setToken(authResponse.token);
    setUser(authResponse.user);

    localStorage.setItem(TOKEN_STORAGE_KEY, authResponse.token);
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(authResponse.user));
    pushToast('success', `Signed in as ${authResponse.user.name}`);
  }

  async function handleLogout() {
    if (token) {
      try {
        await authApi.logout(token);
      } catch {
        // Ignore logout failure on teardown
      }
    }

    setToken(null);
    setUser(null);
    setChats([]);
    setSelectedChatId(null);
    setMessages([]);
    setDocuments([]);
    setAvailableModels([]);
    setModelsSource(null);
    setComposer('');
    setSelectedFile(null);
    setPreviewDocumentId(null);
    setPreviewChunks([]);
    setGroundingNotice(null);
    setDocumentsNotice(null);
    setModelNotice(null);
    setError(null);
    setPendingDeleteChat(null);

    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
    pushToast('info', 'Logged out');
  }

  async function loadModels(authToken: string) {
    setIsModelsLoading(true);

    try {
      const response = await modelsApi.list(authToken);
      setAvailableModels(response.models);
      setModelsSource(response.source);
    } catch (modelsError) {
      setModelsSource('fallback');
      const errorMessage = getErrorMessage(modelsError, 'Failed to fetch available models');
      pushToast('error', errorMessage);
    } finally {
      setIsModelsLoading(false);
    }
  }

  async function loadChats(authToken: string, keepSelectedId?: string | null) {
    setIsChatsLoading(true);

    try {
      const response = await chatsApi.list(authToken, 100);
      const normalized = normalizeChats(response.chats);
      setChats(normalized);

      if (normalized.length === 0) {
        setSelectedChatId(null);
        setMessages([]);
        return;
      }

      const nextSelected =
        keepSelectedId && normalized.some((chat) => chat.id === keepSelectedId)
          ? keepSelectedId
          : normalized[0]?.id ?? null;

      setSelectedChatId(nextSelected);

      if (nextSelected) {
        await loadMessages(nextSelected, authToken);
      } else {
        setMessages([]);
      }
    } catch (chatsError) {
      const errorMessage = getErrorMessage(chatsError, 'Failed to load chats');
      setError(errorMessage);
      pushToast('error', errorMessage);
    } finally {
      setIsChatsLoading(false);
    }
  }

  async function loadMessages(chatId: string, authToken: string) {
    setIsMessagesLoading(true);

    try {
      const response = await chatsApi.listMessages(authToken, chatId, 100);
      setMessages(response.messages);
    } catch (messagesError) {
      const errorMessage = getErrorMessage(messagesError, 'Failed to load messages');
      setError(errorMessage);
      pushToast('error', errorMessage);
    } finally {
      setIsMessagesLoading(false);
    }
  }

  async function loadDocuments(authToken?: string | unknown) {
    const activeToken = typeof authToken === 'string' ? authToken : token;
    if (!activeToken) {
      return;
    }

    setIsDocumentsLoading(true);

    try {
      const response = await documentsApi.list(activeToken, 100);
      setDocuments(response.documents);
    } catch (documentsError) {
      const errorMessage = getErrorMessage(documentsError, 'Failed to load documents');
      setError(errorMessage);
      pushToast('error', errorMessage);
    } finally {
      setIsDocumentsLoading(false);
    }
  }

  useEffect(() => {
    async function bootstrap() {
      const storedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
      const storedUser = localStorage.getItem(USER_STORAGE_KEY);

      if (!storedToken || !storedUser) {
        setIsBootstrapping(false);
        return;
      }

      try {
        const parsedUser = JSON.parse(storedUser) as ApiUser;
        setToken(storedToken);
        setUser(parsedUser);

        const meResponse = await authApi.me(storedToken);
        setUser(meResponse.user);
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(meResponse.user));

        await Promise.all([
          loadModels(storedToken),
          loadChats(storedToken),
          loadDocuments(storedToken),
        ]);
      } catch {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        localStorage.removeItem(USER_STORAGE_KEY);
        setToken(null);
        setUser(null);
      } finally {
        setIsBootstrapping(false);
      }
    }

    void bootstrap();
  }, []);

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsAuthSubmitting(true);

    try {
      if (authMode === 'signup') {
        if (!name.trim()) {
          throw new Error('Name is required');
        }

        const response = await authApi.signup({
          name: name.trim(),
          email: email.trim(),
          password,
        });

        handleAuthSuccess(response);
        await Promise.all([
          loadModels(response.token),
          loadChats(response.token),
          loadDocuments(response.token),
        ]);
      } else {
        const response = await authApi.login({
          email: email.trim(),
          password,
        });

        handleAuthSuccess(response);
        await Promise.all([
          loadModels(response.token),
          loadChats(response.token),
          loadDocuments(response.token),
        ]);
      }

      setName('');
      setPassword('');
    } catch (authError) {
      const errorMessage = getErrorMessage(authError, 'Authentication failed');
      setError(errorMessage);
      pushToast('error', errorMessage);
    } finally {
      setIsAuthSubmitting(false);
    }
  }

  async function handleCreateChat() {
    if (!token || isCreatingChat) {
      return;
    }

    setIsCreatingChat(true);
    setError(null);

    try {
      const response = await chatsApi.create(token, {
        title: 'New Chat',
        model: selectedModel || preferredCreateModel,
      });

      setChats((previousChats) => normalizeChats([response.chat, ...previousChats]));
      setSelectedChatId(response.chat.id);
      setSelectedModel(response.chat.model);
      setMessages([]);
      pushToast('success', `Created a new chat with ${response.chat.model}.`);
    } catch (createChatError) {
      const errorMessage = getErrorMessage(createChatError, 'Failed to create chat');
      setError(errorMessage);
      pushToast('error', errorMessage);
    } finally {
      setIsCreatingChat(false);
    }
  }

  async function handleSelectChat(chatId: string) {
    if (chatId === selectedChatId || !token) {
      return;
    }

    setSelectedChatId(chatId);
    setError(null);
    setGroundingNotice(null);
    setModelNotice(null);
    await loadMessages(chatId, token);
  }

  function handleDeleteChat(chatId: string) {
    const chatToDelete = chats.find((chat) => chat.id === chatId) ?? null;
    if (!chatToDelete) {
      return;
    }

    setPendingDeleteChat(chatToDelete);
  }

  function closeDeleteModal() {
    if (isDeletingChatId) {
      return;
    }

    setPendingDeleteChat(null);
  }

  async function confirmDeleteChat() {
    if (!token || !pendingDeleteChat || isDeletingChatId) {
      return;
    }

    const chatId = pendingDeleteChat.id;
    setIsDeletingChatId(chatId);
    setError(null);

    try {
      await chatsApi.delete(token, chatId);

      const remainingChats = chats.filter((chat) => chat.id !== chatId);
      setChats(remainingChats);

      if (selectedChatId === chatId) {
        const fallbackChat = remainingChats[0] ?? null;
        setSelectedChatId(fallbackChat ? fallbackChat.id : null);

        if (fallbackChat) {
          await loadMessages(fallbackChat.id, token);
        } else {
          setMessages([]);
        }
      }

      pushToast('success', 'Chat deleted.');
      setPendingDeleteChat(null);
    } catch (deleteError) {
      const errorMessage = getErrorMessage(deleteError, 'Failed to delete chat');
      setError(errorMessage);
      pushToast('error', errorMessage);
    } finally {
      setIsDeletingChatId(null);
    }
  }

  async function handleSwitchModel(nextModel: string) {
    if (!token || isUpdatingModel || !nextModel) {
      return;
    }

    setSelectedModel(nextModel);

    if (!selectedChatId) {
      setModelNotice(`Model set to ${nextModel} for new chat.`);
      pushToast('info', `Active model set to ${nextModel}`);
      return;
    }

    setIsUpdatingModel(true);
    setModelNotice(null);
    setError(null);

    try {
      const response = await chatsApi.updateModel(token, selectedChatId, nextModel);

      setChats((previousChats) =>
        previousChats.map((chat) =>
          chat.id === selectedChatId
            ? {
                ...chat,
                model: response.chat.model,
              }
            : chat,
        ),
      );

      setModelNotice(`Model switched to ${response.chat.model}.`);
      pushToast('success', `Active model set to ${response.chat.model}`);
    } catch (switchModelError) {
      const errorMessage = getErrorMessage(switchModelError, 'Failed to update chat model');
      setError(errorMessage);
      pushToast('error', errorMessage);
    } finally {
      setIsUpdatingModel(false);
    }
  }

  async function handleSendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!token || isSending || isRegenerating) {
      return;
    }

    const content = composer.trim();
    if (content.length === 0) {
      return;
    }

    setError(null);
    setGroundingNotice(null);
    setIsSending(true);

    let targetChatId = selectedChatId;

    try {
      if (!targetChatId) {
        const chatResponse = await chatsApi.create(token, {
          title: 'New Chat',
          model: selectedModel || preferredCreateModel,
        });

        targetChatId = chatResponse.chat.id;
        setSelectedChatId(chatResponse.chat.id);
        setSelectedModel(chatResponse.chat.model);
        setChats((previousChats) => normalizeChats([chatResponse.chat, ...previousChats]));
      }

      setComposer('');

      const optimisticUserMessage: ApiMessage = {
        id: `temp-user-${Date.now()}`,
        chatId: targetChatId,
        role: 'user',
        content,
        tokensIn: null,
        tokensOut: null,
        latencyMs: null,
        citations: [],
        createdAt: new Date().toISOString(),
      };

      const optimisticAssistantMessage: ApiMessage = {
        id: `temp-assistant-${Date.now()}`,
        chatId: targetChatId,
        role: 'assistant',
        content: '',
        tokensIn: null,
        tokensOut: null,
        latencyMs: null,
        citations: [],
        createdAt: new Date().toISOString(),
      };

      setMessages((previousMessages) => [
        ...previousMessages,
        optimisticUserMessage,
        optimisticAssistantMessage,
      ]);

      let accumulatedContent = '';
      let lastFlushTime = 0;
      let throttleTimer: ReturnType<typeof setTimeout> | null = null;
      const abortController = new AbortController();
      activeAbortControllerRef.current = abortController;

      const flushStreamingTokens = () => {
        lastFlushTime = performance.now();
        throttleTimer = null;
        const displayContent = cleanStreamingContent(accumulatedContent, content);
        setMessages((previousMessages) =>
          previousMessages.map((msg) => {
            if (msg.id === optimisticAssistantMessage.id) {
              return {
                ...msg,
                content: displayContent,
              };
            }
            return msg;
          }),
        );
      };

      const scheduleTokenFlush = () => {
        const now = performance.now();
        const elapsed = now - lastFlushTime;
        if (elapsed >= 80) {
          if (throttleTimer) {
            clearTimeout(throttleTimer);
            throttleTimer = null;
          }
          flushStreamingTokens();
        } else if (!throttleTimer) {
          throttleTimer = setTimeout(flushStreamingTokens, 80 - elapsed);
        }
      };

      await chatsApi.sendMessageStream(
        token,
        targetChatId,
        content,
        {
          onToken: (delta) => {
            accumulatedContent += delta;
            scheduleTokenFlush();
          },
          onDone: (response) => {
            if (throttleTimer) {
              clearTimeout(throttleTimer);
              throttleTimer = null;
            }
            setMessages((previousMessages) => {
              const persistedMessages = previousMessages.filter(
                (message) =>
                  message.id !== optimisticUserMessage.id &&
                  message.id !== optimisticAssistantMessage.id,
              );

              return [...persistedMessages, response.userMessage, response.assistantMessage];
            });

            if (response.grounding?.enabled) {
              setGroundingNotice(
                `Grounded mode used ${response.grounding.contextChunks} context chunk(s).`,
              );
            }

            setChats((previousChats) =>
              normalizeChats(
                previousChats.map((chat) =>
                  chat.id === targetChatId
                    ? {
                        ...chat,
                        title: response.chatTitle || chat.title,
                        lastMessageAt: response.assistantMessage.createdAt,
                      }
                    : chat,
                ),
              ),
            );
          },
          onError: (streamError) => {
            if (abortController.signal.aborted) {
              return;
            }

            setMessages((previousMessages) =>
              previousMessages.filter(
                (message) =>
                  !message.id.startsWith('temp-user-') && !message.id.startsWith('temp-assistant-'),
              ),
            );

            setComposer(content);
            const errorMessage = getErrorMessage(streamError, 'Failed to send message');
            setError(errorMessage);
            pushToast('error', errorMessage);
          },
        },
        {
          rag: {
            enabled: isRagEnabled,
          },
          signal: abortController.signal,
        },
      );
    } catch (sendError) {
      if (activeAbortControllerRef.current?.signal.aborted) {
        return;
      }

      setMessages((previousMessages) =>
        previousMessages.filter(
          (message) => !message.id.startsWith('temp-user-') && !message.id.startsWith('temp-assistant-'),
        ),
      );

      setComposer(content);
      const errorMessage = getErrorMessage(sendError, 'Failed to send message');
      setError(errorMessage);
      pushToast('error', errorMessage);
    } finally {
      activeAbortControllerRef.current = null;
      setIsSending(false);
    }
  }

  async function handleRegenerateLastAssistant() {
    if (!token || !selectedChatId || isSending || isRegenerating) {
      return;
    }

    const latestUserMessage = findLatestUserMessage(messages);
    if (!latestUserMessage) {
      setError('Send a user message first to regenerate an assistant response.');
      return;
    }

    setError(null);
    setGroundingNotice(null);
    setIsRegenerating(true);

    const optimisticAssistantId = `temp-regenerate-${Date.now()}`;

    setMessages((previousMessages) => {
      const withoutPreviousAssistantTail = stripAssistantMessagesAfter(
        previousMessages,
        latestUserMessage.createdAt,
      );

      return [
        ...withoutPreviousAssistantTail,
        {
          id: optimisticAssistantId,
          chatId: selectedChatId,
          role: 'assistant',
          content: '',
          tokensIn: null,
          tokensOut: null,
          latencyMs: null,
          citations: [],
          createdAt: new Date().toISOString(),
        },
      ];
    });

    try {
      let accumulatedContent = '';
      let lastFlushTime = 0;
      let throttleTimer: ReturnType<typeof setTimeout> | null = null;
      const abortController = new AbortController();
      activeAbortControllerRef.current = abortController;

      const flushRegenerateTokens = () => {
        lastFlushTime = performance.now();
        throttleTimer = null;
        const displayContent = cleanStreamingContent(accumulatedContent, latestUserMessage.content);
        setMessages((previousMessages) =>
          previousMessages.map((msg) => {
            if (msg.id === optimisticAssistantId) {
              return {
                ...msg,
                content: displayContent,
              };
            }
            return msg;
          }),
        );
      };

      const scheduleRegenerateFlush = () => {
        const now = performance.now();
        const elapsed = now - lastFlushTime;
        if (elapsed >= 80) {
          if (throttleTimer) {
            clearTimeout(throttleTimer);
            throttleTimer = null;
          }
          flushRegenerateTokens();
        } else if (!throttleTimer) {
          throttleTimer = setTimeout(flushRegenerateTokens, 80 - elapsed);
        }
      };

      await chatsApi.regenerateMessageStream(
        token,
        selectedChatId,
        {
          onToken: (delta) => {
            accumulatedContent += delta;
            scheduleRegenerateFlush();
          },
          onDone: (response) => {
            if (throttleTimer) {
              clearTimeout(throttleTimer);
              throttleTimer = null;
            }
            setMessages((previousMessages) => {
              const withoutOptimisticMessage = previousMessages.filter(
                (message) => message.id !== optimisticAssistantId,
              );

              const withoutPreviousAssistantTail = stripAssistantMessagesAfter(
                withoutOptimisticMessage,
                response.userMessage.createdAt,
              );

              const hasLatestUserMessage = withoutPreviousAssistantTail.some(
                (message) => message.id === response.userMessage.id,
              );

              if (hasLatestUserMessage) {
                return [...withoutPreviousAssistantTail, response.assistantMessage];
              }

              return [
                ...withoutPreviousAssistantTail,
                response.userMessage,
                response.assistantMessage,
              ];
            });

            if (response.grounding?.enabled) {
              setGroundingNotice(`Grounded mode used ${response.grounding.contextChunks} context chunk(s).`);
            }

            pushToast('success', 'Assistant response regenerated.');

            setChats((previousChats) =>
              normalizeChats(
                previousChats.map((chat) =>
                  chat.id === selectedChatId
                    ? {
                        ...chat,
                        lastMessageAt: response.assistantMessage.createdAt,
                      }
                    : chat,
                ),
              ),
            );
          },
          onError: (streamError) => {
            if (abortController.signal.aborted) {
              return;
            }

            setMessages((previousMessages) =>
              previousMessages.filter((message) => message.id !== optimisticAssistantId),
            );

            const errorMessage = getErrorMessage(streamError, 'Failed to regenerate assistant response');
            setError(errorMessage);
            pushToast('error', errorMessage);
          },
        },
        {
          rag: {
            enabled: isRagEnabled,
          },
          signal: abortController.signal,
        },
      );
    } catch (regenerateError) {
      if (activeAbortControllerRef.current?.signal.aborted) {
        return;
      }

      const errorMessage = getErrorMessage(regenerateError, 'Failed to regenerate response');
      setError(errorMessage);
      pushToast('error', errorMessage);
      await loadMessages(selectedChatId, token);
    } finally {
      activeAbortControllerRef.current = null;
      setIsRegenerating(false);
    }
  }

  async function handleUploadDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!token || !selectedFile || isUploadingDocument) {
      return;
    }

    const mimeType = resolveUploadMimeType(selectedFile);
    if (!mimeType) {
      setError('Unsupported file type. Use txt, md, csv, json, or pdf.');
      return;
    }

    setError(null);
    setDocumentsNotice(null);
    setIsUploadingDocument(true);

    try {
      const contentBase64 = await fileToBase64(selectedFile);

      const uploadResponse = await documentsApi.upload(token, {
        filename: selectedFile.name,
        mimeType,
        contentBase64,
        chatId: selectedChatId,
      });

      const processResponse = await documentsApi.process(token, uploadResponse.document.id);
      const embedResponse = await documentsApi.embed(token, uploadResponse.document.id);

      setDocumentsNotice(
        `Indexed ${uploadResponse.document.filename} (${processResponse.processing.chunksCreated} chunks, model: ${embedResponse.embedding.model}).`,
      );
      pushToast('success', `Indexed ${uploadResponse.document.filename}`);

      setSelectedFile(null);
      setFileInputKey((current) => current + 1);

      await loadDocuments(token);
    } catch (uploadError) {
      const errorMessage = getErrorMessage(uploadError, 'Failed to upload and index document');
      setError(errorMessage);
      pushToast('error', errorMessage);
    } finally {
      setIsUploadingDocument(false);
    }
  }

  async function handleProcessDocument(documentId: string) {
    if (!token) {
      return;
    }

    setProcessingDocumentId(documentId);
    setError(null);

    try {
      const response = await documentsApi.process(token, documentId);
      setDocumentsNotice(
        `Processed ${response.document.filename} into ${response.processing.chunksCreated} chunks.`,
      );
      pushToast('success', `Processed ${response.document.filename}.`);
      await loadDocuments(token);
    } catch (processError) {
      const errorMessage = getErrorMessage(processError, 'Failed to process document');
      setError(errorMessage);
      pushToast('error', errorMessage);
    } finally {
      setProcessingDocumentId(null);
    }
  }

  async function handleEmbedDocument(documentId: string) {
    if (!token) {
      return;
    }

    setEmbeddingDocumentId(documentId);
    setError(null);

    try {
      const response = await documentsApi.embed(token, documentId);
      setDocumentsNotice(
        `Embedded ${response.embedding.embeddedChunks} chunk(s) using ${response.embedding.model}.`,
      );
      pushToast('success', `Embeddings generated with ${response.embedding.model}.`);
      await loadDocuments(token);
    } catch (embeddingError) {
      const errorMessage = getErrorMessage(embeddingError, 'Failed to generate embeddings');
      setError(errorMessage);
      pushToast('error', errorMessage);
    } finally {
      setEmbeddingDocumentId(null);
    }
  }

  async function handlePreviewChunks(documentId: string) {
    if (!token) {
      return;
    }

    setPreviewDocumentId(documentId);
    setPreviewChunks([]);
    setIsPreviewChunksLoading(true);
    setError(null);

    try {
      const response = await documentsApi.listChunks(token, documentId, 30);
      setPreviewChunks(response.chunks);
    } catch (previewError) {
      const errorMessage = getErrorMessage(previewError, 'Failed to load chunk preview');
      setError(errorMessage);
      pushToast('error', errorMessage);
    } finally {
      setIsPreviewChunksLoading(false);
    }
  }

  async function handleDeleteDocument(documentId: string) {
    if (!token) {
      return;
    }

    setIsDeletingDocumentId(documentId);
    setError(null);

    try {
      await documentsApi.delete(token, documentId);
      pushToast('success', 'Document deleted successfully.');
      if (previewDocumentId === documentId) {
        setPreviewDocumentId(null);
        setPreviewChunks([]);
      }
      await loadDocuments(token);
    } catch (deleteError) {
      const errorMessage = getErrorMessage(deleteError, 'Failed to delete document');
      setError(errorMessage);
      pushToast('error', errorMessage);
    } finally {
      setIsDeletingDocumentId(null);
    }
  }

  function handleExportChat() {
    if (!activeChat || messages.length === 0) {
      pushToast('info', 'No messages to export');
      return;
    }

    const title = activeChat.title || 'Conversation';
    const lines = [
      `# ${title}`,
      `*Model: ${activeChat.model}*`,
      `*Exported: ${new Date().toLocaleString()}*`,
      '',
      '---',
      '',
    ];

    for (const msg of messages) {
      const roleName = msg.role === 'user' ? '### User' : '### Assistant';
      lines.push(roleName, '', msg.content, '', '---', '');
    }

    const markdownText = lines.join('\n');
    const blob = new Blob([markdownText], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${title.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50)}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    pushToast('success', 'Chat exported as Markdown');
  }

  async function handleSaveSystemPrompt() {
    if (!token || !selectedChatId) return;
    setIsSavingSystemPrompt(true);
    try {
      const res = await chatsApi.updateSystemPrompt(token, selectedChatId, customSystemPrompt.trim() || null);
      setChats((prev) => prev.map((c) => (c.id === selectedChatId ? res.chat : c)));
      setIsPromptModalOpen(false);
      pushToast('success', 'Custom instructions updated');
    } catch (err) {
      const msg = getErrorMessage(err, 'Failed to update custom instructions');
      pushToast('error', msg);
    } finally {
      setIsSavingSystemPrompt(false);
    }
  }

  function handleFileSelection(event: ChangeEvent<HTMLInputElement>) {
    setDocumentsNotice(null);
    setSelectedFile(event.target.files?.[0] ?? null);
  }

  function handleClearSelectedFile() {
    setSelectedFile(null);
    setFileInputKey((current) => current + 1);
  }

  if (isBootstrapping) {
    return (
      <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-bg px-4 text-text">
        {/* Ambient aura glow */}
        <div className="pointer-events-none absolute -top-32 left-1/2 h-[450px] w-[550px] -translate-x-1/2 rounded-full bg-gradient-to-tr from-indigo-600/20 via-purple-600/15 to-transparent blur-[120px]" />
        <div className="pointer-events-none absolute -bottom-32 right-1/4 h-[350px] w-[450px] rounded-full bg-gradient-to-br from-cyan-600/15 via-indigo-600/10 to-transparent blur-[100px]" />

        <div className="relative flex flex-col items-center text-center animate-fade-in-up">
          {/* Logo with pulsating aura */}
          <div className="relative mb-6">
            <div className="absolute -inset-3 rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 opacity-25 blur-xl animate-pulse" />
            <div className="relative flex h-20 w-20 items-center justify-center rounded-3xl border border-white/[0.12] bg-gradient-to-tr from-surface via-surface-2 to-surface-3 shadow-glow">
              <UniqueAiLogo size={46} className="h-12 w-12 drop-shadow-[0_0_18px_rgba(99,102,241,0.6)] animate-pulse" />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-white">Kortex</h1>
            <span className="rounded-md bg-gradient-to-r from-indigo-500 to-purple-500 px-1.5 py-0.5 text-xs font-bold text-white shadow-sm">
              AI
            </span>
          </div>
          <p className="mt-2 text-xs font-medium tracking-wide text-text-muted">
            Initializing neural workspace…
          </p>

          {/* Sleek Animated Gradient Progress Bar */}
          <div className="mt-6 h-1 w-48 overflow-hidden rounded-full bg-white/[0.08]">
            <div className="h-full w-full rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-cyan-400 animate-pulse" />
          </div>
        </div>
      </main>
    );
  }

  if (!user || !token) {
    return (
      <AuthCard
        authMode={authMode}
        setAuthMode={setAuthMode}
        name={name}
        setName={setName}
        email={email}
        setEmail={setEmail}
        password={password}
        setPassword={setPassword}
        isAuthSubmitting={isAuthSubmitting}
        error={error}
        onSubmit={handleAuthSubmit}
      />
    );
  }

  return (
    <main className="h-dvh bg-bg text-text">
      <section className="mx-auto flex h-dvh w-full max-w-[1500px] flex-col p-2 sm:p-3 md:p-4">
        <div className="relative flex min-h-0 flex-1 overflow-hidden lg:grid lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-3">
          {/* Mobile backdrop */}
          <AnimatePresence>
            {isMobileSidebarOpen ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={() => setIsMobileSidebarOpen(false)}
                className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
              />
            ) : null}
          </AnimatePresence>

          {/* Sidebar Drawer on mobile / Column on desktop */}
          <div
            className={cn(
              'fixed inset-y-0 left-0 z-50 flex w-[320px] max-w-[85vw] flex-col p-2 sm:p-3 transition-transform duration-300 ease-in-out lg:static lg:inset-auto lg:z-auto lg:h-full lg:w-full lg:max-w-none lg:p-0 lg:transform-none lg:transition-none',
              isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
            )}
          >
            <ChatSidebar
              user={user}
              chats={chats}
              visibleChats={visibleChats}
              selectedChatId={selectedChatId}
              chatSearchQuery={chatSearchQuery}
              setChatSearchQuery={setChatSearchQuery}
              chatModelFilter={chatModelFilter}
              setChatModelFilter={setChatModelFilter}
              chatFilterOptions={chatFilterOptions}
              isChatsLoading={isChatsLoading}
              isCreatingChat={isCreatingChat}
              isDeletingChatId={isDeletingChatId}
              onCreateChat={handleCreateChat}
              onSelectChat={handleSelectChat}
              onDeleteChat={handleDeleteChat}
              visibleDocuments={visibleDocuments}
              isDocumentsLoading={isDocumentsLoading}
              selectedFile={selectedFile}
              fileInputKey={fileInputKey}
              isUploadingDocument={isUploadingDocument}
              processingDocumentId={processingDocumentId}
              embeddingDocumentId={embeddingDocumentId}
              previewDocumentId={previewDocumentId}
              isPreviewChunksLoading={isPreviewChunksLoading}
              documentsNotice={documentsNotice}
              onFileSelection={handleFileSelection}
              onClearSelectedFile={handleClearSelectedFile}
              onUploadDocument={handleUploadDocument}
              onLoadDocuments={() => void loadDocuments()}
              onPreviewChunks={handlePreviewChunks}
              onProcessDocument={handleProcessDocument}
              onEmbedDocument={handleEmbedDocument}
              onDeleteDocument={handleDeleteDocument}
              isDeletingDocumentId={isDeletingDocumentId}
              onLogout={handleLogout}
              onCloseMobile={() => setIsMobileSidebarOpen(false)}
              formatChatTime={formatChatTime}
              formatDocumentTime={formatDocumentTime}
              formatBytes={formatBytes}
              statusBadgeVariant={statusBadgeVariant}
            />
          </div>

          <section className="animate-fade-in-up flex min-h-0 flex-1 flex-col rounded-3xl border border-white/[0.08] bg-surface/90 shadow-soft backdrop-blur-xl">
            <ChatHeader
              activeChat={activeChat}
              selectedModel={selectedModel}
              modelDropdownOptions={modelDropdownOptions}
              modelOptions={modelOptions}
              modelsSource={modelsSource}
              isUpdatingModel={isUpdatingModel}
              isModelsLoading={isModelsLoading}
              isRagEnabled={isRagEnabled}
              onSwitchModel={handleSwitchModel}
              onToggleMobileSidebar={() => setIsMobileSidebarOpen((prev) => !prev)}
              onExportChat={handleExportChat}
              onOpenPromptModal={() => {
                setCustomSystemPrompt(activeChat?.systemPrompt ?? '');
                setIsPromptModalOpen(true);
              }}
              messageSearchQuery={messageSearchQuery}
              onMessageSearchChange={setMessageSearchQuery}
            />

            <DocumentPreviewBanner
              previewDocument={previewDocument}
              previewChunks={previewChunks}
              isPreviewChunksLoading={isPreviewChunksLoading}
              onClose={() => {
                setPreviewDocumentId(null);
                setPreviewChunks([]);
              }}
            />

            <MessageList
              messages={visibleMessages}
              isMessagesLoading={isMessagesLoading}
              isNoChatSelected={isNoChatSelected}
              messagesBottomRef={messagesBottomRef}
              onPreviewChunks={handlePreviewChunks}
              formatMessageTime={formatMessageTime}
              onSelectPrompt={(prompt) => setComposer(prompt)}
              isStreaming={isSending || isRegenerating}
            />

            <MessageComposer
              composer={composer}
              setComposer={setComposer}
              isSending={isSending}
              isRegenerating={isRegenerating}
              isMessagesLoading={isMessagesLoading}
              isRagEnabled={isRagEnabled}
              setIsRagEnabled={setIsRagEnabled}
              canRegenerateLastResponse={canRegenerateLastResponse}
              modelNotice={modelNotice}
              groundingNotice={groundingNotice}
              onSendMessage={handleSendMessage}
              onRegenerate={handleRegenerateLastAssistant}
              onStop={handleStopGenerating}
            />
          </section>
        </div>

        <DeleteChatModal
          pendingDeleteChat={pendingDeleteChat}
          isDeletingChatId={isDeletingChatId}
          onClose={closeDeleteModal}
          onConfirm={confirmDeleteChat}
        />

        {toasts.length > 0 ? (
          <div className="pointer-events-none fixed bottom-4 left-1/2 z-[60] flex w-[min(92vw,460px)] -translate-x-1/2 flex-col gap-2">
            <AnimatePresence initial={false}>
              {toasts.map((toast) => (
                <motion.div
                  key={toast.id}
                  initial={{ opacity: 0, y: 10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.98 }}
                  transition={{ duration: 0.14 }}
                  className="pointer-events-auto rounded-xl border border-border/90 bg-surface/95 px-3 py-2 shadow-soft backdrop-blur"
                >
                  <div className="flex items-start gap-2">
                    <Badge
                      variant={toastBadgeVariant(toast.kind)}
                      className="mt-[2px] shrink-0 text-[10px] uppercase tracking-wide"
                    >
                      {toast.kind}
                    </Badge>
                    <p className="flex-1 text-sm leading-6">{toast.message}</p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeToast(toast.id)}
                      className="h-7 px-2 text-[11px] text-text-muted"
                    >
                      Dismiss
                    </Button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        ) : null}

        {isPromptModalOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="w-full max-w-lg rounded-2xl border border-white/[0.1] bg-[#0E1424] p-6 shadow-2xl">
              <h3 className="text-lg font-semibold text-white">Custom Instructions (System Prompt)</h3>
              <p className="mt-1 text-xs text-text-muted">
                Define how the assistant should behave, its domain expertise, tone, or specific formatting rules for this conversation.
              </p>
              <textarea
                value={customSystemPrompt}
                onChange={(e) => setCustomSystemPrompt(e.target.value)}
                placeholder="e.g. You are an expert software architect. Be direct, concise, and provide complete runnable code."
                rows={5}
                className="mt-4 w-full rounded-xl border border-white/[0.1] bg-surface-2 p-3 text-xs text-white placeholder:text-text-muted focus:border-indigo-400 focus:outline-none"
              />
              <div className="mt-4 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsPromptModalOpen(false)}
                  className="border-white/[0.1] text-xs text-slate-300 hover:text-white"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSaveSystemPrompt}
                  disabled={isSavingSystemPrompt}
                  className="bg-indigo-600 hover:bg-indigo-500 text-xs text-white"
                >
                  {isSavingSystemPrompt ? 'Saving…' : 'Save Instructions'}
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}
