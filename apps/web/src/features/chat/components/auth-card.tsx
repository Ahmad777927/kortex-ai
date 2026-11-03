'use client';

import React, { FormEvent, useState } from 'react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Card } from '../../../components/ui/card';
import { Alert, AlertDescription } from '../../../components/ui/alert';
import { SparklesIcon, EyeIcon, EyeOffIcon } from '../../../components/chat/icons';
import { UniqueAiLogo } from '../../../components/chat/ai-logo';
import { cn } from '../../../lib/utils';

export type AuthMode = 'login' | 'signup';

interface AuthCardProps {
  authMode: AuthMode;
  setAuthMode: (mode: AuthMode) => void;
  name: string;
  setName: (name: string) => void;
  email: string;
  setEmail: (email: string) => void;
  password: string;
  setPassword: (password: string) => void;
  isAuthSubmitting: boolean;
  error: string | null;
  onClearError?: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function AuthCard({
  authMode,
  setAuthMode,
  name,
  setName,
  email,
  setEmail,
  password,
  setPassword,
  isAuthSubmitting,
  error,
  onClearError,
  onSubmit,
}: AuthCardProps) {
  const [showPassword, setShowPassword] = useState(false);

  function handleTabChange(mode: AuthMode) {
    setAuthMode(mode);
    onClearError?.();
    setShowPassword(false);
  }

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-bg px-4 py-8 text-text">
      {/* Ambient Dribbble Backdrop Glows */}
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[500px] w-[600px] -translate-x-1/2 rounded-full bg-gradient-to-tr from-indigo-600/20 via-purple-600/15 to-transparent blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-40 right-1/4 h-[400px] w-[500px] rounded-full bg-gradient-to-br from-cyan-600/15 via-indigo-600/10 to-transparent blur-[100px]" />

      <Card className="relative w-full max-w-md rounded-3xl border border-white/[0.10] bg-surface/80 p-7 shadow-2xl backdrop-blur-2xl md:p-9 animate-fade-in-up">
        {/* Brand Icon & Heading */}
        <div className="flex items-center gap-3">
          <UniqueAiLogo size={44} className="h-11 w-11 drop-shadow-[0_0_16px_rgba(99,102,241,0.5)]" />
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">
              Neural Workspace
            </span>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-1.5">
              <span>Kortex</span>
              <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">AI</span>
            </h1>
          </div>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-text-muted">
          Sign in to your private neural AI workspace with grounded document search and deep reasoning.
        </p>

        {/* Auth Mode Toggle Tabs */}
        <div className="mt-6 grid grid-cols-2 rounded-2xl border border-white/[0.08] bg-surface-2/70 p-1">
          <button
            type="button"
            onClick={() => handleTabChange('login')}
            className={cn(
              'h-9 rounded-xl text-xs font-semibold transition-all duration-200',
              authMode === 'login'
                ? 'bg-gradient-to-r from-indigo-500 to-indigo-600 text-white shadow-md'
                : 'text-text-muted hover:text-white',
            )}
          >
            Login
          </button>
          <button
            type="button"
            onClick={() => handleTabChange('signup')}
            className={cn(
              'h-9 rounded-xl text-xs font-semibold transition-all duration-200',
              authMode === 'signup'
                ? 'bg-gradient-to-r from-indigo-500 to-indigo-600 text-white shadow-md'
                : 'text-text-muted hover:text-white',
            )}
          >
            Sign Up
          </button>
        </div>

        <form className="mt-6 space-y-3.5" onSubmit={onSubmit}>
          {authMode === 'signup' ? (
            <div>
              <label className="text-[11px] font-medium text-slate-300">Full Name</label>
              <Input
                className="mt-1 h-10 rounded-xl border-white/[0.08] bg-surface-2/60 text-xs text-white placeholder:text-text-muted/60 focus-visible:border-indigo-500"
                placeholder="Ahmad Arshad"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
              />
            </div>
          ) : null}

          <div>
            <label className="text-[11px] font-medium text-slate-300">Email Address</label>
            <Input
              className="mt-1 h-10 rounded-xl border-white/[0.08] bg-surface-2/60 text-xs text-white placeholder:text-text-muted/60 focus-visible:border-indigo-500"
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-medium text-slate-300">Password</label>
              {authMode === 'signup' ? (
                <span className="text-[10px] text-text-muted">Min. 8 characters</span>
              ) : null}
            </div>
            <div className="relative mt-1">
              <Input
                className="h-10 rounded-xl border-white/[0.08] bg-surface-2/60 pr-10 text-xs text-white placeholder:text-text-muted/60 focus-visible:border-indigo-500"
                type={showPassword ? 'text' : 'password'}
                placeholder={authMode === 'signup' ? 'At least 8 characters' : 'Enter your password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-white transition-colors"
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {error ? (
            <Alert variant="destructive" className="rounded-xl border-red-500/30 bg-red-500/10 py-2 text-xs text-red-300">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <Button
            type="submit"
            disabled={isAuthSubmitting}
            className="mt-2 h-10 w-full rounded-xl bg-gradient-to-r from-indigo-500 via-indigo-600 to-purple-600 text-xs font-semibold text-white shadow-lg shadow-indigo-500/25 hover:from-indigo-400 hover:to-purple-500 transition-all active:scale-[0.98] disabled:opacity-50"
          >
            {isAuthSubmitting
              ? 'Authenticating…'
              : authMode === 'login'
                ? 'Sign In to Workspace'
                : 'Create Account'}
          </Button>
        </form>
      </Card>
    </main>
  );
}
