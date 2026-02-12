import { useState, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';

const DEFAULT_PATH = '~/development/kiln';

export default function SetupWorkspaceScreen() {
  const { screen, setScreen, completeWorkspaceSetup } = useAppStore();
  const [directoryPath, setDirectoryPath] = useState(DEFAULT_PATH);
  const [isFromSettings, setIsFromSettings] = useState(false);

  // Determine if we arrived from settings (screen was set directly from home)
  // We detect this by checking if workspace was already set up
  useEffect(() => {
    const checkSource = async () => {
      try {
        const config = await window.api.storage.getConfig();
        if (config.hasSetWorkspace) {
          setIsFromSettings(true);
          setDirectoryPath(config.developmentPath || DEFAULT_PATH);
        }
      } catch (err) {
        console.error('Failed to load config:', err);
      }
    };
    checkSource();
  }, []);

  const handleBrowse = async () => {
    // Expand ~ for the native dialog
    const expandedPath = directoryPath.startsWith('~')
      ? directoryPath.replace('~', '')
      : directoryPath;
    const selected = await window.api.dialog.selectDirectory(expandedPath || undefined);
    if (selected) {
      setDirectoryPath(selected);
    }
  };

  const handleUseDefault = () => {
    setDirectoryPath(DEFAULT_PATH);
  };

  const handleContinue = async () => {
    // Expand ~ to actual home directory path for storage
    // The main process will handle ~ expansion, but we store what the user sees
    await completeWorkspaceSetup(directoryPath);
    if (isFromSettings) {
      setScreen('home');
    }
    // Otherwise completeWorkspaceSetup navigates to setup-claude
  };

  const handleBack = () => {
    setScreen('home');
  };

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Header */}
      <header className="bg-surface-card border-b border-border px-6 py-4 drag-region header-with-traffic-lights">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-sans font-medium text-accent">
                {isFromSettings ? 'Settings' : 'Step 1 of 2'}
              </span>
            </div>
            <h1 className="text-xl font-sans font-bold text-ink mt-1">Choose Workspace</h1>
            <p className="text-ink-muted text-sm">
              Select where your projects will be stored on disk
            </p>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto">
          {/* Workspace Card */}
          <div className="card-panel p-6">
            <div className="flex items-start space-x-4">
              <div className="flex-shrink-0 w-12 h-12 bg-accent/15 flex items-center justify-center">
                <svg className="w-6 h-6 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
              </div>
              <div className="flex-1">
                <h2 className="text-base font-sans font-semibold text-ink">Workspace Directory</h2>
                <p className="text-ink-muted mt-1">
                  Each project gets its own folder inside this directory
                </p>
              </div>
            </div>

            {/* Directory path display */}
            <div className="mt-6">
              <label className="block text-sm font-sans font-medium text-ink-secondary mb-2">
                Project directory
              </label>
              <div className="flex items-center space-x-3">
                <div className="flex-1 input-inset px-4 py-3 text-ink font-mono text-sm truncate">
                  {directoryPath}
                </div>
                <button
                  onClick={handleBrowse}
                  className="btn-solid-primary px-4 py-3 text-sm no-drag flex-shrink-0"
                >
                  Browse...
                </button>
              </div>

              {/* Use Default link */}
              {directoryPath !== DEFAULT_PATH && (
                <button
                  onClick={handleUseDefault}
                  className="mt-2 text-sm text-accent hover:text-accent transition-colors no-drag"
                >
                  Use default ({DEFAULT_PATH})
                </button>
              )}
            </div>

            {/* Info box */}
            <div className="mt-6 p-4 bg-surface-card border border-border">
              <div className="flex items-start space-x-3">
                <svg className="w-5 h-5 text-ink-muted flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="text-sm text-ink-muted">
                  <p>When you create a project named "my-app", it will be stored at:</p>
                  <code className="block mt-1 text-ink font-mono">{directoryPath}/my-app/</code>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-8 flex justify-between items-center">
            {isFromSettings ? (
              <button
                onClick={handleBack}
                className="btn-solid flex items-center space-x-2 px-4 py-2 no-drag"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                <span>Back</span>
              </button>
            ) : (
              <div />
            )}

            <button
              onClick={handleContinue}
              className="btn-solid-primary flex items-center space-x-2 px-6 py-2 no-drag"
            >
              <span>Continue</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
