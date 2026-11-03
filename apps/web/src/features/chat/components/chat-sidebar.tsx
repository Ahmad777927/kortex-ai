'use client';

import React, { ChangeEvent, FormEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Badge } from '../../../components/ui/badge';
import { Alert, AlertDescription } from '../../../components/ui/alert';
import { DropdownSelect } from '../../../components/ui/dropdown-select';
import {
  SparklesIcon,
  PlusIcon,
  SearchIcon,
  ChatBubbleIcon,
  TrashIcon,
  DocumentIcon,
  UploadCloudIcon,
  RefreshIcon,
  LogoutIcon,
  CloseIcon,
} from '../../../components/chat/icons';
import { UniqueAiLogo } from '../../../components/chat/ai-logo';
import { cn } from '../../../lib/utils';
import type { ApiChat, ApiDocument, ApiUser } from '../types';

interface ChatSidebarProps {
  user: ApiUser;
  chats: ApiChat[];
  visibleChats: ApiChat[];
  selectedChatId: string | null;
  chatSearchQuery: string;
  setChatSearchQuery: (query: string) => void;
  chatModelFilter: string;
  setChatModelFilter: (model: string) => void;
  chatFilterOptions: { value: string; label: string }[];
  isChatsLoading: boolean;
  isCreatingChat: boolean;
  isDeletingChatId: string | null;
  onCreateChat: () => void;
  onSelectChat: (chatId: string) => void;
  onDeleteChat: (chatId: string) => void;
  // Documents
  visibleDocuments: ApiDocument[];
  isDocumentsLoading: boolean;
  selectedFile: File | null;
  fileInputKey: number;
  isUploadingDocument: boolean;
  processingDocumentId: string | null;
  embeddingDocumentId: string | null;
  previewDocumentId: string | null;
  isPreviewChunksLoading: boolean;
  documentsNotice: string | null;
  onFileSelection: (event: ChangeEvent<HTMLInputElement>) => void;
  onClearSelectedFile: () => void;
  onUploadDocument: (event: FormEvent<HTMLFormElement>) => void;
  onLoadDocuments: () => void;
  onPreviewChunks: (documentId: string) => void;
  onProcessDocument: (documentId: string) => void;
  onEmbedDocument: (documentId: string) => void;
  onDeleteDocument?: (documentId: string) => void;
  isDeletingDocumentId?: string | null;
  // Auth
  onLogout: () => void;
  // Mobile responsive
  onCloseMobile?: () => void;
  // Formatters
  formatChatTime: (value: string) => string;
  formatDocumentTime: (value: string) => string;
  formatBytes: (bytes: number) => string;
  statusBadgeVariant: (status: ApiDocument['status']) => 'default' | 'secondary' | 'success' | 'destructive' | 'outline';
}

