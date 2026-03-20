import { useEffect, useRef } from 'react';
import { useProjectStore } from '../store/ProjectStoreContext';

export default function GamificationToast() {
  const gamificationEvent = useProjectStore((s) => s.gamificationEvent);
  const clearGamificationEvent = useProjectStore((s) => s.clearGamificationEvent);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!gamificationEvent) return;

    if (timerRef.current) clearTimeout(timerRef.current);

    const duration = gamificationEvent.type === 'rank_up' ? 5000 : 4000;
    timerRef.current = setTimeout(() => {
      clearGamificationEvent();
    }, duration);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [gamificationEvent, clearGamificationEvent]);

  if (!gamificationEvent) return null;

  const borderColor = gamificationEvent.type === 'rank_up' ? 'border-l-mc-green' : 'border-l-mc-amber';

  return (
    <div className={`fixed top-4 left-1/2 -translate-x-1/2 max-w-md card-panel border-l-4 ${borderColor} p-4 z-50 animate-slide-down`}>
      <div className="flex items-center gap-3">
        {/* Assistant avatar */}
        <div className="w-8 h-8 rounded-full bg-surface-hover flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-mc-green" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M8 14s1.5 2 4 2 4-2 4-2" />
            <line x1="9" y1="9" x2="9.01" y2="9" />
            <line x1="15" y1="9" x2="15.01" y2="9" />
          </svg>
        </div>

        <div className="flex-1">
          <p className="text-xs font-mono text-ink-muted uppercase tracking-wider">
            {gamificationEvent.type === 'rank_up' ? 'Rank Up' : 'Milestone'}
          </p>
          <p className="text-sm font-medium text-ink">{gamificationEvent.label}</p>
        </div>

        <button
          onClick={clearGamificationEvent}
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
