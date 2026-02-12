import { useState, useCallback, useRef } from 'react';
import { DEPLOY_WORKFLOW } from '../constants/deploy-workflow';

// ─── Types ──────────────────────────────────────────────────────────

type PhaseStatus = 'pending' | 'running' | 'passed' | 'failed' | 'skipped';
type ViewMode = 'config' | 'running' | 'report';

interface PhaseResult {
  name: string;
  status: PhaseStatus;
  duration: number;
  metrics: Record<string, string | number>;
  error?: string;
}

interface LogEntry {
  time: string;
  message: string;
  level: 'info' | 'warn' | 'error' | 'success';
}

interface CICDConfig {
  projectPath: string;
  deleteRepoAfterTest: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────────

function timestamp(): string {
  return new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Component ──────────────────────────────────────────────────────

export default function CICDTestRunner({ onClose }: { onClose: () => void }) {
  const [view, setView] = useState<ViewMode>('config');
  const [config, setConfig] = useState<CICDConfig>({
    projectPath: '',
    deleteRepoAfterTest: true,
  });
  const [phases, setPhases] = useState<PhaseResult[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [totalDuration, setTotalDuration] = useState<number | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [copied, setCopied] = useState(false);
  const cancelledRef = useRef(false);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Track created resources for cleanup on cancel
  const createdRepoRef = useRef<string | null>(null);

  // ─── Logging ──────────────────────────────────────────────────

  const log = useCallback((message: string, level: LogEntry['level'] = 'info') => {
    const entry: LogEntry = { time: timestamp(), message, level };
    setLogs(prev => {
      const next = [...prev, entry];
      setTimeout(() => {
        if (logContainerRef.current) {
          logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
      }, 10);
      return next;
    });
    console.log(`[CICD:${level}] ${message}`);
  }, []);

  // ─── Phase helpers ────────────────────────────────────────────

  const updatePhase = useCallback((index: number, update: Partial<PhaseResult>) => {
    setPhases(prev => {
      const next = [...prev];
      next[index] = { ...next[index], ...update };
      return next;
    });
  }, []);

  const checkCancelled = () => {
    if (cancelledRef.current) throw new Error('Test cancelled by user');
  };

  const getRepoFullName = (url: string) =>
    url.replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '');

  // ─── Phase 1: Preflight ───────────────────────────────────────

  async function phasePreflight(projectPath: string): Promise<Record<string, string | number>> {
    log('Verifying CLIs...');

    // Check git
    const gitStatus = await window.api.github.checkGitStatus(projectPath);
    log(`  git: available (repo=${gitStatus.hasGitRepo}, remote=${gitStatus.hasRemote})`);
    checkCancelled();

    // Check gh
    const ghStatus = await window.api.cli.checkGitHub();
    if (!ghStatus.installed) throw new Error('GitHub CLI (gh) is not installed');
    if (!ghStatus.authenticated) throw new Error('GitHub CLI is not authenticated. Run "gh auth login"');
    log(`  gh: installed + authenticated`, 'success');
    checkCancelled();

    // Check vercel
    const vercelStatus = await window.api.cli.checkVercel();
    if (!vercelStatus.installed) throw new Error('Vercel CLI is not installed');
    if (!vercelStatus.authenticated) throw new Error('Vercel CLI is not authenticated. Run "vercel login"');
    log(`  vercel: installed + authenticated`, 'success');
    checkCancelled();

    // Check project path has files
    const files = await window.api.fs.readdir(projectPath);
    const realFiles = files.filter((f: string) => !f.startsWith('.'));
    if (realFiles.length === 0) {
      throw new Error(`Project path has no files: ${projectPath}`);
    }
    log(`  Project: ${realFiles.length} files/folders found`, 'success');

    return {
      hasGitRepo: gitStatus.hasGitRepo ? 1 : 0,
      hasRemote: gitStatus.hasRemote ? 1 : 0,
      fileCount: realFiles.length,
    };
  }

  // ─── Phase 2: First Deploy ────────────────────────────────────

  async function phaseFirstDeploy(projectPath: string): Promise<Record<string, string | number>> {
    // Git init + commit
    log('Initializing git...');
    const gitStatus = await window.api.github.checkGitStatus(projectPath);
    if (!gitStatus.hasGitRepo) {
      await window.api.github.gitInit(projectPath);
      log('  Git repo initialized');
    }

    const username = await window.api.github.getUsername();
    await window.api.github.ensureGitignore(projectPath);
    await window.api.github.ensureGitConfig(projectPath, username);
    checkCancelled();

    log('Committing files...');
    const commitResult = await window.api.github.gitAddAndCommit(projectPath, 'Initial commit');
    log(`  Committed: ${commitResult.commitHash.slice(0, 7)}`, 'success');
    checkCancelled();

    // Create GitHub repo
    log('Creating GitHub repo...');
    const repoSlug = `cicd-test-${Date.now().toString(36)}`;
    const repoResult = await window.api.github.createRepoAndPush(projectPath, repoSlug);
    const repoUrl = repoResult.repoUrl;
    createdRepoRef.current = repoUrl;
    log(`  Pushed to: ${repoUrl}`, 'success');
    checkCancelled();

    // Vercel deploy
    log('Running initial Vercel deploy...');
    const testEnvVars: Record<string, string> = { CICD_TEST: 'true' };

    // Collect any .env.local vars from the project
    try {
      const envContent = await window.api.fs.readFile(`${projectPath}/.env.local`);
      for (const line of envContent.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq === -1) continue;
        const key = trimmed.substring(0, eq).trim();
        const val = trimmed.substring(eq + 1).trim();
        if (key && val) testEnvVars[key] = val;
      }
    } catch { /* .env.local may not exist */ }

    const deployResult = await window.api.vercel.deploy(projectPath, testEnvVars);
    log(`  Vercel deploy: ${deployResult.url}`, 'success');
    checkCancelled();

    // Read Vercel project config
    log('Reading Vercel project config...');
    const vercelConfig = await window.api.vercel.getProjectConfig(projectPath);
    log(`  orgId: ${vercelConfig.orgId.slice(0, 8)}..., projectId: ${vercelConfig.projectId.slice(0, 8)}...`);
    checkCancelled();

    // Persist env vars to Vercel
    log('Persisting env vars to Vercel...');
    await window.api.vercel.addEnvVars(projectPath, testEnvVars);
    log('  Env vars saved', 'success');
    checkCancelled();

    // Get Vercel token for GitHub secrets
    log('Reading Vercel token...');
    const vercelToken = await window.api.vercel.getToken();
    log('  Token retrieved');
    checkCancelled();

    // Set GitHub secrets
    log('Setting GitHub secrets...');
    const repoFullName = getRepoFullName(repoUrl);
    await window.api.github.setSecret(repoFullName, 'VERCEL_TOKEN', vercelToken);
    log('  VERCEL_TOKEN set');
    checkCancelled();
    await window.api.github.setSecret(repoFullName, 'VERCEL_ORG_ID', vercelConfig.orgId);
    log('  VERCEL_ORG_ID set');
    checkCancelled();
    await window.api.github.setSecret(repoFullName, 'VERCEL_PROJECT_ID', vercelConfig.projectId);
    log('  VERCEL_PROJECT_ID set', 'success');
    checkCancelled();

    // Write workflow file
    log('Writing GitHub Actions workflow...');
    await window.api.github.writeWorkflowFile(projectPath, DEPLOY_WORKFLOW);
    log('  Workflow file written');
    checkCancelled();

    // Verify workflow file exists on disk
    log('Verifying workflow file...');
    const workflowContent = await window.api.fs.readFile(`${projectPath}/.github/workflows/deploy.yml`);
    if (!workflowContent || !workflowContent.includes('Deploy to Vercel')) {
      throw new Error('Workflow file verification failed: file missing or malformed');
    }
    log(`  Workflow verified (${workflowContent.length} chars)`, 'success');

    // Commit and push workflow
    log('Committing + pushing workflow...');
    const wfCommit = await window.api.github.gitAddAndCommit(projectPath, 'Add Vercel deployment workflow [skip ci]');
    await window.api.github.gitPush(projectPath);
    log(`  Pushed workflow: ${wfCommit.commitHash.slice(0, 7)}`, 'success');
    checkCancelled();

    return {
      repoUrl,
      vercelUrl: deployResult.url,
      commitHash: commitResult.commitHash,
      orgId: vercelConfig.orgId,
      projectId: vercelConfig.projectId,
      secretsSet: 3,
      workflowVerified: 1,
    };
  }

  // ─── Phase 3: Re-deploy (GH Actions) ─────────────────────────

  async function phaseRedeploy(projectPath: string): Promise<Record<string, string | number>> {
    // Write a small change
    log('Writing test change...');
    const testContent = `\n<!-- CI/CD test: ${new Date().toISOString()} -->\n`;
    try {
      const existing = await window.api.fs.readFile(`${projectPath}/README.md`);
      await window.api.fs.writeFile(`${projectPath}/README.md`, existing + testContent);
      log('  Appended comment to README.md');
    } catch {
      await window.api.fs.writeFile(`${projectPath}/cicd-test.txt`, `CI/CD test file created at ${new Date().toISOString()}\n`);
      log('  Created cicd-test.txt');
    }
    checkCancelled();

    // Commit + push
    log('Committing + pushing change...');
    const commitResult = await window.api.github.gitAddAndCommit(projectPath, 'CI/CD test change');
    await window.api.github.gitPush(projectPath);
    const commitSha = commitResult.commitHash;
    log(`  Pushed: ${commitSha.slice(0, 7)}`, 'success');
    checkCancelled();

    // Poll for workflow run matching commit
    log('Waiting for GitHub Actions workflow run...');
    let runId: number | null = null;
    let attempts = 0;
    const pollStart = Date.now();

    // Phase 1: Find the run (up to 90s)
    while (!runId && attempts < 18) {
      await delay(5000);
      checkCancelled();
      attempts++;
      try {
        const runs = await window.api.github.getWorkflowRuns(projectPath, 5);
        // getWorkflowRuns may return string or array depending on implementation
        const parsedRuns = typeof runs === 'string' ? JSON.parse(runs) : runs;
        const match = parsedRuns.find((r: { headSha?: string; status?: string; databaseId?: number }) =>
          r.headSha?.startsWith(commitSha) && r.status !== 'completed'
        );
        if (match) {
          runId = match.databaseId;
          log(`  Found run #${runId} (attempt ${attempts})`, 'success');
        }
      } catch (err) {
        log(`  Poll attempt ${attempts}: ${err instanceof Error ? err.message : 'error'}`, 'warn');
      }
    }

    if (!runId) {
      // Try one more time looking for any run with this SHA (might already be completed)
      try {
        const runs = await window.api.github.getWorkflowRuns(projectPath, 5);
        const parsedRuns = typeof runs === 'string' ? JSON.parse(runs) : runs;
        const match = parsedRuns.find((r: { headSha?: string; databaseId?: number }) =>
          r.headSha?.startsWith(commitSha)
        );
        if (match) {
          runId = match.databaseId;
          log(`  Found completed run #${runId}`, 'success');
        }
      } catch { /* ignore */ }
    }

    if (!runId) {
      throw new Error(`Could not find workflow run for commit ${commitSha.slice(0, 7)} after ${attempts} attempts`);
    }

    // Phase 2: Watch until complete (up to 5 min)
    log('Watching workflow run...');
    let status = '', conclusion = '';

    while (status !== 'completed' && attempts < 78) {
      await delay(5000);
      checkCancelled();
      attempts++;
      try {
        const runs = await window.api.github.getWorkflowRuns(projectPath, 5);
        const parsedRuns = typeof runs === 'string' ? JSON.parse(runs) : runs;
        const run = parsedRuns.find((r: { databaseId?: number }) => r.databaseId === runId);
        if (run) {
          status = run.status;
          conclusion = run.conclusion || '';
          if (status === 'completed') {
            log(`  Run #${runId}: ${status} / ${conclusion}`);
          }
        }
      } catch (err) {
        log(`  Watch attempt ${attempts}: ${err instanceof Error ? err.message : 'error'}`, 'warn');
      }
    }

    const ghActionsDuration = Date.now() - pollStart;

    if (status !== 'completed') {
      throw new Error(`Workflow run #${runId} did not complete after ${Math.round(ghActionsDuration / 1000)}s`);
    }

    if (conclusion !== 'success') {
      throw new Error(`Workflow run #${runId} failed with conclusion: ${conclusion}`);
    }

    log(`GitHub Actions deployment succeeded in ${(ghActionsDuration / 1000).toFixed(1)}s`, 'success');

    return {
      runId,
      commitSha,
      conclusion,
      ghActionsDuration: Math.round(ghActionsDuration / 1000),
    };
  }

  // ─── Run a shell command and wait for exit code ────────────────

  function runCommandWithExitCode(command: string, timeoutMs = 30_000): Promise<number> {
    return new Promise((resolve, reject) => {
      const sessionId = `cicd-cleanup-${Date.now()}`;
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          window.api.setup.removeListeners();
          reject(new Error(`Command timed out after ${timeoutMs / 1000}s`));
        }
      }, timeoutMs);

      window.api.setup.onExit((data) => {
        if (data.sessionId === sessionId && !settled) {
          settled = true;
          clearTimeout(timer);
          window.api.setup.removeListeners();
          resolve(data.code);
        }
      });

      window.api.setup.runCommand(command, sessionId).catch((err) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          window.api.setup.removeListeners();
          reject(err);
        }
      });
    });
  }

  // ─── Phase 4: Cleanup ────────────────────────────────────────

  async function phaseCleanup(deleteRepo: boolean): Promise<Record<string, string | number>> {
    const repoUrl = createdRepoRef.current;
    let repoDeleted = false;

    if (deleteRepo && repoUrl) {
      log('Deleting GitHub repo...');
      const repoFullName = getRepoFullName(repoUrl);
      try {
        const exitCode = await runCommandWithExitCode(`gh repo delete ${repoFullName} --yes`);
        if (exitCode === 0) {
          repoDeleted = true;
          log(`  Deleted: ${repoFullName}`, 'success');
        } else {
          log(`  gh repo delete exited with code ${exitCode}`, 'warn');
        }
      } catch (err) {
        log(`  Failed to delete repo: ${err instanceof Error ? err.message : String(err)}`, 'warn');
      }
    } else if (!deleteRepo && repoUrl) {
      log(`Repo preserved: ${repoUrl}`);
    } else {
      log('No repo to clean up');
    }

    createdRepoRef.current = null;
    return { repoDeleted: repoDeleted ? 1 : 0 };
  }

  // ─── Test orchestrator ────────────────────────────────────────

  const runCICDTest = async () => {
    const testStart = Date.now();
    cancelledRef.current = false;
    createdRepoRef.current = null;
    setIsRunning(true);
    setView('running');
    setLogs([]);
    setTotalDuration(null);
    setCopied(false);

    const phaseList = [
      { name: 'Preflight', key: 'preflight' },
      { name: 'First Deploy', key: 'first-deploy' },
      { name: 'Re-deploy (GH Actions)', key: 'redeploy' },
      { name: 'Cleanup', key: 'cleanup' },
    ];

    const results: PhaseResult[] = phaseList.map(p => ({
      name: p.name,
      status: 'pending' as const,
      duration: 0,
      metrics: {},
    }));
    setPhases(results);

    log('Starting CI/CD test...');
    log(`Project: ${config.projectPath}`);
    log(`Delete repo after: ${config.deleteRepoAfterTest ? 'Yes' : 'No'}`);
    log('─'.repeat(50));

    for (let i = 0; i < phaseList.length; i++) {
      const phase = phaseList[i];

      if (cancelledRef.current) {
        // Still try cleanup if we created a repo
        if (createdRepoRef.current && config.deleteRepoAfterTest) {
          log('\nAttempting cleanup after cancellation...', 'warn');
          try {
            await phaseCleanup(true);
          } catch { /* ignore */ }
        }
        for (let j = i; j < phaseList.length; j++) {
          updatePhase(j, { status: 'skipped' });
        }
        break;
      }

      updatePhase(i, { status: 'running' });
      log(`\n── Phase ${i + 1}: ${phase.name} ──`);
      const phaseStart = Date.now();

      try {
        let metrics: Record<string, string | number> = {};

        switch (phase.key) {
          case 'preflight':
            metrics = await phasePreflight(config.projectPath);
            break;
          case 'first-deploy':
            metrics = await phaseFirstDeploy(config.projectPath);
            break;
          case 'redeploy':
            metrics = await phaseRedeploy(config.projectPath);
            break;
          case 'cleanup':
            metrics = await phaseCleanup(config.deleteRepoAfterTest);
            break;
        }

        const duration = Date.now() - phaseStart;
        updatePhase(i, { status: 'passed', duration, metrics });
        log(`Phase "${phase.name}" passed (${(duration / 1000).toFixed(1)}s)\n`, 'success');
      } catch (err) {
        const duration = Date.now() - phaseStart;
        const message = err instanceof Error ? err.message : String(err);
        updatePhase(i, { status: 'failed', duration, error: message });
        log(`Phase "${phase.name}" FAILED: ${message}`, 'error');

        // If a phase before cleanup fails, still try cleanup
        if (phase.key !== 'cleanup' && createdRepoRef.current && config.deleteRepoAfterTest) {
          log('\nAttempting cleanup after failure...', 'warn');
          const cleanupIndex = phaseList.findIndex(p => p.key === 'cleanup');
          if (cleanupIndex > i) {
            updatePhase(cleanupIndex, { status: 'running' });
            const cleanupStart = Date.now();
            try {
              const cleanupMetrics = await phaseCleanup(true);
              updatePhase(cleanupIndex, { status: 'passed', duration: Date.now() - cleanupStart, metrics: cleanupMetrics });
              log('Cleanup completed', 'success');
            } catch {
              updatePhase(cleanupIndex, { status: 'failed', duration: Date.now() - cleanupStart, error: 'Cleanup also failed' });
            }
          }
        }

        // Skip remaining phases
        for (let j = i + 1; j < phaseList.length; j++) {
          if (phaseList[j].key !== 'cleanup' || !createdRepoRef.current) {
            updatePhase(j, { status: 'skipped' });
          }
        }
        break;
      }
    }

    const elapsed = Date.now() - testStart;
    setTotalDuration(elapsed);
    setIsRunning(false);
    setView('report');
    log(`\nCI/CD test complete in ${(elapsed / 1000).toFixed(1)}s`);
  };

  const cancelTest = () => {
    cancelledRef.current = true;
    log('Cancelling test...', 'warn');
  };

  // ─── Browse for project path ──────────────────────────────────

  const browseForPath = async () => {
    const selected = await window.api.dialog.selectDirectory(config.projectPath || undefined);
    if (selected) {
      setConfig(c => ({ ...c, projectPath: selected }));
    }
  };

  // ─── Report generation ────────────────────────────────────────

  const generateReportText = () => {
    const ts = new Date().toLocaleString();
    const passed = phases.filter(p => p.status === 'passed').length;
    const failed = phases.filter(p => p.status === 'failed').length;
    const skipped = phases.filter(p => p.status === 'skipped').length;

    let report = `KILN CI/CD TEST REPORT\n`;
    report += `========================\n`;
    report += `Date: ${ts}\n`;
    report += `Project: ${config.projectPath}\n`;
    report += `Result: ${failed === 0 ? 'ALL PASSED' : `${failed} FAILED`}\n`;
    report += `Phases: ${passed} passed, ${failed} failed, ${skipped} skipped\n`;
    report += `Duration: ${totalDuration ? (totalDuration / 1000).toFixed(1) : '?'}s\n\n`;

    report += `PHASES\n------\n`;
    phases.forEach(phase => {
      const icon = phase.status === 'passed' ? 'PASS' : phase.status === 'failed' ? 'FAIL' : phase.status === 'skipped' ? 'SKIP' : '----';
      const dur = phase.duration ? `${(phase.duration / 1000).toFixed(1)}s` : '-';
      report += `  [${icon}] ${phase.name} — ${dur}\n`;

      if (Object.keys(phase.metrics).length > 0) {
        Object.entries(phase.metrics).forEach(([k, v]) => {
          report += `         ${k}: ${v}\n`;
        });
      }
      if (phase.error) {
        report += `         Error: ${phase.error}\n`;
      }
    });

    report += `\nLOGS\n----\n`;
    logs.forEach(l => {
      report += `  [${l.time}] ${l.message}\n`;
    });

    return report;
  };

  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(generateReportText());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      console.error('[CICD] Failed to copy report');
    }
  };

  // ─── Derived state ───────────────────────────────────────────

  const passedCount = phases.filter(p => p.status === 'passed').length;
  const failedCount = phases.filter(p => p.status === 'failed').length;

  // ─── Config View ──────────────────────────────────────────────

  if (view === 'config') {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60">
        <div className="bg-surface border border-border w-[480px] max-h-[90vh] flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
            <div>
              <h3 className="text-lg font-sans font-semibold text-ink">CI/CD Test Runner</h3>
              <p className="text-xs text-ink-muted mt-0.5">Test the full deployment pipeline with real cloud services</p>
            </div>
            <button onClick={onClose} className="text-ink-muted hover:text-ink-secondary">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="p-5 space-y-5 overflow-y-auto min-h-0 flex-1">
            {/* Project Path */}
            <div>
              <label className="block text-sm font-sans font-medium text-ink-secondary mb-1.5">Project Path</label>
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={config.projectPath}
                  onChange={e => setConfig(c => ({ ...c, projectPath: e.target.value }))}
                  className="flex-1 input-inset bg-surface-light border border-border px-3 py-2 text-sm text-ink placeholder-ink-muted focus:outline-none focus:border-spectrum-blue"
                  placeholder="/path/to/project"
                />
                <button
                  onClick={browseForPath}
                  className="btn-solid px-3 py-2 text-sm"
                >
                  Browse
                </button>
              </div>
              <p className="text-[13px] text-ink-muted mt-1">Directory with a deployable project (e.g. Next.js app)</p>
            </div>

            {/* Options */}
            <div className="space-y-3">
              <label className="block text-sm font-sans font-medium text-ink-secondary">Options</label>
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.deleteRepoAfterTest}
                  onChange={e => setConfig(c => ({ ...c, deleteRepoAfterTest: e.target.checked }))}
                  className="w-4 h-4 border-border bg-surface-light text-spectrum-blue focus:ring-spectrum-blue"
                />
                <div>
                  <span className="text-sm text-ink-secondary">Delete GitHub repo after test</span>
                  <p className="text-[13px] text-ink-muted">Cleans up the test repo via `gh repo delete`</p>
                </div>
              </label>
            </div>

            {/* Phases preview */}
            <div className="card-panel p-3">
              <p className="text-sm font-sans font-medium text-ink-muted mb-2">Test Phases</p>
              <div className="space-y-1.5">
                {[
                  { name: 'Preflight', desc: 'Verify CLIs, project files, git status' },
                  { name: 'First Deploy', desc: 'Git init, push to GH, Vercel deploy, secrets, workflow' },
                  { name: 'Re-deploy (GH Actions)', desc: 'Push change, watch GH Actions run to completion' },
                  { name: 'Cleanup', desc: config.deleteRepoAfterTest ? 'Delete test GitHub repo' : 'Preserve repo (cleanup disabled)' },
                ].map((p, i) => (
                  <div key={i} className="flex items-center space-x-2 text-xs">
                    <div className="w-1.5 h-1.5 bg-spectrum-blue" />
                    <div>
                      <span className="text-ink-secondary">{p.name}</span>
                      <span className="text-ink-muted ml-1.5">— {p.desc}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-border flex justify-between items-center flex-shrink-0">
            <p className="text-[13px] text-ink-muted">Creates real GitHub repos and Vercel deployments</p>
            <button
              onClick={runCICDTest}
              disabled={!config.projectPath.trim()}
              className="btn-solid-primary px-5 py-2 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Start Test
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Running View ─────────────────────────────────────────────

  if (view === 'running') {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60">
        <div className="bg-surface border border-border w-[560px] max-h-[85vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-border flex-shrink-0">
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 border-4 border-spectrum-blue border-t-transparent animate-spin" />
              <h3 className="text-base font-sans font-semibold text-ink">CI/CD Test Running</h3>
            </div>
            <button
              onClick={cancelTest}
              disabled={!isRunning}
              className="btn-solid-danger px-3 py-1 text-xs disabled:opacity-30"
            >
              Cancel
            </button>
          </div>

          {/* Phase progress */}
          <div className="px-5 py-3 border-b border-border-subtle flex-shrink-0">
            <div className="flex space-x-1">
              {phases.map((phase, i) => (
                <div key={i} className="flex-1 flex flex-col items-center">
                  <div className={`w-full h-1.5 ${
                    phase.status === 'passed' ? 'bg-success' :
                    phase.status === 'running' ? 'bg-spectrum-blue animate-pulse' :
                    phase.status === 'failed' ? 'bg-error' :
                    phase.status === 'skipped' ? 'bg-surface' :
                    'bg-surface'
                  }`} />
                  <span className={`text-[8px] mt-1 truncate w-full text-center ${
                    phase.status === 'running' ? 'text-spectrum-blue font-medium' :
                    phase.status === 'passed' ? 'text-success' :
                    phase.status === 'failed' ? 'text-error' :
                    'text-ink-muted'
                  }`}>
                    {phase.name.split(' ')[0]}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Log output */}
          <div ref={logContainerRef} className="flex-1 overflow-y-auto px-4 py-3 font-mono text-[14px] leading-relaxed min-h-0">
            {logs.map((entry, i) => (
              <div key={i} className={`${
                entry.level === 'error' ? 'text-error' :
                entry.level === 'warn' ? 'text-spectrum-blue' :
                entry.level === 'success' ? 'text-success' :
                'text-ink-muted'
              }`}>
                <span className="text-ink-muted select-none">{entry.time} </span>
                {entry.message}
              </div>
            ))}
            {isRunning && (
              <div className="text-ink-muted animate-pulse mt-1">...</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── Report View ──────────────────────────────────────────────

  const allPassed = failedCount === 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60">
      <div className="bg-surface border border-border w-[560px] max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border flex-shrink-0">
          <h3 className="text-base font-sans font-semibold text-ink">CI/CD Test Report</h3>
          <button onClick={onClose} className="text-ink-muted hover:text-ink-secondary">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Summary */}
        <div className={`mx-4 mt-3 px-4 py-3 border flex-shrink-0 ${
          allPassed ? 'bg-success/10 border-success/30' : 'bg-error/10 border-error/30'
        }`}>
          <div className="flex items-center space-x-3">
            {allPassed ? (
              <svg className="w-8 h-8 text-success flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg className="w-8 h-8 text-error flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            )}
            <div>
              <p className={`text-sm font-bold ${allPassed ? 'text-success' : 'text-error'}`}>
                {allPassed ? 'All Phases Passed' : `${failedCount} Phase${failedCount > 1 ? 's' : ''} Failed`}
              </p>
              <p className="text-xs text-ink-muted mt-0.5">
                {passedCount} passed, {failedCount} failed &middot; {totalDuration ? `${(totalDuration / 1000).toFixed(1)}s` : ''}
              </p>
            </div>
          </div>
        </div>

        {/* Phase results */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1 min-h-0">
          {phases.map((phase, i) => (
            <div key={i} className={`px-3 py-2.5 ${
              phase.status === 'failed' ? 'bg-error/5 border border-error/20' :
              phase.status === 'passed' ? 'bg-surface-card/50' :
              ''
            }`}>
              <div className="flex items-center space-x-2.5">
                <div className="w-5 h-5 flex-shrink-0 flex items-center justify-center">
                  {phase.status === 'passed' && (
                    <svg className="w-4 h-4 text-success" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                  {phase.status === 'failed' && (
                    <svg className="w-4 h-4 text-error" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  )}
                  {phase.status === 'skipped' && (
                    <svg className="w-4 h-4 text-ink-muted" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 000 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>

                <span className={`flex-1 text-sm ${
                  phase.status === 'passed' ? 'text-ink-secondary' :
                  phase.status === 'failed' ? 'text-error font-medium' :
                  'text-ink-muted'
                }`}>
                  {phase.name}
                </span>
                {phase.duration > 0 && (
                  <span className="text-[13px] text-ink-muted font-mono">
                    {phase.duration >= 60000
                      ? `${Math.floor(phase.duration / 60000)}m ${Math.round((phase.duration % 60000) / 1000)}s`
                      : `${(phase.duration / 1000).toFixed(1)}s`
                    }
                  </span>
                )}
              </div>

              {Object.keys(phase.metrics).length > 0 && phase.status === 'passed' && (
                <div className="mt-1.5 ml-7 space-y-0.5">
                  {Object.entries(phase.metrics).map(([key, value]) => (
                    <p key={key} className="text-[13px] text-ink-muted font-mono">
                      {key}: <span className="text-ink-muted">{value}</span>
                    </p>
                  ))}
                </div>
              )}

              {phase.error && (
                <div className="mt-1.5 ml-7 px-2 py-1.5 bg-error/10 text-[14px] text-error font-mono break-all">
                  {phase.error}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="px-5 py-3 border-t border-border flex space-x-2 flex-shrink-0">
          <button
            onClick={copyReport}
            className="btn-solid flex-1 px-3 py-1.5 text-xs flex items-center justify-center space-x-1.5"
          >
            {copied ? (
              <span className="text-success">Copied!</span>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <span>Copy Report</span>
              </>
            )}
          </button>
          <button
            onClick={() => { setView('config'); setPhases([]); setLogs([]); }}
            className="btn-solid-primary flex-1 px-3 py-1.5 text-xs font-medium"
          >
            Run Again
          </button>
          <button
            onClick={onClose}
            className="btn-solid px-3 py-1.5 text-xs"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
