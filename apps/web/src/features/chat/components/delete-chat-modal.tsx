'use client';

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Button } from '../../../components/ui/button';
import type { ApiChat } from '../types';

interface DeleteChatModalProps {
  pendingDeleteChat: ApiChat | null;
  isDeletingChatId: string | null;
  onClose: () => void;
  onConfirm: () => void;
}

export function DeleteChatModal({
  pendingDeleteChat,
  isDeletingChatId,
  onClose,
  onConfirm,
}: DeleteChatModalProps) {
  return (
    <AnimatePresence>
      {pendingDeleteChat ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="w-full max-w-md rounded-2xl border border-border bg-surface p-4 shadow-soft"
            onClick={(event) => event.stopPropagation()}
          >
            <h4 className="text-base font-semibold">Delete chat</h4>
            <p className="mt-2 text-sm leading-6 text-text-muted">
              Are you sure you want to delete{' '}
              <span className="font-medium text-text">{pendingDeleteChat.title}</span>? This will
              remove all associated messages permanently.
            </p>

            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isDeletingChatId === pendingDeleteChat.id}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={onConfirm}
                disabled={isDeletingChatId === pendingDeleteChat.id}
              >
                {isDeletingChatId === pendingDeleteChat.id ? 'Deleting…' : 'Delete'}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

