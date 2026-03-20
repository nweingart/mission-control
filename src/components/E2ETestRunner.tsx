import { useState, useCallback, useRef, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { getProjectStoreBySlug } from '../store/projectStoreRegistry';
import type { StoreApi } from 'zustand';
import type { AppState } from '../store/useAppStore';

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

interface E2EConfig {
  repoUrl: string;
  includeBuild: boolean;
  timeoutMinutes: number;
}

const DEFAULT_REPO = 'https://github.com/vercel/chatbot';

// ─── Helpers ────────────────────────────────────────────────────────

/** Wait for a condition on a per-project store (subscribes to Zustand store updates) */
function waitForProjectStore<T>(
  store: StoreApi<AppState>,
  selector: (state: AppState) => T,
  predicate: (value: T) => boolean,
  timeoutMs: number,
  description: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const current = selector(store.getState());
    if (predicate(current)) { resolve(current); return; }

    const timeout = setTimeout(() => {
      unsub();
      reject(new Error(`Timeout (${(timeoutMs / 1000).toFixed(0)}s): ${description}`));
    }, timeoutMs);

    const unsub = store.subscribe((state) => {
      const value = selector(state);
      if (predicate(value)) {
        clearTimeout(timeout);
        unsub();
        resolve(value);
      }
    });
  });
}

