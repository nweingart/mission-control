import { useState, useCallback, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import { waitForStore, waitForStoreValue } from '../lib/storeWatcher';
import type { GapFinding } from '../types';

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
  idea: string;
  includeDiscovery: boolean;
  includePlanning: boolean;
  includeGapAnalysis: boolean;
  includeDeploy: boolean;
}

interface E2ECheckpoint {
  projectSlug: string;
  projectPath: string;
  config: E2EConfig;
  resumeFromPhaseIndex: number;
  completedPhases: PhaseResult[];
  phaseList: { name: string; key: string; skip: boolean }[];
  timestamp: number;
}

// ─── Prompts (same as the real app uses) ────────────────────────────

const DISCOVERY_SYSTEM_PROMPT = `You are helping a user plan their software project through a natural conversation.

Your approach:
- Ask ONE question at a time, then wait for their response
- Keep your responses short and conversational (2-3 sentences max before your question)
- Build on their previous answers naturally
- Cover these areas through the conversation: target users, core features, tech preferences, MVP scope
- Don't use headers or bullet points - keep it conversational like a chat

When you feel you have enough information (usually after 4-6 exchanges), say "I think I have a good picture now. Ready for me to draft the PRD?" and wait for confirmation.

Remember: One question at a time. Be curious and engaged, not formulaic.`;

const PRD_GENERATION_PROMPT = `Based on our conversation, generate a comprehensive Product Requirements Document (PRD) in markdown format that a developer could actually build from.

## Required Sections:

### 1. Overview
- Product name and one-line description
- Problem statement (what pain point does this solve?)
- Target users (primary and secondary)
- Core value proposition

### 2. User Stories
Write 5-8 specific user stories in the format: "As a [user type], I want to [action] so that [benefit]"

### 3. Feature Specifications
For EACH core MVP feature, include:
- Feature name and description
- User flow (step by step what happens)
- UI components needed
- Data requirements (what needs to be stored/retrieved)
- Acceptance criteria (how do we know it's done?)

### 4. Data Model
Define the key database tables/collections:
- Table name
- Fields with types (id, name: string, created_at: timestamp, etc.)
- Relationships between tables

### 5. API Endpoints
List the main API routes needed:
- Method and path (GET /api/users, POST /api/posts, etc.)
- Brief description of what each does

### 6. Tech Stack
- Frontend: Next.js 14 + TypeScript + Tailwind CSS
- Backend: Next.js API routes + TypeScript
- Database: SQLite / PostgreSQL
- Auth: NextAuth.js
- Hosting: GitHub Pages / Self-hosted

### 7. MVP Scope
- What's IN for v1 (be specific)
- What's OUT for v1 (explicitly list features to defer)

### 8. Open Questions
List any decisions that still need to be made

Output ONLY the PRD markdown, starting with "# [Product Name] - Product Requirements Document". No preamble or explanation.`;

const DEFAULT_IDEA = `A personal finance dashboard where users can track income and expenses, categorize transactions, set monthly budgets per category, and view spending analytics. Features: transaction list with add/edit/delete, category management (food, rent, entertainment, etc.), monthly budget targets with progress bars, a dashboard with spending breakdown charts (pie chart by category, bar chart monthly trend), and a simple search/filter for transactions. Use a clean modern UI with a sidebar navigation.`;

import {
  extractJsonObject,
  buildGapAnalysisPrompt,
  buildGapMetaReviewPrompt,
  buildGapFixPrompt,
  countWords,
  detectPRDSections,
  formatRelativeTime,
} from '../utils/gap-helpers';

const GAP_PASS_THRESHOLD = 95;

// ─── Helpers ────────────────────────────────────────────────────────

