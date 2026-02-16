import { useState, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import ReactMarkdown from 'react-markdown';

export default function PRDReviewScreen() {
  const {
    currentProject,
    updateProject,
    goToDiscovery,
    goToPlanning,
  } = useAppStore();

  const [prd, setPrd] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const loadPRD = async () => {
      if (!currentProject) return;

      try {
        const prdContent = await window.api.storage.getPRD(currentProject.slug);
        setPrd(prdContent);
      } catch (err) {
        console.error('Failed to load PRD:', err);
        setError('Failed to load PRD');
      } finally {
        setIsLoading(false);
      }
    };

    loadPRD();
  }, [currentProject]);

  const handleApprove = async () => {
    if (!currentProject) return;
    await updateProject({ status: 'planning' });
    goToPlanning();
  };

  const handleGoBack = () => {
    goToDiscovery();
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-surface-card">
        <div className="w-12 h-12 border-4 border-accent border-t-transparent animate-spin"></div>
      </div>
    );
  }

  if (error || !prd) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-surface-card">
        <div className="text-center">
          <div className="text-error text-5xl mb-4">!</div>
          <h2 className="text-base font-sans font-semibold text-ink mb-2">Could not load PRD</h2>
          <p className="text-ink-secondary mb-4">{error || 'PRD not found'}</p>
          <button
            onClick={handleGoBack}
            className="btn-solid-primary px-4 py-2"
          >
            Go Back to Discovery
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-surface-card relative">
      {/* Header */}
      <header className="bg-surface-card border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={handleGoBack}
              className="text-ink-muted hover:text-ink transition-colors no-drag"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-xl font-sans font-bold text-ink">{currentProject?.name}</h1>
              <p className="text-ink-muted text-sm">Review your Product Requirements Document</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-ink-muted">Step 2 of 4</span>
            <div className="flex space-x-1">
              <div className="w-2 h-2 bg-accent"></div>
              <div className="w-2 h-2 bg-accent"></div>
              <div className="w-2 h-2 bg-border"></div>
              <div className="w-2 h-2 bg-border"></div>
            </div>
          </div>
        </div>
      </header>

      {/* PRD Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-8">
          {/* PRD Document */}
          <div className="card-panel p-8 relative">
            <button
              onClick={() => {
                navigator.clipboard.writeText(prd).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                });
              }}
              className="absolute top-4 right-4 p-2 text-ink-muted hover:text-ink transition-colors"
              title="Copy PRD to clipboard"
            >
              {copied ? (
                <svg className="w-5 h-5 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
            </button>
            <div className="prose max-w-none prose-headings:text-ink prose-h1:text-2xl prose-h2:text-xl prose-h2:border-b prose-h2:pb-2 prose-h2:mb-4 prose-h3:text-lg prose-p:text-ink-secondary prose-li:text-ink-secondary prose-strong:text-ink prose-code:bg-surface-light prose-code:px-1 prose-code:py-0.5 prose-code:text-sm prose-pre:bg-surface-light prose-pre:text-ink">
              <ReactMarkdown>{prd}</ReactMarkdown>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-8 flex justify-between items-center">
            <button
              onClick={handleGoBack}
              className="flex items-center space-x-2 px-4 py-2 text-ink-muted hover:text-ink transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span>Back to Discussion</span>
            </button>

            <button
              onClick={handleApprove}
              className="btn-solid-primary flex items-center space-x-2 px-6 py-3"
            >
              <span>Approve & Generate Tasks</span>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </button>
          </div>

          {/* Help text */}
          <p className="mt-4 text-center text-sm text-ink-muted">
            Review the PRD above. If you need changes, go back and continue the conversation.
          </p>
        </div>
      </main>
    </div>
  );
}
