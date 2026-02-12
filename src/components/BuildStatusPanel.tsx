import type { TaskPhase } from '../types';

interface BuildStatusPanelProps {
  taskPhase: TaskPhase;
  currentBranch: string;
  error: string | null;
  onRetry: () => void;
}

const SpinnerIcon = () => (
  <div className="w-6 h-6 border-4 border-accent border-t-transparent animate-spin" />
);

export default function BuildStatusPanel({ taskPhase, currentBranch, error, onRetry }: BuildStatusPanelProps) {
  return (
    <div className="h-full flex items-center justify-center bg-surface border border-border">
      <div className="text-center p-8">
        {taskPhase === 'idle' && (
          <>
            <div className="w-12 h-12 mx-auto mb-4 bg-border flex items-center justify-center">
              <svg className="w-6 h-6 text-ink-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-ink-muted font-display uppercase tracking-wider text-[13px]">Preparing pipeline...</p>
          </>
        )}
        {taskPhase === 'branching' && (
          <>
            <div className="w-12 h-12 mx-auto mb-4 bg-accent/15 flex items-center justify-center text-accent">
              <SpinnerIcon />
            </div>
            <p className="text-accent font-display uppercase tracking-wider text-[13px]">Creating branch</p>
            <p className="text-sm text-ink-muted mt-1 font-mono">{currentBranch}</p>
          </>
        )}
        {taskPhase === 'committing' && (
          <>
            <div className="w-12 h-12 mx-auto mb-4 bg-accent/15 flex items-center justify-center text-accent">
              <SpinnerIcon />
            </div>
            <p className="text-accent font-display uppercase tracking-wider text-[13px]">Committing changes</p>
          </>
        )}
        {taskPhase === 'merging' && (
          <>
            <div className="w-12 h-12 mx-auto mb-4 bg-accent/15 flex items-center justify-center text-accent">
              <SpinnerIcon />
            </div>
            <p className="text-accent font-display uppercase tracking-wider text-[13px]">Merging to main</p>
            <p className="text-sm text-ink-muted mt-1 font-mono">{currentBranch}</p>
          </>
        )}
        {taskPhase === 'pushing' && (
          <>
            <div className="w-12 h-12 mx-auto mb-4 bg-success/15 flex items-center justify-center text-success">
              <SpinnerIcon />
            </div>
            <p className="text-success font-display uppercase tracking-wider text-[13px]">Pushing to remote</p>
          </>
        )}
        {taskPhase === 'error' && (
          <>
            <div className="w-12 h-12 mx-auto mb-4 bg-error/15 flex items-center justify-center">
              <svg className="w-6 h-6 text-error" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <p className="text-error font-display uppercase tracking-wider text-[13px]">Pipeline Error</p>
            <p className="text-sm text-ink-muted mt-1">{error}</p>
            <button
              onClick={onRetry}
              className="btn-solid-danger mt-4 px-4 py-2 text-sm"
            >
              Retry
            </button>
          </>
        )}
      </div>
    </div>
  );
}
