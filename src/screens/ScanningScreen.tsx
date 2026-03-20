import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useProjectStore } from '../store/ProjectStoreContext';
import { resilientChat } from '../utils/resilient-chat';
import {
  buildScanPrompt, parseScanResponse, mergeWithExisting,
  buildStreamingIssuesScanPrompt, buildPrdScanPrompt,
  parseIssuesScanResponse, parsePrdScanResponse,
} from '../utils/scan-parser';
import type { ScanResults } from '../utils/scan-parser';
import type { FeatureModule, CodeIssue, ScanDiff, BacklogItem } from '../types';
import { queueAssistantMessage } from '../utils/assistant-chat-state';
import { AgentTimeline, AgentStatusBar } from 'agent-native';
import { useDiscoveryStream } from '../hooks/useDiscoveryStream';
import DiscoveryCard from '../components/DiscoveryCard';

type OnboardingStep = 'scanning' | 'issues-triage';

export default function ScanningScreen() {
  const {
    currentProject,
    updateProject,
    setScreen,
    setProjectHomeTab,
    setPlanSubTab,
    loadBacklog,
    planAndSprintIssue,
    addToast,
  } = useProjectStore();

  const [status, setStatus] = useState<'starting' | 'scanning' | 'complete' | 'failed'>('starting');
  const [progress, setProgress] = useState('Preparing to scan...');
  const [error, setError] = useState<string | null>(null);
  const [scanDiff, setScanDiff] = useState<ScanDiff | null>(null);
  const [diffDisplayNames, setDiffDisplayNames] = useState<Record<string, string>>({});
  const scanStarted = useRef(false);
  const isRescan = useRef(false);

  // Post-scan onboarding state
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep>('scanning');
  const [scanResults, setScanResults] = useState<ScanResults | null>(null);
  const [selectedIssueIds, setSelectedIssueIds] = useState<Set<string>>(new Set());
  const [addingToBacklog, setAddingToBacklog] = useState(false);

  // Phase 2 state
  const [phase2Status, setPhase2Status] = useState<'idle' | 'running' | 'complete' | 'failed'>('idle');
  const phase2Ref = useRef<{ cancel: () => void } | null>(null);
  const scanCancelRef = useRef<{ cancel: () => void } | null>(null);

  // Plan & Sprint state per issue
  const [planningIssueIds, setPlanningIssueIds] = useState<Set<string>>(new Set());
  const [plannedIssueIds, setPlannedIssueIds] = useState<Set<string>>(new Set());

  // Track which issues have been triaged to avoid double-processing
  const triagedIssueIds = useRef<Set<string>>(new Set());

  // Incremental auto-triage: fires on each issue as it streams in
  const handleIssueDiscovered = useCallback((issue: CodeIssue) => {
    if (triagedIssueIds.current.has(issue.id)) return;
    // Auto-triage critical issues immediately (low SP = instant build path)
    if (issue.severity === 'critical' && issue.status === 'open') {
      triagedIssueIds.current.add(issue.id);
      planAndSprintIssue(issue).catch(err => {
        console.error('Incremental auto-triage failed:', err);
      });
    }
  }, [planAndSprintIssue]);

  // Streaming discovery hook with incremental triage callback
  const discoveryStream = useDiscoveryStream({ onIssueDiscovered: handleIssueDiscovered });
  const discoveryFeedRef = useRef<HTMLDivElement>(null);

  // Elapsed timer for "still working" indicator
  const [elapsedSec, setElapsedSec] = useState(0);
  useEffect(() => {
    if (status !== 'scanning' && status !== 'starting') {
      setElapsedSec(0);
      return;
    }
    const start = Date.now();
    const interval = setInterval(() => setElapsedSec(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(interval);
  }, [status]);

  const autoTriageCriticalIssues = useCallback(async (issues: CodeIssue[]) => {
    // Filter out issues already triaged incrementally
    const untriaged = issues.filter((i) => i.severity === 'critical' && i.status === 'open' && !triagedIssueIds.current.has(i.id));
    if (untriaged.length === 0) return;

    const ids = new Set(untriaged.map((i) => i.id));
    setPlanningIssueIds(ids);

    for (const issue of untriaged) {
      triagedIssueIds.current.add(issue.id);
      try {
        await planAndSprintIssue(issue);
        setPlannedIssueIds((prev) => new Set(prev).add(issue.id));
        setScanResults((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            issues: prev.issues.map((i) =>
              i.id === issue.id ? { ...i, status: 'planned' as const } : i
            ),
          };
        });
      } catch (err) {
        console.error('Auto-triage failed for issue:', issue.id, err);
      }
    }

    setPlanningIssueIds(new Set());
    addToast({
      type: 'success',
      message: `Auto-planned ${criticalOpen.length} critical ${criticalOpen.length === 1 ? 'issue' : 'issues'} into Sprint 1`,
    });
    if (currentProject) {
      queueAssistantMessage(
        currentProject.slug,
        `Found ${issues.length} issues. ${criticalOpen.length} critical ${criticalOpen.length === 1 ? 'one has' : 'ones have'} been auto-planned.`,
      );
    }
  }, [planAndSprintIssue, addToast, currentProject]);

  useEffect(() => {
    if (!currentProject || scanStarted.current) return;

    // If already complete, this is a re-scan (user clicked "Re-scan")
    isRescan.current = currentProject.scanStatus === 'complete';

    // If issues_ready, resume from Phase 1 results
    if (currentProject.scanStatus === 'issues_ready') {
      scanStarted.current = true;
      resumeFromIssuesReady();
      return;
    }

    scanStarted.current = true;
    runScan();
  }, [currentProject]);

  // Cleanup Phase 2 and streaming on unmount
  useEffect(() => {
    return () => {
      scanCancelRef.current?.cancel();
      phase2Ref.current?.cancel();
      discoveryStream.unsubscribe();
    };
  }, []);

  const resumeFromIssuesReady = async () => {
    if (!currentProject) return;
    try {
      const issues = await window.api.storage.getIssues(currentProject.slug) || [];
      const openIssues = issues.filter((i: CodeIssue) => i.status === 'open');
      const criticalIds = new Set(openIssues.filter((i: CodeIssue) => i.severity === 'critical').map((i: CodeIssue) => i.id));
      setSelectedIssueIds(criticalIds);

      // Load already-planned issues
      const alreadyPlanned = new Set(issues.filter((i: CodeIssue) => i.status === 'planned').map((i: CodeIssue) => i.id));
      setPlannedIssueIds(alreadyPlanned);

      setScanResults({
        masterPrd: '',
        features: [],
        issues,
        featureIdeas: [],
        techStack: currentProject.techStack || { languages: [], frameworks: [], buildTools: [], summary: '' },
        fileCount: 0,
        summary: '',
      });
      setStatus('complete');
      setOnboardingStep('issues-triage');

      // Auto-triage unplanned critical issues
      const unplannedCritical = issues.filter((i: CodeIssue) => i.severity === 'critical' && i.status === 'open');
      if (unplannedCritical.length > 0) {
        autoTriageCriticalIssues(issues);
      }

      // Kick off Phase 2 in background if not already complete
      if (currentProject.scanStatus !== 'complete') {
        runPhase2(
          currentProject.techStack?.summary || 'Unknown stack',
          `${issues.length} issues found`,
          issues,
        );
      }
    } catch (err) {
      console.error('Failed to resume from issues_ready:', err);
      // Fall back to full scan
      runScan();
    }
  };

  const runPhase2 = (techStackSummary: string, issuesSummary: string, issues: CodeIssue[]) => {
    if (!currentProject) return;

    setPhase2Status('running');

    const prompt = buildPrdScanPrompt(techStackSummary, issuesSummary);
    const { promise, cancel } = resilientChat.long(currentProject.projectPath, prompt, {
      streaming: true,
    });
    phase2Ref.current = { cancel };

    // Phase 2 runs silently in background (user is on triage by now)

    promise.then(async (response) => {
      try {
        const prdResult = parsePrdScanResponse(response);

        // Save PRD, features to storage
        await window.api.storage.savePRD(currentProject.slug, prdResult.masterPrd);
        await window.api.storage.saveFeatures(currentProject.slug, prdResult.features);

        // Append to scan history
        const existingHistory = await window.api.storage.getScanHistory(currentProject.slug).catch(() => []);
        await window.api.storage.saveScanHistory(currentProject.slug, [
          ...existingHistory,
          {
            id: `scan-${Date.now()}`,
            timestamp: new Date().toISOString(),
            masterPrd: prdResult.masterPrd,
            features: prdResult.features,
            issues,
            techStack: currentProject.techStack || { languages: [], frameworks: [], buildTools: [], summary: '' },
            fileCount: 0,
            summary: '',
          },
        ]);

        await updateProject({
          scanStatus: 'complete',
          lastScannedAt: new Date().toISOString(),
        });

        setPhase2Status('complete');
      } catch (parseErr) {
        console.error('Phase 2 parse error:', parseErr);
        setPhase2Status('failed');
      }
    }).catch((err) => {
      const msg = err instanceof Error ? err.message : 'Phase 2 failed';
      if (msg === 'cancelled') return;
      console.error('Phase 2 failed:', err);
      setPhase2Status('failed');
      // Don't crash — issues are already saved
    });
  };

  const runScan = async () => {
    if (!currentProject) return;

    setStatus('scanning');
    setProgress(isRescan.current ? 'Re-scanning codebase...' : 'Scanning for issues...');

    // Load existing data for diff computation on re-scan
    let existingFeatures: FeatureModule[] = [];
    let existingIssues: CodeIssue[] = [];
    if (isRescan.current) {
      try {
        existingFeatures = await window.api.storage.getFeatures(currentProject.slug);
        existingIssues = await window.api.storage.getIssues(currentProject.slug);
      } catch {
        // If loading fails, proceed as fresh scan
      }
    }

    try {
      await updateProject({ scanStatus: 'scanning' });

      // Re-scans use the existing single-call flow
      if (isRescan.current) {
        const prompt = buildScanPrompt();
        const { promise, cancel: rescanCancel, chatId: rescanChatId } = resilientChat.long(currentProject.projectPath, prompt, {
          retryAction: () => {
            scanStarted.current = false;
            setStatus('starting');
            setError(null);
          },
          streaming: true,
          onChatIdChange: (newId) => discoveryStream.subscribe(newId),
        });
        scanCancelRef.current = { cancel: rescanCancel };

        // Subscribe discovery stream for re-scan too
        discoveryStream.subscribe(rescanChatId);

        setProgress('Analyzing codebase structure and features...');
        let response: string;
        try {
          response = await promise;
        } finally {
          discoveryStream.unsubscribe();
        }
        const scanResult = parseScanResponse(response);

        let finalFeatures = scanResult.features;
        let finalIssues = scanResult.issues;
        let diff: ScanDiff | undefined;

        if (existingFeatures.length > 0 || existingIssues.length > 0) {
          const mergeResult = mergeWithExisting(
            scanResult.features,
            scanResult.issues,
            existingFeatures,
            existingIssues,
          );
          finalFeatures = mergeResult.features;
          finalIssues = mergeResult.issues;
          diff = mergeResult.diff;
          setScanDiff(diff);
          setDiffDisplayNames(mergeResult.nameMap);
        }

        await window.api.storage.savePRD(currentProject.slug, scanResult.masterPrd);
        await window.api.storage.saveFeatures(currentProject.slug, finalFeatures);
        await window.api.storage.saveIssues(currentProject.slug, finalIssues);

        const existingHistory = await window.api.storage.getScanHistory(currentProject.slug).catch(() => []);
        await window.api.storage.saveScanHistory(currentProject.slug, [
          ...existingHistory,
          {
            id: `scan-${Date.now()}`,
            timestamp: new Date().toISOString(),
            masterPrd: scanResult.masterPrd,
            features: finalFeatures,
            issues: finalIssues,
            techStack: scanResult.techStack,
            fileCount: scanResult.fileCount,
            summary: scanResult.summary,
          },
        ]);

        await updateProject({
          scanStatus: 'complete',
          lastScannedAt: new Date().toISOString(),
          techStack: scanResult.techStack,
          scanError: undefined,
          lastScanDiff: diff,
        });

        setStatus('complete');
        setProgress('Scan complete!');

        setScanResults({
          masterPrd: scanResult.masterPrd,
          features: finalFeatures,
          issues: finalIssues,
          featureIdeas: scanResult.featureIdeas,
          techStack: scanResult.techStack,
          fileCount: scanResult.fileCount,
          summary: scanResult.summary,
        });

        if (diff) return;
        setTimeout(() => setScreen('project-home'), 1500);
        return;
      }

      // ── First scan: Phase 1 (streaming issues discovery) ──────────
      const phase1Prompt = buildStreamingIssuesScanPrompt();
      const { promise: phase1Promise, cancel: phase1Cancel, chatId: phase1ChatId } = resilientChat.long(currentProject.projectPath, phase1Prompt, {
        retryAction: () => {
          scanStarted.current = false;
          setStatus('starting');
          setError(null);
        },
        streaming: true,
        onChatIdChange: (newId) => discoveryStream.subscribe(newId),
      });
      scanCancelRef.current = { cancel: phase1Cancel };

      // Subscribe discovery stream to this chat
      discoveryStream.subscribe(phase1ChatId);

      setProgress('Scanning for issues...');
      let phase1Response: string;
      try {
        phase1Response = await phase1Promise;
      } finally {
        discoveryStream.unsubscribe();
      }

      // Read latest results from refs (not stale closure state)
      const streamResults = discoveryStream.getResults();
      let finalIssues: CodeIssue[];
      let finalTechStack = streamResults.techStack;

      if (streamResults.issues.length > 0) {
        finalIssues = streamResults.issues;
      } else {
        // Fallback: Claude didn't emit tags, try JSON parsing
        try {
          const phase1Result = parseIssuesScanResponse(phase1Response);
          finalIssues = phase1Result.issues;
          finalTechStack = phase1Result.techStack;
        } catch {
          // Streaming prompt response isn't valid JSON — no issues found
          finalIssues = [];
        }
      }

      const techStack = finalTechStack || { languages: [], frameworks: [], buildTools: [], summary: 'Unknown stack' };
      const scanSummary = streamResults.scanMeta?.summary || `${finalIssues.length} issues found`;
      const fileCount = streamResults.scanMeta?.fileCount || 0;

      // Save issues + techStack to storage
      await window.api.storage.saveIssues(currentProject.slug, finalIssues);
      await updateProject({
        scanStatus: 'issues_ready',
        techStack,
        scanError: undefined,
      });

      // Set scan results with issues (features/PRD empty for now)
      setScanResults({
        masterPrd: '',
        features: [],
        issues: finalIssues,
        featureIdeas: [],
        techStack,
        fileCount,
        summary: scanSummary,
      });

      // Pre-select critical issues
      const openIssues = finalIssues.filter(i => i.status === 'open');
      const criticalIds = new Set(openIssues.filter(i => i.severity === 'critical').map(i => i.id));
      setSelectedIssueIds(criticalIds);

      setStatus('complete');
      // Stay on scanning view so user can see discoveries; they'll click "Continue to Triage"

      // Catch any critical issues that weren't triaged during streaming
      // (e.g., if the streaming parser missed a tag or the issue was in the final batch)
      const untriagedCritical = finalIssues.filter(
        i => i.severity === 'critical' && i.status === 'open' && !triagedIssueIds.current.has(i.id)
      );
      if (untriagedCritical.length > 0) {
        autoTriageCriticalIssues(untriagedCritical);
      }

      // Fire Phase 2 in background (don't await)
      runPhase2(
        techStack.summary,
        scanSummary,
        finalIssues,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Scan failed';
      if (msg === 'cancelled') return;

      setStatus('failed');
      setError(msg);
      await updateProject({ scanStatus: 'failed', scanError: msg });
    }
  };

  const handleRetry = () => {
    scanCancelRef.current?.cancel();
    scanCancelRef.current = null;
    setStatus('starting');
    setError(null);
    discoveryStream.reset();
    setScanDiff(null);
    setOnboardingStep('scanning');
    setScanResults(null);
    setPhase2Status('idle');
    // scanStarted stays true — we call runScan directly, not via the useEffect
    runScan();
  };

  const handleCancelScan = () => {
    scanCancelRef.current?.cancel();
    scanCancelRef.current = null;
    discoveryStream.unsubscribe();
    setStatus('failed');
    setError('Scan cancelled');
    // Reset project status so it doesn't stay stuck at 'scanning'
    updateProject({ scanStatus: 'failed', scanError: 'Scan cancelled by user' });
  };

  // Navigation helpers
  const goToBrainstorm = () => {
    setProjectHomeTab('plan');
    setPlanSubTab('planning');
    setScreen('project-home');
    setTimeout(() => {
      window.openAssistant?.();
    }, 100);
  };

  const handlePlanAndSprint = async (issue: CodeIssue) => {
    setPlanningIssueIds(prev => new Set(prev).add(issue.id));
    try {
      await planAndSprintIssue(issue);
      setPlannedIssueIds(prev => new Set(prev).add(issue.id));
      // Update local scan results to reflect planned status
      setScanResults(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          issues: prev.issues.map(i =>
            i.id === issue.id ? { ...i, status: 'planned' as const } : i
          ),
        };
      });
    } catch (err) {
      console.error('Plan & Sprint failed:', err);
      addToast({ type: 'warning', message: 'Failed to plan issue. Try again.' });
    } finally {
      setPlanningIssueIds(prev => {
        const next = new Set(prev);
        next.delete(issue.id);
        return next;
      });
    }
  };

  const handleAddAllToBacklog = async () => {
    if (!currentProject || !scanResults) return;
    setAddingToBacklog(true);

    try {
      const allOpenIssues = scanResults.issues.filter(i => i.status === 'open');
      const existingBacklog = await window.api.storage.getBacklog(currentProject.slug).catch(() => [] as BacklogItem[]);

      const newItems: BacklogItem[] = allOpenIssues.map((issue, i) => ({
        id: `backlog-${Date.now()}-${i}`,
        title: `Fix: ${issue.title}`,
        description: issue.description + (issue.file ? `\n\nFile: ${issue.file}` : ''),
        priority: issue.severity === 'critical' ? 'high' as const : issue.severity === 'warning' ? 'medium' as const : 'low' as const,
        type: 'bug_fix' as const,
        estimatedEffort: issue.estimatedEffort,
        createdAt: new Date().toISOString(),
        prdStatus: 'pending' as const,
      }));

      await window.api.storage.saveBacklog(currentProject.slug, [...existingBacklog, ...newItems]);

      const updatedIssues = scanResults.issues.map(i =>
        i.status === 'open' ? { ...i, status: 'planned' as const } : i
      );
      await window.api.storage.saveIssues(currentProject.slug, updatedIssues);

      await loadBacklog();

      setProjectHomeTab('plan');
      setPlanSubTab('backlog');
      setScreen('project-home');
    } catch (err) {
      console.error('Failed to add issues to backlog:', err);
      setAddingToBacklog(false);
    }
  };

  const toggleIssue = (id: string) => {
    setSelectedIssueIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAllIssues = () => {
    const openIssues = scanResults?.issues.filter(i => i.status === 'open') || [];
    setSelectedIssueIds(new Set(openIssues.map(i => i.id)));
  };

  const deselectAllIssues = () => {
    setSelectedIssueIds(new Set());
  };

  // Group issues by severity for triage display
  const groupedIssues = useMemo(() => {
    if (!scanResults) return { critical: [], warning: [], info: [] };
    const open = scanResults.issues.filter(i => i.status === 'open');
    return {
      critical: open.filter(i => i.severity === 'critical'),
      warning: open.filter(i => i.severity === 'warning'),
      info: open.filter(i => i.severity === 'info'),
    };
  }, [scanResults]);

  const openIssueCount = groupedIssues.critical.length + groupedIssues.warning.length + groupedIssues.info.length;

  // ── Step Progress Indicator ──────────────────────────────
  const renderStepIndicator = () => {
    const steps = [
      { key: 'scanning', label: 'Scan' },
      { key: 'issues-triage', label: 'Find Bugs' },
    ];
    const currentIdx = steps.findIndex(s => s.key === onboardingStep);

    return (
      <div className="flex items-center justify-center gap-3 mb-8">
        {steps.map((step, i) => {
          const isComplete = i < currentIdx;
          const isCurrent = i === currentIdx;
          return (
            <div key={step.key} className="flex items-center gap-2">
              {i > 0 && (
                <div className={`w-8 h-px ${isComplete || isCurrent ? 'bg-accent' : 'bg-border'}`} />
              )}
              <div className="flex items-center gap-1.5">
                <div className={`w-2.5 h-2.5 rounded-full transition-colors ${
                  isComplete ? 'bg-success' :
                  isCurrent ? 'bg-accent' :
                  'bg-border'
                }`} />
                <span className={`text-xs font-medium ${
                  isCurrent ? 'text-ink' : 'text-ink-muted'
                }`}>
                  {step.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // Auto-scroll discovery feed
  useEffect(() => {
    if (discoveryFeedRef.current && discoveryStream.discoveries.length > 0) {
      discoveryFeedRef.current.scrollTop = discoveryFeedRef.current.scrollHeight;
    }
  }, [discoveryStream.discoveries.length]);

  // Map discovery stream status to AgentStatusBar status
  const agentStatusBarStatus = useMemo(() => {
    if (status === 'failed') return 'error' as const;
    if (status === 'complete' || discoveryStream.agentStatus === 'complete') return 'complete' as const;
    if (discoveryStream.agentStatus === 'acting') return 'acting' as const;
    if (discoveryStream.agentStatus === 'thinking') return 'thinking' as const;
    return 'idle' as const;
  }, [status, discoveryStream.agentStatus]);

  // Use streamed issue count during scan, fallback to scanResults after completion
  const issueCount = discoveryStream.issues.length || (scanResults?.issues.length ?? 0);

  // ── Scanning UI (streaming two-panel layout) ────────────
  const renderScanningUI = () => {
    const isActive = status === 'scanning' || status === 'starting';
    const isComplete = status === 'complete';
    const isFailed = status === 'failed';

    // Re-scan with diff: show the old diff card view
    if (isComplete && scanDiff) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="w-full max-w-md text-center px-6">
            <div className="w-16 h-16 bg-success/15 border-2 border-success/30 flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="font-display text-xl tracking-wide font-bold text-ink mb-2">Scan Complete</h2>
            <div className="mt-4 text-left card-panel p-4 space-y-3">
              <h3 className="text-sm font-semibold text-ink">What Changed</h3>
              <p className="text-xs text-ink-muted">{scanDiff.summary}</p>
              {scanDiff.newFeatures.length > 0 && (
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-success font-medium">New Features</span>
                  <ul className="mt-1 space-y-0.5">
                    {scanDiff.newFeatures.map((fp, i) => (
                      <li key={i} className="text-xs text-ink-secondary flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 bg-success rounded-full flex-shrink-0" />
                        {diffDisplayNames[fp] || fp}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {scanDiff.removedFeatures.length > 0 && (
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-error font-medium">Removed Features</span>
                  <ul className="mt-1 space-y-0.5">
                    {scanDiff.removedFeatures.map((fp, i) => (
                      <li key={i} className="text-xs text-ink-secondary flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 bg-error rounded-full flex-shrink-0" />
                        {diffDisplayNames[fp] || fp}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {scanDiff.newIssues.length > 0 && (
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-warning font-medium">New Issues</span>
                  <ul className="mt-1 space-y-0.5">
                    {scanDiff.newIssues.map((fp, i) => (
                      <li key={i} className="text-xs text-ink-secondary flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 bg-warning rounded-full flex-shrink-0" />
                        {diffDisplayNames[fp] || fp}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {scanDiff.issuesFixed.length > 0 && (
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-success font-medium">Issues Fixed</span>
                  <ul className="mt-1 space-y-0.5">
                    {scanDiff.issuesFixed.map((fp, i) => (
                      <li key={i} className="text-xs text-ink-secondary flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 bg-success rounded-full flex-shrink-0" />
                        {diffDisplayNames[fp] || fp}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <button onClick={() => setScreen('project-home')} className="btn-solid-primary w-full mt-4">
                VIEW DASHBOARD
              </button>
            </div>
          </div>
        </div>
      );
    }

    // Re-scan auto-redirect (no diff)
    if (isComplete && !scanDiff && isRescan.current) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="w-16 h-16 bg-success/15 border-2 border-success/30 flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-xs text-ink-muted">Redirecting to dashboard...</p>
        </div>
      );
    }

    // ── Main streaming layout ──────────────────────────────
    return (
      <div className="flex-1 flex flex-col min-h-0">
        {/* Status bar */}
        <div className="border-b border-border px-4 py-2">
          <AgentStatusBar
            status={agentStatusBarStatus}
            className="text-sm"
          />
        </div>

        {/* Two-panel content */}
        <div className="flex-1 flex min-h-0">
          {/* Left panel: Agent Timeline */}
          <div className="w-[35%] border-r border-border overflow-y-auto p-4">
            <AgentTimeline
              {...discoveryStream.timelineProps}
              showToolCalls
              showElapsedTime={false}
              autoScroll
              classNames={{
                root: 'text-xs',
              }}
            />
            {(isActive && discoveryStream.timelineProps.steps.length === 0) && (
              <div className="flex items-center gap-2 text-xs text-ink-muted mt-2">
                <div className="w-3 h-3 border-2 border-accent border-t-transparent animate-spin rounded-full" />
                Starting scan...
              </div>
            )}
          </div>

          {/* Right panel: Discovery Feed */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto p-4" ref={discoveryFeedRef}>
              {discoveryStream.discoveries.length === 0 && isActive && (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <p className="text-sm text-ink-muted">Waiting for discoveries...</p>
                  <p className="text-xs text-ink-muted/60 mt-1">Issues will appear here as they're found</p>
                </div>
              )}
              {discoveryStream.discoveries.length === 0 && isComplete && !scanResults?.issues.length && (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <p className="text-sm text-ink-muted">No issues detected</p>
                  <p className="text-xs text-ink-muted/60 mt-1">Your codebase looks clean</p>
                </div>
              )}
              {discoveryStream.discoveries.length === 0 && isComplete && (scanResults?.issues.length ?? 0) > 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <div className="w-12 h-12 bg-accent/15 border-2 border-accent/30 rounded-full flex items-center justify-center mx-auto mb-3">
                    <span className="text-lg font-bold text-accent">{scanResults!.issues.length}</span>
                  </div>
                  <p className="text-sm text-ink">Scan complete — {scanResults!.issues.length} issue{scanResults!.issues.length !== 1 ? 's' : ''} found</p>
                  <p className="text-xs text-ink-muted mt-1">Click "Continue to Triage" to review them</p>
                </div>
              )}
              {discoveryStream.discoveries.map((d, i) => (
                <DiscoveryCard
                  key={`${d.type}-${d.index}`}
                  type={d.type}
                  title={
                    d.type === 'techStack'
                      ? 'Tech Stack'
                      : String(d.data.title || d.data.name || `Discovery ${i + 1}`)
                  }
                  description={d.type !== 'techStack' ? String(d.data.description || '') : undefined}
                  severity={d.data.severity as 'critical' | 'warning' | 'info' | undefined}
                  category={d.data.category as string | undefined}
                  file={d.data.file as string | undefined}
                  languages={d.type === 'techStack' ? (d.data.languages as string[]) : undefined}
                  frameworks={d.type === 'techStack' ? (d.data.frameworks as string[]) : undefined}
                  buildTools={d.type === 'techStack' ? (d.data.buildTools as string[]) : undefined}
                  isNew
                />
              ))}
            </div>

            {/* Issue counter + elapsed time */}
            {(issueCount > 0 || (isActive && elapsedSec >= 5)) && (
              <div className="border-t border-border px-4 py-2 text-xs text-ink-muted flex items-center justify-between">
                <span>
                  {issueCount > 0
                    ? `${issueCount} issue${issueCount !== 1 ? 's' : ''} found${isActive ? ' so far' : ''}`
                    : 'Scanning...'}
                </span>
                {isActive && elapsedSec >= 5 && (
                  <span className="font-mono text-ink-muted/60">
                    {Math.floor(elapsedSec / 60)}:{(elapsedSec % 60).toString().padStart(2, '0')} elapsed
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Bottom action bar */}
        <div className="border-t border-border px-6 py-3 flex items-center justify-between">
          <button
            onClick={() => setScreen('project-home')}
            className="text-sm text-ink-muted hover:text-ink transition-colors font-medium"
          >
            Skip to Dashboard
          </button>

          {isFailed && (
            <button onClick={handleRetry} className="btn-solid-primary px-4 py-2 text-sm font-bold">
              RETRY SCAN
            </button>
          )}

          {isComplete && !isRescan.current && issueCount > 0 && (
            <button
              onClick={() => setOnboardingStep('issues-triage')}
              className="btn-solid-primary px-4 py-2 text-sm font-bold"
            >
              Continue to Triage ({issueCount})
            </button>
          )}

          {isComplete && !isRescan.current && issueCount === 0 && (
            <button
              onClick={() => setScreen('project-home')}
              className="btn-solid-primary px-4 py-2 text-sm font-bold"
            >
              Go to Dashboard
            </button>
          )}

          {isActive && (
            <button
              onClick={handleCancelScan}
              className="text-sm text-ink-muted hover:text-error transition-colors font-medium"
            >
              Cancel Scan
            </button>
          )}
        </div>

        {/* Error display */}
        {isFailed && error && (
          <div className="px-6 pb-3">
            <div className="card-panel p-3 border-error/30 bg-error/5">
              <p className="text-xs text-error">{error}</p>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── Issues Triage Step ───────────────────────────────────
  const renderIssuesTriage = () => {
    if (!scanResults) return null;

    const allSelected = selectedIssueIds.size === openIssueCount;

    const severityDot: Record<string, string> = {
      critical: 'bg-error',
      warning: 'bg-warning',
      info: 'bg-ink-muted/40',
    };

    const categoryBadge: Record<string, string> = {
      bug: 'bg-spectrum-orange/15 text-spectrum-orange border-spectrum-orange/30',
      security: 'bg-spectrum-red/15 text-spectrum-red border-spectrum-red/30',
      performance: 'bg-accent/15 text-accent border-accent/30',
      dead_code: 'bg-surface-light text-ink-muted border-border',
    };

    const renderIssueRow = (issue: CodeIssue) => {
      const isPlanning = planningIssueIds.has(issue.id);
      const isPlanned = plannedIssueIds.has(issue.id) || issue.status === 'planned';

      return (
        <div
          key={issue.id}
          className="flex items-start gap-3 px-4 py-3 hover:bg-surface-light/50 transition-colors border-b border-border last:border-0"
        >
          {/* Checkbox */}
          <label className="flex items-start gap-3 flex-1 min-w-0 cursor-pointer">
            <input
              type="checkbox"
              checked={selectedIssueIds.has(issue.id)}
              onChange={() => toggleIssue(issue.id)}
              className="mt-0.5 w-4 h-4 accent-accent flex-shrink-0"
            />
            <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${severityDot[issue.severity]}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-ink">{issue.title}</span>
                <span className={`text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 border rounded ${categoryBadge[issue.category]}`}>
                  {issue.category.replaceAll('_', ' ')}
                </span>
              </div>
              {issue.file && (
                <p className="text-xs text-ink-muted font-mono mt-0.5 truncate">{issue.file}</p>
              )}
            </div>
          </label>

          {/* Plan & Sprint button */}
          <div className="flex-shrink-0 mt-0.5">
            {isPlanned ? (
              <span className="text-[10px] uppercase tracking-wider font-bold text-success px-2 py-1">Planned</span>
            ) : (
              <button
                onClick={() => handlePlanAndSprint(issue)}
                disabled={isPlanning}
                className="btn-solid-primary px-2.5 py-1 text-[11px] font-bold disabled:opacity-50 flex items-center gap-1.5"
              >
                {isPlanning ? (
                  <>
                    <div className="w-3 h-3 border-2 border-white border-t-transparent animate-spin rounded-full" />
                    Planning...
                  </>
                ) : (
                  'Plan & Sprint'
                )}
              </button>
            )}
          </div>
        </div>
      );
    };

    const renderSeverityGroup = (label: string, issues: CodeIssue[], color: string) => {
      if (issues.length === 0) return null;
      return (
        <div className="mb-4">
          <div className="flex items-center gap-2 px-4 py-2">
            <span className={`w-2 h-2 rounded-full ${color}`} />
            <span className="text-[10px] uppercase tracking-wider font-bold text-ink-muted">
              {label} ({issues.length})
            </span>
          </div>
          <div>{issues.map(renderIssueRow)}</div>
        </div>
      );
    };

    return (
      <div className="flex-1 flex flex-col min-h-0">
        <div className="pt-4">
          {renderStepIndicator()}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-24">
          <div className="max-w-3xl mx-auto">
            {/* Header */}
            <div className="text-center mb-6">
              <h2 className="font-display text-xl tracking-wide font-bold text-ink mb-1">
                We found {openIssueCount} potential issue{openIssueCount !== 1 ? 's' : ''}
              </h2>
              <p className="text-sm text-ink-muted">
                Select issues to add to your backlog, or click "Plan & Sprint" for instant action
              </p>
            </div>

            {/* Select all / deselect */}
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={allSelected ? deselectAllIssues : selectAllIssues}
                className="text-xs text-accent hover:text-accent/80 font-medium transition-colors"
              >
                {allSelected ? 'Deselect All' : 'Select All'}
              </button>
              <span className="text-xs text-ink-muted">
                {selectedIssueIds.size} selected
              </span>
            </div>

            {/* Issues list */}
            <div className="card-panel overflow-hidden max-h-[60vh] overflow-y-auto">
              {renderSeverityGroup('Critical', groupedIssues.critical, 'bg-error')}
              {renderSeverityGroup('Warning', groupedIssues.warning, 'bg-warning')}
              {renderSeverityGroup('Info', groupedIssues.info, 'bg-ink-muted/40')}
            </div>

            {/* Phase 2 background indicator */}
            {phase2Status === 'running' && (
              <div className="flex items-center gap-2 justify-center mt-4">
                <div className="w-3 h-3 border-2 border-accent border-t-transparent animate-spin rounded-full" />
                <span className="text-xs text-ink-muted">Generating project documentation...</span>
              </div>
            )}
            {phase2Status === 'failed' && (
              <p className="text-xs text-ink-muted text-center mt-4">
                Documentation generation failed — you can re-scan later from the project home.
              </p>
            )}
          </div>
        </div>

        {/* Bottom action bar */}
        <div className="absolute bottom-0 left-0 right-0 bg-surface border-t border-border px-6 py-4">
          <div className="max-w-3xl mx-auto flex items-center justify-between">
            <button
              onClick={goToBrainstorm}
              className="text-sm text-ink-muted hover:text-ink transition-colors font-medium"
            >
              Skip — Brainstorm Features Instead
            </button>
            <button
              onClick={handleAddAllToBacklog}
              disabled={selectedIssueIds.size === 0 || addingToBacklog}
              className="btn-solid-primary px-6 py-2.5 text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {addingToBacklog ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent animate-spin rounded-full" />
                  Adding...
                </>
              ) : (
                `ADD ALL TO BACKLOG`
              )}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ── Main Render ──────────────────────────────────────────
  // Show scanning UI while scanning, on failure, or for re-scan diffs
  if (onboardingStep === 'scanning') {
    return renderScanningUI();
  }

  // Post-scan guided flow
  return (
    <div className="flex-1 flex flex-col relative min-h-0">
      {onboardingStep === 'issues-triage' && renderIssuesTriage()}
    </div>
  );
}