export function ChatSidebar({
  user,
  chats,
  visibleChats,
  selectedChatId,
  chatSearchQuery,
  setChatSearchQuery,
  chatModelFilter,
  setChatModelFilter,
  chatFilterOptions,
  isChatsLoading,
  isCreatingChat,
  isDeletingChatId,
  onCreateChat,
  onSelectChat,
  onDeleteChat,
  visibleDocuments,
  isDocumentsLoading,
  selectedFile,
  fileInputKey,
  isUploadingDocument,
  processingDocumentId,
  embeddingDocumentId,
  previewDocumentId,
  isPreviewChunksLoading,
  documentsNotice,
  onFileSelection,
  onClearSelectedFile,
  onUploadDocument,
  onLoadDocuments,
  onPreviewChunks,
  onProcessDocument,
  onEmbedDocument,
  onDeleteDocument,
  isDeletingDocumentId,
  onLogout,
  onCloseMobile,
  formatChatTime,
  formatDocumentTime,
  formatBytes,
  statusBadgeVariant,
}: ChatSidebarProps) {
  const userInitial = user.name ? user.name.charAt(0).toUpperCase() : 'U';

  function handleCreateChatClick() {
    onCreateChat();
    onCloseMobile?.();
  }

  function handleSelectChatClick(chatId: string) {
    onSelectChat(chatId);
    onCloseMobile?.();
  }

  return (
    <aside className="animate-fade-in-up flex h-full min-h-0 flex-col rounded-3xl border border-white/[0.08] bg-surface/95 shadow-soft backdrop-blur-2xl">
      {/* Brand Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] p-4">
        <div className="flex items-center gap-3">
          <UniqueAiLogo size={36} className="h-9 w-9 shrink-0 drop-shadow-[0_0_14px_rgba(99,102,241,0.45)]" />
          <div>
            <h1 className="text-base font-bold tracking-tight text-white flex items-center gap-1.5">
              <span>Kortex</span>
              <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">AI</span>
            </h1>
            <p className="text-[10px] font-medium tracking-wider text-text-muted uppercase">Neural Studio</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-indigo-400">
            Pro
          </span>
          {onCloseMobile ? (
            <button
              type="button"
              onClick={onCloseMobile}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-white/[0.08] hover:text-white lg:hidden transition-colors"
              title="Close sidebar"
            >
              <CloseIcon className="h-4.5 w-4.5" />
            </button>
          ) : null}
        </div>
      </div>

      {/* New Chat Action Button */}
      <div className="border-b border-white/[0.06] p-3">
        <button
          type="button"
          onClick={handleCreateChatClick}
          disabled={isCreatingChat}
          className="group flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 via-indigo-600 to-purple-600 py-2.5 px-4 text-xs font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all duration-200 hover:from-indigo-400 hover:to-purple-500 hover:shadow-indigo-500/35 active:scale-[0.98] disabled:opacity-50"
        >
          <PlusIcon className="h-4.5 w-4.5 transition-transform group-hover:rotate-90 duration-200" />
          <span>{isCreatingChat ? 'Creating…' : 'New Conversation'}</span>
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-3">
        {/* Chats Section */}
        <section>
          <div className="flex items-center justify-between px-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              Recent Chats
            </p>
            {chats.length > 0 ? (
              <span className="text-[10px] text-text-muted/80">
                {visibleChats.length}/{chats.length}
              </span>
            ) : null}
          </div>

          <div className="mt-2.5 space-y-2">
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
              <Input
                value={chatSearchQuery}
                onChange={(event) => setChatSearchQuery(event.target.value)}
                placeholder="Search chats..."
                className="h-8.5 rounded-xl border-white/[0.08] bg-surface-2/60 pl-9 text-xs text-white placeholder:text-text-muted/60 outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 focus:border-white/25"
              />
            </div>

            <DropdownSelect
              value={chatModelFilter}
              options={chatFilterOptions}
              onValueChange={setChatModelFilter}
              triggerClassName="h-8 rounded-xl border-white/[0.06] bg-surface-2/60 text-xs text-text-muted hover:text-white"
            />
          </div>

          <div className="mt-2.5">
            {isChatsLoading ? (
              <p className="px-2 py-3 text-xs text-text-muted">Loading conversations…</p>
            ) : chats.length === 0 ? (
              <p className="px-2 py-3 text-xs text-text-muted">No chats yet. Start a new one above.</p>
            ) : visibleChats.length === 0 ? (
              <div className="space-y-2 px-2 py-2 text-center">
                <p className="text-xs text-text-muted">No matching conversations.</p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setChatSearchQuery('');
                    setChatModelFilter('all');
                  }}
                  className="h-7 text-xs"
                >
                  Clear filters
                </Button>
              </div>
            ) : (
              <ul className="space-y-1">
                <AnimatePresence initial={false}>
                  {visibleChats.map((chat) => {
                    const isActive = selectedChatId === chat.id;

                    return (
                      <motion.li
                        key={chat.id}
                        layout
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.14 }}
                      >
                        <div
                          className={cn(
                            'group relative flex items-center gap-2 rounded-xl border px-3 py-2.5 transition-all duration-150',
                            isActive
                              ? 'border-indigo-500/40 bg-gradient-to-r from-indigo-500/15 to-purple-500/10 text-white shadow-sm'
                              : 'border-transparent text-slate-300 hover:border-white/[0.06] hover:bg-white/[0.04]',
                          )}
                        >
                          <ChatBubbleIcon
                            className={cn(
                              'h-4.5 w-4.5 shrink-0 transition-colors',
                              isActive ? 'text-indigo-400' : 'text-text-muted group-hover:text-slate-200',
                            )}
                          />

                          <button
                            type="button"
                            onClick={() => handleSelectChatClick(chat.id)}
                            className="min-w-0 flex-1 text-left"
                          >
                            <p className="line-clamp-1 text-xs font-medium">{chat.title}</p>
                            <p className="mt-0.5 text-[10px] text-text-muted">
                              {chat.model.replace(/^models\//, '')} • {formatChatTime(chat.lastMessageAt)}
                            </p>
                          </button>

                          <button
                            type="button"
                            disabled={isDeletingChatId === chat.id}
                            onClick={() => onDeleteChat(chat.id)}
                            className="opacity-0 group-hover:opacity-100 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-text-muted hover:bg-red-500/20 hover:text-red-400 transition-all"
                            title="Delete Chat"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </div>
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ul>
            )}
          </div>
        </section>

        {/* Knowledge Documents Section */}
        <section className="border-t border-white/[0.06] pt-4">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-1.5">
              <DocumentIcon className="h-4 w-4 text-indigo-400" />
              <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                Knowledge Docs
              </p>
            </div>
            <button
              type="button"
              onClick={() => onLoadDocuments()}
              className="flex items-center gap-1 text-[11px] text-text-muted hover:text-white transition-colors"
            >
              <RefreshIcon className="h-3.5 w-3.5" />
              <span>Refresh</span>
            </button>
          </div>

          {documentsNotice ? (
            <Alert variant="info" className="mt-2 px-2.5 py-1.5 text-xs border-indigo-500/30 bg-indigo-500/10 text-indigo-300">
              <AlertDescription>{documentsNotice}</AlertDescription>
            </Alert>
          ) : null}

          {/* Upload Form */}
          <form onSubmit={onUploadDocument} className="mt-2.5 rounded-2xl border border-dashed border-white/[0.12] bg-surface-2/40 p-3 transition-colors hover:border-indigo-500/40">
            <input
              key={fileInputKey}
              type="file"
              onChange={onFileSelection}
              accept=".txt,.md,.csv,.json,.pdf"
              className="w-full text-xs text-text-muted file:mr-2 file:rounded-lg file:border-0 file:bg-white/[0.08] file:px-2.5 file:py-1 file:text-xs file:font-medium file:text-white hover:file:bg-white/[0.15]"
            />

            {selectedFile ? (
              <div className="mt-2 flex items-center justify-between text-xs text-slate-300">
                <span className="line-clamp-1">{selectedFile.name}</span>
                <button
                  type="button"
                  onClick={onClearSelectedFile}
                  className="text-text-muted hover:text-red-400"
                >
                  ✕
                </button>
              </div>
            ) : (
              <p className="mt-1 text-[10px] text-text-muted">Supports .txt, .md, .csv, .json, .pdf</p>
            )}

            <Button
              type="submit"
              disabled={!selectedFile || isUploadingDocument}
              size="sm"
              className="mt-2.5 h-8 w-full gap-1.5 rounded-xl bg-white/[0.08] text-xs font-medium text-white hover:bg-white/[0.15]"
            >
              <UploadCloudIcon className="h-4 w-4" />
              <span>{isUploadingDocument ? 'Indexing…' : 'Upload + Index'}</span>
            </Button>
          </form>

          {/* Document List */}
          <div className="mt-3 space-y-2">
            {isDocumentsLoading ? (
              <p className="px-1 text-xs text-text-muted">Loading documents…</p>
            ) : visibleDocuments.length === 0 ? (
              <p className="px-1 text-xs text-text-muted">No indexed documents yet.</p>
            ) : (
              visibleDocuments.map((document) => {
                const isProcessing = processingDocumentId === document.id;
                const isEmbedding = embeddingDocumentId === document.id;

                return (
                  <article
                    key={document.id}
                    className="rounded-xl border border-white/[0.06] bg-surface-2/50 p-2.5 text-xs transition-colors hover:border-white/[0.12]"
                  >
                    <div className="flex items-start justify-between gap-1.5">
                      <p className="line-clamp-1 font-medium text-white">{document.filename}</p>
                      <Badge variant={statusBadgeVariant(document.status)} className="text-[9px] px-1.5 py-0">
                        {document.status}
                      </Badge>
                    </div>

                    <p className="mt-1 text-[10px] text-text-muted">
                      {formatBytes(document.sizeBytes)} • {formatDocumentTime(document.createdAt)}
                    </p>

                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onPreviewChunks(document.id)}
                        disabled={isPreviewChunksLoading && previewDocumentId === document.id}
                        className="h-6 rounded-lg px-2 text-[10px] border-white/[0.08] bg-surface hover:text-white"
                      >
                        Preview
                      </Button>

                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onProcessDocument(document.id)}
                        disabled={isProcessing || isUploadingDocument}
                        className="h-6 rounded-lg px-2 text-[10px] border-white/[0.08] bg-surface hover:text-white"
                      >
                        {isProcessing ? 'Processing…' : 'Process'}
                      </Button>

                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onEmbedDocument(document.id)}
                        disabled={isEmbedding || isUploadingDocument}
                        className="h-6 rounded-lg px-2 text-[10px] border-white/[0.08] bg-surface hover:text-white"
                      >
                        {isEmbedding ? 'Embedding…' : 'Embed'}
                      </Button>

                      {onDeleteDocument ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => onDeleteDocument(document.id)}
                          disabled={isDeletingDocumentId === document.id}
                          className="h-6.5 rounded-lg px-2 text-[10px] text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 ml-auto"
                          title="Delete document"
                        >
                          <TrashIcon className="h-3.5 w-3.5" />
                        </Button>
                      ) : null}
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>
      </div>

      {/* User Profile Footer */}
      <div className="border-t border-white/[0.06] p-3">
        <div className="flex items-center justify-between rounded-2xl border border-white/[0.08] bg-surface-2/60 p-2.5 backdrop-blur">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 text-xs font-bold text-white shadow-sm">
              {userInitial}
              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-emerald-400" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-1 text-xs font-semibold text-white">{user.name}</p>
              <p className="line-clamp-1 text-[11px] text-text-muted">{user.email}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onLogout}
            title="Log Out"
            className="flex h-8.5 w-8.5 items-center justify-center rounded-xl text-text-muted hover:bg-white/[0.08] hover:text-red-400 transition-colors"
          >
            <LogoutIcon className="h-4.5 w-4.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