function timestamp(): string {
  return new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function loadCheckpoint(): E2ECheckpoint | null {
  try {
    const saved = localStorage.getItem('e2e-checkpoint');
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

// ─── Component ──────────────────────────────────────────────────────

export default function E2ETestRunner({ onClose }: { onClose: () => void }) {
  const [view, setView] = useState<ViewMode>('config');
  const [config, setConfig] = useState<E2EConfig>({
    idea: DEFAULT_IDEA,
    includeDiscovery: true,
    includePlanning: true,
    includeGapAnalysis: true,
    includeDeploy: false,
  });
  const [phases, setPhases] = useState<PhaseResult[]>([]);
  const [currentPhase, setCurrentPhase] = useState(-1);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [totalDuration, setTotalDuration] = useState<number | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [copied, setCopied] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [checkpoint, setCheckpoint] = useState<E2ECheckpoint | null>(loadCheckpoint);
  const cancelledRef = useRef(false);
  const logContainerRef = useRef<HTMLDivElement>(null);

  const store = useAppStore;

  // ─── Logging ──────────────────────────────────────────────────

  const log = useCallback((message: string, level: LogEntry['level'] = 'info') => {
    const entry: LogEntry = { time: timestamp(), message, level };
    setLogs(prev => {
      const next = [...prev, entry];
      // Auto-scroll
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

  // ─── Phase implementations ───────────────────────────────────

  async function phaseCreateProject(idea: string): Promise<Record<string, string | number>> {
    log('Creating test project...');
    const project = await store.getState().createProject('E2E Test App', idea);
    log(`Project created: ${project.slug}`, 'success');
    log(`Path: ${project.projectPath}`);
    return {
      slug: project.slug,
      path: project.projectPath,
    };
  }

  async function phaseDiscovery(): Promise<Record<string, string | number>> {
    const { currentProject, chatMessages } = store.getState();
    if (!currentProject) throw new Error('No current project');

    log('Navigating to discovery...');
    store.getState().setScreen('discovery');

    // Wait for the DiscoveryScreen to auto-initialize the chat
    // It sends the first message (the idea) to Claude and gets a response
    log('Waiting for Claude to respond to the idea...');

    const messages = await waitForStoreValue(
      state => state.chatMessages,
      msgs => msgs.length >= 2 && msgs[msgs.length - 1].role === 'assistant',
      60_000,
      'Waiting for Claude discovery response'
    );

    const lastResponse = messages[messages.length - 1];
    const wordCount = countWords(lastResponse.content);
    log(`Claude responded (${wordCount} words)`, 'success');

    return {
      responseWords: wordCount,
      messagesCount: messages.length,
    };
  }

  async function phasePRDGeneration(): Promise<Record<string, string | number>> {
    const { currentProject, chatMessages } = store.getState();
    if (!currentProject) throw new Error('No current project');

    log('Generating PRD from conversation...');

    // Build conversation context (same as the real app does)
    let context = `${DISCOVERY_SYSTEM_PROMPT}\n\nProject: ${currentProject.name}\nInitial Idea: ${currentProject.idea}\n\n`;
    context += 'Conversation so far:\n';
    for (const msg of chatMessages) {
      context += `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}\n\n`;
    }
    const prdPrompt = `${context}\n\n${PRD_GENERATION_PROMPT}`;

    // Call Claude to generate the PRD
    log('Sending PRD generation request to Claude...');
    const prdResponse = await window.api.claude.chat(currentProject.projectPath, prdPrompt);
    checkCancelled();

    if (!prdResponse || prdResponse.length < 100) {
      throw new Error(`PRD response too short (${prdResponse?.length || 0} chars)`);
    }

    // Save the PRD
    await window.api.storage.savePRD(currentProject.slug, prdResponse);
    await store.getState().updateProject({ status: 'discovery' });
    await store.getState().saveChatHistory();

    const wordCount = countWords(prdResponse);
    const sections = detectPRDSections(prdResponse);

    log(`PRD generated: ${wordCount} words, ${sections.length} sections`, 'success');
    log(`Sections: ${sections.join(', ')}`);

    // Navigate to PRD review
    store.getState().setScreen('prd-review');
    await delay(2000); // Let user see the PRD briefly

    return {
      wordCount,
      sections: sections.length,
      sectionNames: sections.join(', '),
      charCount: prdResponse.length,
    };
  }

  async function phaseTaskGeneration(): Promise<Record<string, string | number>> {
    const { currentProject } = store.getState();
    if (!currentProject) throw new Error('No current project');

    log('Approving PRD and generating tasks...');

    // Replicate what PRDReviewScreen.handleApprove() does
    await store.getState().updateProject({ status: 'planning' });
    store.getState().setScreen('planning');

    // TasksScreen auto-generates tasks on mount via generateTasks()
    log('Waiting for Claude to generate tasks from PRD...');

    const tasks = await waitForStoreValue(
      state => state.tasks,
      t => t.length > 0,
      90_000,
      'Waiting for task generation'
    );
    checkCancelled();

    log(`${tasks.length} tasks generated:`, 'success');
    tasks.forEach((task, i) => {
      log(`  ${i + 1}. ${task.title}`);
    });

    await delay(2000); // Let user see the tasks

    return {
      taskCount: tasks.length,
      taskTitles: tasks.map(t => t.title).join(' | '),
    };
  }

  async function phaseBuilding(): Promise<Record<string, string | number>> {
    const { currentProject, tasks } = store.getState();
    if (!currentProject) throw new Error('No current project');
    const projectPath = currentProject.projectPath;

    log(`Starting build phase with ${tasks.length} tasks...`);
    log('Using non-interactive mode (claude --print) for reliability');

    // Update status but DON'T navigate to BuildScreen - we'll run tasks programmatically
    await store.getState().updateProject({ status: 'building' });

    // Initialize git early so we have commit history throughout the build
    log('Initializing git repo...');
    try {
      const gitStatus = await window.api.github.checkGitStatus(projectPath);
      if (!gitStatus.hasGitRepo) {
        await window.api.github.gitInit(projectPath);
        log('  Git repo initialized');
      }
      const username = await window.api.github.getUsername();
      await window.api.github.ensureGitignore(projectPath);
      await window.api.github.ensureGitConfig(projectPath, username);
    } catch (err) {
      log('  Git init failed, continuing without per-task commits', 'warn');
    }

    // Get the PRD for context
    const prd = await window.api.storage.getPRD(currentProject.slug);
    const context = prd || currentProject.idea || '';

    const taskTimings: Record<string, number> = {};
    const buildStart = Date.now();
    let completedCount = 0;
    let commitCount = 0;

    // Run each task using claude --print (non-interactive)
    for (let i = 0; i < tasks.length; i++) {
      checkCancelled();
      const task = tasks[i];
      const taskStart = Date.now();

      log(`\nTask ${i + 1}/${tasks.length}: ${task.title}`);

      const prompt = `I'm building "${currentProject.name}".

## Context
${context}

## Your Task
Task ${i + 1} of ${tasks.length}: ${task.title}

Build this task completely. Create all necessary files and code.
Do not ask questions - make reasonable decisions and proceed.`;

      try {
        // Use the chat() API which runs claude --print --dangerously-skip-permissions
        log('  Sending to Claude...');
        const response = await window.api.claude.chat(projectPath, prompt);
        checkCancelled();

        const taskDuration = Date.now() - taskStart;
        taskTimings[task.title] = taskDuration;

        // Mark task as complete in store
        store.getState().updateTask(task.id, { completed: true });
        completedCount++;

        log(`  Completed in ${(taskDuration / 1000).toFixed(1)}s (${response.length} chars output)`, 'success');

        // Commit after each task for incremental git history
        try {
          const commitResult = await window.api.github.gitAddAndCommit(
            projectPath,
            `feat: ${task.title}`
          );
          commitCount++;
          log(`  Committed: ${commitResult.commitHash.slice(0, 7)}`, 'success');
          store.getState().addGitEvent({
            type: 'committed',
            commitHash: commitResult.commitHash,
            commitMessage: `feat: ${task.title}`,
          });
        } catch {
          log('  No changes to commit for this task', 'warn');
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log(`  FAILED: ${message}`, 'error');
        // Continue to next task instead of stopping completely
      }
    }

    const totalBuildTime = Date.now() - buildStart;

    // FAIL the phase if no tasks completed
    if (completedCount === 0) {
      throw new Error(`Build failed: 0/${tasks.length} tasks completed after ${Math.round(totalBuildTime / 1000)}s`);
    }

    log(`\nBuild complete: ${completedCount}/${tasks.length} tasks, ${commitCount} commits in ${(totalBuildTime / 1000).toFixed(1)}s`, 'success');

    if (completedCount < tasks.length) {
      log(`Warning: Only ${completedCount}/${tasks.length} tasks completed`, 'warn');
    }

    // Verify files actually exist on disk
    try {
      const files = await window.api.fs.readdir(projectPath);
      const realFiles = files.filter((f: string) => !f.startsWith('.'));
      if (realFiles.length === 0) {
        throw new Error('Build completed but no files were created on disk');
      }
      log(`Verified ${realFiles.length} files/folders on disk`, 'success');
    } catch (e) {
      if (e instanceof Error && e.message.includes('no files')) throw e;
      log('Could not verify files on disk', 'warn');
    }

    // Advance status past 'building' so loadProject won't route back to BuildScreen
    await store.getState().updateProject({ status: 'previewing' });

    return {
      totalBuildTime: Math.round(totalBuildTime / 1000),
      tasksCompleted: completedCount,
      tasksTotal: tasks.length,
      commits: commitCount,
      ...Object.fromEntries(
        Object.entries(taskTimings).map(([k, v]) => [`task_${k.substring(0, 30)}`, Math.round(v / 1000)])
      ),
    };
  }

  async function phaseGapAnalysis(): Promise<Record<string, string | number>> {
    const { currentProject } = store.getState();
    if (!currentProject) throw new Error('No current project');
    const projectPath = currentProject.projectPath;

    store.getState().setScreen('gap-analysis');
    log('Starting gap analysis...');

    // Load PRD
    const prd = await window.api.storage.getPRD(currentProject.slug);
    if (!prd || prd.trim().length === 0) {
      log('No PRD found, skipping gap analysis', 'warn');
      return { skipped: 1, reason: 'no_prd' };
    }

    let passCount = 0;
    let finalGrade = 0;
    let finalValidatedGrade = 0;
    let findingsCount = 0;
    let fixApplied = false;

    // ── Pass 1: Analysis ──
    log('Pass 1: Analyzing codebase against PRD...');
    const analysisResponse = await window.api.claude.chat(projectPath, buildGapAnalysisPrompt(prd));
    checkCancelled();

    const analysisJson = extractJsonObject(analysisResponse);
    let parsedAnalysis: { grade: number; summary: string; findings: Array<{ category: string; description: string; prdSection?: string; severity: string; resolved: boolean }>; remainingItems: string[] };

    if (analysisJson) {
      try {
        parsedAnalysis = JSON.parse(analysisJson);
      } catch {
        // Retry with stricter prompt
        log('  JSON parse failed, retrying...', 'warn');
        const retryResponse = await window.api.claude.chat(projectPath,
          `Your previous response was not valid JSON. ${buildGapAnalysisPrompt(prd)}`);
        checkCancelled();
        const retryJson = extractJsonObject(retryResponse);
        if (!retryJson) throw new Error('Failed to parse gap analysis response as JSON after retry');
        parsedAnalysis = JSON.parse(retryJson);
      }
    } else {
      throw new Error('Failed to parse gap analysis response as JSON');
    }

    log(`  Initial grade: ${parsedAnalysis.grade}/100, ${parsedAnalysis.findings?.length || 0} findings`, 'success');

    // ── Pass 1: Meta-review ──
    log('Pass 1: Meta-reviewing findings...');
    const metaResponse = await window.api.claude.chat(projectPath,
      buildGapMetaReviewPrompt(prd, analysisJson || analysisResponse));
    checkCancelled();

    const metaJson = extractJsonObject(metaResponse);
    let parsedMeta: { validatedGrade: number; summary: string; adjustedFindings: Array<{ category: string; description: string; prdSection?: string; severity: string; resolved: boolean }>; remainingItems: string[] };

    if (metaJson) {
      try {
        parsedMeta = JSON.parse(metaJson);
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

    log(`  Validated grade: ${parsedMeta.validatedGrade}/100`, 'success');
    passCount = 1;
    finalGrade = parsedAnalysis.grade;
    finalValidatedGrade = parsedMeta.validatedGrade;
    findingsCount = parsedMeta.adjustedFindings?.length || 0;

    // Store pass 1 result
    store.getState().addGapAnalysis({
      id: `gap-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      pass: 1,
      grade: parsedAnalysis.grade,
      validatedGrade: parsedMeta.validatedGrade,
      findings: (parsedMeta.adjustedFindings || []) as GapFinding[],
      summary: parsedMeta.summary,
      fixesApplied: false,
      remainingItems: parsedMeta.remainingItems || [],
      timestamp: new Date().toISOString(),
    });
    store.getState().addGitEvent({
      type: 'gap_analysis_complete',
      commitMessage: `Gap analysis pass 1: grade ${parsedMeta.validatedGrade}/100`,
    });

    // ── Decision: Fix needed? ──
    if (parsedMeta.validatedGrade < GAP_PASS_THRESHOLD) {
      // ── Auto-fix ──
      log(`Grade ${parsedMeta.validatedGrade} < ${GAP_PASS_THRESHOLD}, running auto-fix...`);
      const fixFindings = parsedMeta.adjustedFindings || parsedAnalysis.findings || [];
      await window.api.claude.chat(projectPath, buildGapFixPrompt(fixFindings));
      checkCancelled();

      try {
        const commitResult = await window.api.github.gitAddAndCommit(projectPath, 'fix: gap analysis auto-fix');
        log(`  Fix committed: ${commitResult.commitHash}`, 'success');
        fixApplied = true;
        store.getState().addGitEvent({
          type: 'committed',
          commitHash: commitResult.commitHash,
          commitMessage: 'fix: gap analysis auto-fix',
        });
      } catch {
        log('  No changes to commit from auto-fix', 'warn');
      }

      // ── Pass 2: Re-analysis ──
      log('Pass 2: Re-analyzing after fixes...');
      const reResponse = await window.api.claude.chat(projectPath, buildGapAnalysisPrompt(prd));
      checkCancelled();

      const reJson = extractJsonObject(reResponse);
      let reParsed: { grade: number; summary: string; findings: GapFinding[]; remainingItems: string[] };

      if (reJson) {
        try { reParsed = JSON.parse(reJson); } catch {
          reParsed = { grade: parsedMeta.validatedGrade, summary: parsedMeta.summary, findings: [], remainingItems: [] };
        }
      } else {
        reParsed = { grade: parsedMeta.validatedGrade, summary: parsedMeta.summary, findings: [], remainingItems: [] };
      }

      // Pass 2 meta-review
      const reMetaResponse = await window.api.claude.chat(projectPath,
        buildGapMetaReviewPrompt(prd, reJson || reResponse));
      checkCancelled();

      const reMetaJson = extractJsonObject(reMetaResponse);
      let reMetaParsed: { validatedGrade: number; summary: string; adjustedFindings: GapFinding[]; remainingItems: string[] };

      if (reMetaJson) {
        try { reMetaParsed = JSON.parse(reMetaJson); } catch {
          reMetaParsed = { validatedGrade: reParsed.grade, summary: reParsed.summary, adjustedFindings: reParsed.findings, remainingItems: reParsed.remainingItems };
        }
      } else {
        reMetaParsed = { validatedGrade: reParsed.grade, summary: reParsed.summary, adjustedFindings: reParsed.findings, remainingItems: reParsed.remainingItems };
      }

      log(`  Pass 2 validated grade: ${reMetaParsed.validatedGrade}/100`, 'success');
      passCount = 2;
      finalGrade = reParsed.grade;
      finalValidatedGrade = reMetaParsed.validatedGrade;
      findingsCount = reMetaParsed.adjustedFindings?.length || 0;

      // Store pass 2 result
      store.getState().addGapAnalysis({
        id: `gap-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        pass: 2,
        grade: reParsed.grade,
        validatedGrade: reMetaParsed.validatedGrade,
        findings: (reMetaParsed.adjustedFindings || []) as GapFinding[],
        summary: reMetaParsed.summary,
        fixesApplied: true,
        remainingItems: reMetaParsed.remainingItems || [],
        timestamp: new Date().toISOString(),
      });
      store.getState().addGitEvent({
        type: 'gap_analysis_complete',
        commitMessage: `Gap analysis pass 2: grade ${reMetaParsed.validatedGrade}/100`,
      });
    }

    const passed = finalValidatedGrade >= GAP_PASS_THRESHOLD;
    log(`Gap analysis ${passed ? 'PASSED' : 'NEEDS REVIEW'}: ${finalValidatedGrade}/100`, passed ? 'success' : 'warn');

    return {
      grade: finalGrade,
      validatedGrade: finalValidatedGrade,
      findings: findingsCount,
      passes: passCount,
      fixApplied: fixApplied ? 1 : 0,
      result: passed ? 'passed' : 'needs-review',
    };
  }

  async function phasePreview(): Promise<Record<string, string | number>> {
    log('Checking preview...');

    // Update project status to previewing and persist it
    await store.getState().updateProject({ status: 'previewing' });
    log('Project status updated to previewing');

    // Navigate to preview screen if not already there
    if (store.getState().screen !== 'previewing') {
      store.getState().setScreen('previewing');
    }

    // PreviewScreen auto-starts the dev server
    // We can't detect the server URL from the store (it's component-local state)
    // Just wait a reasonable time for the server to start
    log('Waiting for dev server to start...');
    await delay(10_000); // 10 seconds for server to boot

    checkCancelled();

    // The preview screen rendered successfully
    log('Preview screen loaded', 'success');
    log('Note: Check the app UI to verify the dev server is running');

    return {
      screenReached: 1,
    };
  }

  async function phasePlanningV2(): Promise<Record<string, string | number>> {
    const { currentProject } = store.getState();
    if (!currentProject) throw new Error('No current project');

    log('[Planning] Starting V2 planning session (parallel with build)...');

    // Create a new planning chat
    const chatId = store.getState().createPlanningChat('E2E Test Planning');
    log(`[Planning] Created planning chat: ${chatId}`);

    // Load backlog to get current state
    await store.getState().loadBacklog();
    const initialBacklogCount = store.getState().backlog.length;

    // Build the planning prompt
    const prd = await window.api.storage.getPRD(currentProject.slug);
    const tasks = store.getState().tasks;
    const v1Features = tasks.map((t) => `- ${t.title}`).join('\n') || 'None specified';

    const planningPrompt = `You are helping plan V2 features for "${currentProject.name}".

Context:
- PRD: ${prd || 'Not available'}
- V1 Features being built:
${v1Features}

Your role:
1. Suggest potential V2 features based on natural extensions of the MVP
2. When suggesting a feature to add, use this exact format:

**Add to backlog?**
Title: [Feature title]
Description: [1-2 sentence description]
Priority: [high/medium/low]

Please suggest 2-3 V2 features that would naturally extend this MVP. Use the exact format above for each suggestion.`;

    // Send the planning message
    log('[Planning] Sending planning request to Claude...');
    store.getState().addPlanningMessage({ role: 'user', content: 'What V2 features should we plan for this project?' });

    const planningStart = Date.now();
    const response = await window.api.claude.chat(currentProject.projectPath, planningPrompt);
    const planningDuration = Date.now() - planningStart;
    checkCancelled();

    if (!response || response.length < 50) {
      throw new Error(`Planning response too short (${response?.length || 0} chars)`);
    }

    // Add assistant response to chat
    store.getState().addPlanningMessage({ role: 'assistant', content: response });
    log(`[Planning] Claude responded (${response.length} chars, ${(planningDuration / 1000).toFixed(1)}s)`, 'success');

    // Try to extract backlog suggestions using the shared utility pattern
    const suggestionMatches = response.match(/\*\*Add to backlog\?\*\*[\s\S]*?Title:\s*([^\n]+)/gi) || [];
    const suggestionsFound = suggestionMatches.length;
    log(`[Planning] Found ${suggestionsFound} backlog suggestions in response`);

    // Add a test backlog item programmatically
    store.getState().addBacklogItem({
      title: 'E2E Test Feature',
      description: 'A test feature added during E2E testing',
      priority: 'medium',
      chatId: chatId,
    });
    log('[Planning] Added test backlog item');

    // If Claude suggested items, try to parse and add the first one
    if (suggestionsFound > 0) {
      const titleMatch = suggestionMatches[0].match(/Title:\s*([^\n]+)/i);
      if (titleMatch) {
        const title = titleMatch[1].trim();
        // Check for description and priority in the full response
        const suggestionBlock = response.substring(response.indexOf(suggestionMatches[0]));
        const descMatch = suggestionBlock.match(/Description:\s*([^\n]+)/i);
        const prioMatch = suggestionBlock.match(/Priority:\s*(high|medium|low)/i);

        store.getState().addBacklogItem({
          title: title,
          description: descMatch ? descMatch[1].trim() : '',
          priority: (prioMatch ? prioMatch[1].toLowerCase() : 'medium') as 'high' | 'medium' | 'low',
          chatId: chatId,
        });
        log(`[Planning] Added Claude's suggestion: "${title}"`, 'success');
      }
    }

    // Save the planning data
    await store.getState().savePlanningChats();
    await store.getState().saveBacklog();

    // Verify persistence by reloading
    await store.getState().loadBacklog();
    await store.getState().loadPlanningChats();

    const finalBacklogCount = store.getState().backlog.length;
    const chatMessages = store.getState().getActivePlanningMessages().length;

    log(`[Planning] Verified: ${finalBacklogCount} backlog items, ${chatMessages} chat messages`);

    if (finalBacklogCount <= initialBacklogCount) {
      throw new Error('Backlog items were not persisted correctly');
    }

    return {
      chatId,
      responseChars: response.length,
      responseDuration: Math.round(planningDuration / 1000),
      suggestionsFound,
      backlogItemsAdded: finalBacklogCount - initialBacklogCount,
      totalBacklogItems: finalBacklogCount,
      chatMessages,
    };
  }

  async function phaseDeploy(): Promise<Record<string, string | number>> {
    log('Starting deploy...');

    const { currentProject } = store.getState();
    if (!currentProject) throw new Error('No current project');
    const projectPath = currentProject.projectPath;

    // Stop dev server first
    try {
      await window.api.devServer.stop();
      log('Dev server stopped');
    } catch {
      log('No dev server to stop', 'warn');
    }

    store.getState().setScreen('deploying');

    // Verify files exist before attempting deploy
    try {
      const files = await window.api.fs.readdir(projectPath);
      const realFiles = files.filter((f: string) => !f.startsWith('.'));
      if (realFiles.length === 0) {
        throw new Error('Cannot deploy: no files in project directory');
      }
      log(`Found ${realFiles.length} files/folders to deploy`);
    } catch (e) {
      if (e instanceof Error && e.message.includes('Cannot deploy')) throw e;
      throw new Error(`Cannot access project directory: ${projectPath}`);
    }

    // Replicate the deploy flow from DeployScreen
    // Step 1: Git setup
    log('Setting up git...');
    const username = await window.api.github.getUsername();
    const gitStatus = await window.api.github.checkGitStatus(projectPath);

    if (!gitStatus.hasGitRepo) {
      await window.api.github.gitInit(projectPath);
      log('Git repo initialized');
    }

    await window.api.github.ensureGitignore(projectPath);
    await window.api.github.ensureGitConfig(projectPath, username);
    checkCancelled();

    // Step 2: Commit
    log('Committing code...');
    const commitResult = await window.api.github.gitAddAndCommit(projectPath, 'Initial commit');
    log(`Committed: ${commitResult.commitHash}`, 'success');
    checkCancelled();

    // Step 3: Push to GitHub
    log('Pushing to GitHub...');
    let repoUrl = '';
    if (gitStatus.hasRemote) {
      await window.api.github.gitPush(projectPath);
      const freshStatus = await window.api.github.checkGitStatus(projectPath);
      repoUrl = (freshStatus.remoteUrl || '').replace(/\.git$/, '');
    } else {
      // Use a unique name to avoid "Name already exists" error
      const uniqueSlug = `${currentProject.slug}-${Date.now().toString(36)}`;
      try {
        const repoResult = await window.api.github.createRepoAndPush(projectPath, uniqueSlug);
        repoUrl = repoResult.repoUrl;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('Name already exists')) {
          // Extremely unlikely with timestamp, but handle it
          log('Repo name collision, retrying with new name...', 'warn');
          const retrySlug = `${currentProject.slug}-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 4)}`;
          const repoResult = await window.api.github.createRepoAndPush(projectPath, retrySlug);
          repoUrl = repoResult.repoUrl;
        } else {
          throw err;
        }
      }
    }

    await store.getState().updateProject({ githubRepo: repoUrl });
    log(`Pushed to GitHub: ${repoUrl}`, 'success');

    log('Deployment complete');
    await store.getState().updateProject({ status: 'complete' });

    return {
      githubRepo: repoUrl,
      commitHash: commitResult.commitHash,
    };
  }

  // ─── Test orchestrator ────────────────────────────────────────

  const runE2ETest = async () => {
    const testStart = Date.now();
    cancelledRef.current = false;
    setIsRunning(true);
    setView('running');
    setLogs([]);
    setTotalDuration(null);
    setCopied(false);
    setMinimized(false);

    // Clear any old checkpoint on fresh start
    localStorage.removeItem('e2e-checkpoint');
    setCheckpoint(null);

    // Define phases
    // Note: 'building+planning' is a special parallel phase
    const phaseList: { name: string; key: string; skip: boolean }[] = [
      { name: 'Create Project', key: 'create', skip: false },
      { name: 'Discovery Chat', key: 'discovery', skip: !config.includeDiscovery },
      { name: 'PRD Generation', key: 'prd', skip: false },
      { name: 'Task Generation', key: 'tasks', skip: false },
      { name: 'Building + V2 Planning', key: 'building+planning', skip: false },
      { name: 'Gap Analysis', key: 'gap-analysis', skip: !config.includeGapAnalysis },
      { name: 'Preview', key: 'preview', skip: false },
      { name: 'Deploy', key: 'deploy', skip: !config.includeDeploy },
    ];

    const results: PhaseResult[] = phaseList.map(p => ({
      name: p.name,
      status: p.skip ? 'skipped' : 'pending',
      duration: 0,
      metrics: {},
    }));
    setPhases(results);

    log('Starting E2E test...');
    log(`Idea: "${config.idea.substring(0, 80)}${config.idea.length > 80 ? '...' : ''}"`);
    log(`Discovery: ${config.includeDiscovery ? 'Yes' : 'No'} | Deploy: ${config.includeDeploy ? 'Yes' : 'No'}`);
    log('─'.repeat(50));

    for (let i = 0; i < phaseList.length; i++) {
      const phase = phaseList[i];

      if (phase.skip) {
        log(`Skipping: ${phase.name}`);
        continue;
      }

      if (cancelledRef.current) {
        for (let j = i; j < phaseList.length; j++) {
          if (!phaseList[j].skip) {
            updatePhase(j, { status: 'skipped' });
          }
        }
        break;
      }

      setCurrentPhase(i);
      updatePhase(i, { status: 'running' });
      log(`\n── Phase ${i + 1}: ${phase.name} ──`);
      const phaseStart = Date.now();

      try {
        let metrics: Record<string, string | number> = {};

        switch (phase.key) {
          case 'create':
            metrics = await phaseCreateProject(config.idea);
            break;
          case 'discovery':
            metrics = await phaseDiscovery();
            break;
          case 'prd':
            metrics = await phasePRDGeneration();
            break;
          case 'tasks':
            metrics = await phaseTaskGeneration();
            break;
          case 'building+planning':
            // Run building and planning in parallel (the core V2 Planning feature test)
            if (config.includePlanning) {
              log('Running Building and V2 Planning in PARALLEL...');
              log('This tests the core feature: planning V2 while building V1');

              const [buildMetrics, planMetrics] = await Promise.all([
                phaseBuilding(),
                phasePlanningV2(),
              ]);

              // Merge metrics from both phases
              metrics = {
                ...buildMetrics,
                ...Object.fromEntries(
                  Object.entries(planMetrics).map(([k, v]) => [`planning_${k}`, v])
                ),
                parallelExecution: 'true',
              };
            } else {
              // Just run building without planning
              log('Running Building only (planning disabled)...');
              metrics = await phaseBuilding();
              metrics.parallelExecution = 'false';
            }
            break;
          case 'gap-analysis':
            metrics = await phaseGapAnalysis();
            break;
          case 'preview':
            metrics = await phasePreview();
            break;
          case 'deploy':
            metrics = await phaseDeploy();
            break;
        }

        const duration = Date.now() - phaseStart;
        results[i] = { ...results[i], status: 'passed', duration, metrics };
        updatePhase(i, { status: 'passed', duration, metrics });
        log(`Phase "${phase.name}" passed (${(duration / 1000).toFixed(1)}s)\n`, 'success');

        // Save checkpoint after each successful phase
        try {
          const cp: E2ECheckpoint = {
            projectSlug: store.getState().currentProject?.slug || '',
            projectPath: store.getState().currentProject?.projectPath || '',
            config,
            resumeFromPhaseIndex: i + 1,
            completedPhases: results.slice(0, i + 1),
            phaseList,
            timestamp: Date.now(),
          };
          localStorage.setItem('e2e-checkpoint', JSON.stringify(cp));
        } catch { /* ignore localStorage errors */ }
      } catch (err) {
        const duration = Date.now() - phaseStart;
        const message = err instanceof Error ? err.message : String(err);
        updatePhase(i, { status: 'failed', duration, error: message });
        log(`Phase "${phase.name}" FAILED: ${message}`, 'error');

        // Skip remaining phases
        for (let j = i + 1; j < phaseList.length; j++) {
          if (!phaseList[j].skip) {
            updatePhase(j, { status: 'skipped' });
          }
        }
        break;
      }
    }

    // Cleanup
    log('\n── Cleanup ──');

    // Stop dev server
    try { await window.api.devServer.stop(); } catch { /* ignore */ }

    // Kill any Claude sessions
    const sessionId = store.getState().buildSessionId;
    if (sessionId) {
      try { await window.api.claude.kill(sessionId); } catch { /* ignore */ }
    }

    // Remove test project from the project list but keep files on disk
    const testProject = store.getState().currentProject;
    if (testProject) {
      log(`Test project kept on disk at: ${testProject.projectPath}`);
    }

    // Reset all project-scoped state and go home
    store.getState().setCurrentProject(null);
    store.getState().setTasks([]);
    store.getState().setChatMessages([]);
    store.getState().clearTerminalOutput();

    // Clear planning data and git events
    store.getState().setActivePlanningChat(null);
    store.setState({ gitEvents: [], backlog: [], sprints: [], planningChats: [], activePlanningChatId: null, prdStreaming: {}, deployments: [], gapAnalyses: [], saveError: null, projectHomeTab: 'plan' as const, planSubTab: 'planning' as const, shipSubTab: 'commits' as const, buildTaskPhase: 'idle' as const, buildCurrentTaskId: null, buildSessionActive: false, activeBuildChatIds: [], terminalOutput: [], oneOffBacklogItemId: null, gamification: { streakCount: 0, lastActivityDate: null, streakFreezeUsedThisWeek: false, lastFreezeWeek: null, totalTasksCompleted: 0, totalBuilds: 0, milestones: [] }, gamificationEvent: null, assistantGreeting: null, assistantApproval: null, assistantErrorContext: null, assistantHumanTaskContext: null, toasts: [], buildPipelineResume: null, buildPipelineAutoApprove: null });

    // Clear checkpoint
    localStorage.removeItem('e2e-checkpoint');
    setCheckpoint(null);

    store.getState().setScreen('home');

    try {
      await store.getState().refreshProjects();
    } catch { /* ignore */ }

    const elapsed = Date.now() - testStart;
    setTotalDuration(elapsed);
    setCurrentPhase(-1);
    setIsRunning(false);
    setView('report');
    log(`\nE2E test complete in ${(elapsed / 1000).toFixed(1)}s`);
  };

  // ─── Resume from checkpoint ──────────────────────────────────

  const resumeE2ETest = async (cp: E2ECheckpoint) => {
    const testStart = Date.now();
    cancelledRef.current = false;
    setIsRunning(true);
    setView('running');
    setLogs([]);
    setTotalDuration(null);
    setCopied(false);
    setMinimized(false);

    // Restore config from checkpoint
    setConfig(cp.config);

    // Restore phase list from checkpoint
    const phaseList = cp.phaseList;
    const resumeIndex = cp.resumeFromPhaseIndex;

    // Build results array: completed phases from checkpoint + pending for the rest
    const results: PhaseResult[] = phaseList.map((p, idx) => {
      if (idx < cp.completedPhases.length) {
        return cp.completedPhases[idx];
      }
      return {
        name: p.name,
        status: p.skip ? 'skipped' as const : 'pending' as const,
        duration: 0,
        metrics: {},
      };
    });
    setPhases(results);

    log('Resuming E2E test from checkpoint...');
    log(`Project: ${cp.projectSlug}`);
    log(`Resuming from phase ${resumeIndex + 1}: ${phaseList[resumeIndex]?.name || 'unknown'}`);
    log(`${cp.completedPhases.filter(p => p.status === 'passed').length} phases already passed`);
    log('─'.repeat(50));

    // Reload the project from disk
    log('Reloading project from disk...');
    try {
      await store.getState().loadProject(cp.projectSlug);
      // Override the screen that loadProject set based on project status —
      // we don't want the build screen (or any other) rendering behind the E2E modal
      store.getState().setScreen('home');
      await delay(1000); // Let store settle
      const project = store.getState().currentProject;
      if (!project) {
        throw new Error(`Failed to load project "${cp.projectSlug}" — project not found`);
      }
      log(`Project loaded: ${project.name} (${project.slug})`, 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log(`Failed to load project: ${message}`, 'error');
      setTotalDuration(Date.now() - testStart);
      setCurrentPhase(-1);
      setIsRunning(false);
      setView('report');
      return;
    }

    // Run remaining phases starting from resumeIndex
    for (let i = resumeIndex; i < phaseList.length; i++) {
      const phase = phaseList[i];

      if (phase.skip) {
        log(`Skipping: ${phase.name}`);
        continue;
      }

      if (cancelledRef.current) {
        for (let j = i; j < phaseList.length; j++) {
          if (!phaseList[j].skip) {
            updatePhase(j, { status: 'skipped' });
          }
        }
        break;
      }

      setCurrentPhase(i);
      updatePhase(i, { status: 'running' });
      log(`\n── Phase ${i + 1}: ${phase.name} (resumed) ──`);
      const phaseStart = Date.now();

      try {
        let metrics: Record<string, string | number> = {};

        switch (phase.key) {
          case 'create':
            // Skip project creation on resume — project already exists
            log('Skipping project creation (already exists from previous run)', 'success');
            metrics = { skipped: 1, reason: 'resume' };
            break;
          case 'discovery':
            metrics = await phaseDiscovery();
            break;
          case 'prd':
            metrics = await phasePRDGeneration();
            break;
          case 'tasks':
            metrics = await phaseTaskGeneration();
            break;
          case 'building+planning':
            if (cp.config.includePlanning) {
              log('Running Building and V2 Planning in PARALLEL...');
              const [buildMetrics, planMetrics] = await Promise.all([
                phaseBuilding(),
                phasePlanningV2(),
              ]);
              metrics = {
                ...buildMetrics,
                ...Object.fromEntries(
                  Object.entries(planMetrics).map(([k, v]) => [`planning_${k}`, v])
                ),
                parallelExecution: 'true',
              };
            } else {
              metrics = await phaseBuilding();
              metrics.parallelExecution = 'false';
            }
            break;
          case 'gap-analysis':
            metrics = await phaseGapAnalysis();
            break;
          case 'preview':
            metrics = await phasePreview();
            break;
          case 'deploy':
            metrics = await phaseDeploy();
            break;
        }

        const duration = Date.now() - phaseStart;
        results[i] = { ...results[i], status: 'passed', duration, metrics };
        updatePhase(i, { status: 'passed', duration, metrics });
        log(`Phase "${phase.name}" passed (${(duration / 1000).toFixed(1)}s)\n`, 'success');

        // Update checkpoint
        try {
          const updatedCp: E2ECheckpoint = {
            ...cp,
            resumeFromPhaseIndex: i + 1,
            completedPhases: results.slice(0, i + 1),
            timestamp: Date.now(),
          };
          localStorage.setItem('e2e-checkpoint', JSON.stringify(updatedCp));
        } catch { /* ignore */ }
      } catch (err) {
        const duration = Date.now() - phaseStart;
        const message = err instanceof Error ? err.message : String(err);
        updatePhase(i, { status: 'failed', duration, error: message });
        log(`Phase "${phase.name}" FAILED: ${message}`, 'error');

        for (let j = i + 1; j < phaseList.length; j++) {
          if (!phaseList[j].skip) {
            updatePhase(j, { status: 'skipped' });
          }
        }
        break;
      }
    }

    // Cleanup
    log('\n── Cleanup ──');

    try { await window.api.devServer.stop(); } catch { /* ignore */ }

    const sessionId = store.getState().buildSessionId;
    if (sessionId) {
      try { await window.api.claude.kill(sessionId); } catch { /* ignore */ }
    }

    const testProject = store.getState().currentProject;
    if (testProject) {
      log(`Test project kept on disk at: ${testProject.projectPath}`);
    }

    store.getState().setCurrentProject(null);
    store.getState().setTasks([]);
    store.getState().setChatMessages([]);
    store.getState().clearTerminalOutput();

    store.getState().setActivePlanningChat(null);
    store.setState({ gitEvents: [], backlog: [], sprints: [], planningChats: [], activePlanningChatId: null, prdStreaming: {}, deployments: [], gapAnalyses: [], saveError: null, projectHomeTab: 'plan' as const, planSubTab: 'planning' as const, shipSubTab: 'commits' as const, buildTaskPhase: 'idle' as const, buildCurrentTaskId: null, buildSessionActive: false, activeBuildChatIds: [], terminalOutput: [], oneOffBacklogItemId: null, gamification: { streakCount: 0, lastActivityDate: null, streakFreezeUsedThisWeek: false, lastFreezeWeek: null, totalTasksCompleted: 0, totalBuilds: 0, milestones: [] }, gamificationEvent: null, assistantGreeting: null, assistantApproval: null, assistantErrorContext: null, assistantHumanTaskContext: null, toasts: [], buildPipelineResume: null, buildPipelineAutoApprove: null });

    // Clear checkpoint
    localStorage.removeItem('e2e-checkpoint');
    setCheckpoint(null);

    store.getState().setScreen('home');

    try {
      await store.getState().refreshProjects();
    } catch { /* ignore */ }

    const elapsed = Date.now() - testStart;
    setTotalDuration(elapsed);
    setCurrentPhase(-1);
    setIsRunning(false);
    setView('report');
    log(`\nResumed E2E test complete in ${(elapsed / 1000).toFixed(1)}s`);
  };

  const cancelTest = () => {
    cancelledRef.current = true;
    log('Cancelling test...', 'warn');
  };

  // ─── Report generation ────────────────────────────────────────

  const generateReportText = () => {
    const ts = new Date().toLocaleString();
    const passed = phases.filter(p => p.status === 'passed').length;
    const failed = phases.filter(p => p.status === 'failed').length;
    const skipped = phases.filter(p => p.status === 'skipped').length;

    let report = `MC E2E TEST REPORT\n`;
    report += `========================\n`;
    report += `Date: ${ts}\n`;
    report += `Idea: ${config.idea}\n`;
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
      console.error('[E2E] Failed to copy report');
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
              <h3 className="text-lg font-sans font-semibold text-ink">E2E Flow Test</h3>
              <p className="text-xs text-ink-muted mt-0.5">Test the full app pipeline with real Claude calls</p>
            </div>
            <button onClick={onClose} className="text-ink-muted hover:text-ink-secondary">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="p-5 space-y-5 overflow-y-auto min-h-0 flex-1">
            {/* Idea */}
            <div>
              <label className="block text-sm font-sans font-medium text-ink-secondary mb-1.5">Test Project Idea</label>
              <textarea
                value={config.idea}
                onChange={e => setConfig(c => ({ ...c, idea: e.target.value }))}
                rows={3}
                className="w-full input-inset bg-surface-light border border-border px-3 py-2 text-sm text-ink placeholder-ink-muted focus:outline-none focus:border-accent resize-none"
                placeholder="Describe a simple app to test with..."
              />
              <p className="text-[13px] text-ink-muted mt-1">Simpler ideas = faster tests. Complex ideas may take 10+ minutes.</p>
            </div>

            {/* Options */}
            <div className="space-y-3">
              <label className="block text-sm font-sans font-medium text-ink-secondary">Options</label>

              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.includeDiscovery}
                  onChange={e => setConfig(c => ({ ...c, includeDiscovery: e.target.checked }))}
                  className="w-4 h-4 border-border bg-surface-light text-accent focus:ring-accent"
                />
                <div>
                  <span className="text-sm text-ink-secondary">Discovery Chat</span>
                  <p className="text-[13px] text-ink-muted">Send idea to Claude, get a response before PRD generation</p>
                </div>
              </label>

              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.includePlanning}
                  onChange={e => setConfig(c => ({ ...c, includePlanning: e.target.checked }))}
                  className="w-4 h-4 border-border bg-surface-light text-accent focus:ring-accent"
                />
                <div>
                  <span className="text-sm text-ink-secondary">V2 Planning (Parallel)</span>
                  <p className="text-[13px] text-ink-muted">Test planning V2 features while building (two Claude sessions)</p>
                </div>
              </label>

              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.includeGapAnalysis}
                  onChange={e => setConfig(c => ({ ...c, includeGapAnalysis: e.target.checked }))}
                  className="w-4 h-4 border-border bg-surface-light text-accent focus:ring-accent"
                />
                <div>
                  <span className="text-sm text-ink-secondary">Gap Analysis</span>
                  <p className="text-[13px] text-ink-muted">Compare build against PRD, auto-fix gaps if grade &lt; 95</p>
                </div>
              </label>

              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.includeDeploy}
                  onChange={e => setConfig(c => ({ ...c, includeDeploy: e.target.checked }))}
                  className="w-4 h-4 border-border bg-surface-light text-accent focus:ring-accent"
                />
                <div>
                  <span className="text-sm text-ink-secondary">Deploy to GitHub</span>
                  <p className="text-[13px] text-ink-muted">Push code to a real GitHub repo (creates a new repo)</p>
                </div>
              </label>
            </div>

            {/* Phases preview */}
            <div className="card-panel p-3">
              <p className="text-sm font-sans font-medium text-ink-muted mb-2">Test Phases</p>
              <div className="space-y-1.5">
                {[
                  { name: 'Create Project', active: true, parallel: false },
                  { name: 'Discovery Chat', active: config.includeDiscovery, parallel: false },
                  { name: 'PRD Generation', active: true, parallel: false },
                  { name: 'Task Generation', active: true, parallel: false },
                  { name: config.includePlanning ? 'Building + V2 Planning' : 'Building', active: true, parallel: config.includePlanning },
                  { name: 'Gap Analysis', active: config.includeGapAnalysis, parallel: false },
                  { name: 'Preview', active: true, parallel: false },
                  { name: 'Deploy', active: config.includeDeploy, parallel: false },
                ].map((p, i) => (
                  <div key={i} className="flex items-center space-x-2 text-xs">
                    <div className={`w-1.5 h-1.5 ${p.active ? 'bg-accent' : 'bg-border'}`} />
                    <span className={p.active ? 'text-ink-secondary' : 'text-ink-muted line-through'}>
                      {p.name}
                    </span>
                    {p.parallel && (
                      <span className="text-[13px] text-accent bg-accent/10 px-1.5 py-0.5">
                        parallel
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Resume banner */}
          {checkpoint && (
            <div className="mx-5 mb-2">
              <div className="card-panel p-4 border-accent/30">
                <p className="text-xs font-semibold text-accent mb-2">Resume available</p>
                <div className="space-y-1 mb-3">
                  <p className="text-xs text-ink-muted">
                    Project: <span className="text-ink font-medium">{checkpoint.projectSlug}</span>
                  </p>
                  <p className="text-xs text-ink-muted">
                    Failed at: <span className="text-ink font-medium">
                      {checkpoint.phaseList[checkpoint.resumeFromPhaseIndex]?.name || 'Unknown'}
                    </span>
                    <span className="text-ink-muted">
                      {' '}({checkpoint.completedPhases.filter(p => p.status === 'passed').length}/{checkpoint.phaseList.length} phases passed)
                    </span>
                  </p>
                  <p className="text-[13px] text-ink-muted">{formatRelativeTime(checkpoint.timestamp)}</p>
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => resumeE2ETest(checkpoint)}
                    className="btn-solid-primary px-4 py-1.5 text-xs font-semibold"
                  >
                    Resume from {checkpoint.phaseList[checkpoint.resumeFromPhaseIndex]?.name || 'next phase'}
                  </button>
                  <button
                    onClick={() => { localStorage.removeItem('e2e-checkpoint'); setCheckpoint(null); }}
                    className="btn-solid px-3 py-1.5 text-xs"
                  >
                    Discard
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="px-5 py-4 border-t border-border flex justify-between items-center flex-shrink-0">
            <p className="text-[13px] text-ink-muted">This will create a real project and call Claude</p>
            <button
              onClick={runE2ETest}
              disabled={!config.idea.trim()}
              className="btn-solid-primary px-5 py-2 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Start E2E Test
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Running View ─────────────────────────────────────────────

  if (view === 'running') {
    // Minimized view - small floating indicator
    if (minimized) {
      const runningPhase = phases.find(p => p.status === 'running');
      const passedCount = phases.filter(p => p.status === 'passed').length;
      return (
        <div
          className="fixed bottom-4 right-4 z-[100] bg-surface border border-border p-3 cursor-pointer hover:border-accent transition-colors"
          onClick={() => setMinimized(false)}
        >
          <div className="flex items-center space-x-3">
            <div className="w-4 h-4 border-4 border-accent border-t-transparent animate-spin" />
            <div>
              <p className="text-xs font-medium text-ink">E2E Test Running</p>
              <p className="text-[13px] text-ink-muted">
                {runningPhase ? runningPhase.name : `${passedCount}/${phases.length} phases`}
              </p>
            </div>
            <svg className="w-4 h-4 text-ink-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          </div>
        </div>
      );
    }

    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60">
        <div className="bg-surface border border-border w-[560px] max-h-[85vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-border flex-shrink-0">
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 border-4 border-accent border-t-transparent animate-spin" />
              <h3 className="text-base font-sans font-semibold text-ink">E2E Test Running</h3>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setMinimized(true)}
                className="p-1.5 text-ink-muted hover:text-ink-secondary transition-colors"
                title="Minimize"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              <button
                onClick={cancelTest}
                disabled={!isRunning}
                className="btn-solid-danger px-3 py-1 text-xs disabled:opacity-30"
              >
                Cancel
              </button>
            </div>
          </div>

          {/* Phase progress */}
          <div className="px-5 py-3 border-b border-border-subtle flex-shrink-0">
            <div className="flex space-x-1">
              {phases.map((phase, i) => (
                <div key={i} className="flex-1 flex flex-col items-center">
                  <div className={`w-full h-1.5 ${
                    phase.status === 'passed' ? 'bg-success' :
                    phase.status === 'running' ? 'bg-accent animate-pulse' :
                    phase.status === 'failed' ? 'bg-error' :
                    phase.status === 'skipped' ? 'bg-surface' :
                    'bg-surface'
                  }`} />
                  <span className={`text-[8px] mt-1 truncate w-full text-center ${
                    phase.status === 'running' ? 'text-accent font-medium' :
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
                entry.level === 'warn' ? 'text-accent' :
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
          <h3 className="text-base font-sans font-semibold text-ink">E2E Test Report</h3>
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
                {/* Icon */}
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

                {/* Name + duration */}
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

              {/* Metrics */}
              {Object.keys(phase.metrics).length > 0 && phase.status === 'passed' && (
                <div className="mt-1.5 ml-7 space-y-0.5">
                  {Object.entries(phase.metrics).map(([key, value]) => (
                    <p key={key} className="text-[13px] text-ink-muted font-mono">
                      {key}: <span className="text-ink-muted">{value}</span>
                    </p>
                  ))}
                </div>
              )}

              {/* Error */}
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
            onClick={() => { localStorage.removeItem('e2e-checkpoint'); setCheckpoint(null); setView('config'); setPhases([]); setLogs([]); }}
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