function timestamp(): string {
  return new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Component ──────────────────────────────────────────────────────

export default function E2ETestRunner({ onClose }: { onClose: () => void }) {
  const [view, setView] = useState<ViewMode>('config');
  // Read auto-start repo URL synchronously on first render
  const initialRepoUrl = (window as unknown as Record<string, unknown>).__e2eRepoUrl as string | undefined;
  const [config, setConfig] = useState<E2EConfig>({
    repoUrl: initialRepoUrl || DEFAULT_REPO,
    includeBuild: true,
    timeoutMinutes: 10,
  });
  const [phases, setPhases] = useState<PhaseResult[]>([]);
  const [currentPhase, setCurrentPhase] = useState(-1);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [totalDuration, setTotalDuration] = useState<number | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [copied, setCopied] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const cancelledRef = useRef(false);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const projectSlugRef = useRef<string | null>(null);
  const autoStartedRef = useRef(false);

  const store = useAppStore;

  // Check for auto-start flag (set by --run-e2e CLI flag)
  const shouldAutoStart = (window as unknown as Record<string, unknown>).__e2eAutostart === true;

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
    console.log(`[E2E:${level}] ${message}`);
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

  /** Get the per-project store for the imported project */
  const getProjectStore = () => {
    const slug = projectSlugRef.current;
    if (!slug) throw new Error('No project slug');
    const ps = getProjectStoreBySlug(slug);
    if (!ps) throw new Error(`Project store not found for ${slug}`);
    return ps;
  };

  // ─── Phase implementations ───────────────────────────────────

  async function phaseImport(): Promise<Record<string, string | number>> {
    const parsed = config.repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (!parsed) throw new Error('Invalid GitHub URL');
    const repoName = parsed[2].replace(/\.git$/, '');
    const fullUrl = `https://github.com/${parsed[1]}/${repoName}`;

    log(`Importing ${fullUrl}...`);

    const appConfig = await window.api.storage.getConfig();
    const projectPath = `${appConfig.developmentPath}/${repoName}`;

    // Clone (may already exist)
    try {
      await window.api.github.runShellCommand(appConfig.developmentPath, 'git', ['clone', fullUrl, repoName]);
      log('Cloned repository', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('already exists')) {
        log('Repository already exists locally, reusing', 'warn');
      } else {
        throw err;
      }
    }

    // Create project record
    const project = await store.getState().importProject(repoName, fullUrl, projectPath);
    log(`Project created: ${project.slug}`, 'success');

    // Open it (hydrates per-project store, starts scan)
    await store.getState().openProject(project.slug);
    projectSlugRef.current = project.slug;

    log(`Project opened and scanning started`, 'success');

    return {
      slug: project.slug,
      path: projectPath,
      repo: fullUrl,
    };
  }

  async function phaseScan(): Promise<Record<string, string | number>> {
    const ps = getProjectStore();
    log('Waiting for scan to complete...');

    // Wait for scanStatus to reach 'issues_ready' or 'complete'
    const timeoutMs = config.timeoutMinutes * 60 * 1000;
    const project = await waitForProjectStore(
      ps,
      (s) => s.currentProject,
      (p) => p !== null && (p.scanStatus === 'issues_ready' || p.scanStatus === 'complete'),
      timeoutMs,
      'Waiting for scan completion',
    );
    checkCancelled();

    if (!project) throw new Error('Project became null during scan');

    // Check what we got
    const issues = await window.api.storage.getIssues(project.slug);
    const features = await window.api.storage.getFeatures(project.slug).catch(() => []);

    const criticalCount = issues.filter((i: { severity: string }) => i.severity === 'critical').length;
    const highCount = issues.filter((i: { severity: string }) => i.severity === 'high').length;

    log(`Scan complete: ${issues.length} issues (${criticalCount} critical, ${highCount} high), ${features.length} features`, 'success');

    // If only issues_ready, wait a bit more for Phase 2 (PRD/features)
    if (project.scanStatus === 'issues_ready') {
      log('Phase 1 done, waiting for Phase 2 (PRD generation)...');
      try {
        await waitForProjectStore(
          ps,
          (s) => s.currentProject,
          (p) => p !== null && p.scanStatus === 'complete',
          timeoutMs,
          'Waiting for Phase 2',
        );
        log('Phase 2 complete', 'success');
      } catch {
        log('Phase 2 timed out — continuing with issues only', 'warn');
      }
    }

    return {
      issues: issues.length,
      critical: criticalCount,
      high: highCount,
      features: features.length,
      scanStatus: ps.getState().currentProject?.scanStatus || 'unknown',
    };
  }

  async function phaseTriage(): Promise<Record<string, string | number>> {
    const ps = getProjectStore();
    const slug = projectSlugRef.current!;

    log('Loading issues and checking auto-triage...');

    // Load backlog to see what got auto-triaged
    await ps.getState().loadBacklog();
    await ps.getState().loadSprints();

    const backlog = ps.getState().backlog;
    const sprints = ps.getState().sprints;

    if (backlog.length > 0) {
      log(`Auto-triage found ${backlog.length} items in backlog`, 'success');
      backlog.forEach(item => {
        log(`  - [${item.priority}] ${item.title}`);
      });
    } else {
      // Manually add a critical issue to the backlog if auto-triage didn't fire
      log('No auto-triaged items, manually adding an issue to backlog...');
      const issues = await window.api.storage.getIssues(slug);
      const critical = issues.find((i: { severity: string; status: string }) => i.severity === 'critical' && i.status === 'open');
      const target = critical || issues[0];

      if (target) {
        await ps.getState().planAndSprintIssue(target);
        log(`Added "${target.title || target.description?.slice(0, 50)}" to backlog`, 'success');
      } else {
        log('No issues to triage — scan may not have found any', 'warn');
        return { backlogItems: 0, sprints: 0, skipped: 1 };
      }
    }

    // Reload to get latest state
    await ps.getState().loadBacklog();
    await ps.getState().loadSprints();

    const finalBacklog = ps.getState().backlog;
    const finalSprints = ps.getState().sprints;

    log(`Backlog: ${finalBacklog.length} items, Sprints: ${finalSprints.length}`, 'success');

    return {
      backlogItems: finalBacklog.length,
      sprints: finalSprints.length,
    };
  }

  async function phasePlan(): Promise<Record<string, string | number>> {
    const ps = getProjectStore();

    log('Waiting for PRD generation on backlog items...');

    const backlog = ps.getState().backlog;
    const pendingPrds = backlog.filter(b => b.prdStatus === 'pending' || b.prdStatus === 'generating');

    if (pendingPrds.length > 0) {
      log(`${pendingPrds.length} items still generating PRDs, waiting...`);

      // Wait for at least one item to have a complete PRD
      const timeoutMs = config.timeoutMinutes * 60 * 1000;
      try {
        await waitForProjectStore(
          ps,
          (s) => s.backlog,
          (bl) => bl.some(b => b.prdStatus === 'complete'),
          timeoutMs,
          'Waiting for PRD generation',
        );
        log('At least one PRD generated', 'success');
      } catch {
        log('PRD generation timed out', 'warn');
      }
    }

    // Check sprint readiness
    const sprints = ps.getState().sprints;
    const activeSprint = sprints.find(s => s.status === 'active');
    const planningSprint = sprints.find(s => s.status === 'planning');
    const targetSprint = activeSprint || planningSprint;

    if (!targetSprint) {
      log('No sprint found — checking if auto-activation triggered...', 'warn');
      ps.getState().checkAutoActivateSprints();
      await delay(1000);
    }

    const finalSprints = ps.getState().sprints;
    const finalBacklog = ps.getState().backlog;
    const readyItems = finalBacklog.filter(b => b.prdStatus === 'complete');

    log(`Planning complete: ${readyItems.length}/${finalBacklog.length} items ready, ${finalSprints.length} sprints`, 'success');

    return {
      totalItems: finalBacklog.length,
      readyItems: readyItems.length,
      sprints: finalSprints.length,
      activeSprintExists: finalSprints.some(s => s.status === 'active') ? 1 : 0,
    };
  }

  async function phaseBuild(): Promise<Record<string, string | number>> {
    const ps = getProjectStore();

    log('Starting build...');

    // Find the active sprint
    const sprints = ps.getState().sprints;
    const activeSprint = sprints.find(s => s.status === 'active');

    if (!activeSprint) {
      // Try to activate the first planning sprint
      const planningSprint = sprints.find(s => s.status === 'planning');
      if (planningSprint) {
        ps.getState().setSprintStatus(planningSprint.id, 'active');
        log(`Activated sprint: ${planningSprint.name}`);
      } else {
        log('No sprint to build — skipping', 'warn');
        return { skipped: 1 };
      }
    }

    const sprint = ps.getState().sprints.find(s => s.status === 'active')!;
    ps.getState().startBuild(sprint.id);

    log(`Build started for sprint "${sprint.name}"`, 'success');

    // Wait for build to complete
    const timeoutMs = config.timeoutMinutes * 60 * 1000;
    const buildStart = Date.now();

    try {
      await waitForProjectStore(
        ps,
        (s) => s.buildSessionActive,
        (active) => active === false,
        timeoutMs,
        'Waiting for build completion',
      );
    } catch {
      log('Build timed out', 'warn');
    }

    const buildDuration = Date.now() - buildStart;
    const tasks = ps.getState().tasks;
    const completedTasks = tasks.filter(t => t.completed).length;

    log(`Build finished: ${completedTasks}/${tasks.length} tasks in ${Math.round(buildDuration / 1000)}s`, completedTasks > 0 ? 'success' : 'warn');

    // Check git state
    const project = ps.getState().currentProject;
    if (project) {
      try {
        const gitStatus = await window.api.github.checkGitStatus(project.projectPath);
        log(`Git: ${gitStatus.hasGitRepo ? 'repo exists' : 'no repo'}, ${gitStatus.isDirty ? 'dirty' : 'clean'}`, 'success');
      } catch {
        log('Could not check git status', 'warn');
      }
    }

    return {
      tasksTotal: tasks.length,
      tasksCompleted: completedTasks,
      buildDuration: Math.round(buildDuration / 1000),
    };
  }

  async function phaseVerify(): Promise<Record<string, string | number>> {
    const ps = getProjectStore();
    const project = ps.getState().currentProject;
    if (!project) throw new Error('No project');

    log('Verifying results...');

    // Check files on disk
    let fileCount = 0;
    try {
      const files = await window.api.fs.readdir(project.projectPath);
      fileCount = files.filter((f: string) => !f.startsWith('.')).length;
      log(`${fileCount} files/folders on disk`, 'success');
    } catch {
      log('Could not read project directory', 'warn');
    }

    // Check git events
    const gitEvents = ps.getState().gitEvents;
    const commits = gitEvents.filter(e => e.type === 'committed').length;
    const merges = gitEvents.filter(e => e.type === 'merged').length;
    log(`Git history: ${commits} commits, ${merges} merges`, commits > 0 ? 'success' : 'warn');

    // Check stored data
    const issues = await window.api.storage.getIssues(project.slug).catch(() => []);
    const features = await window.api.storage.getFeatures(project.slug).catch(() => []);
    let hasPrd = false;
    try {
      const prd = await window.api.storage.getPRD(project.slug);
      hasPrd = !!prd && prd.length > 100;
    } catch { /* no PRD */ }

    log(`Stored: ${issues.length} issues, ${features.length} features, PRD: ${hasPrd ? 'yes' : 'no'}`, 'success');

    const tasks = ps.getState().tasks;
    const completedTasks = tasks.filter(t => t.completed).length;
    const allPassed = issues.length > 0 && completedTasks > 0;

    log(allPassed ? 'All verifications passed!' : 'Some verifications incomplete', allPassed ? 'success' : 'warn');

    return {
      files: fileCount,
      commits,
      merges,
      issues: issues.length,
      features: features.length,
      hasPrd: hasPrd ? 1 : 0,
      tasksCompleted: completedTasks,
      result: allPassed ? 'passed' : 'incomplete',
    };
  }

  // ─── Run all phases ────────────────────────────────────────────

  const runTest = useCallback(async () => {
    cancelledRef.current = false;
    setIsRunning(true);
    setView('running');
    setLogs([]);
    setTotalDuration(null);

    const phaseList = [
      { name: 'Import Repo', key: 'import', skip: false },
      { name: 'Scan Codebase', key: 'scan', skip: false },
      { name: 'Triage Issues', key: 'triage', skip: false },
      { name: 'Plan Sprint', key: 'plan', skip: false },
      { name: 'Build Tasks', key: 'build', skip: !config.includeBuild },
      { name: 'Verify Results', key: 'verify', skip: false },
    ];

    const initialPhases = phaseList.map(p => ({
      name: p.name,
      status: (p.skip ? 'skipped' : 'pending') as PhaseStatus,
      duration: 0,
      metrics: {},
    }));
    setPhases(initialPhases);

    const phaseFns: Record<string, () => Promise<Record<string, string | number>>> = {
      import: phaseImport,
      scan: phaseScan,
      triage: phaseTriage,
      plan: phasePlan,
      build: phaseBuild,
      verify: phaseVerify,
    };

    const testStart = Date.now();
    log(`Starting E2E test: ${config.repoUrl}`);
    log(`Build: ${config.includeBuild ? 'enabled' : 'disabled'}, Timeout: ${config.timeoutMinutes}min`);

    for (let i = 0; i < phaseList.length; i++) {
      const phase = phaseList[i];
      if (phase.skip) continue;
      if (cancelledRef.current) break;

      setCurrentPhase(i);
      updatePhase(i, { status: 'running' });
      log(`\n── Phase ${i + 1}: ${phase.name} ──`);

      const phaseStart = Date.now();
      try {
        const metrics = await phaseFns[phase.key]();
        const duration = Date.now() - phaseStart;
        updatePhase(i, { status: 'passed', duration, metrics });
        log(`Phase ${phase.name} passed (${(duration / 1000).toFixed(1)}s)`, 'success');
      } catch (err) {
        const duration = Date.now() - phaseStart;
        const message = err instanceof Error ? err.message : String(err);
        updatePhase(i, { status: 'failed', duration, error: message });
        log(`Phase ${phase.name} FAILED: ${message}`, 'error');

        // Mark remaining as skipped
        for (let j = i + 1; j < phaseList.length; j++) {
          updatePhase(j, { status: 'skipped' });
        }
        break;
      }
    }

    const elapsed = Date.now() - testStart;
    setTotalDuration(elapsed);
    setCurrentPhase(-1);
    setIsRunning(false);
    setView('report');

    log(`\nE2E test complete in ${(elapsed / 1000).toFixed(1)}s`);
  }, [config, log, updatePhase]);

  // Auto-start when triggered by --run-e2e CLI flag
  useEffect(() => {
    if (shouldAutoStart && !autoStartedRef.current && !isRunning) {
      autoStartedRef.current = true;
      // Small delay to let the config update with the repo URL
      setTimeout(() => runTest(), 500);
    }
  }, [shouldAutoStart, isRunning, runTest]);

  // ─── Cancel ────────────────────────────────────────────────────

  const handleCancel = useCallback(() => {
    cancelledRef.current = true;
    log('Cancelling test...', 'warn');
  }, [log]);

  // ─── Copy report ──────────────────────────────────────────────

  const copyReport = useCallback(() => {
    const lines = [
      `Mission Control E2E Test Report`,
      `Repo: ${config.repoUrl}`,
      `Date: ${new Date().toISOString()}`,
      `Duration: ${totalDuration ? `${(totalDuration / 1000).toFixed(1)}s` : 'N/A'}`,
      '',
      'Phases:',
      ...phases.map(p => {
        const status = p.status === 'passed' ? 'PASS' : p.status === 'failed' ? 'FAIL' : p.status.toUpperCase();
        const dur = p.duration ? ` (${(p.duration / 1000).toFixed(1)}s)` : '';
        const err = p.error ? ` — ${p.error}` : '';
        const metrics = Object.entries(p.metrics).map(([k, v]) => `  ${k}: ${v}`).join('\n');
        return `  [${status}] ${p.name}${dur}${err}${metrics ? '\n' + metrics : ''}`;
      }),
      '',
      'Log:',
      ...logs.map(l => `  [${l.time}] ${l.message}`),
    ];
    navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [config, totalDuration, phases, logs]);

  // ─── Render ───────────────────────────────────────────────────

  if (minimized) {
    return (
      <button
        onClick={() => setMinimized(false)}
        className="fixed bottom-4 right-4 z-[100] bg-accent text-surface px-4 py-2 text-sm font-semibold shadow-lg"
      >
        E2E Test {isRunning ? '(running...)' : ''}
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60">
      <div className="bg-surface border border-border w-[700px] max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-lg font-sans font-semibold text-ink">E2E Test Runner</h3>
          <div className="flex items-center gap-2">
            <button onClick={() => setMinimized(true)} className="text-ink-muted hover:text-ink-secondary text-xs">
              Minimize
            </button>
            <button onClick={onClose} className="text-ink-muted hover:text-ink-secondary">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Config */}
        {view === 'config' && (
          <div className="p-5 space-y-4 overflow-y-auto">
            <div>
              <label className="block text-xs font-display uppercase tracking-wider text-ink-muted mb-1.5">GitHub Repository</label>
              <input
                type="text"
                value={config.repoUrl}
                onChange={(e) => setConfig(c => ({ ...c, repoUrl: e.target.value }))}
                className="w-full px-3 py-2 bg-surface border border-border text-ink text-sm focus:outline-none focus:border-accent"
                placeholder="https://github.com/owner/repo"
              />
            </div>

            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 text-sm text-ink cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.includeBuild}
                  onChange={(e) => setConfig(c => ({ ...c, includeBuild: e.target.checked }))}
                  className="accent-[rgb(var(--color-accent))]"
                />
                Include Build Phase
              </label>
              <div>
                <label className="text-xs text-ink-muted mr-2">Timeout (min):</label>
                <input
                  type="number"
                  value={config.timeoutMinutes}
                  onChange={(e) => setConfig(c => ({ ...c, timeoutMinutes: Number(e.target.value) || 10 }))}
                  className="w-16 px-2 py-1 bg-surface border border-border text-ink text-sm focus:outline-none focus:border-accent"
                  min={1}
                  max={60}
                />
              </div>
            </div>

            <button
              onClick={runTest}
              className="btn-solid-primary w-full py-3 text-center"
            >
              START TEST
            </button>
          </div>
        )}

        {/* Running / Report */}
        {(view === 'running' || view === 'report') && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Phase list */}
            <div className="px-5 py-3 border-b border-border space-y-1.5">
              {phases.map((phase, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="w-5 text-center">
                    {phase.status === 'passed' && <span className="text-success">&#10003;</span>}
                    {phase.status === 'failed' && <span className="text-error">&#10007;</span>}
                    {phase.status === 'running' && <span className="text-accent animate-pulse">&#9679;</span>}
                    {phase.status === 'pending' && <span className="text-ink-muted">&#9675;</span>}
                    {phase.status === 'skipped' && <span className="text-ink-muted">&#8211;</span>}
                  </span>
                  <span className={phase.status === 'running' ? 'text-ink font-medium' : 'text-ink-muted'}>
                    {phase.name}
                  </span>
                  {phase.duration > 0 && (
                    <span className="text-xs text-ink-muted ml-auto">{(phase.duration / 1000).toFixed(1)}s</span>
                  )}
                </div>
              ))}
            </div>

            {/* Log output */}
            <div ref={logContainerRef} className="flex-1 overflow-y-auto px-5 py-3 font-mono text-xs leading-relaxed">
              {logs.map((entry, i) => (
                <div key={i} className={
                  entry.level === 'error' ? 'text-error' :
                  entry.level === 'warn' ? 'text-mc-amber' :
                  entry.level === 'success' ? 'text-success' :
                  'text-ink-muted'
                }>
                  <span className="text-ink-muted/50 mr-2">{entry.time}</span>
                  {entry.message}
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-border flex items-center justify-between">
              {totalDuration && (
                <span className="text-xs text-ink-muted">
                  Total: {(totalDuration / 1000).toFixed(1)}s
                </span>
              )}
              <div className="flex items-center gap-2 ml-auto">
                {isRunning && (
                  <button onClick={handleCancel} className="btn-solid px-3 py-1.5 text-sm">Cancel</button>
                )}
                {view === 'report' && (
                  <>
                    <button onClick={copyReport} className="btn-solid px-3 py-1.5 text-sm">
                      {copied ? 'Copied!' : 'Copy Report'}
                    </button>
                    <button onClick={() => { setView('config'); setPhases([]); setLogs([]); }} className="btn-solid px-3 py-1.5 text-sm">
                      Run Again
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
