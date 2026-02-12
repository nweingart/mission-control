import { useAppStore } from '../store/useAppStore';

export default function SettingsScreen() {
  const { setScreen, resetOnboarding } = useAppStore();

  const handleResetOnboarding = () => {
    if (window.confirm('Reset onboarding walkthrough? You will see the intro screens again.')) {
      resetOnboarding();
    }
  };

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Header */}
      <header className="border-b border-border px-6 py-3 drag-region flex items-center gap-3 header-with-traffic-lights">
        <button
          onClick={() => setScreen('home')}
          className="no-drag text-ink-muted hover:text-ink transition-colors"
          title="Back to Home"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="font-display text-lg tracking-wide font-bold text-secondary">Settings</h1>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-lg mx-auto space-y-6">
          {/* Navigation shortcuts */}
          <section className="card-panel p-5 space-y-1">
            <h2 className="text-sm font-semibold text-ink mb-3">Configuration</h2>
            <button
              onClick={() => setScreen('setup-deploy')}
              className="w-full text-left px-3 py-2.5 rounded-lg text-sm text-ink hover:bg-surface-hover transition-colors flex items-center justify-between"
            >
              Manage Tools
              <svg className="w-4 h-4 text-ink-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <button
              onClick={() => setScreen('setup-workspace')}
              className="w-full text-left px-3 py-2.5 rounded-lg text-sm text-ink hover:bg-surface-hover transition-colors flex items-center justify-between"
            >
              Workspace Directory
              <svg className="w-4 h-4 text-ink-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <button
              onClick={handleResetOnboarding}
              className="w-full text-left px-3 py-2.5 rounded-lg text-sm text-ink hover:bg-surface-hover transition-colors"
            >
              Reset Onboarding
            </button>
          </section>

          {/* Debug / Test */}
          <section className="card-panel p-5 space-y-1">
            <h2 className="text-sm font-semibold text-ink mb-3">Debug</h2>
            <button
              onClick={() => (window as unknown as { openFlowTest?: () => void }).openFlowTest?.()}
              className="w-full text-left px-3 py-2.5 rounded-lg text-sm text-ink hover:bg-surface-hover transition-colors"
            >
              Run Flow Test
            </button>
            <button
              onClick={() => (window as unknown as { openE2ETest?: () => void }).openE2ETest?.()}
              className="w-full text-left px-3 py-2.5 rounded-lg text-sm text-ink hover:bg-surface-hover transition-colors"
            >
              Run E2E Test
            </button>
            <button
              onClick={() => (window as unknown as { openCICDTest?: () => void }).openCICDTest?.()}
              className="w-full text-left px-3 py-2.5 rounded-lg text-sm text-ink hover:bg-surface-hover transition-colors"
            >
              Run CI/CD Test
            </button>
          </section>
        </div>
      </main>
    </div>
  );
}
