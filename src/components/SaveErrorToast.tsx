import { useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';

export default function SaveErrorToast() {
  const saveError = useAppStore((s) => s.saveError);
  const setSaveError = useAppStore((s) => s.setSaveError);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!saveError) return;

    // Clear any existing timer
    if (timerRef.current) clearTimeout(timerRef.current);

    // Auto-dismiss after 4 seconds
    timerRef.current = setTimeout(() => {
      setSaveError(null);
    }, 4000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [saveError, setSaveError]);

  if (!saveError) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 max-w-md card-panel border-l-4 border-l-error p-4 z-50 animate-slide-down">
      <div className="flex items-start gap-3">
        <svg className="w-5 h-5 text-error flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
        <p className="text-sm text-ink flex-1">{saveError}</p>
        <button
          onClick={() => setSaveError(null)}
          className="text-ink-muted hover:text-ink flex-shrink-0"
          aria-label="Dismiss"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>
    </div>
  );
}
