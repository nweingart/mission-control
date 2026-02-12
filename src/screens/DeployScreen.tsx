import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import ProgressBar from '../components/ProgressBar';
import PreflightGateOverlay from '../components/PreflightGateOverlay';
import { usePreflightCheck } from '../hooks/usePreflightCheck';
import confetti from 'canvas-confetti';
import { DEPLOY_WORKFLOW } from '../constants/deploy-workflow';
import type { ServiceKey } from '../constants/preflight-requirements';

type DeployStep =
  | 'setup'
  | 'git-init'
  | 'git-commit'
  | 'github-push'
  | 'vercel-deploy'
  | 'env-vars'
  | 'github-actions'
  | 'watching'
  | 'complete'
  | 'pushing'
  | 'error';

export default function DeployScreen() {
  const {
    currentProject,
    updateProject,
    goToHome,
    goToPreview,
  } = useAppStore();

  const preflightServices = useMemo<ServiceKey[]>(
    () => (currentProject?.githubRepo ? ['github'] : ['github', 'vercel']),
    [currentProject?.githubRepo]
  );
  const preflight = usePreflightCheck(preflightServices);

  // Early return if no project - prevents null access throughout component
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
    if (!/^https:\/\/(github\.com|vercel\.com|.*\.vercel\.app)(\/|$)/.test(url)) {
      console.warn('[DeployScreen] Blocked openExternal for unexpected URL:', url);
      return;
    }
    window.api.shell.openExternal(url);
  }, []);

  const collectAllEnvVars = async (): Promise<Record<string, string>> => {
    const envVars: Record<string, string> = {
      ...(currentProject.envVars || {}),
      NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseAnonKey,
    };
    // Scan .env.local for additional vars Claude may have created
    try {
      const content = await window.api.fs.readFile(
        `${currentProject.projectPath}/.env.local`
      );
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq === -1) continue;
        const key = trimmed.substring(0, eq).trim();
        const val = trimmed.substring(eq + 1).trim();
        if (key && val && !envVars[key]) envVars[key] = val;
      }
    } catch { /* .env.local may not exist */ }
    return envVars;
  };

  const getRepoFullName = (url: string) =>
    url.replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '');

  // ──────────────────────────────────────────────
  // FIRST DEPLOY FLOW
  // ──────────────────────────────────────────────
  const startFirstDeploy = async () => {
    if (!currentProject || isDeploying) return;

    if (!supabaseUrl || !supabaseAnonKey) {
      setError('Please enter your Supabase URL and Anon Key');
      return;
    }

    setError(null);

    await preflight.runGuarded(async () => {
    setIsDeploying(true);

    // Save env vars (merging project vars, Supabase vars, and .env.local)
    const envVars = await collectAllEnvVars();
    await updateProject({ envVars });

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

      deploymentId = `deploy-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      currentBranch = await window.api.github.getCurrentBranch(currentProject.projectPath);
      useAppStore.getState().addDeployment({
        id: deploymentId,
        branch: currentBranch,
        commitHash: commitResult.commitHash,
        commitMessage: 'Initial commit',
        githubRepoUrl: `${newRepoUrl}/commit/${commitResult.commitHash}`,
        status: 'deploying',
        timestamp: new Date().toISOString(),
      });

      setProgress(50);

      // Step 4: Vercel Deploy
      setDeployStep('vercel-deploy');
      setProgress(55);
      setStatusMessage('Deploying to Vercel...');
      setVercelOutput([]);

      window.api.vercel.onOutput((data) => {
        if (!isMountedRef.current) return;
        setVercelOutput((prev) => {
          const next = [...prev, data.content];
          return next.length > 200 ? next.slice(-200) : next;
        });
      });

      const deployResult = await window.api.vercel.deploy(currentProject.projectPath, envVars);
      if (!isMountedRef.current) return;

      window.api.vercel.removeListeners();

      const projectUpdates: Record<string, unknown> = {};
      if (deployResult.url) {
        projectUpdates.vercelUrl = deployResult.url;
      }

      // Step 5: Read Vercel config
      setStatusMessage('Configuring CI/CD pipeline...');
      setDeployStep('env-vars');
      setProgress(65);
      if (!isMountedRef.current) return;

      const vercelConfig = await window.api.vercel.getProjectConfig(currentProject.projectPath);
      if (!isMountedRef.current) return;

      // Step 6: Persist env vars to Vercel
      setStatusMessage('Saving environment variables to Vercel...');
      setProgress(70);

      await window.api.vercel.addEnvVars(currentProject.projectPath, envVars);
      if (!isMountedRef.current) return;

      // Step 7-8: Set GitHub secrets
      setDeployStep('github-actions');
      setStatusMessage('Setting up GitHub Actions...');
      setProgress(75);

      const vercelToken = await window.api.vercel.getToken();
      if (!isMountedRef.current) return;

      const repoFullName = getRepoFullName(newRepoUrl);
      await window.api.github.setSecret(repoFullName, 'VERCEL_TOKEN', vercelToken);
      if (!isMountedRef.current) return;
      await window.api.github.setSecret(repoFullName, 'VERCEL_ORG_ID', vercelConfig.orgId);
      if (!isMountedRef.current) return;
      await window.api.github.setSecret(repoFullName, 'VERCEL_PROJECT_ID', vercelConfig.projectId);
      if (!isMountedRef.current) return;

      // Step 9-10: Write + push workflow
      setStatusMessage('Adding deployment workflow...');
      setProgress(85);

      await window.api.github.writeWorkflowFile(currentProject.projectPath, DEPLOY_WORKFLOW);
      await window.api.github.gitAddAndCommit(
        currentProject.projectPath,
        'Add Vercel deployment workflow [skip ci]'
      );
      if (!isMountedRef.current) return;
      await window.api.github.gitPush(currentProject.projectPath);
      if (!isMountedRef.current) return;

      setProgress(90);

      // Complete
      projectUpdates.status = 'complete';
      await updateProject(projectUpdates);

      useAppStore.getState().updateDeployment(deploymentId, {
        status: 'success',
        vercelUrl: deployResult.url,
        vercelProjectId: deployResult.projectId,
      });
      useAppStore.getState().addGitEvent({
        type: 'deployed',
        branchName: currentBranch,
        commitHash: commitResult.commitHash,
        commitMessage: `Deployed to ${deployResult.url}`,
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
      window.api.vercel.removeListeners();
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

    const currentBranch = await window.api.github.getCurrentBranch(currentProject.projectPath).catch((err) => {
      console.warn('[DeployScreen] Could not detect branch, defaulting to "main":', err);
      return 'main';
    });
    const deploymentId = `deploy-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    useAppStore.getState().addDeployment({
      id: deploymentId,
      branch: currentBranch,
      commitHash: '',
      githubRepoUrl: currentProject.githubRepo,
      status: 'deploying',
      timestamp: new Date().toISOString(),
    });

    try {
      setDeployStep('vercel-deploy');
      setProgress(55);
      setStatusMessage('Deploying to Vercel...');
      setVercelOutput([]);

      window.api.vercel.onOutput((data) => {
        if (!isMountedRef.current) return;
        setVercelOutput((prev) => {
          const next = [...prev, data.content];
          return next.length > 200 ? next.slice(-200) : next;
        });
      });

      const deployResult = await window.api.vercel.deploy(currentProject.projectPath, envVars);
      if (!isMountedRef.current) return;

      window.api.vercel.removeListeners();

      const projectUpdates: Record<string, unknown> = {};
      if (deployResult.url) {
        projectUpdates.vercelUrl = deployResult.url;
      }

      // Step 5: Read Vercel config
      setStatusMessage('Configuring CI/CD pipeline...');
      setDeployStep('env-vars');
      setProgress(65);
      if (!isMountedRef.current) return;

      const vercelConfig = await window.api.vercel.getProjectConfig(currentProject.projectPath);
      if (!isMountedRef.current) return;

      // Step 6: Persist env vars to Vercel
      setStatusMessage('Saving environment variables to Vercel...');
      setProgress(70);

      await window.api.vercel.addEnvVars(currentProject.projectPath, envVars);
      if (!isMountedRef.current) return;

      // Step 7-8: Set GitHub secrets
      setDeployStep('github-actions');
      setStatusMessage('Setting up GitHub Actions...');
      setProgress(75);

      const vercelToken = await window.api.vercel.getToken();
      if (!isMountedRef.current) return;

      const repoFullName = getRepoFullName(currentProject.githubRepo || '');
      await window.api.github.setSecret(repoFullName, 'VERCEL_TOKEN', vercelToken);
      if (!isMountedRef.current) return;
      await window.api.github.setSecret(repoFullName, 'VERCEL_ORG_ID', vercelConfig.orgId);
      if (!isMountedRef.current) return;
      await window.api.github.setSecret(repoFullName, 'VERCEL_PROJECT_ID', vercelConfig.projectId);
      if (!isMountedRef.current) return;

      // Step 9-10: Write + push workflow
      setStatusMessage('Adding deployment workflow...');
      setProgress(85);

      await window.api.github.writeWorkflowFile(currentProject.projectPath, DEPLOY_WORKFLOW);
      await window.api.github.gitAddAndCommit(
        currentProject.projectPath,
        'Add Vercel deployment workflow [skip ci]'
      );
      if (!isMountedRef.current) return;
      await window.api.github.gitPush(currentProject.projectPath);
      if (!isMountedRef.current) return;

      setProgress(90);

      // Complete
      projectUpdates.status = 'complete';
      await updateProject(projectUpdates);

      useAppStore.getState().updateDeployment(deploymentId, {
        status: 'success',
        vercelUrl: deployResult.url,
        vercelProjectId: deployResult.projectId,
      });
      useAppStore.getState().addGitEvent({
        type: 'deployed',
        branchName: currentBranch,
        commitMessage: `Deployed to ${deployResult.url}`,
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
      window.api.vercel.removeListeners();
      if (!isMountedRef.current) return;
      setError(err instanceof Error ? err.message : 'Deployment failed');
      setDeployStep('error');
      setIsDeploying(false);
      useAppStore.getState().updateDeployment(deploymentId, {
        status: 'failed',
        error: err instanceof Error ? err.message : 'Deployment failed',
      });
    }
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

      // Poll for GitHub Actions workflow run
      setDeployStep('watching');
      setStatusMessage('Waiting for deployment...');
      setProgress(75);

      useAppStore.getState().updateDeployment(deploymentId, { status: 'watching' });

      let runId: number | null = null;
      let attempts = 0;
      let phase1Errors = 0;

      // Phase 1: Find the workflow run (up to 60s)
      while (!runId && attempts < 12) {
        await new Promise(r => setTimeout(r, 5000));
        if (!isMountedRef.current) return;
        attempts++;
        try {
          const runs = JSON.parse(
            await window.api.github.getWorkflowRuns(currentProject.projectPath, 5)
          );
          const match = runs.find((r: { headSha?: string; status?: string; databaseId?: number }) =>
            r.headSha?.startsWith(commitResult.commitHash) && r.status !== 'completed'
          );
          if (match) runId = match.databaseId;
          phase1Errors = 0;
        } catch (err) {
          phase1Errors++;
          console.warn('[DeployScreen] Workflow polling error (attempt', attempts, '):', err);
          setStatusMessage(`Checking deployment status... (retrying, ${phase1Errors} error${phase1Errors > 1 ? 's' : ''})`);
          if (phase1Errors >= 5) {
            throw new Error('Unable to check deployment status: GitHub API is not responding. Your code was pushed successfully — check GitHub Actions manually.');
          }
        }
      }

      if (!runId) {
        // Couldn't find run — show soft success
        setPushMessage('Changes pushed! Deployment should be running on GitHub Actions.');
        useAppStore.getState().updateDeployment(deploymentId, { status: 'success', vercelUrl: currentProject.vercelUrl });
        setDeployStep('complete');
        setProgress(100);
        setIsDeploying(false);
        return;
      }

      // Phase 2: Watch the run until complete (up to 5 min)
      setStatusMessage('Deploying via GitHub Actions...');
      setProgress(85);
      let status = '', conclusion = '';
      let phase2Errors = 0;
      attempts = 0;

      while (status !== 'completed' && attempts < 60) {
        await new Promise(r => setTimeout(r, 5000));
        if (!isMountedRef.current) return;
        attempts++;
        try {
          const runs = JSON.parse(
            await window.api.github.getWorkflowRuns(currentProject.projectPath, 5)
          );
          const run = runs.find((r: { databaseId?: number }) => r.databaseId === runId);
          if (run) {
            status = run.status;
            conclusion = run.conclusion || '';
          }
          phase2Errors = 0;
        } catch (err) {
          phase2Errors++;
          console.warn('[DeployScreen] Workflow watch error (attempt', attempts, '):', err);
          setStatusMessage(`Watching deployment... (retrying, ${phase2Errors} error${phase2Errors > 1 ? 's' : ''})`);
          if (phase2Errors >= 5) {
            throw new Error('Unable to monitor deployment: GitHub API is not responding. Check GitHub Actions manually for deployment status.');
          }
        }
      }

      if (conclusion === 'success') {
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
        setPushMessage('Deployed successfully! Your changes are live.');
        useAppStore.getState().updateDeployment(deploymentId, { status: 'success', vercelUrl: currentProject.vercelUrl });
        useAppStore.getState().addGitEvent({
          type: 'deployed',
          branchName: currentBranch,
          commitHash: commitResult.commitHash,
          commitMessage: 'Deployed via GitHub Actions',
        });
      } else if (status === 'completed') {
        throw new Error(`Deployment failed (${conclusion}). Check GitHub Actions for details.`);
      } else {
        setPushMessage('Deployment is taking longer than expected. Check GitHub Actions for the latest status.');
        useAppStore.getState().updateDeployment(deploymentId, { status: 'watching', vercelUrl: currentProject.vercelUrl });
      }

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
    // Don't clear customRepoName or showRepoNameInput - user may want to keep editing
  };

  // ──────────────────────────────────────────────
  // RENDER
  // ──────────────────────────────────────────────

  const isInProgress = ['git-init', 'git-commit', 'github-push', 'vercel-deploy', 'env-vars', 'github-actions', 'pushing', 'watching'].includes(deployStep);

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
                    : 'Deploy Phase - Ship it to the world'}
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
                <h3 className="text-base font-sans font-semibold text-accent mb-2">Deploy via GitHub</h3>
                <p className="text-sm text-accent mb-3">
                  Your code will be pushed to GitHub and automatically deployed to Vercel. Every future push will auto-deploy.
                </p>
                <ol className="text-sm text-accent space-y-1 list-decimal list-inside">
                  <li>Enter your Supabase credentials below (if needed)</li>
                  <li>We'll create a GitHub repo and push your code</li>
                  <li>We'll deploy to Vercel and save your environment variables</li>
                  <li>We'll set up GitHub Actions for automatic future deploys</li>
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

              <div className="card-panel p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-sans font-semibold text-ink">Supabase Configuration</h3>
                  {currentProject.supabaseRef && (
                    <span className="inline-flex items-center space-x-1 px-2 py-0.5 text-xs font-medium bg-success/15 text-success">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span>Auto-provisioned</span>
                    </span>
                  )}
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-sans font-medium text-ink mb-1">
                      Supabase Project URL
                    </label>
                    <input
                      type="text"
                      value={supabaseUrl}
                      onChange={(e) => setSupabaseUrl(e.target.value)}
                      placeholder="https://xxxxx.supabase.co"
                      className="input-inset w-full px-3 py-2 border border-border focus:ring-2 focus:ring-accent focus:border-accent bg-surface-card text-ink"
                    />
                    <p className="text-xs text-ink-muted mt-1">
                      Found in Project Settings &rarr; API &rarr; Project URL
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-sans font-medium text-ink mb-1">
                      Supabase Anon Key
                    </label>
                    <input
                      type="text"
                      value={supabaseAnonKey}
                      onChange={(e) => setSupabaseAnonKey(e.target.value)}
                      placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                      className="input-inset w-full px-3 py-2 border border-border focus:ring-2 focus:ring-accent focus:border-accent bg-surface-card text-ink"
                    />
                    <p className="text-xs text-ink-muted mt-1">
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
              <div className="card-panel p-6 text-center">
                <div className="w-12 h-12 bg-accent/15 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-6 h-6 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <h2 className="text-base font-sans font-semibold text-ink mb-2">Push Changes</h2>
                <p className="text-ink-secondary mb-4">
                  Commit and push your latest changes to GitHub. Vercel will automatically deploy the update.
                </p>
                <button
                  onClick={startRedeploy}
                  disabled={isDeploying}
                  className="btn-solid-primary px-6 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Push Changes
                </button>
              </div>
            </div>
          )}

          {/* ──── VERCEL DEPLOY STEP ──── */}
          {deployStep === 'vercel-deploy' && (
            <div className="space-y-6">
              <div className="card-panel p-6">
                <h3 className="text-base font-sans font-semibold text-ink mb-4">Deploying to Vercel</h3>
                <p className="text-ink-secondary mb-2 text-sm">
                  Running <code className="bg-surface-card px-1.5 py-0.5 text-accent text-xs">vercel deploy --prod</code>
                </p>

                <div
                  ref={vercelLogRef}
                  className="bg-surface border border-border p-3 h-48 overflow-y-auto font-mono text-xs text-ink-secondary space-y-0.5"
                >
                  {vercelOutput.length === 0 ? (
                    <p className="text-ink-muted">Waiting for output...</p>
                  ) : (
                    vercelOutput.map((line, i) => (
                      <p key={i} className="whitespace-pre-wrap break-all">{line}</p>
                    ))
                  )}
                </div>

                <p className="text-xs text-ink-muted mt-3">
                  This usually takes 1-2 minutes.
                </p>
              </div>
            </div>
          )}

          {/* ──── WATCHING STEP ──── */}
          {deployStep === 'watching' && (
            <div className="card-panel p-6">
              <h3 className="text-base font-sans font-semibold text-ink mb-2">Deploying via GitHub Actions</h3>
              <p className="text-ink-secondary text-sm mb-4">
                Your push triggered a deployment. Watching for results...
              </p>
              <div className="flex items-center space-x-3">
                <div className="w-5 h-5 border-4 border-accent border-t-transparent animate-spin" />
                <span className="text-ink-secondary text-sm">{statusMessage}</span>
              </div>
              <p className="text-xs text-ink-muted mt-3">
                This usually takes 1-3 minutes.
              </p>
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
                  <h3 className="font-medium text-error">
                    {interruptedDeploy ? 'Deployment Interrupted' : 'Deployment Failed'}
                  </h3>
                  <p className="text-sm text-error mt-1">{error}</p>
                  <button
                    onClick={interruptedDeploy ? retryVercelDeploy : retry}
                    className="mt-3 text-sm text-error underline hover:text-error"
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
                    {currentProject?.vercelUrl && (
                      <button
                        onClick={() => openUrl(currentProject.vercelUrl!)}
                        className="btn-solid-success px-4 py-2 text-sm"
                      >
                        View on Vercel
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
                    Your app is live!
                  </h2>
                  <p className="text-success mb-2">
                    Your code is on GitHub and deployed to Vercel.
                  </p>
                  {currentProject?.vercelUrl && (
                    <p className="text-sm font-mono text-success mb-4 break-all">
                      {currentProject.vercelUrl}
                    </p>
                  )}
                  {!currentProject?.vercelUrl && (
                    <p className="text-success mb-4">
                      Future pushes to GitHub will auto-deploy.
                    </p>
                  )}
                  <div className="flex items-center justify-center space-x-3">
                    {githubRepoUrl && (
                      <button
                        onClick={() => openUrl(githubRepoUrl)}
                        className="btn-solid px-4 py-2 text-sm"
                      >
                        View on GitHub
                      </button>
                    )}
                    {currentProject?.vercelUrl && (
                      <button
                        onClick={() => openUrl(currentProject.vercelUrl!)}
                        className="btn-solid-success px-4 py-2 text-sm"
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
              className="text-ink-muted hover:text-ink transition-colors"
            >
              Back to Projects
            </button>

            {deployStep === 'setup' && !isRedeploy && (
              <button
                onClick={startFirstDeploy}
                disabled={isDeploying}
                className="btn-solid-primary flex items-center space-x-2 px-6 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
                className="text-accent hover:text-accent-hover transition-colors text-sm"
              >
                Push more changes
              </button>
            )}

            {deployStep === 'error' && (
              <button
                onClick={interruptedDeploy ? retryVercelDeploy : retry}
                disabled={isDeploying}
                className="btn-solid-primary flex items-center space-x-2 px-6 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
