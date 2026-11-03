'use client';

import React, { KeyboardEvent, FormEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Button } from '../../../components/ui/button';
import { Switch } from '../../../components/ui/switch';
import { Textarea } from '../../../components/ui/textarea';
import { Alert, AlertDescription } from '../../../components/ui/alert';
import { SendIcon, StopIcon, RefreshIcon } from '../../../components/chat/icons';

interface MessageComposerProps {
  composer: string;
  setComposer: (value: string) => void;
  isSending: boolean;
  isRegenerating: boolean;
  isMessagesLoading: boolean;
  isRagEnabled: boolean;
  setIsRagEnabled: (enabled: boolean) => void;
  canRegenerateLastResponse: boolean;
  modelNotice: string | null;
  groundingNotice: string | null;
  onSendMessage: (event: FormEvent<HTMLFormElement>) => void;
  onRegenerate: () => void;
  onStop: () => void;
}

export function MessageComposer({
  composer,
  setComposer,
  isSending,
  isRegenerating,
  isMessagesLoading,
  isRagEnabled,
  setIsRagEnabled,
  canRegenerateLastResponse,
  modelNotice,
  groundingNotice,
  onSendMessage,
  onRegenerate,
  onStop,
}: MessageComposerProps) {
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  const isBusy = isSending || isRegenerating;

  return (
    <footer className="border-t border-white/[0.06] bg-surface/50 px-4 py-4 backdrop-blur-xl md:px-8">
      <AnimatePresence>
        {modelNotice ? (
          <motion.div
            key="model-notice"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="mx-auto mb-3 max-w-[860px]"
          >
            <Alert variant="info" className="border-indigo-500/30 bg-indigo-500/10 text-indigo-300">
              <AlertDescription>{modelNotice}</AlertDescription>
            </Alert>
          </motion.div>
        ) : null}

        {groundingNotice ? (
          <motion.div
            key="grounding-notice"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25 }}
            className="mx-auto mb-3 max-w-[860px]"
          >
            <Alert variant="success" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300 shadow-sm shadow-emerald-500/10">
              <AlertDescription>{groundingNotice}</AlertDescription>
            </Alert>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <form onSubmit={onSendMessage} className="mx-auto w-full max-w-[860px]">
        {/* Linear gradient focus container */}
        <div className="group relative rounded-[28px] p-[1.5px] transition-all duration-300 bg-gradient-to-r from-white/[0.08] via-white/[0.06] to-white/[0.08] focus-within:from-indigo-500 focus-within:via-purple-500 focus-within:to-cyan-400 focus-within:shadow-[0_0_35px_-8px_rgba(99,102,241,0.45)]">
          <div className="relative rounded-[26.5px] bg-[#0E1424]/95 p-3 backdrop-blur-2xl">
            <Textarea
              rows={2}
              value={composer}
              onChange={(event) => setComposer(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask Kortex anything or paste your code..."
              className="min-h-[72px] resize-none border-none bg-transparent px-3 py-1 text-[15px] leading-7 text-white placeholder:text-text-muted/60 shadow-none outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
            />

            <div className="mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-2.5 px-2">
              <label className="inline-flex cursor-pointer items-center gap-2.5 text-xs font-medium text-text-muted hover:text-white transition-colors">
                <Switch checked={isRagEnabled} onCheckedChange={setIsRagEnabled} />
                <span>Grounded mode with citations</span>
              </label>

              <div className="flex items-center gap-2">
                {isBusy ? (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={onStop}
                    className="h-10 rounded-full px-4 gap-2 border border-red-500/50 bg-red-500/15 text-red-300 hover:bg-red-500/25 transition-all shadow-md shadow-red-500/20"
                  >
                    <StopIcon className="h-4 w-4 text-red-400" />
                    <span className="text-xs font-semibold">Stop</span>
                  </Button>
                ) : (
                  <>
                    {canRegenerateLastResponse ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={onRegenerate}
                        disabled={isMessagesLoading}
                        className="h-9 gap-1.5 rounded-full border-white/[0.08] bg-surface/80 px-3.5 text-xs font-medium text-slate-300 hover:bg-surface hover:text-white"
                      >
                        <RefreshIcon className="h-3.5 w-3.5" />
                        <span>Regenerate</span>
                      </Button>
                    ) : null}

                    <Button
                      type="submit"
                      disabled={isMessagesLoading || composer.trim().length === 0}
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-tr from-indigo-500 via-indigo-600 to-purple-600 p-0 text-white shadow-md shadow-indigo-500/30 transition-all hover:scale-105 hover:from-indigo-400 hover:to-purple-500 active:scale-95 disabled:opacity-40 disabled:hover:scale-100"
                      title="Send message"
                    >
                      <SendIcon className="h-5 w-5 ml-0.5 text-white" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <p className="mt-2 text-center text-[11px] text-text-muted/70">
          AI generated content may contain inaccuracies. Verify critical information.
        </p>
      </form>
    </footer>
  );
}
