import { useState, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import ReactMarkdown from 'react-markdown';

export default function PRDReviewScreen() {
  const {
    currentProject,
    updateProject,
    goToHome,
    goToDiscovery,
    goToPlanning,
  } = useAppStore();

  const [prd, setPrd] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    await updateProject({ status: 'planning' });
    goToPlanning();
  };

  const handleGoBack = () => {
    goToDiscovery();
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-charcoal-800">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-terracotta-500"></div>
      </div>
    );
  }

  if (error || !prd) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-charcoal-800">
        <div className="text-center">
          <div className="text-rust-500 text-5xl mb-4">!</div>
          <h2 className="text-xl font-semibold text-cream-100 mb-2">Could not load PRD</h2>
          <p className="text-charcoal-200 mb-4">{error || 'PRD not found'}</p>
          <button
            onClick={handleGoBack}
            className="px-4 py-2 bg-terracotta-500 text-charcoal-950 rounded-lg hover:bg-terracotta-600"
          >
            Go Back to Discovery
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-charcoal-800">
      {/* Header */}
      <header className="bg-charcoal-800 border-b border-charcoal-600 px-6 py-4 drag-region header-with-traffic-lights">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={handleGoBack}
              className="text-charcoal-300 hover:text-cream-100 transition-colors no-drag"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-xl font-bold text-cream-100">{currentProject?.name}</h1>
              <p className="text-charcoal-300 text-sm">Review your Product Requirements Document</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-charcoal-300">Step 2 of 4</span>
            <div className="flex space-x-1">
              <div className="w-2 h-2 rounded-full bg-terracotta-500"></div>
              <div className="w-2 h-2 rounded-full bg-terracotta-500"></div>
              <div className="w-2 h-2 rounded-full bg-charcoal-600"></div>
              <div className="w-2 h-2 rounded-full bg-charcoal-600"></div>
            </div>
          </div>
        </div>
      </header>

      {/* PRD Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-8">
          {/* PRD Document */}
          <div className="bg-stone-200 rounded-xl shadow-sm border border-stone-300 p-8">
            <div className="prose prose-gray max-w-none prose-headings:text-charcoal prose-h1:text-2xl prose-h2:text-xl prose-h2:border-b prose-h2:pb-2 prose-h2:mb-4 prose-h3:text-lg prose-p:text-stone-700 prose-li:text-stone-700 prose-strong:text-charcoal prose-code:bg-stone-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-pre:bg-charcoal-950 prose-pre:text-cream-100">
              <ReactMarkdown>{prd}</ReactMarkdown>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-8 flex justify-between items-center">
            <button
              onClick={handleGoBack}
              className="flex items-center space-x-2 px-4 py-2 text-charcoal-300 hover:text-cream-100 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span>Back to Discussion</span>
            </button>

            <button
              onClick={handleApprove}
              className="flex items-center space-x-2 px-6 py-3 bg-terracotta-500 text-charcoal-950 rounded-lg hover:bg-terracotta-600 transition-colors"
            >
              <span>Approve & Generate Tasks</span>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </button>
          </div>

          {/* Help text */}
          <p className="mt-4 text-center text-sm text-charcoal-400">
            Review the PRD above. If you need changes, go back and continue the conversation.
          </p>
        </div>
      </main>
    </div>
  );
}
