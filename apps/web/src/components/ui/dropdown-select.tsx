import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '../../lib/utils';

export interface DropdownOption {
  value: string;
  label: string;
  mutedLabel?: string;
}

export interface DropdownSelectProps {
  value: string;
  options: DropdownOption[];
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
}

export function DropdownSelect({
  value,
  options,
  onValueChange,
  placeholder = 'Select option',
  disabled = false,
  className,
  triggerClassName,
}: DropdownSelectProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      const target = event.target;
      if (!containerRef.current || !(target instanceof Node)) {
        return;
      }

      if (!containerRef.current.contains(target)) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, []);

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value],
  );

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          'flex h-10 w-full items-center justify-between rounded-lg border border-border bg-surface px-3 text-left text-sm text-text transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-60',
          triggerClassName,
        )}
      >
        <span className={cn('truncate', !selectedOption && 'text-text-muted')}>
          {selectedOption?.label ?? placeholder}
        </span>
        <svg
          viewBox="0 0 20 20"
          aria-hidden="true"
          className={cn('h-6 w-6 text-text-muted transition', open && 'rotate-180')}
        >
          <path
            d="M5.75 7.5L10 12.25L14.25 7.5"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
          />
        </svg>
      </button>

      {open ? (
        <div
          role="listbox"
          style={{ backgroundColor: '#0c1222' }}
          className="animate-dropdown-in absolute right-0 top-full z-[100] mt-1.5 min-w-[210px] max-h-72 overflow-y-auto rounded-2xl border border-white/20 bg-[#0c1222] p-1.5 shadow-2xl ring-1 ring-black/80"
        >
          {options.map((option) => {
            const isSelected = option.value === value;

            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onValueChange(option.value);
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs transition-colors',
                  isSelected
                    ? 'bg-gradient-to-r from-indigo-500/20 to-purple-500/15 text-white font-medium border border-indigo-500/30'
                    : 'text-slate-300 hover:bg-white/[0.08] hover:text-white',
                )}
              >
                <div className="min-w-0">
                  <span className="truncate">{option.label}</span>
                  {option.mutedLabel ? (
                    <p className="truncate text-[10px] text-text-muted">{option.mutedLabel}</p>
                  ) : null}
                </div>
                {isSelected ? (
                  <span className="ml-2 text-indigo-400 font-bold text-xs">✓</span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
