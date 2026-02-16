interface CompletionToastProps {
  countdown: number;
  onCancel: () => void;
  onAdvanceNow: () => void;
}

export default function CompletionToast({ countdown, onCancel, onAdvanceNow }: CompletionToastProps) {
  return (
    <div className="absolute bottom-4 left-4 right-4 bg-surface-card border-l-4 border-l-success border border-border p-4 z-10">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <svg className="w-5 h-5 text-success flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          <span className="text-sm text-ink">
            Task appears complete — Advancing in {countdown}s...
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onCancel}
            className="btn-solid px-3 py-1.5 text-sm"
          >
            Cancel
          </button>
          <button
            onClick={onAdvanceNow}
            className="btn-solid-success px-3 py-1.5 text-sm"
          >
            Advance Now
          </button>
        </div>
      </div>
    </div>
  );
}
