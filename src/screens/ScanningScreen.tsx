import { useState, useEffect, useRef } from 'react';
import { useProjectStore } from '../store/ProjectStoreContext';
import { resilientChat } from '../utils/resilient-chat';
import type { FeatureModule, CodeIssue, ScanDiff } from '../types';

export default function ScanningScreen() {
  const { currentProject, updateProject, setScreen } = useProjectStore();
  const [status, setStatus] = useState<'starting' | 'scanning' | 'complete' | 'failed'>('starting');
  const [progress, setProgress] = useState('Preparing to scan...');
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState('');
  const [scanDiff, setScanDiff] = useState<ScanDiff | null>(null);
  const [diffDisplayNames, setDiffDisplayNames] = useState<Record<string, string>>({});
  const scanStarted = useRef(false);
  const isRescan = useRef(false);

  useEffect(() => {
    if (!currentProject || scanStarted.current) return;

    // If already complete, this is a re-scan (user clicked "Re-scan")
    isRescan.current = currentProject.scanStatus === 'complete';

    scanStarted.current = true;
    runScan();
  }, [currentProject]);

  const runScan = async () => {
    if (!currentProject) return;

    setStatus('scanning');
    setProgress(isRescan.current ? 'Re-scanning codebase...' : 'Scanning codebase...');

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

      const prompt = buildScanPrompt();

      const { promise } = resilientChat.long(currentProject.projectPath, prompt, {
        retryAction: () => {
          scanStarted.current = false;
          setStatus('starting');
          setError(null);
        },
      });

      setProgress('Analyzing codebase structure and features...');
      const response = await promise;

      // Parse the scan results
      const scanResult = parseScanResponse(response);

      // If re-scan, compute diff and merge with existing data
      let finalFeatures = scanResult.features;
      let finalIssues = scanResult.issues;
      let diff: ScanDiff | undefined;

      if (isRescan.current && (existingFeatures.length > 0 || existingIssues.length > 0)) {
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

      // Save results
      await window.api.storage.savePRD(currentProject.slug, scanResult.masterPrd);
      await window.api.storage.saveFeatures(currentProject.slug, finalFeatures);
      await window.api.storage.saveIssues(currentProject.slug, finalIssues);

      // Append to scan history
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

      // If no diff to show, navigate after brief pause
      if (!diff) {
        setTimeout(() => setScreen('project-home'), 1500);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Scan failed';
      if (msg === 'cancelled') return;

      setStatus('failed');
      setError(msg);
      await updateProject({ scanStatus: 'failed', scanError: msg });
    }
  };

  const handleRetry = () => {
    scanStarted.current = false;
    setStatus('starting');
    setError(null);
    setOutput('');
    setScanDiff(null);
    runScan();
  };

  const buildScanPrompt = () => {
    return `You are analyzing an existing codebase. Your job is to produce a comprehensive scan of this project.

Analyze the codebase thoroughly and return a JSON response with this exact structure:

{
  "masterPrd": "A comprehensive PRD (Product Requirements Document) for this project. Write it in markdown. Include: project overview, core functionality, architecture, key user flows, and technical decisions. Be thorough — this is the living documentation for the project.",
  "techStack": {
    "languages": ["list", "of", "languages"],
    "frameworks": ["list", "of", "frameworks"],
    "buildTools": ["list", "of", "build tools"],
    "summary": "One-line summary like 'Next.js app with PostgreSQL, deployed on Vercel'"
  },
  "features": [
    {
      "name": "Feature Name",
      "description": "What this feature does",
      "prd": "Detailed PRD for this specific feature in markdown. Include: purpose, user flow, implementation details, key files.",
      "files": ["src/relevant/file.ts", "src/other/file.ts"]
    }
  ],
  "issues": [
    {
      "title": "Short title",
      "description": "What the issue is and why it matters",
      "severity": "critical|warning|info",
      "category": "bug|security|performance|dead_code",
      "estimatedEffort": "quick_fix|moderate|significant",
      "file": "src/file-with-issue.ts"
    }
  ],
  "fileCount": 123,
  "summary": "Brief summary of what was found — e.g. '12 features detected, 3 critical issues, Next.js + TypeScript stack'"
}

IMPORTANT:
- Be thorough in feature detection — identify all major features/modules
- For each feature, list the KEY files involved (not every file, just the important ones)
- For issues, focus on real problems: actual bugs, security concerns, dead code, performance issues
- Do NOT flag style preferences or subjective opinions as issues
- The masterPrd should be comprehensive enough to onboard a new developer
- Return ONLY valid JSON, no markdown fences or explanation outside the JSON`;
  };

  const parseScanResponse = (response: string) => {
    // Try to extract JSON from the response
    let json: Record<string, unknown>;
    try {
      // Try direct parse first
      json = JSON.parse(response);
    } catch {
      // Try to find JSON in the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Scan did not return valid JSON. Please retry.');
      }
      json = JSON.parse(jsonMatch[0]);
    }

    const now = new Date().toISOString();

    const features = ((json.features as Array<Record<string, unknown>>) || []).map((f, i) => {
      const name = String(f.name || `Feature ${i + 1}`);
      const files = (f.files as string[]) || [];
      const fingerprint = generateFingerprint(name, files);
      return {
        id: `feat-${Date.now()}-${i}`,
        fingerprint,
        name,
        description: String(f.description || ''),
        prd: String(f.prd || ''),
        files,
        status: 'documented' as const,
        createdAt: now,
        lastUpdated: now,
      };
    });

    const issues = ((json.issues as Array<Record<string, unknown>>) || []).map((issue, i) => {
      const category = String(issue.category || 'bug') as 'bug' | 'security' | 'performance' | 'dead_code';
      const file = issue.file ? String(issue.file) : undefined;
      const description = String(issue.description || '');
      const fingerprint = generateIssueFingerprint(category, file, description);
      return {
        id: `issue-${Date.now()}-${i}`,
        fingerprint,
        title: String(issue.title || `Issue ${i + 1}`),
        description,
        severity: (issue.severity || 'info') as 'critical' | 'warning' | 'info',
        category,
        estimatedEffort: (issue.estimatedEffort || 'moderate') as 'quick_fix' | 'moderate' | 'significant',
        file,
        status: 'open' as const,
        firstSeen: now,
        lastSeen: now,
      };
    });

    const techStack = json.techStack as { languages: string[]; frameworks: string[]; buildTools: string[]; summary: string } || {
      languages: [],
      frameworks: [],
      buildTools: [],
      summary: 'Unknown stack',
    };

    return {
      masterPrd: String(json.masterPrd || ''),
      techStack,
      features,
      issues,
      fileCount: Number(json.fileCount) || 0,
      summary: String(json.summary || 'Scan complete'),
    };
  };

  /** Merge new scan results with existing data, preserving user edits and computing diff */
  const mergeWithExisting = (
    newFeatures: FeatureModule[],
    newIssues: CodeIssue[],
    existingFeatures: FeatureModule[],
    existingIssues: CodeIssue[],
  ) => {
    const now = new Date().toISOString();
    const existingFeatureMap = new Map(existingFeatures.map(f => [f.fingerprint, f]));
    const existingIssueMap = new Map(existingIssues.map(i => [i.fingerprint, i]));
    const newFeatureFingerprints = new Set(newFeatures.map(f => f.fingerprint));
    const newIssueFingerprints = new Set(newIssues.map(i => i.fingerprint));

    // Diff tracking — store fingerprints for stable identity
    const diffNewFeatures: string[] = [];
    const diffRemovedFeatures: string[] = [];
    const diffUpdatedFeatures: string[] = [];
    const diffNewIssues: string[] = [];
    const diffIssuesFixed: string[] = [];
    // Display name map: fingerprint → human-readable name/title
    const nameMap: Record<string, string> = {};

    // Merge features
    const mergedFeatures: FeatureModule[] = newFeatures.map(newFeat => {
      const existing = existingFeatureMap.get(newFeat.fingerprint);
      nameMap[newFeat.fingerprint] = newFeat.name;
      if (existing) {
        // Feature existed before — preserve user-edited PRDs
        if (existing.prdEditedByUser) {
          diffUpdatedFeatures.push(newFeat.fingerprint);
          return {
            ...existing,
            // Update metadata but keep the user's PRD; store new PRD as proposal
            description: newFeat.description,
            files: newFeat.files,
            proposedPrd: newFeat.prd !== existing.prd ? newFeat.prd : undefined,
            lastUpdated: now,
          };
        }
        // Not user-edited — update everything
        diffUpdatedFeatures.push(newFeat.fingerprint);
        return {
          ...existing,
          description: newFeat.description,
          prd: newFeat.prd,
          files: newFeat.files,
          status: 'documented' as const,
          lastUpdated: now,
        };
      }
      // New feature
      diffNewFeatures.push(newFeat.fingerprint);
      return newFeat;
    });

    // Check for removed features (existed before but not in new scan)
    for (const existing of existingFeatures) {
      if (!newFeatureFingerprints.has(existing.fingerprint)) {
        nameMap[existing.fingerprint] = existing.name;
        diffRemovedFeatures.push(existing.fingerprint);
        // Mark as outdated but keep in the list
        mergedFeatures.push({ ...existing, status: 'outdated', lastUpdated: now });
      }
    }

    // Merge issues
    const mergedIssues: CodeIssue[] = newIssues.map(newIssue => {
      const existing = existingIssueMap.get(newIssue.fingerprint);
      nameMap[newIssue.fingerprint] = newIssue.title;
      if (existing) {
        // Issue still exists — update lastSeen, preserve status/backlog associations
        return {
          ...existing,
          lastSeen: now,
          // Update fields that might change
          severity: newIssue.severity,
          estimatedEffort: newIssue.estimatedEffort,
        };
      }
      // New issue
      diffNewIssues.push(newIssue.fingerprint);
      return newIssue;
    });

    // Issues that disappeared — mark as fixed (unless already planned/have backlog items)
    for (const existing of existingIssues) {
      if (!newIssueFingerprints.has(existing.fingerprint)) {
        nameMap[existing.fingerprint] = existing.title;
        if (existing.status === 'open') {
          diffIssuesFixed.push(existing.fingerprint);
          mergedIssues.push({ ...existing, status: 'fixed', lastSeen: now });
        } else {
          // Keep planned/fixed issues as-is
          mergedIssues.push(existing);
        }
      }
    }

    // Build summary
    const parts: string[] = [];
    if (diffNewFeatures.length > 0) parts.push(`${diffNewFeatures.length} new feature${diffNewFeatures.length > 1 ? 's' : ''}`);
    if (diffRemovedFeatures.length > 0) parts.push(`${diffRemovedFeatures.length} removed`);
    if (diffUpdatedFeatures.length > 0) parts.push(`${diffUpdatedFeatures.length} updated`);
    if (diffNewIssues.length > 0) parts.push(`${diffNewIssues.length} new issue${diffNewIssues.length > 1 ? 's' : ''}`);
    if (diffIssuesFixed.length > 0) parts.push(`${diffIssuesFixed.length} issue${diffIssuesFixed.length > 1 ? 's' : ''} fixed`);

    const diff: ScanDiff = {
      newFeatures: diffNewFeatures,
      removedFeatures: diffRemovedFeatures,
      updatedFeatures: diffUpdatedFeatures,
      newIssues: diffNewIssues,
      issuesFixed: diffIssuesFixed,
      summary: parts.length > 0 ? parts.join(', ') : 'No changes detected',
    };

    return { features: mergedFeatures, issues: mergedIssues, diff, nameMap };
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center">
      <div className="w-full max-w-md text-center px-6">
        {/* Spinning icon */}
        {status === 'scanning' || status === 'starting' ? (
          <div className="w-16 h-16 border-4 border-accent border-t-transparent animate-spin mx-auto mb-6" />
        ) : status === 'complete' ? (
          <div className="w-16 h-16 bg-success/15 border-2 border-success/30 flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        ) : (
          <div className="w-16 h-16 bg-error/15 border-2 border-error/30 flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-error" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
        )}

        <h2 className="font-display text-xl tracking-wide font-bold text-ink mb-2">
          {status === 'scanning' || status === 'starting'
            ? (isRescan.current ? 'Re-scanning Codebase' : 'Scanning Codebase')
            : status === 'complete' ? 'Scan Complete' : 'Scan Failed'}
        </h2>

        <p className="text-ink-muted text-sm mb-6">
          {status === 'failed' ? error : progress}
        </p>

        {status === 'failed' && (
          <button
            onClick={handleRetry}
            className="btn-solid-primary"
          >
            RETRY SCAN
          </button>
        )}

        {/* Diff summary on re-scan completion */}
        {status === 'complete' && scanDiff && (
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

            <button
              onClick={() => setScreen('project-home')}
              className="btn-solid-primary w-full mt-4"
            >
              VIEW DASHBOARD
            </button>
          </div>
        )}

        {/* Auto-navigate for first scans (no diff) */}
        {status === 'complete' && !scanDiff && (
          <p className="text-xs text-ink-muted">Redirecting to dashboard...</p>
        )}

        {/* Live output (collapsed by default) */}
        {output && (status === 'scanning' || status === 'starting') && (
          <div className="mt-6 text-left">
            <pre className="bg-surface-card border border-border p-3 text-xs text-ink-muted max-h-40 overflow-y-auto font-mono">
              {output}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

// Fingerprint generation utilities
function generateFingerprint(name: string, files: string[]): string {
  const normalized = name.toLowerCase().trim();
  const sortedFiles = [...files].sort().join('|');
  return simpleHash(`${normalized}::${sortedFiles}`);
}

function generateIssueFingerprint(category: string, file: string | undefined, description: string): string {
  const normalized = description.toLowerCase().trim().slice(0, 100);
  return simpleHash(`${category}::${file || ''}::${normalized}`);
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}
