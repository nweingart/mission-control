import { useState, useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import type { GapFinding, GapAnalysis } from '../types';
import { resilientChat } from '../utils/resilient-chat';

type GapPhase =
  | 'analyzing'
  | 'meta-reviewing'
  | 'confirm-fix'
  | 'fixing'
  | 're-analyzing'
  | 'passed'
  | 'needs-review'
  | 'error';

// Extract the first balanced JSON object from a string
function extractJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function buildAnalysisPrompt(prd: string): string {
  return `You are a senior QA engineer. Compare this codebase against the PRD below and grade how completely the PRD requirements have been implemented.

## PRD
${prd}

## Instructions
1. Read the codebase thoroughly
2. Compare every requirement in the PRD against what's actually implemented
3. Grade from 0-100 how complete the implementation is
4. List specific gaps as findings

Respond with ONLY valid JSON in this exact format:
{
  "grade": <number 0-100>,
  "summary": "<2-3 sentence summary of coverage>",
  "findings": [
    {
      "category": "<feature area>",
      "description": "<what's missing or incomplete>",
      "prdSection": "<which PRD section this relates to>",
      "severity": "missing" | "incomplete" | "deviation",
      "resolved": false
    }
  ],
  "remainingItems": ["<brief description of each remaining item>"]
}`;
}

function buildMetaReviewPrompt(prd: string, analysisJson: string): string {
  return `You are a principal engineer reviewing a gap analysis. The analysis below was performed by comparing a codebase against a PRD. Your job is to validate the findings — remove false positives, adjust severity, and provide a validated grade.

## PRD
${prd}

## Initial Analysis
${analysisJson}

## Instructions
1. Review each finding — is it a real gap or a false positive?
2. Check if the grade seems fair given the actual findings
3. Adjust the grade and findings as needed

Respond with ONLY valid JSON in this exact format:
{
  "validatedGrade": <number 0-100>,
  "summary": "<2-3 sentence validated summary>",
  "adjustedFindings": [
    {
      "category": "<feature area>",
      "description": "<validated description>",
      "prdSection": "<PRD section>",
      "severity": "missing" | "incomplete" | "deviation",
      "resolved": false
    }
  ],
  "remainingItems": ["<brief description of each validated remaining item>"]
}`;
}

function buildFixPrompt(findings: GapFinding[]): string {
  const items = findings
    .filter(f => !f.resolved)
    .map(f => `- [${f.severity}] ${f.category}: ${f.description}${f.prdSection ? ` (PRD: ${f.prdSection})` : ''}`)
    .join('\n');

  return `The following gaps were identified between the codebase and the PRD. Fix each one directly in the codebase:

${items}

Fix each issue completely. Do not create unnecessary files. Focus on implementing the missing or incomplete features.`;
}

const PASS_THRESHOLD = 95;

export default function GapAnalysisScreen() {
  const {
    currentProject,
    updateProject,
    goToPreview,
    addGapAnalysis,
    addGitEvent,
  } = useAppStore();

  const [phase, setPhase] = useState<GapPhase>('analyzing');
  const [streamOutput, setStreamOutput] = useState('');
  const [grade, setGrade] = useState<number | null>(null);
  const [validatedGrade, setValidatedGrade] = useState<number | null>(null);
  const [findings, setFindings] = useState<GapFinding[]>([]);
  const [remainingItems, setRemainingItems] = useState<string[]>([]);
  const [summary, setSummary] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fixCommitHash, setFixCommitHash] = useState<string | null>(null);
  const [autoProceedCountdown, setAutoProceedCountdown] = useState<number | null>(null);
  const [showFindings, setShowFindings] = useState(false);

  const isMountedRef = useRef(true);
  const pipelineStartedRef = useRef(false);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamOutputRef = useRef<HTMLDivElement>(null);
  const fixConfirmResolverRef = useRef<((proceed: boolean) => void) | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);

  const waitForFixConfirmation = (): Promise<boolean> =>
    new Promise((resolve) => { fixConfirmResolverRef.current = resolve; });

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
      }
    };
  }, []);

  // Auto-scroll stream output
  useEffect(() => {
    if (streamOutputRef.current) {
      streamOutputRef.current.scrollTop = streamOutputRef.current.scrollHeight;
    }
  }, [streamOutput]);

  const continueToPreview = useCallback(async () => {
    try {
      await updateProject({ status: 'previewing' });
      if (isMountedRef.current) {
        goToPreview();
      }
    } catch (err) {
      console.error('Failed to proceed to preview:', err);
    }
  }, [updateProject, goToPreview]);

  // Start auto-proceed countdown
  const startAutoProceed = useCallback(() => {
    setAutoProceedCountdown(3);
    countdownRef.current = setInterval(() => {
      setAutoProceedCountdown(prev => {
        if (prev === null || prev <= 1) {
          if (countdownRef.current) {
            clearInterval(countdownRef.current);
            countdownRef.current = null;
          }
          continueToPreview();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [continueToPreview]);

  // Main pipeline
  useEffect(() => {
    if (!currentProject || pipelineStartedRef.current) return;
    pipelineStartedRef.current = true;

    const projectPath = currentProject.projectPath;

    const run = async () => {
      // Load PRD
      const prd = await window.api.storage.getPRD(currentProject.slug);
      if (!prd || prd.trim().length === 0) {
        await updateProject({ status: 'previewing' });
        if (isMountedRef.current) goToPreview();
        return;
      }

      // ── Phase 1: Analyzing ──
      try {
        if (!isMountedRef.current) return;
        setPhase('analyzing');
        setStreamOutput('');

        window.api.claude.onChatOutput((content: string) => {
          if (!isMountedRef.current) return;
          setStreamOutput(prev => prev + content);
        });

        const analysis1 = resilientChat.long(projectPath, buildAnalysisPrompt(prd));
        cancelRef.current = analysis1.cancel;
        const analysisResponse = await analysis1.promise;
        cancelRef.current = null;
        if (!isMountedRef.current) return;

        const analysisJson = extractJsonObject(analysisResponse);
        let parsedAnalysis: { grade: number; summary: string; findings: GapFinding[]; remainingItems: string[] };

        if (analysisJson) {
          try {
            parsedAnalysis = JSON.parse(analysisJson);
          } catch {
            // Retry with stricter prompt
            setStreamOutput('');
            const analysisRetry = resilientChat.long(projectPath,
              `Your previous response was not valid JSON. ${buildAnalysisPrompt(prd)}`);
            cancelRef.current = analysisRetry.cancel;
            const retryResponse = await analysisRetry.promise;
            cancelRef.current = null;
            if (!isMountedRef.current) return;
            const retryJson = extractJsonObject(retryResponse);
            if (!retryJson) {
              setPhase('error');
              setError('Failed to parse gap analysis response as JSON');
              return;
            }
            parsedAnalysis = JSON.parse(retryJson);
          }
        } else {
          setPhase('error');
          setError('Failed to parse gap analysis response as JSON');
          return;
        }

        setGrade(parsedAnalysis.grade);
        setSummary(parsedAnalysis.summary);
        setFindings(parsedAnalysis.findings || []);
        setRemainingItems(parsedAnalysis.remainingItems || []);

        const pass1Analysis: GapAnalysis = {
          id: `gap-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          pass: 1,
          grade: parsedAnalysis.grade,
          validatedGrade: parsedAnalysis.grade,
          findings: parsedAnalysis.findings || [],
          summary: parsedAnalysis.summary,
          fixesApplied: false,
          remainingItems: parsedAnalysis.remainingItems || [],
          timestamp: new Date().toISOString(),
        };
        addGapAnalysis(pass1Analysis);
        addGitEvent({
          type: 'gap_analysis_complete',
          commitMessage: `Gap analysis pass 1: grade ${parsedAnalysis.grade}/100`,
        });

        // ── Phase 2: Meta-reviewing ──
        if (!isMountedRef.current) return;
        setPhase('meta-reviewing');
        setStreamOutput('');

        const meta1 = resilientChat.standard(projectPath,
          buildMetaReviewPrompt(prd, analysisJson || analysisResponse));
        cancelRef.current = meta1.cancel;
        const metaResponse = await meta1.promise;
        cancelRef.current = null;
        if (!isMountedRef.current) return;

        const metaJson = extractJsonObject(metaResponse);
        let parsedMeta: { validatedGrade: number; summary: string; adjustedFindings: GapFinding[]; remainingItems: string[] };

        if (metaJson) {
          try {
            parsedMeta = JSON.parse(metaJson);
          } catch {
            // Retry with stricter prompt
            setStreamOutput('');
            const metaRetry1 = resilientChat.standard(projectPath,
              `Your previous response was not valid JSON. ${buildMetaReviewPrompt(prd, analysisJson || analysisResponse)}`);
            cancelRef.current = metaRetry1.cancel;
            const metaRetryResponse = await metaRetry1.promise;
            cancelRef.current = null;
            if (!isMountedRef.current) return;
            const metaRetryJson = extractJsonObject(metaRetryResponse);
            if (metaRetryJson) {
              try {
                parsedMeta = JSON.parse(metaRetryJson);
              } catch {
                // Final fallback to pass 1 results
                parsedMeta = {
                  validatedGrade: parsedAnalysis.grade,
                  summary: parsedAnalysis.summary,
                  adjustedFindings: parsedAnalysis.findings,
                  remainingItems: parsedAnalysis.remainingItems,
                };
              }
            } else {
              parsedMeta = {
                validatedGrade: parsedAnalysis.grade,
                summary: parsedAnalysis.summary,
                adjustedFindings: parsedAnalysis.findings,
                remainingItems: parsedAnalysis.remainingItems,
              };
            }
          }
        } else {
          // No JSON found — retry once
          setStreamOutput('');
          const metaRetry2 = resilientChat.standard(projectPath,
            `Your previous response was not valid JSON. ${buildMetaReviewPrompt(prd, analysisJson || analysisResponse)}`);
          cancelRef.current = metaRetry2.cancel;
          const metaRetryResponse = await metaRetry2.promise;
          cancelRef.current = null;
          if (!isMountedRef.current) return;
          const metaRetryJson = extractJsonObject(metaRetryResponse);
          if (metaRetryJson) {
            try {
              parsedMeta = JSON.parse(metaRetryJson);
            } catch {
              parsedMeta = {
                validatedGrade: parsedAnalysis.grade,
                summary: parsedAnalysis.summary,
                adjustedFindings: parsedAnalysis.findings,
                remainingItems: parsedAnalysis.remainingItems,
              };
            }
          } else {
            parsedMeta = {
              validatedGrade: parsedAnalysis.grade,
              summary: parsedAnalysis.summary,
              adjustedFindings: parsedAnalysis.findings,
              remainingItems: parsedAnalysis.remainingItems,
            };
          }
        }

        setValidatedGrade(parsedMeta.validatedGrade);
        setSummary(parsedMeta.summary);
        setFindings(parsedMeta.adjustedFindings || []);
        setRemainingItems(parsedMeta.remainingItems || []);

        // Update the stored analysis with validated data
        pass1Analysis.validatedGrade = parsedMeta.validatedGrade;
        pass1Analysis.findings = parsedMeta.adjustedFindings || [];
        pass1Analysis.summary = parsedMeta.summary;
        pass1Analysis.remainingItems = parsedMeta.remainingItems || [];

        // ── Decision ──
        if (parsedMeta.validatedGrade >= PASS_THRESHOLD) {
          if (!isMountedRef.current) return;
          setPhase('passed');
          startAutoProceed();
          return;
        }

        // ── Confirmation Gate ──
        if (!isMountedRef.current) return;
        setPhase('confirm-fix');
        setStreamOutput('');
        const shouldFix = await waitForFixConfirmation();
        if (!isMountedRef.current) return;
        if (!shouldFix) {
          setPhase('needs-review');
          return;
        }

        // ── Phase 3: Fixing ──
        if (!isMountedRef.current) return;
        setPhase('fixing');
        setStreamOutput('');

        const fixFindings = parsedMeta.adjustedFindings || parsedAnalysis.findings || [];
        const fix1 = resilientChat.long(projectPath, buildFixPrompt(fixFindings));
        cancelRef.current = fix1.cancel;
        await fix1.promise;
        cancelRef.current = null;
        if (!isMountedRef.current) return;

        try {
          const commitResult = await window.api.github.gitAddAndCommit(projectPath, 'fix: gap analysis auto-fix');
          setFixCommitHash(commitResult.commitHash);
          addGitEvent({
            type: 'committed',
            commitHash: commitResult.commitHash,
            commitMessage: 'fix: gap analysis auto-fix',
          });
          addGitEvent({
            type: 'auto_fixed',
            commitHash: commitResult.commitHash,
            commitMessage: 'fix: gap analysis auto-fix',
          });
        } catch {
          // Commit may fail if no changes were made — not fatal
        }

        // ── Phase 4: Re-analyzing ──
        if (!isMountedRef.current) return;
        setPhase('re-analyzing');
        setStreamOutput('');

        const reAnalysis = resilientChat.long(projectPath, buildAnalysisPrompt(prd));
        cancelRef.current = reAnalysis.cancel;
        const reResponse = await reAnalysis.promise;
        cancelRef.current = null;
        if (!isMountedRef.current) return;

        const reJson = extractJsonObject(reResponse);
        let reParsed: { grade: number; summary: string; findings: GapFinding[]; remainingItems: string[] };

        if (reJson) {
          try {
            reParsed = JSON.parse(reJson);
          } catch {
            reParsed = { grade: parsedMeta.validatedGrade, summary: parsedMeta.summary, findings: fixFindings, remainingItems: parsedMeta.remainingItems };
          }
        } else {
          reParsed = { grade: parsedMeta.validatedGrade, summary: parsedMeta.summary, findings: fixFindings, remainingItems: parsedMeta.remainingItems };
        }

        setGrade(reParsed.grade);

        // Meta-review pass 2 to validate findings after fixes
        const reMeta = resilientChat.standard(projectPath,
          buildMetaReviewPrompt(prd, reJson || reResponse));
        cancelRef.current = reMeta.cancel;
        const reMetaResponse = await reMeta.promise;
        cancelRef.current = null;
        if (!isMountedRef.current) return;

        const reMetaJson = extractJsonObject(reMetaResponse);
        let reMetaParsed: { validatedGrade: number; summary: string; adjustedFindings: GapFinding[]; remainingItems: string[] };

        if (reMetaJson) {
          try {
            reMetaParsed = JSON.parse(reMetaJson);
          } catch {
            reMetaParsed = { validatedGrade: reParsed.grade, summary: reParsed.summary, adjustedFindings: reParsed.findings, remainingItems: reParsed.remainingItems };
          }
        } else {
          reMetaParsed = { validatedGrade: reParsed.grade, summary: reParsed.summary, adjustedFindings: reParsed.findings, remainingItems: reParsed.remainingItems };
        }

        setValidatedGrade(reMetaParsed.validatedGrade);
        setSummary(reMetaParsed.summary);
        setFindings(reMetaParsed.adjustedFindings || []);
        setRemainingItems(reMetaParsed.remainingItems || []);

        const pass2Analysis: GapAnalysis = {
          id: `gap-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          pass: 2,
          grade: reParsed.grade,
          validatedGrade: reMetaParsed.validatedGrade,
          findings: reMetaParsed.adjustedFindings || [],
          summary: reMetaParsed.summary,
          fixesApplied: true,
          fixCommitHash: fixCommitHash || undefined,
          remainingItems: reMetaParsed.remainingItems || [],
          timestamp: new Date().toISOString(),
        };
        addGapAnalysis(pass2Analysis);
        addGitEvent({
          type: 'gap_analysis_complete',
          commitMessage: `Gap analysis pass 2: grade ${reMetaParsed.validatedGrade}/100`,
        });

        // ── Final decision ──
        if (!isMountedRef.current) return;
        if (reMetaParsed.validatedGrade >= PASS_THRESHOLD) {
          setPhase('passed');
          startAutoProceed();
        } else {
          setPhase('needs-review');
        }
      } catch (err) {
        if (!isMountedRef.current) return;
        console.error('[GapAnalysisScreen] Pipeline error:', err);
        setPhase('error');
        setError(err instanceof Error ? err.message : 'Gap analysis failed');
      }
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject]);

  const projectPath = currentProject?.projectPath || '';

  const handleRetry = useCallback(() => {
    pipelineStartedRef.current = false;
    setPhase('analyzing');
    setStreamOutput('');
    setGrade(null);
    setValidatedGrade(null);
    setFindings([]);
    setRemainingItems([]);
    setSummary('');
    setError(null);
    setFixCommitHash(null);
    // Re-trigger pipeline by changing a dependency — simplest: just run inline
    const rerun = async () => {
      pipelineStartedRef.current = true;
      const prd = await window.api.storage.getPRD(currentProject!.slug);
      if (!prd || prd.trim().length === 0) {
        await updateProject({ status: 'previewing' });
        if (isMountedRef.current) goToPreview();
        return;
      }

      try {
        setStreamOutput('');
        window.api.claude.onChatOutput((content: string) => {
          if (!isMountedRef.current) return;
          setStreamOutput(prev => prev + content);
        });

        const retryAnalysis = resilientChat.long(projectPath, buildAnalysisPrompt(prd));
        cancelRef.current = retryAnalysis.cancel;
        const response = await retryAnalysis.promise;
        cancelRef.current = null;
        if (!isMountedRef.current) return;
        const json = extractJsonObject(response);
        if (!json) {
          setPhase('error');
          setError('Failed to parse gap analysis response');
          return;
        }
        const parsed = JSON.parse(json);
        setGrade(parsed.grade);
        setValidatedGrade(parsed.grade);
        setSummary(parsed.summary);
        setFindings(parsed.findings || []);
        setRemainingItems(parsed.remainingItems || []);

        if (parsed.grade >= PASS_THRESHOLD) {
          setPhase('passed');
          startAutoProceed();
        } else {
          setPhase('needs-review');
        }
      } catch (err) {
        setPhase('error');
        setError(err instanceof Error ? err.message : 'Gap analysis failed');
      }
    };
    rerun();
  }, [currentProject, projectPath, updateProject, goToPreview, startAutoProceed]);

  const handleSkipToPreview = useCallback(() => {
    cancelRef.current?.();
    cancelRef.current = null;
    continueToPreview();
  }, [continueToPreview]);

  const handleConfirmFix = useCallback(() => {
    if (fixConfirmResolverRef.current) {
      fixConfirmResolverRef.current(true);
      fixConfirmResolverRef.current = null;
    }
  }, []);

  const handleSkipFix = useCallback(() => {
    if (fixConfirmResolverRef.current) {
      fixConfirmResolverRef.current(false);
      fixConfirmResolverRef.current = null;
    }
  }, []);

  // ─── Phase indicator ────────────────────────────────────────
  const phases = [
    { key: 'analyzing', label: 'Analysis' },
    { key: 'meta-reviewing', label: 'Meta-Review' },
    { key: 'fixing', label: 'Fix' },
    { key: 're-analyzing', label: 'Re-analyze' },
  ];

  const phaseIndex = phases.findIndex(p => p.key === phase);
  const isActivePhase = (key: string) => key === phase;
  const isCompletedPhase = (key: string) => {
    const idx = phases.findIndex(p => p.key === key);
    return idx < phaseIndex || phase === 'passed' || phase === 'needs-review';
  };

  const displayGrade = validatedGrade ?? grade;
  const gradeColor = displayGrade === null ? 'text-ink-muted'
    : displayGrade >= PASS_THRESHOLD ? 'text-success'
    : displayGrade >= 80 ? 'text-accent'
    : 'text-error';

  const gradeBgColor = displayGrade === null ? 'bg-surface'
    : displayGrade >= PASS_THRESHOLD ? 'bg-success/15'
    : displayGrade >= 80 ? 'bg-accent/15'
    : 'bg-error/15';

  // ─── RENDER: Confirm fix ────────────────────────────────────
  if (phase === 'confirm-fix') {
    const unresolvedFindings = findings.filter(f => !f.resolved);
    return (
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Header */}
        <header className="bg-surface-card border-b border-border px-6 py-4 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-sans font-bold text-ink">Gap Analysis -- Review Findings</h1>
              <p className="text-sm font-mono text-ink-muted">{currentProject?.name}</p>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-2xl mx-auto space-y-6">
            {/* Grade display */}
            <div className={`border p-8 text-center ${gradeBgColor} ${
              displayGrade !== null && displayGrade >= PASS_THRESHOLD
                ? 'border-success/30'
                : displayGrade !== null && displayGrade >= 80
                ? 'border-accent/30'
                : 'border-error/30'
            }`}>
              <div className={`text-6xl font-bold ${gradeColor}`}>
                {displayGrade ?? '?'}<span className="text-2xl text-ink-muted"> / 100</span>
              </div>
              <div className="mt-2 text-base font-sans font-semibold text-accent">
                Needs Fix
              </div>
            </div>

            {/* Summary */}
            {summary && (
              <div className="card-panel p-4">
                <h3 className="text-base font-sans font-semibold text-ink mb-2">Summary</h3>
                <p className="text-sm text-ink-secondary">{summary}</p>
              </div>
            )}

            {/* Findings list */}
            {unresolvedFindings.length > 0 && (
              <div className="card-panel overflow-hidden">
                <div className="px-4 py-3 border-b border-border">
                  <h3 className="text-base font-sans font-semibold text-ink">
                    Findings to Fix ({unresolvedFindings.length})
                  </h3>
                </div>
                <div className="p-4 space-y-2">
                  {unresolvedFindings.map((finding, i) => (
                    <GapFindingCard key={i} finding={finding} />
                  ))}
                </div>
              </div>
            )}

            {/* Explanation */}
            <div className="bg-accent/5 border border-accent/20 p-4">
              <p className="text-sm text-ink-secondary">
                Fixing will ask Claude to address these issues and commit the changes automatically.
              </p>
            </div>

            {/* Action buttons */}
            <div className="flex items-center justify-between">
              <button
                onClick={handleSkipFix}
                className="btn-solid px-4 py-2 text-sm"
              >
                Skip to Preview
              </button>
              <button
                onClick={handleConfirmFix}
                className="btn-solid-primary flex items-center gap-2 px-6 py-3 font-medium"
              >
                Fix Issues
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ─── RENDER: In-progress (analyzing, meta-reviewing, fixing, re-analyzing) ──
  if (phase === 'analyzing' || phase === 'meta-reviewing' || phase === 'fixing' || phase === 're-analyzing') {
    return (
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Header */}
        <header className="bg-surface-card border-b border-border px-6 py-4 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-sans font-bold text-ink">Gap Analysis</h1>
              <p className="text-sm font-mono text-ink-muted">Validating build against PRD requirements</p>
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-accent animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="text-sm text-accent">
                {phase === 'analyzing' ? 'Analyzing...' :
                 phase === 'meta-reviewing' ? 'Meta-reviewing...' :
                 phase === 'fixing' ? 'Auto-fixing...' :
                 'Re-analyzing...'}
              </span>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-hidden flex flex-col p-6">
          {/* Phase indicators */}
          <div className="flex items-center gap-2 mb-6">
            {phases.map((p, i) => (
              <div key={p.key} className="flex items-center gap-2">
                {i > 0 && <div className="w-8 h-px bg-border" />}
                <div className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium transition-colors ${
                  isActivePhase(p.key)
                    ? 'bg-accent/15 text-accent'
                    : isCompletedPhase(p.key)
                    ? 'bg-success/15 text-success'
                    : 'bg-surface text-ink-muted'
                }`}>
                  {isCompletedPhase(p.key) ? (
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  ) : isActivePhase(p.key) ? (
                    <div className="w-2 h-2 bg-accent animate-pulse" />
                  ) : (
                    <div className="w-2 h-2 bg-ink-muted/20" />
                  )}
                  {p.label}
                </div>
              </div>
            ))}
          </div>

          {/* Streaming output */}
          <div className="flex-1 min-h-0 bg-surface-light border border-border overflow-hidden flex flex-col">
            <div className="bg-surface px-4 py-2 border-b border-border flex items-center justify-between">
              <span className="text-sm font-mono text-ink-muted">Claude Analysis Output</span>
              {grade !== null && (
                <span className={`text-sm font-mono font-bold ${gradeColor}`}>
                  Grade: {grade}/100
                </span>
              )}
            </div>
            <div
              ref={streamOutputRef}
              className="flex-1 overflow-y-auto p-4 font-mono text-sm text-ink-secondary whitespace-pre-wrap"
            >
              {streamOutput || 'Waiting for output...'}
            </div>
          </div>

          {/* Skip button */}
          <div className="mt-4 flex justify-end">
            <button
              onClick={handleSkipToPreview}
              className="btn-solid px-4 py-2 text-sm"
            >
              Skip to Preview
            </button>
          </div>
        </main>
      </div>
    );
  }

  // ─── RENDER: Completed (passed or needs-review) ────────────
  if (phase === 'passed' || phase === 'needs-review') {
    return (
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Header */}
        <header className="bg-surface-card border-b border-border px-6 py-4 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-sans font-bold text-ink">Gap Analysis Complete</h1>
              <p className="text-sm font-mono text-ink-muted">{currentProject?.name}</p>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-2xl mx-auto space-y-6">
            {/* Grade display */}
            <div className={`border p-8 text-center ${gradeBgColor} ${
              displayGrade !== null && displayGrade >= PASS_THRESHOLD
                ? 'border-success/30'
                : displayGrade !== null && displayGrade >= 80
                ? 'border-accent/30'
                : 'border-error/30'
            }`}>
              <div className={`text-6xl font-bold ${gradeColor}`}>
                {displayGrade ?? '?'}<span className="text-2xl text-ink-muted"> / 100</span>
              </div>
              <div className={`mt-2 text-base font-sans font-semibold ${
                phase === 'passed' ? 'text-success' : 'text-accent'
              }`}>
                {phase === 'passed' ? 'Pass' : 'Needs Review'}
              </div>
            </div>

            {/* Summary */}
            {summary && (
              <div className="card-panel p-4">
                <h3 className="text-base font-sans font-semibold text-ink mb-2">Summary</h3>
                <p className="text-sm text-ink-secondary">{summary}</p>
              </div>
            )}

            {/* Remaining items */}
            {remainingItems.length > 0 && (
              <div className="card-panel p-4">
                <h3 className="text-base font-sans font-semibold text-ink mb-2">
                  Remaining Items ({remainingItems.length})
                </h3>
                <ul className="space-y-1.5">
                  {remainingItems.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-ink-secondary">
                      <span className="text-ink-muted mt-0.5">&#8226;</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Findings (expandable) */}
            {findings.length > 0 && (
              <div className="card-panel overflow-hidden">
                <button
                  onClick={() => setShowFindings(!showFindings)}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-surface transition-colors"
                >
                  <h3 className="text-base font-sans font-semibold text-ink">
                    Findings ({findings.length})
                  </h3>
                  <svg
                    className={`w-4 h-4 text-ink-muted transition-transform ${showFindings ? 'rotate-180' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {showFindings && (
                  <div className="border-t border-border p-4 space-y-2">
                    {findings.map((finding, i) => (
                      <GapFindingCard key={i} finding={finding} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Fix info */}
            {fixCommitHash && (
              <div className="flex items-center gap-2 text-success text-sm">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span>Auto-fix applied ({fixCommitHash.slice(0, 7)})</span>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex items-center justify-between">
              {phase === 'needs-review' && findings.length > 0 && (
                <button
                  onClick={() => setShowFindings(true)}
                  className="btn-solid px-4 py-2 text-sm"
                >
                  View Findings
                </button>
              )}
              {phase === 'passed' && <div />}

              <button
                onClick={continueToPreview}
                className="btn-solid-success flex items-center gap-2 px-6 py-3 font-medium"
              >
                <span>Continue to Preview</span>
                {autoProceedCountdown !== null && autoProceedCountdown > 0 && (
                  <span className="text-surface-light/60">({autoProceedCountdown}s)</span>
                )}
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ─── RENDER: Error ─────────────────────────────────────────
  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      <header className="bg-surface-card border-b border-border px-6 py-4 flex-shrink-0">
        <div>
          <h1 className="text-xl font-sans font-bold text-ink">Gap Analysis</h1>
          <p className="text-sm font-mono text-ink-muted">Error encountered</p>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 mx-auto mb-4 bg-error/15 flex items-center justify-center">
            <svg className="w-8 h-8 text-error" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          </div>
          <h2 className="text-base font-sans font-semibold text-ink mb-2">Analysis Failed</h2>
          <p className="text-ink-muted text-sm mb-6">{error || 'An unexpected error occurred'}</p>

          {/* Raw output if available */}
          {streamOutput && (
            <div className="mb-6 bg-surface-light border border-border p-4 text-left max-h-48 overflow-y-auto">
              <pre className="text-xs text-ink-muted whitespace-pre-wrap font-mono">{streamOutput}</pre>
            </div>
          )}

          <div className="flex items-center justify-center gap-3">
            <button
              onClick={handleRetry}
              className="btn-solid-danger px-4 py-2 text-sm font-medium"
            >
              Retry
            </button>
            <button
              onClick={handleSkipToPreview}
              className="btn-solid px-4 py-2 text-sm"
            >
              Skip to Preview
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

// ─── GAP FINDING CARD ────────────────────────────────────────
function GapFindingCard({ finding }: { finding: GapFinding }) {
  const severityStyles = {
    missing: {
      bg: 'bg-error/10',
      border: 'border-error/30',
      badge: 'bg-error/15 text-error',
      text: 'text-error',
    },
    incomplete: {
      bg: 'bg-accent/10',
      border: 'border-accent/30',
      badge: 'bg-accent/15 text-accent',
      text: 'text-accent',
    },
    deviation: {
      bg: 'bg-accent/10',
      border: 'border-accent/30',
      badge: 'bg-accent/15 text-accent',
      text: 'text-accent',
    },
  };

  const styles = severityStyles[finding.severity];

  return (
    <div className={`border p-3 ${styles.bg} ${styles.border}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs font-medium px-2 py-0.5 ${styles.badge}`}>
              {finding.severity}
            </span>
            <span className="text-xs text-ink-muted">{finding.category}</span>
            {finding.resolved && (
              <span className="text-xs text-success flex items-center gap-1">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Resolved
              </span>
            )}
          </div>
          <p className={`text-sm ${styles.text}`}>{finding.description}</p>
          {finding.prdSection && (
            <p className="text-xs text-ink-muted mt-1">PRD: {finding.prdSection}</p>
          )}
        </div>
      </div>
    </div>
  );
}
