import { useState, useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import ProgressBar from '../components/ProgressBar';
import confetti from 'canvas-confetti';

type DeployStep =
  | 'setup'
  | 'git-init'
  | 'git-commit'
  | 'github-push'
  | 'vercel-deploy'
  | 'complete'
  | 'pushing'
  | 'error';

export default function DeployScreen() {
  const {
    currentProject,
    updateProject,
    goToHome,
    goToPreview,
    cliStatus,
  } = useAppStore();

  // Early return if no project - prevents null access throughout component
  if (!currentProject) {
    return (
      <div className="flex-1 flex items-center justify-center bg-charcoal-800">
        <div className="text-center">
          <p className="text-charcoal-300 mb-4">No project selected</p>
          <button
            onClick={goToHome}
            className="px-4 py-2 bg-terracotta-500 text-charcoal-950 rounded-lg hover:bg-terracotta-600"
          >
            Go to Home
          </button>
        </div>
      </div>
    );
  }

  const isRedeploy = !!currentProject.githubRepo;

  const isInterruptedDeploy = currentProject?.status === 'deploying' && !!currentProject?.githubRepo;

  const [deployStep, setDeployStep] = useState<DeployStep>(
    currentProject?.status === 'complete' ? 'complete' : isInterruptedDeploy ? 'error' : 'setup'
  );
  const [interruptedDeploy, setInterruptedDeploy] = useState(isInterruptedDeploy);
  const [isDeploying, setIsDeploying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [vercelOutput, setVercelOutput] = useState<string[]>([]);
  const vercelLogRef = useRef<HTMLDivElement>(null);

  // Supabase config
  const [supabaseUrl, setSupabaseUrl] = useState(
    currentProject?.envVars?.NEXT_PUBLIC_SUPABASE_URL || ''
  );
  const [supabaseAnonKey, setSupabaseAnonKey] = useState(
    currentProject?.envVars?.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  );

  // GitHub state
  const [githubRepoUrl, setGithubRepoUrl] = useState(currentProject?.githubRepo || '');
  const [pushMessage, setPushMessage] = useState('');
  const [customRepoName, setCustomRepoName] = useState('');
  const [showRepoNameInput, setShowRepoNameInput] = useState(false);

  const isMountedRef = useRef(true);

  // Sync from project when it changes
  useEffect(() => {
    if (currentProject?.envVars) {
      if (currentProject.envVars.NEXT_PUBLIC_SUPABASE_URL && !supabaseUrl) {
        setSupabaseUrl(currentProject.envVars.NEXT_PUBLIC_SUPABASE_URL);
      }
      if (currentProject.envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY && !supabaseAnonKey) {
        setSupabaseAnonKey(currentProject.envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY);
      }
    }
  }, [currentProject?.envVars]);

  useEffect(() => {
    if (vercelLogRef.current) {
      vercelLogRef.current.scrollTop = vercelLogRef.current.scrollHeight;
    }
  }, [vercelOutput]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      window.api.github.removeListeners();
      window.api.vercel.removeListeners();
    };
  }, []);

  // Detect interrupted deploy on mount
  useEffect(() => {
    if (interruptedDeploy) {
      setError('A previous deployment to Vercel was interrupted. Your code is already on GitHub — click "Retry Vercel Deploy" to finish.');
      setGithubRepoUrl(currentProject?.githubRepo || '');
    }
  }, []);

  useEffect(() => {
    if (currentProject?.status === 'complete' && currentProject?.githubRepo) {
      setGithubRepoUrl(currentProject.githubRepo);
      setDeployStep('complete');
      setProgress(100);
    }
  }, [currentProject?.status, currentProject?.githubRepo]);

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
  }, []);

  const openUrl = useCallback((url: string) => {
    window.api.shell.openExternal(url);
  }, []);

  // ──────────────────────────────────────────────
  // FIRST DEPLOY FLOW
  // ──────────────────────────────────────────────
  const startFirstDeploy = async () => {
    if (!currentProject || isDeploying) return;

    if (!supabaseUrl || !supabaseAnonKey) {
      setError('Please enter your Supabase URL and Anon Key');
      return;
    }

    setIsDeploying(true);
    setError(null);

    // Pre-flight: verify CLIs are still authenticated
    try {
      const freshStatus = await window.api.cli.checkAll();
      if (!freshStatus.github?.authenticated) {
        setError('GitHub CLI is not authenticated. Please run "gh auth login" in your terminal and try again.');
        setIsDeploying(false);
        return;
      }
      if (!freshStatus.vercel?.authenticated) {
        setError('Vercel CLI is not authenticated. Please run "vercel login" in your terminal and try again.');
        setIsDeploying(false);
        return;
      }
    } catch {
      // If CLI check itself fails, proceed anyway — the actual commands will surface errors
    }

    // Save env vars
    const envVars: Record<string, string> = {
      ...(currentProject.envVars || {}),
      NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseAnonKey,
    };
    await updateProject({ envVars });

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

      await window.api.github.gitAddAndCommit(
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
        setProgress(35);
        setStatusMessage('Pushing to GitHub...');

        await window.api.github.gitPush(currentProject.projectPath);
        if (!isMountedRef.current) return;

        // Get the remote URL as our repo URL
        const freshStatus = await window.api.github.checkGitStatus(currentProject.projectPath);
        newRepoUrl = freshStatus.remoteUrl.replace(/\.git$/, '');
      } else {
        setDeployStep('github-push');
        setProgress(35);
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
      await updateProject({ githubRepo: newRepoUrl, status: 'deploying' });

      setProgress(50);

      // Step 4: Vercel Deploy
      setDeployStep('vercel-deploy');
      setProgress(55);
      setStatusMessage('Deploying to Vercel...');
      setVercelOutput([]);

      window.api.vercel.onOutput((data) => {
        if (!isMountedRef.current) return;
        setVercelOutput((prev) => [...prev, data.content]);
      });

      const deployResult = await window.api.vercel.deploy(currentProject.projectPath, envVars);
      if (!isMountedRef.current) return;

      window.api.vercel.removeListeners();

      const updates: Record<string, unknown> = { status: 'complete' };
      if (deployResult.url) {
        updates.vercelUrl = deployResult.url;
      }
      await updateProject(updates);

      setDeployStep('complete');
      setProgress(100);
      setIsDeploying(false);

      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      });
    } catch (err) {
      window.api.vercel.removeListeners();
      if (!isMountedRef.current) return;
      setError(err instanceof Error ? err.message : 'Deployment failed');
      setDeployStep('error');
      setIsDeploying(false);
    }
  };

  // ──────────────────────────────────────────────
  // RETRY VERCEL DEPLOY (after interrupted deploy)
  // ──────────────────────────────────────────────
  const retryVercelDeploy = async () => {
    if (!currentProject || isDeploying) return;

    setIsDeploying(true);
    setError(null);
    setInterruptedDeploy(false);

    const envVars: Record<string, string> = {
      ...(currentProject.envVars || {}),
    };

    try {
      setDeployStep('vercel-deploy');
      setProgress(55);
      setStatusMessage('Deploying to Vercel...');
      setVercelOutput([]);

      window.api.vercel.onOutput((data) => {
        if (!isMountedRef.current) return;
        setVercelOutput((prev) => [...prev, data.content]);
      });

      const deployResult = await window.api.vercel.deploy(currentProject.projectPath, envVars);
      if (!isMountedRef.current) return;

      window.api.vercel.removeListeners();

      const updates: Record<string, unknown> = { status: 'complete' };
      if (deployResult.url) {
        updates.vercelUrl = deployResult.url;
      }
      await updateProject(updates);

      setDeployStep('complete');
      setProgress(100);
      setIsDeploying(false);

      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      });
    } catch (err) {
      window.api.vercel.removeListeners();
      if (!isMountedRef.current) return;
      setError(err instanceof Error ? err.message : 'Deployment failed');
      setDeployStep('error');
      setIsDeploying(false);
    }
  };

  // ──────────────────────────────────────────────
  // RE-DEPLOY FLOW
  // ──────────────────────────────────────────────
  const startRedeploy = async () => {
    if (!currentProject || isDeploying) return;

    setIsDeploying(true);
    setError(null);
    setDeployStep('pushing');
    setProgress(20);
    setPushMessage('');

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

      setStatusMessage('Pushing to GitHub...');
      setProgress(70);

      await window.api.github.gitPush(currentProject.projectPath);
      if (!isMountedRef.current) return;

      setPushMessage('Changes pushed! Vercel will auto-deploy in a few moments.');
      setDeployStep('complete');
      setProgress(100);
      setIsDeploying(false);
    } catch (err) {
      if (!isMountedRef.current) return;
      setError(err instanceof Error ? err.message : 'Push failed');
      setDeployStep('error');
      setIsDeploying(false);
    }
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
    // Don't clear customRepoName or showRepoNameInput - user may want to keep editing
  };

  // ──────────────────────────────────────────────
  // RENDER
  // ──────────────────────────────────────────────

  const isInProgress = ['git-init', 'git-commit', 'github-push', 'vercel-deploy', 'pushing'].includes(deployStep);

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Header */}
      <header className="bg-charcoal-800 border-b border-charcoal-600 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={goToPreview}
              className="text-charcoal-300 hover:text-cream-100 transition-colors no-drag"
              disabled={isDeploying}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-xl font-bold text-cream-100">{currentProject?.name}</h1>
              <p className="text-charcoal-300 text-sm">
                {currentProject?.status === 'complete'
                  ? 'Deployed!'
                  : isRedeploy
                    ? 'Push updates to GitHub'
                    : 'Deploy Phase - Ship it to the world'}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-charcoal-300">Step 5 of 5</span>
            <div className="flex space-x-1">
              <div className="w-2 h-2 rounded-full bg-terracotta-500"></div>
              <div className="w-2 h-2 rounded-full bg-terracotta-500"></div>
              <div className="w-2 h-2 rounded-full bg-terracotta-500"></div>
              <div className="w-2 h-2 rounded-full bg-terracotta-500"></div>
              <div className="w-2 h-2 rounded-full bg-terracotta-500"></div>
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
              <div className="bg-terracotta-500/10 border border-terracotta-500/30 rounded-lg p-4">
                <h3 className="font-medium text-terracotta-400 mb-2">Deploy via GitHub</h3>
                <p className="text-sm text-terracotta-400 mb-3">
                  Your code will be pushed to GitHub and automatically deployed to Vercel. Every future push will auto-deploy.
                </p>
                <ol className="text-sm text-terracotta-400 space-y-1 list-decimal list-inside">
                  <li>Enter your Supabase credentials below</li>
                  <li>We'll create a GitHub repo and push your code</li>
                  <li>We'll automatically deploy to Vercel</li>
                  <li>Future changes: just push to GitHub!</li>
                </ol>
              </div>

              {/* Repo name input - shown when name collision occurs */}
              {showRepoNameInput && (
                <div className="bg-charcoal-700 rounded-lg border border-charcoal-600 p-4 mb-6">
                  <h3 className="font-medium text-cream-100 mb-4">GitHub Repository Name</h3>
                  <div>
                    <label className="block text-sm font-medium text-charcoal-100 mb-1">
                      Repository Name
                    </label>
                    <input
                      type="text"
                      value={customRepoName}
                      onChange={(e) => setCustomRepoName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                      placeholder={currentProject.slug}
                      className="w-full px-3 py-2 border border-charcoal-500 rounded-lg focus:ring-2 focus:ring-terracotta-500 focus:border-terracotta-500 bg-charcoal-800 text-cream-100 font-mono"
                    />
                    <p className="text-xs text-charcoal-300 mt-1">
                      Choose a unique name for your GitHub repository
                    </p>
                  </div>
                </div>
              )}

              <div className="bg-charcoal-700 rounded-lg border border-charcoal-600 p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-medium text-cream-100">Supabase Configuration</h3>
                  {currentProject.supabaseRef && (
                    <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-xs font-medium bg-sage-500/15 text-sage-400">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span>Auto-provisioned</span>
                    </span>
                  )}
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-charcoal-100 mb-1">
                      Supabase Project URL
                    </label>
                    <input
                      type="text"
                      value={supabaseUrl}
                      onChange={(e) => setSupabaseUrl(e.target.value)}
                      placeholder="https://xxxxx.supabase.co"
                      className="w-full px-3 py-2 border border-charcoal-500 rounded-lg focus:ring-2 focus:ring-terracotta-500 focus:border-terracotta-500 bg-charcoal-800 text-cream-100"
                    />
                    <p className="text-xs text-charcoal-300 mt-1">
                      Found in Project Settings &rarr; API &rarr; Project URL
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-charcoal-100 mb-1">
                      Supabase Anon Key
                    </label>
                    <input
                      type="text"
                      value={supabaseAnonKey}
                      onChange={(e) => setSupabaseAnonKey(e.target.value)}
                      placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                      className="w-full px-3 py-2 border border-charcoal-500 rounded-lg focus:ring-2 focus:ring-terracotta-500 focus:border-terracotta-500 bg-charcoal-800 text-cream-100"
                    />
                    <p className="text-xs text-charcoal-300 mt-1">
                      Found in Project Settings &rarr; API &rarr; anon/public key
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ──── RE-DEPLOY SETUP ──── */}
          {deployStep === 'setup' && isRedeploy && (
            <div className="space-y-6">
              <div className="bg-charcoal-700 rounded-lg border border-charcoal-600 p-6 text-center">
                <div className="w-12 h-12 bg-terracotta-500/15 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-6 h-6 text-terracotta-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <h2 className="text-lg font-bold text-cream-100 mb-2">Push Changes</h2>
                <p className="text-charcoal-200 mb-4">
                  Commit and push your latest changes to GitHub. Vercel will automatically deploy the update.
                </p>
                <button
                  onClick={startRedeploy}
                  disabled={isDeploying}
                  className="px-6 py-2 bg-terracotta-500 text-charcoal-950 rounded-lg hover:bg-terracotta-600 disabled:bg-charcoal-600 disabled:cursor-not-allowed transition-colors"
                >
                  Push Changes
                </button>
              </div>
            </div>
          )}

          {/* ──── VERCEL DEPLOY STEP ──── */}
          {deployStep === 'vercel-deploy' && (
            <div className="space-y-6">
              <div className="bg-charcoal-700 rounded-lg border border-charcoal-600 p-6">
                <h3 className="font-medium text-cream-100 mb-4">Deploying to Vercel</h3>
                <p className="text-charcoal-200 mb-2 text-sm">
                  Running <code className="bg-charcoal-800 px-1.5 py-0.5 rounded text-terracotta-400 text-xs">vercel deploy --prod</code>
                </p>

                <div
                  ref={vercelLogRef}
                  className="bg-charcoal-900 border border-charcoal-600 rounded-lg p-3 h-48 overflow-y-auto font-mono text-xs text-charcoal-200 space-y-0.5"
                >
                  {vercelOutput.length === 0 ? (
                    <p className="text-charcoal-400">Waiting for output...</p>
                  ) : (
                    vercelOutput.map((line, i) => (
                      <p key={i} className="whitespace-pre-wrap break-all">{line}</p>
                    ))
                  )}
                </div>

                <p className="text-xs text-charcoal-400 mt-3">
                  This usually takes 1-2 minutes.
                </p>
              </div>
            </div>
          )}

          {/* ──── ERROR ──── */}
          {error && (
            <div className="mb-6 bg-rust-500/10 border border-rust-500/30 rounded-lg p-4">
              <div className="flex items-start">
                <svg className="w-5 h-5 text-rust-500 mt-0.5 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
                <div>
                  <h3 className="font-medium text-rust-400">
                    {interruptedDeploy ? 'Deployment Interrupted' : 'Deployment Failed'}
                  </h3>
                  <p className="text-sm text-rust-400 mt-1">{error}</p>
                  <button
                    onClick={interruptedDeploy ? retryVercelDeploy : retry}
                    className="mt-3 text-sm text-rust-400 underline hover:text-rust-300"
                  >
                    {interruptedDeploy ? 'Retry Vercel Deploy' : 'Try again'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ──── COMPLETE ──── */}
          {deployStep === 'complete' && (
            <div className="space-y-4">
              {pushMessage ? (
                <div className="bg-sage-500/10 border border-sage-500/30 rounded-lg p-6 text-center">
                  <div className="w-12 h-12 bg-sage-500/15 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-6 h-6 text-sage-500" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                  <p className="text-sage-400 font-medium mb-4">{pushMessage}</p>
                  <div className="flex items-center justify-center space-x-3">
                    {githubRepoUrl && (
                      <button
                        onClick={() => openUrl(githubRepoUrl)}
                        className="px-4 py-2 bg-charcoal-950 text-cream-100 rounded-lg hover:bg-charcoal-900 transition-colors text-sm"
                      >
                        View on GitHub
                      </button>
                    )}
                    {currentProject?.vercelUrl && (
                      <button
                        onClick={() => openUrl(currentProject.vercelUrl!)}
                        className="px-4 py-2 bg-sage-500 text-charcoal-950 rounded-lg hover:bg-sage-600 transition-colors text-sm"
                      >
                        View on Vercel
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-sage-500/10 border border-sage-500/30 rounded-lg p-6 text-center">
                  <div className="w-16 h-16 bg-sage-500/15 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-sage-500" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                  <h2 className="text-xl font-bold text-sage-400 mb-2">
                    Your app is live!
                  </h2>
                  <p className="text-sage-500 mb-2">
                    Your code is on GitHub and deployed to Vercel.
                  </p>
                  {currentProject?.vercelUrl && (
                    <p className="text-sm font-mono text-sage-400 mb-4 break-all">
                      {currentProject.vercelUrl}
                    </p>
                  )}
                  {!currentProject?.vercelUrl && (
                    <p className="text-sage-500 mb-4">
                      Future pushes to GitHub will auto-deploy.
                    </p>
                  )}
                  <div className="flex items-center justify-center space-x-3">
                    {githubRepoUrl && (
                      <button
                        onClick={() => openUrl(githubRepoUrl)}
                        className="px-4 py-2 bg-charcoal-950 text-cream-100 rounded-lg hover:bg-charcoal-900 transition-colors text-sm"
                      >
                        View on GitHub
                      </button>
                    )}
                    {currentProject?.vercelUrl && (
                      <button
                        onClick={() => openUrl(currentProject.vercelUrl!)}
                        className="px-4 py-2 bg-sage-500 text-charcoal-950 rounded-lg hover:bg-sage-600 transition-colors text-sm"
                      >
                        Visit Your App
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
              className="text-charcoal-300 hover:text-cream-100 transition-colors"
            >
              Back to Projects
            </button>

            {deployStep === 'setup' && !isRedeploy && (
              <button
                onClick={startFirstDeploy}
                disabled={isDeploying}
                className="flex items-center space-x-2 px-6 py-2 bg-terracotta-500 text-charcoal-950 rounded-lg hover:bg-terracotta-600 disabled:bg-charcoal-600 disabled:cursor-not-allowed transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
                <span>Deploy to GitHub + Vercel</span>
              </button>
            )}

            {deployStep === 'complete' && isRedeploy && (
              <button
                onClick={() => {
                  setPushMessage('');
                  setDeployStep('setup');
                }}
                className="text-terracotta-500 hover:text-terracotta-600 transition-colors text-sm"
              >
                Push more changes
              </button>
            )}

            {deployStep === 'error' && (
              <button
                onClick={interruptedDeploy ? retryVercelDeploy : retry}
                disabled={isDeploying}
                className="flex items-center space-x-2 px-6 py-2 bg-terracotta-500 text-charcoal-950 rounded-lg hover:bg-terracotta-600 disabled:bg-charcoal-600 disabled:cursor-not-allowed transition-colors"
              >
                <span>{interruptedDeploy ? 'Retry Vercel Deploy' : 'Retry'}</span>
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
