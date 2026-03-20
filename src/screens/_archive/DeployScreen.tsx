import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import ProgressBar from '../components/ProgressBar';
import PreflightGateOverlay from '../components/PreflightGateOverlay';
import { usePreflightCheck } from '../hooks/usePreflightCheck';
import confetti from 'canvas-confetti';
import type { ServiceKey } from '../constants/preflight-requirements';
import HoldToStartButton from '../components/HoldToStartButton';

type DeployStep =
  | 'setup'
  | 'git-init'
  | 'git-commit'
  | 'github-push'
  | 'pushing'
  | 'watching'
  | 'complete'
  | 'error';

export default function DeployScreen() {
  const {
    currentProject,
    updateProject,
    goToHome,
    goToPreview,
  } = useAppStore();

  const preflightServices = useMemo<ServiceKey[]>(() => ['github'], []);
  const preflight = usePreflightCheck(preflightServices);

  const isRedeploy = !!currentProject?.githubRepo;

  const [deployStep, setDeployStep] = useState<DeployStep>(
    currentProject?.status === 'complete' ? 'complete' : 'setup'
  );
  const [isDeploying, setIsDeploying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');

  // GitHub state
  const [githubRepoUrl, setGithubRepoUrl] = useState(currentProject?.githubRepo || '');
  const [pushMessage, setPushMessage] = useState('');
  const [customRepoName, setCustomRepoName] = useState('');
  const [showRepoNameInput, setShowRepoNameInput] = useState(false);

  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      window.api.github.removeListeners();
    };
  }, []);

  useEffect(() => {
    if (currentProject?.status === 'complete' && currentProject?.githubRepo) {
      setGithubRepoUrl(currentProject.githubRepo);
      setDeployStep('complete');
      setProgress(100);
    }
  }, [currentProject?.status, currentProject?.githubRepo]);

  const openUrl = useCallback((url: string) => {
    if (!/^https:\/\/github\.com(\/|$)/.test(url)) {
      console.warn('[DeployScreen] Blocked openExternal for unexpected URL:', url);
      return;
    }
    window.api.shell.openExternal(url);
  }, []);

  // Early return if no project — after all hooks to satisfy Rules of Hooks
  if (!currentProject) {
    return (
      <div className="flex-1 flex items-center justify-center bg-surface-card">
        <div className="text-center">
          <p className="text-ink-muted mb-4">No project selected</p>
          <button
            onClick={goToHome}
            className="btn-solid-primary px-4 py-2"
          >
            Go to Home
          </button>
        </div>
      </div>
    );
  }

  const getRepoFullName = (url: string) =>
    url.replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '');

  // ──────────────────────────────────────────────
  // FIRST DEPLOY FLOW
  // ──────────────────────────────────────────────
  const startFirstDeploy = async () => {
    if (!currentProject || isDeploying) return;

    setError(null);

    await preflight.runGuarded(async () => {
    setIsDeploying(true);

    let deploymentId: string | undefined;
    let currentBranch: string | undefined;

    try {
      // Step 1: Git Init
      setDeployStep('git-init');
      setProgress(10);
      setStatusMessage('Getting GitHub username...');

      const username = await window.api.github.getUsername();
      if (!isMountedRef.current) return;

      setStatusMessage('Checking git status...');
      setProgress(12);
      const gitStatus = await window.api.github.checkGitStatus(currentProject.projectPath);
      if (!isMountedRef.current) return;

      if (!gitStatus.hasGitRepo) {
        setStatusMessage('Initializing git repository...');
        setProgress(15);
        await window.api.github.gitInit(currentProject.projectPath);
        if (!isMountedRef.current) return;
      }

      setStatusMessage('Setting up .gitignore...');
      setProgress(18);
      await window.api.github.ensureGitignore(currentProject.projectPath);
      if (!isMountedRef.current) return;

      setStatusMessage('Configuring git...');
      setProgress(20);
      await window.api.github.ensureGitConfig(currentProject.projectPath, username);
      if (!isMountedRef.current) return;

      // Step 2: Git Commit
      setDeployStep('git-commit');
      setProgress(25);
      setStatusMessage('Committing files...');

      const commitResult = await window.api.github.gitAddAndCommit(
        currentProject.projectPath,
        'Initial commit'
      );
      if (!isMountedRef.current) return;

      setProgress(30);

      // Step 3: GitHub Push
      let newRepoUrl = '';

      if (gitStatus.hasRemote) {
        // Already has a remote — just push
        setDeployStep('github-push');
        setProgress(50);
        setStatusMessage('Pushing to GitHub...');

        await window.api.github.gitPush(currentProject.projectPath);
        if (!isMountedRef.current) return;

        // Get the remote URL as our repo URL
        const freshStatus = await window.api.github.checkGitStatus(currentProject.projectPath);
        newRepoUrl = freshStatus.remoteUrl.replace(/\.git$/, '');
      } else {
        setDeployStep('github-push');
        setProgress(50);
        setStatusMessage('Creating GitHub repository...');

        const repoName = customRepoName || currentProject.slug;
        try {
          const repoResult = await window.api.github.createRepoAndPush(
            currentProject.projectPath,
            repoName
          );
          if (!isMountedRef.current) return;
          newRepoUrl = repoResult.repoUrl;
        } catch (repoErr) {
          const errMsg = repoErr instanceof Error ? repoErr.message : String(repoErr);
          if (errMsg.includes('Name already exists') || errMsg.includes('already exists on this account')) {
            // Show repo name input so user can choose a different name
            setShowRepoNameInput(true);
            setCustomRepoName(repoName);
            setError(`Repository "${repoName}" already exists on your GitHub account. Please choose a different name.`);
            setDeployStep('setup');
            setIsDeploying(false);
            return;
          }
          throw repoErr;
        }
      }

      setGithubRepoUrl(newRepoUrl);
      await updateProject({ githubRepo: newRepoUrl, status: 'complete' });

      deploymentId = `deploy-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      currentBranch = await window.api.github.getCurrentBranch(currentProject.projectPath);
      useAppStore.getState().addDeployment({
        id: deploymentId,
        branch: currentBranch,
        commitHash: commitResult.commitHash,
        commitMessage: 'Initial commit',
        githubRepoUrl: `${newRepoUrl}/commit/${commitResult.commitHash}`,
        status: 'success',
        timestamp: new Date().toISOString(),
      });
      useAppStore.getState().addGitEvent({
        type: 'deployed',
        branchName: currentBranch,
        commitHash: commitResult.commitHash,
        commitMessage: `Pushed to GitHub: ${newRepoUrl}`,
      });

      setDeployStep('complete');
      setProgress(100);
      setIsDeploying(false);

      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      });
    } catch (err) {
      if (!isMountedRef.current) return;
      setError(err instanceof Error ? err.message : 'Deployment failed');
      setDeployStep('error');
      setIsDeploying(false);
      if (typeof deploymentId !== 'undefined') {
        useAppStore.getState().updateDeployment(deploymentId, {
          status: 'failed',
          error: err instanceof Error ? err.message : 'Deployment failed',
        });
      }
    }
    }); // end preflight.runGuarded
  };

  // ──────────────────────────────────────────────
  // RE-DEPLOY FLOW
  // ──────────────────────────────────────────────
  const startRedeploy = async () => {
    if (!currentProject || isDeploying) return;

    setError(null);

    await preflight.runGuarded(async () => {
    setIsDeploying(true);
    setDeployStep('pushing');
    setProgress(20);
    setPushMessage('');

    let deploymentId: string | undefined;

    try {
      setStatusMessage('Committing changes...');
      const dateStr = new Date().toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });

      const commitResult = await window.api.github.gitAddAndCommit(
        currentProject.projectPath,
        `Update ${dateStr}`
      );
      if (!isMountedRef.current) return;

      setProgress(50);

      if (!commitResult.isNewCommit) {
        setPushMessage('No changes to commit. Your deployed version is up to date.');
        setDeployStep('complete');
        setProgress(100);
        setIsDeploying(false);
        return;
      }

      const currentBranch = await window.api.github.getCurrentBranch(currentProject.projectPath);
      deploymentId = `deploy-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      useAppStore.getState().addDeployment({
        id: deploymentId,
        branch: currentBranch,
        commitHash: commitResult.commitHash,
        commitMessage: `Update ${dateStr}`,
        githubRepoUrl: currentProject.githubRepo ? `${currentProject.githubRepo}/commit/${commitResult.commitHash}` : undefined,
        status: 'pushing',
        timestamp: new Date().toISOString(),
      });

      setStatusMessage('Pushing to GitHub...');
      setProgress(70);

      await window.api.github.gitPush(currentProject.projectPath);
      if (!isMountedRef.current) return;

      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
      setPushMessage('Pushed successfully! Your changes are on GitHub.');
      useAppStore.getState().updateDeployment(deploymentId, { status: 'success' });
      useAppStore.getState().addGitEvent({
        type: 'deployed',
        branchName: currentBranch,
        commitHash: commitResult.commitHash,
        commitMessage: 'Pushed to GitHub',
      });

      setDeployStep('complete');
      setProgress(100);
      setIsDeploying(false);
    } catch (err) {
      if (!isMountedRef.current) return;
      setError(err instanceof Error ? err.message : 'Push failed');
      setDeployStep('error');
      setIsDeploying(false);
      if (typeof deploymentId !== 'undefined') {
        useAppStore.getState().updateDeployment(deploymentId, {
          status: 'failed',
          error: err instanceof Error ? err.message : 'Push failed',
        });
      }
    }
    }); // end preflight.runGuarded
  };

  // ──────────────────────────────────────────────
  // RETRY
  // ──────────────────────────────────────────────
  const retry = () => {
    setError(null);
    setProgress(0);
    setStatusMessage('');
    setDeployStep('setup');
    setIsDeploying(false);
  };

  // ──────────────────────────────────────────────
  // RENDER
  // ──────────────────────────────────────────────

  const isInProgress = ['git-init', 'git-commit', 'github-push', 'pushing'].includes(deployStep);

  return (
    <div className="flex-1 overflow-hidden flex flex-col relative">
      {preflight.status === 'blocked' && (
        <PreflightGateOverlay
          failures={preflight.failures}
          onRetry={preflight.retry}
          context="deploy your app"
        />
      )}
      {/* Header */}
      <header className="bg-surface-card border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={goToPreview}
              className="text-ink-muted hover:text-ink transition-colors no-drag"
              disabled={isDeploying}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-xl font-sans font-bold text-ink">{currentProject?.name}</h1>
              <p className="text-sm font-mono text-ink-muted">
                {currentProject?.status === 'complete'
                  ? 'Deployed!'
                  : isRedeploy
                    ? 'Push updates to GitHub'
                    : 'Deploy Phase - Push to GitHub'}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-xs font-sans font-medium text-ink-muted">Step 5 of 5</span>
            <div className="flex space-x-1">
              <div className="w-2 h-2 bg-accent"></div>
              <div className="w-2 h-2 bg-accent"></div>
              <div className="w-2 h-2 bg-accent"></div>
              <div className="w-2 h-2 bg-accent"></div>
              <div className="w-2 h-2 bg-accent"></div>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto">

          {/* Progress bar (during active steps) */}
          {isInProgress && (
            <div className="mb-6">
              <ProgressBar
                progress={progress}
                label={statusMessage || 'Working...'}
                color="blue"
              />
            </div>
          )}

          {/* ──── SETUP STEP ──── */}
          {deployStep === 'setup' && !isRedeploy && (
            <div className="space-y-6">
              <div className="bg-accent/10 border border-accent/30 p-4">
                <h3 className="text-base font-sans font-semibold text-accent mb-2">Push to GitHub</h3>
                <p className="text-sm text-accent mb-3">
                  Your code will be pushed to a new GitHub repository.
                </p>
                <ol className="text-sm text-accent space-y-1 list-decimal list-inside">
                  <li>We'll create a GitHub repo and push your code</li>
                  <li>Your project will be available on GitHub</li>
                </ol>
              </div>

              {/* Repo name input - shown when name collision occurs */}
              {showRepoNameInput && (
                <div className="card-panel p-4 mb-6">
                  <h3 className="text-base font-sans font-semibold text-ink mb-4">GitHub Repository Name</h3>
                  <div>
                    <label className="block text-sm font-sans font-medium text-ink mb-1">
                      Repository Name
                    </label>
                    <input
                      type="text"
                      value={customRepoName}
                      onChange={(e) => setCustomRepoName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                      placeholder={currentProject.slug}
                      className="input-inset w-full px-3 py-2 border border-border focus:ring-2 focus:ring-accent focus:border-accent bg-surface-card text-ink font-mono"
                    />
                    <p className="text-xs text-ink-muted mt-1">
                      Choose a unique name for your GitHub repository
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ──── RE-DEPLOY SETUP ──── */}
          {deployStep === 'setup' && isRedeploy && (
            <div className="space-y-6">
              <div className="card-panel p-6 text-center">
                <div className="w-12 h-12 bg-accent/15 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-6 h-6 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <h2 className="text-base font-sans font-semibold text-ink mb-2">Push Changes</h2>
                <p className="text-ink-secondary mb-4">
                  Commit and push your latest changes to GitHub.
                </p>
                <HoldToStartButton
                  onStart={startRedeploy}
                  label="Hold to Push"
                  disabled={isDeploying}
                />
              </div>
            </div>
          )}

          {/* ──── ERROR ──── */}
          {error && (
            <div className="mb-6 bg-error/10 border border-error/30 p-4">
              <div className="flex items-start">
                <svg className="w-5 h-5 text-error mt-0.5 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
                <div>
                  <h3 className="font-medium text-error">Deployment Failed</h3>
                  <p className="text-sm text-error mt-1">{error}</p>
                  <button
                    onClick={retry}
                    className="mt-3 text-sm text-error underline hover:text-error"
                  >
                    Try again
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ──── COMPLETE ──── */}
          {deployStep === 'complete' && (
            <div className="space-y-4">
              {pushMessage ? (
                <div className="bg-success/10 border border-success/30 p-6 text-center">
                  <div className="w-12 h-12 bg-success/15 flex items-center justify-center mx-auto mb-4">
                    <svg className="w-6 h-6 text-success" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                  <p className="text-success font-medium mb-4">{pushMessage}</p>
                  <div className="flex items-center justify-center space-x-3">
                    {githubRepoUrl && (
                      <button
                        onClick={() => openUrl(githubRepoUrl)}
                        className="btn-solid px-4 py-2 text-sm"
                      >
                        View on GitHub
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-success/10 border border-success/30 p-6 text-center">
                  <div className="w-16 h-16 bg-success/15 flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-success" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                  <h2 className="text-base font-sans font-semibold text-success mb-2">
                    Your code is on GitHub!
                  </h2>
                  <p className="text-success mb-4">
                    Your project has been pushed to GitHub successfully.
                  </p>
                  <div className="flex items-center justify-center space-x-3">
                    {githubRepoUrl && (
                      <button
                        onClick={() => openUrl(githubRepoUrl)}
                        className="btn-solid px-4 py-2 text-sm"
                      >
                        View on GitHub
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ──── BOTTOM ACTIONS ──── */}
          <div className="mt-6 flex justify-between items-center">
            <button
              onClick={goToHome}
              className="text-ink-muted hover:text-ink transition-colors"
            >
              Back to Projects
            </button>

            {deployStep === 'setup' && !isRedeploy && (
              <HoldToStartButton
                onStart={startFirstDeploy}
                label="Hold to Start"
                disabled={isDeploying}
              />
            )}

            {deployStep === 'complete' && isRedeploy && (
              <button
                onClick={() => {
                  setPushMessage('');
                  setDeployStep('setup');
                }}
                className="text-accent hover:text-accent-hover transition-colors text-sm"
              >
                Push more changes
              </button>
            )}

            {deployStep === 'error' && (
              <button
                onClick={retry}
                disabled={isDeploying}
                className="btn-solid-primary flex items-center space-x-2 px-6 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>Retry</span>
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
