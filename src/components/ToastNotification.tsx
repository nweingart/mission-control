import { useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';

const borderColors: Record<string, string> = {
  success: 'border-l-spectrum-green',
  warning: 'border-l-houston-amber',
  error: 'border-l-houston-red',
  urgent: 'border-l-houston-red',
};

const dotColors: Record<string, string> = {
  success: 'bg-spectrum-green',
  warning: 'bg-houston-amber',
  error: 'bg-houston-red',
  urgent: 'bg-houston-red',
};

function ToastItem({ toast }: { toast: { id: string; type: string; message: string; ctaLabel?: string; ctaAction?: () => void } }) {
  const removeToast = useAppStore((s) => s.removeToast);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const isUrgent = toast.type === 'urgent';

  useEffect(() => {
    if (isUrgent) return; // urgent toasts don't auto-dismiss
    timerRef.current = setTimeout(() => removeToast(toast.id), 4000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [toast.id, isUrgent, removeToast]);

  return (
    <div
      className={`card-panel border-l-4 ${borderColors[toast.type]} p-4 animate-slide-down ${
        isUrgent ? 'bg-houston-red-soft' : ''
      }`}
    >
      <div className="flex items-center gap-3">
        {/* Status dot */}
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColors[toast.type]}`} />

        {/* Message */}
        <p className="text-sm text-ink flex-1">{toast.message}</p>

        {/* CTA */}
        {toast.ctaLabel && toast.ctaAction && (
          <button
            onClick={() => {
              toast.ctaAction?.();
              removeToast(toast.id);
            }}
            className="text-xs font-semibold text-spectrum-blue hover:text-spectrum-blue/80 transition-colors flex-shrink-0"
          >
            {toast.ctaLabel}
          </button>
        )}

        {/* Dismiss */}
        <button
          onClick={() => removeToast(toast.id)}
          className="text-ink-muted hover:text-ink flex-shrink-0"
          aria-label="Dismiss"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default function ToastNotification() {
  const toasts = useAppStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 w-full max-w-md">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
