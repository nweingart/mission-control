import { useState, useEffect, useRef } from 'react';
import type { DecisionRequest } from '../types';

const AUTO_RESOLVE_MS = 10 * 60 * 1000; // 10 minutes

interface DecisionPointProps {
  taskId: string;
  taskTitle: string;
  decision: DecisionRequest;
  onResolve: (taskId: string, response: string) => void;
}

export default function DecisionPoint({ taskId, taskTitle, decision, onResolve }: DecisionPointProps) {
  const [freeformInput, setFreeformInput] = useState('');
  const [remainingMs, setRemainingMs] = useState(AUTO_RESOLVE_MS);
  const [autoResolved, setAutoResolved] = useState(false);
  const resolvedRef = useRef(false);

  const handleResolve = (response: string) => {
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    onResolve(taskId, response);
  };

  // Countdown timer + auto-resolve when it hits 0
  useEffect(() => {
    const start = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      const remaining = Math.max(0, AUTO_RESOLVE_MS - elapsed);
      setRemainingMs(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        if (!resolvedRef.current) {
          setAutoResolved(true);
          const autoResponse = decision.options?.[0]
            ? `[auto] Proceeding with: ${decision.options[0]}`
            : '[auto] Proceeding with your best judgment.';
          handleResolve(autoResponse);
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const formatTime = (ms: number) => {
    const totalSec = Math.ceil(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
  };

  const timerPct = (remainingMs / AUTO_RESOLVE_MS) * 100;
  const isUrgent = remainingMs < 60_000;

  if (autoResolved) {
    return (
      <div className="bg-surface-light border border-border rounded-lg p-3 mb-3 text-xs text-ink-muted">
        Auto-resolved: proceeding with {decision.options?.[0] ? `"${decision.options[0]}"` : 'default approach'}
      </div>
    );
  }

  return (
    <div className="bg-accent/5 border border-accent/30 rounded-lg p-4 mb-3 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent"></span>
          </span>
          <span className="text-xs font-medium text-accent uppercase tracking-wider">Decision needed</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-mono ${isUrgent ? 'text-red-400' : 'text-ink-muted'}`}>
            {formatTime(remainingMs)}
          </span>
          <div className="w-16 h-1 bg-surface-light rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${isUrgent ? 'bg-red-400' : 'bg-accent/50'}`}
              style={{ width: `${timerPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Task context */}
      <p className="text-xs text-ink-muted mb-2">{taskTitle}</p>

      {/* Question */}
      <p className="text-sm font-medium text-ink mb-2">{decision.question}</p>

      {/* Context */}
      {decision.context && (
        <p className="text-xs text-ink-secondary mb-3 leading-relaxed">{decision.context}</p>
      )}

      {/* Options */}
      {decision.options && decision.options.length > 0 && (
        <div className="space-y-1.5 mb-3">
          {decision.options.map((option, i) => (
            <button
              key={i}
              type="button"
              onClick={() => handleResolve(option)}
              className="w-full text-left px-3 py-2 text-sm rounded border border-border bg-surface hover:bg-surface-light hover:border-accent/40 transition-colors text-ink"
            >
              <span className="text-accent font-mono text-xs mr-2">{i + 1}.</span>
              {option}
            </button>
          ))}
        </div>
      )}

      {/* Freeform input */}
      <div className="flex gap-2">
        <input
          type="text"
          value={freeformInput}
          onChange={(e) => setFreeformInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && freeformInput.trim()) {
              handleResolve(freeformInput.trim());
            }
          }}
          placeholder="Or type your own guidance..."
          className="flex-1 px-3 py-1.5 text-sm bg-surface border border-border rounded focus:outline-none focus:border-accent/50 text-ink placeholder:text-ink-muted"
        />
        <button
          type="button"
          onClick={() => {
            if (freeformInput.trim()) handleResolve(freeformInput.trim());
          }}
          disabled={!freeformInput.trim()}
          className="px-3 py-1.5 text-sm font-medium bg-accent text-black rounded hover:bg-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Send
        </button>
      </div>
    </div>
  );
}
