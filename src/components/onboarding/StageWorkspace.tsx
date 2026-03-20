import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import mcAvatar from '../../assets/mc-avatar.webp';

interface StageWorkspaceProps {
  onComplete: () => void;
}

const DEFAULT_PATH = '~/development';

export default function StageWorkspace({ onComplete }: StageWorkspaceProps) {
  const completeOnboardingStage = useAppStore(s => s.completeOnboardingStage);
  const [directoryPath, setDirectoryPath] = useState(DEFAULT_PATH);
  const [hasAnimated, setHasAnimated] = useState(false);

  const handleBrowse = async () => {
    const expandedPath = directoryPath.startsWith('~')
      ? directoryPath.replace('~', '')
      : directoryPath;
    const selected = await window.api.dialog.selectDirectory(expandedPath || undefined);
    if (selected) {
      setDirectoryPath(selected);
    }
  };

  const handleContinue = async () => {
    await completeOnboardingStage(2, { workspacePath: directoryPath });
    onComplete();
  };

  return (
    <div className="max-w-xl w-full">
      {/* Assistant avatar — wakes up */}
      <div className="flex flex-col items-center mb-8">
        <div
          className={`w-20 h-20 rounded-full overflow-hidden border-4 border-accent mb-4 ${
            !hasAnimated ? 'animate-mc-wake-up' : ''
          }`}
          onAnimationEnd={() => setHasAnimated(true)}
        >
          <img src={mcAvatar} alt="Assistant" className="w-full h-full object-cover scale-[1.3] translate-y-[15%]" />
        </div>
        <div className="card-panel p-4 max-w-md text-center">
          <p className="text-sm text-ink leading-relaxed">
            I'm online! Let's set up your workspace. This is where your imported repos will live.
          </p>
        </div>
      </div>

      {/* Workspace picker */}
      <div className="card-panel p-6">
        <div className="flex items-start space-x-4 mb-6">
          <div className="flex-shrink-0 w-10 h-10 bg-accent/15 flex items-center justify-center">
            <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-sans font-semibold text-ink">Workspace Directory</h3>
            <p className="text-xs text-ink-muted mt-0.5">Each project gets its own folder inside this directory</p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <div className="flex-1 input-inset px-4 py-3 text-ink font-mono text-sm truncate">
            {directoryPath}
          </div>
          <button
            onClick={handleBrowse}
            className="btn-solid-primary px-4 py-3 text-sm flex-shrink-0"
          >
            Browse...
          </button>
        </div>

        {directoryPath !== DEFAULT_PATH && (
          <button
            onClick={() => setDirectoryPath(DEFAULT_PATH)}
            className="mt-2 text-sm text-accent hover:text-accent transition-colors"
          >
            Use default ({DEFAULT_PATH})
          </button>
        )}

        <div className="mt-4 p-3 bg-surface-card border border-border">
          <div className="flex items-start space-x-2">
            <svg className="w-4 h-4 text-ink-muted flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-xs text-ink-muted">
              Example: a project named "my-app" will be stored at <code className="text-ink font-mono">{directoryPath}/my-app/</code>
            </p>
          </div>
        </div>
      </div>

      {/* Continue */}
      <div className="mt-6 flex justify-center">
        <button
          onClick={handleContinue}
          className="btn-solid-primary flex items-center space-x-2 px-8 py-3"
        >
          <span>CONTINUE</span>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}
