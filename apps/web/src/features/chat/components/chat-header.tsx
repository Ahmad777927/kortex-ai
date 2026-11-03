'use client';

import React from 'react';
import { Badge } from '../../../components/ui/badge';
import { DropdownSelect } from '../../../components/ui/dropdown-select';
import { SparklesIcon, MenuIcon } from '../../../components/chat/icons';
import type { ApiChat, ApiAvailableModel } from '../types';

interface ChatHeaderProps {
  activeChat: ApiChat | null;
  selectedModel: string;
  modelDropdownOptions: { value: string; label: string }[];
  modelOptions: ApiAvailableModel[];
  modelsSource: 'gemini' | 'fallback' | null;
  isUpdatingModel: boolean;
  isModelsLoading: boolean;
  isRagEnabled: boolean;
  onSwitchModel: (nextModel: string) => void;
  onToggleMobileSidebar?: () => void;
}

export function ChatHeader({
  activeChat,
  selectedModel,
  modelDropdownOptions,
  modelOptions,
  modelsSource,
  isUpdatingModel,
  isModelsLoading,
  isRagEnabled,
  onSwitchModel,
  onToggleMobileSidebar,
}: ChatHeaderProps) {
  const currentModelName = activeChat?.model ?? selectedModel;

  return (
    <header className="relative z-40 border-b border-white/[0.06] bg-[#0E1424] px-4 py-3.5 backdrop-blur-xl transition-all md:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {onToggleMobileSidebar ? (
            <button
              type="button"
              onClick={onToggleMobileSidebar}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-surface-2/80 text-slate-200 hover:bg-white/[0.08] hover:text-white lg:hidden transition-colors"
              title="Toggle sidebar"
            >
              <MenuIcon className="h-4.5 w-4.5" />
            </button>
          ) : null}

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)] animate-pulse" />
              <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-400">
                {activeChat ? 'Active Conversation' : 'New Session'}
              </p>
            </div>
            <h2 className="mt-0.5 line-clamp-1 text-base md:text-lg font-semibold tracking-tight text-white">
              {activeChat?.title ?? 'Start a new conversation'}
            </h2>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-surface-2/80 p-1 shadow-inner backdrop-blur">
            <div className="flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium text-text-muted">
              <SparklesIcon className="h-3.5 w-3.5 text-indigo-400" />
              <span className="hidden sm:inline">Model:</span>
            </div>

            <DropdownSelect
              value={currentModelName}
              options={modelDropdownOptions}
              onValueChange={onSwitchModel}
              disabled={isUpdatingModel || isModelsLoading || modelOptions.length === 0}
              placeholder="Select Model"
              className="min-w-[170px] sm:min-w-[210px]"
              triggerClassName="h-8 text-xs font-medium bg-surface/90 border-white/[0.06] hover:border-white/20 rounded-lg text-white outline-none focus:outline-none focus:ring-0"
            />
          </div>

          <Badge
            variant="secondary"
            className="hidden md:inline-flex items-center gap-1.5 border-white/[0.08] bg-surface-2/80 px-2.5 py-1 text-[11px] font-medium text-slate-300"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
            {isModelsLoading
              ? 'Loading…'
              : 'Neural Cloud'}
          </Badge>

          <Badge
            variant="outline"
            className={`border px-2.5 py-1 text-[11px] font-medium transition-colors ${
              isRagEnabled
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                : 'border-white/[0.06] bg-surface-2/50 text-text-muted'
            }`}
          >
            RAG: {isRagEnabled ? 'Active' : 'Off'}
          </Badge>
        </div>
      </div>
    </header>
  );
}
