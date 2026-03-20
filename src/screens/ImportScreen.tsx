import { useState } from 'react';
import { useAppStore } from '../store/useAppStore';

export default function ImportScreen() {
  const importProject = useAppStore(s => s.importProject);
  const openProject = useAppStore(s => s.openProject);
  const goToHome = useAppStore(s => s.goToHome);
  const [repoUrl, setRepoUrl] = useState('');
  const [isCloning, setIsCloning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parseRepoUrl = (url: string): { owner: string; repo: string } | null => {
    // Handle formats: https://github.com/owner/repo, github.com/owner/repo, owner/repo
    const cleaned = url.trim().replace(/\.git$/, '').replace(/\/$/, '');

    // Full URL
    const urlMatch = cleaned.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (urlMatch) return { owner: urlMatch[1], repo: urlMatch[2] };

    // owner/repo shorthand
    const shortMatch = cleaned.match(/^([^/\s]+)\/([^/\s]+)$/);
    if (shortMatch) return { owner: shortMatch[1], repo: shortMatch[2] };

    return null;
  };

  const handleImport = async () => {
    setError(null);

    const parsed = parseRepoUrl(repoUrl);
    if (!parsed) {
      setError('Please enter a valid GitHub repo URL (e.g. https://github.com/owner/repo)');
      return;
    }

    const fullUrl = `https://github.com/${parsed.owner}/${parsed.repo}`;

    setIsCloning(true);
    try {
      // Get development path from config
      const config = await window.api.storage.getConfig();
      const projectPath = `${config.developmentPath}/${parsed.repo}`;

      // Clone the repo
      await window.api.github.runShellCommand(
        config.developmentPath,
        'git', ['clone', fullUrl, parsed.repo]
      );

      // Create the project record and open it
      const project = await importProject(parsed.repo, fullUrl, projectPath);
      await openProject(project.slug);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to clone repository';
      // If directory already exists, try to use it
      if (msg.includes('already exists')) {
        try {
          const config = await window.api.storage.getConfig();
          const projectPath = `${config.developmentPath}/${parsed.repo}`;
          const project = await importProject(parsed.repo, fullUrl, projectPath);
          await openProject(project.slug);
          return;
        } catch (innerErr) {
          setError(innerErr instanceof Error ? innerErr.message : 'Failed to import project');
        }
      } else {
        setError(msg);
      }
    } finally {
      setIsCloning(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && repoUrl.trim() && !isCloning) {
      handleImport();
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-surface">
      {/* Drag region for window title bar */}
      <div className="absolute top-0 left-0 right-0 h-14 drag-region" />

      <div className="w-full max-w-lg px-6">
        {/* Back button */}
        <button
          onClick={goToHome}
          className="mb-8 text-ink-muted hover:text-ink text-sm flex items-center gap-1.5 no-drag"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>

        {/* Header */}
        <h1 className="font-display text-2xl tracking-wide font-bold text-ink mb-2">
          Import Repository
        </h1>
        <p className="text-ink-muted text-sm mb-8">
          Enter a GitHub repository URL. Mission Control will clone it and scan the codebase to generate
          documentation, find bugs, and map features.
        </p>

        {/* Input */}
        <div className="mb-4">
          <label className="block text-xs font-display uppercase tracking-wider text-ink-muted mb-2">
            GitHub Repository
          </label>
          <input
            type="text"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="https://github.com/owner/repo"
            className="w-full px-4 py-3 bg-surface border border-border text-ink placeholder-ink-muted text-sm focus:outline-none focus:border-accent"
            autoFocus
            disabled={isCloning}
          />
          <p className="text-xs text-ink-muted mt-1.5">
            Accepts full URLs, github.com/owner/repo, or owner/repo
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 bg-error/10 border border-error/30 text-error text-sm">
            {error}
          </div>
        )}

        {/* Import button */}
        <button
          onClick={handleImport}
          disabled={!repoUrl.trim() || isCloning}
          className="w-full btn-solid-primary flex items-center justify-center gap-2 py-3"
        >
          {isCloning ? (
            <>
              <div className="w-4 h-4 border-2 border-current border-t-transparent animate-spin" />
              <span>CLONING...</span>
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span>IMPORT & SCAN</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
