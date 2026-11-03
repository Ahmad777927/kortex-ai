'use client';

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Button } from '../../../components/ui/button';
import { MarkdownContent, CopyMessageButton } from '../../../components/chat/markdown-content';
import {
  SparklesIcon,
  CodeIcon,
  RocketIcon,
  LightbulbIcon,
  CpuIcon,
} from '../../../components/chat/icons';
import { UniqueAiLogo } from '../../../components/chat/ai-logo';
import type { ApiMessage } from '../types';

interface MessageListProps {
  messages: ApiMessage[];
  isMessagesLoading: boolean;
  isNoChatSelected: boolean;
  messagesBottomRef: React.RefObject<HTMLDivElement | null>;
  onPreviewChunks: (documentId: string) => void;
  formatMessageTime: (value: string) => string;
  onSelectPrompt?: (prompt: string) => void;
  isStreaming?: boolean;
}

const STARTER_PROMPTS = [
  {
    icon: CodeIcon,
    title: 'Code & Build',
    subtitle: 'Build a 3-page interactive website in React and Tailwind',
    prompt: 'Develop me a modern, responsive website in React with 3 interactive pages.',
    accent: 'from-blue-500/20 to-indigo-500/10 border-blue-500/20 hover:border-blue-500/40 text-blue-400',
  },
  {
    icon: LightbulbIcon,
    title: 'Concept & Insights',
    subtitle: 'Explain how vector embeddings and RAG grounding work',
    prompt: 'Explain how vector embeddings, cosine similarity, and RAG grounding work with examples.',
    accent: 'from-amber-500/20 to-orange-500/10 border-amber-500/20 hover:border-amber-500/40 text-amber-400',
  },
  {
    icon: RocketIcon,
    title: 'Product Strategy',
    subtitle: 'Create a launch plan for a developer AI SaaS product',
    prompt: 'Draft an effective go-to-market and launch plan for an AI developer platform.',
    accent: 'from-purple-500/20 to-pink-500/10 border-purple-500/20 hover:border-purple-500/40 text-purple-400',
  },
  {
    icon: CpuIcon,
    title: 'Debug & Optimize',
    subtitle: 'Identify and fix memory leaks or async bottlenecks',
    prompt: 'How do you detect, profile, and fix memory leaks and slow async queries in a Node.js backend?',
    accent: 'from-emerald-500/20 to-teal-500/10 border-emerald-500/20 hover:border-emerald-500/40 text-emerald-400',
  },
];

