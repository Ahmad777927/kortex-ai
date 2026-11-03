import * as React from 'react';
import { cn } from '../../lib/utils';

type AlertVariant = 'default' | 'info' | 'success' | 'warning' | 'destructive';

const alertVariantClasses: Record<AlertVariant, string> = {
  default: 'border-border bg-surface-2 text-text',
  info: 'border-border bg-surface-2 text-text',
  success: 'border-success/30 bg-success/10 text-success',
  warning: 'border-warning/30 bg-warning/10 text-warning',
  destructive: 'border-danger/30 bg-danger/10 text-danger',
};

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: AlertVariant;
}

export function Alert({ className, variant = 'default', ...props }: AlertProps) {
  return (
    <div
      role="alert"
      className={cn('rounded-lg border px-3 py-2 text-sm', alertVariantClasses[variant], className)}
      {...props}
    />
  );
}

export function AlertDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('leading-6', className)} {...props} />;
}