export function MessageList({
  messages,
  isMessagesLoading,
  isNoChatSelected,
  messagesBottomRef,
  onPreviewChunks,
  formatMessageTime,
  onSelectPrompt,
  isStreaming = false,
}: MessageListProps) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-8">
      {isMessagesLoading ? (
        <div className="flex h-full items-center justify-center">
          <div className="flex items-center gap-3 rounded-full border border-white/[0.10] bg-surface-2/80 px-5 py-2.5 shadow-soft backdrop-blur-xl animate-fade-in-up">
            <UniqueAiLogo size={20} className="h-5 w-5 animate-pulse" />
            <p className="text-xs font-medium text-slate-300">Syncing conversation…</p>
          </div>
        </div>
      ) : isNoChatSelected ? (
        <div className="flex h-full flex-col items-center justify-center px-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/[0.08] bg-surface-2/80 shadow-soft">
            <SparklesIcon className="h-8 w-8 text-indigo-400" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-white">Select a chat to begin</h3>
          <p className="mt-1.5 max-w-sm text-sm text-text-muted">
            Choose an existing conversation from the sidebar or click &ldquo;New Chat&rdquo; to start fresh.
          </p>
        </div>
      ) : messages.length === 0 ? (
        <div className="mx-auto flex h-full max-w-3xl flex-col items-center justify-center py-8 text-center animate-fade-in-up">
          {/* Hero Emblem */}
          <div className="relative mb-6">
            <div className="absolute -inset-2 rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 opacity-25 blur-xl animate-pulse" />
            <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-white/[0.12] bg-gradient-to-tr from-surface via-surface-2 to-surface-3 shadow-glow">
              <UniqueAiLogo size={42} className="h-10 w-10 drop-shadow-[0_0_16px_rgba(99,102,241,0.5)]" />
            </div>
          </div>

          <h2 className="text-2xl font-bold tracking-tight text-white md:text-3xl">
            How can I help you today?
          </h2>
          <p className="mt-2 max-w-md text-sm text-text-muted">
            Next-generation neural intelligence workspace with document grounding, deep reasoning, and live citations.
          </p>

          {/* Starter Suggestion Cards */}
          <div className="mt-8 grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
            {STARTER_PROMPTS.map((starter, index) => {
              const Icon = starter.icon;

              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => onSelectPrompt?.(starter.prompt)}
                  className={`group relative flex flex-col items-start rounded-2xl border bg-surface/60 p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg backdrop-blur ${starter.accent}`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/[0.06] text-slate-200 group-hover:text-white transition-colors">
                      <Icon className="h-4.5 w-4.5" />
                    </span>
                    <span className="text-xs font-semibold text-white group-hover:text-indigo-300 transition-colors">
                      {starter.title}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-text-muted group-hover:text-slate-200 transition-colors">
                    {starter.subtitle}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="mx-auto flex w-full max-w-[860px] flex-col gap-6">
          <AnimatePresence initial={false}>
            {messages.map((message, index) => {
              const isUser = message.role === 'user';
              const isLastMessage = index === messages.length - 1;
              const isCurrentlyStreaming = isStreaming && !isUser && isLastMessage;

              return (
                <motion.article
                  key={message.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.22, ease: 'easeOut' }}
                  className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  {isUser ? (
                    <div className="max-w-[85%] md:max-w-[75%] rounded-3xl rounded-br-md border border-indigo-500/30 bg-gradient-to-tr from-surface-2 to-surface-3 px-5 py-3.5 text-[15px] leading-7 text-white shadow-soft">
                      <p className="whitespace-pre-wrap break-words">{message.content}</p>
                      <p className="mt-1.5 text-right text-[11px] font-medium text-slate-400">
                        {formatMessageTime(message.createdAt)}
                      </p>
                    </div>
                  ) : (
                    <div className="w-full max-w-[96%] md:max-w-[92%] rounded-3xl border border-white/[0.08] bg-surface/70 p-5 md:p-6 text-text shadow-soft backdrop-blur-xl">
                      {/* Assistant Avatar Header */}
                      <div className="mb-4 flex items-center justify-between border-b border-white/[0.06] pb-3">
                        <div className="flex items-center gap-2.5">
                          <UniqueAiLogo size={26} className="h-6.5 w-6.5 shrink-0" />
                          <span className="text-xs font-semibold tracking-wide text-white">
                            Kortex AI
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <CopyMessageButton text={message.content} />
                          <span className="text-[11px] text-text-muted">
                            {formatMessageTime(message.createdAt)}
                          </span>
                        </div>
                      </div>

                      {message.content.length === 0 ? (
                        <div className="flex items-center gap-2.5 py-2 text-text-muted">
                          <span className="h-2 w-2 rounded-full bg-indigo-400 animate-ping" />
                          <span className="text-xs font-medium text-slate-300">Generating response…</span>
                        </div>
                      ) : (
                        <div>
                          <MarkdownContent content={message.content} />
                          {isCurrentlyStreaming ? (
                            <span className="inline-block h-3.5 w-1.5 ml-1 bg-indigo-400 rounded-sm animate-pulse align-middle" />
                          ) : null}
                        </div>
                      )}

                      {message.citations.length > 0 ? (
                        <div className="mt-5 border-t border-white/[0.06] pt-3">
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
                            Grounded Sources ({message.citations.length})
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {message.citations.map((citation, index) => (
                              <Button
                                key={`${message.id}-${citation.chunkId}-${index}`}
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  onPreviewChunks(citation.documentId);
                                }}
                                className="h-7 rounded-full border-emerald-500/30 bg-emerald-500/10 px-3 text-[11px] font-medium text-emerald-300 hover:bg-emerald-500/20"
                              >
                                Source {index + 1} • score {citation.score.toFixed(2)}
                              </Button>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )}
                </motion.article>
              );
            })}
          </AnimatePresence>

          <div ref={messagesBottomRef} />
        </div>
      )}
    </div>
  );
}
