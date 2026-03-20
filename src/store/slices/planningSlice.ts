import { StateCreator } from 'zustand';
import type { AppState } from '../useAppStore';
import type { BacklogItem, Sprint, SprintStatus, CodeIssue } from '../../types';
import { resilientChat } from '../../utils/resilient-chat';
import { persistQueued } from '../../utils/persist';
import { getSprintReadiness } from '../../utils/missionReadiness';
import { queueAssistantMessage } from '../../utils/assistant-chat-state';
import { classifyInteractionDepth } from '../../utils/interaction-depth';

export interface PlanningSlice {
  backlog: BacklogItem[];
  sprints: Sprint[];
  /** Streaming PRD content per backlog item ID (while generating) */
  prdStreaming: Record<string, string>;

  addBacklogItem: (item: Omit<BacklogItem, 'id' | 'createdAt'>) => string;
  updateBacklogItem: (id: string, updates: Partial<BacklogItem>) => void;
  removeBacklogItem: (id: string) => void;
  reorderBacklog: (items: BacklogItem[]) => void;
  saveBacklog: () => Promise<void>;
  loadBacklog: () => Promise<void>;

  addSprint: (name: string) => void;
  updateSprint: (id: string, updates: Partial<Sprint>) => void;
  renameSprint: (id: string, name: string) => void;
  removeSprint: (id: string) => void;
  setSprintStatus: (id: string, status: SprintStatus) => void;
  saveSprints: () => Promise<void>;
  loadSprints: () => Promise<void>;
  initializeSprintsIfNeeded: () => void;

  generateBacklogPRD: (itemId: string) => Promise<void>;
  retryFailedPRDs: (sprintId: string) => void;
  ensureAllPRDsGenerating: (sprintId: string) => void;
  planAndSprint: (itemId: string) => Promise<void>;
  planAndSprintIssue: (issue: CodeIssue) => Promise<string>;
  checkAutoActivateSprints: () => void;
  startBuild: (sprintId: string) => void;
  checkSprintOverflow: (sprintId: string) => void;
}

export const PLANNING_INITIAL_STATE = {
  backlog: [] as BacklogItem[],
  sprints: [] as Sprint[],
  prdStreaming: {} as Record<string, string>,
};

export const createPlanningSlice: StateCreator<AppState, [], [], PlanningSlice> = (set, get) => ({
  ...PLANNING_INITIAL_STATE,

  // Backlog actions
  addBacklogItem: (item) => {
    const { currentProject } = get();
    const newItem: BacklogItem = {
      ...item,
      id: `backlog-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date().toISOString(),
      prdStatus: 'pending',
    };
    set((state) => ({ backlog: [...state.backlog, newItem] }));
    if (currentProject) {
      persistQueued(currentProject.slug, 'backlog', get().backlog, window.api.storage.saveBacklog);
      get().generateBacklogPRD(newItem.id);
    }
    return newItem.id;
  },

  updateBacklogItem: (id, updates) => {
    const { currentProject, backlog } = get();
    set((state) => ({
      backlog: state.backlog.map((item) =>
        item.id === id ? { ...item, ...updates } : item
      ),
    }));
    if (currentProject) {
      persistQueued(currentProject.slug, 'backlog', get().backlog, window.api.storage.saveBacklog);
    }
    // When prdStatus changes to complete, check if sprint can auto-activate
    if (updates.prdStatus === 'complete') {
      get().checkAutoActivateSprints();
    }
    // When storyPoints change, check for sprint overflow
    if (updates.storyPoints !== undefined) {
      const item = get().backlog.find((b) => b.id === id);
      if (item?.sprintId) {
        get().checkSprintOverflow(item.sprintId);
      }
    }
  },

  removeBacklogItem: (id) => {
    const { currentProject } = get();
    set((state) => ({
      backlog: state.backlog.filter((item) => item.id !== id),
    }));
    if (currentProject) {
      persistQueued(currentProject.slug, 'backlog', get().backlog, window.api.storage.saveBacklog);
    }
  },

  reorderBacklog: (items) => {
    const { currentProject } = get();
    set({ backlog: items });
    if (currentProject) {
      persistQueued(currentProject.slug, 'backlog', items, window.api.storage.saveBacklog);
    }
  },

  saveBacklog: async () => {
    const { currentProject, backlog } = get();
    if (currentProject) {
      try {
        await window.api.storage.saveBacklog(currentProject.slug, backlog);
      } catch (err) {
        console.error('Failed to save backlog:', err);
      }
    }
  },

  loadBacklog: async () => {
    const { currentProject } = get();
    if (currentProject) {
      try {
        const items = await window.api.storage.getBacklog(currentProject.slug);
        set({ backlog: items });
      } catch (err) {
        console.error('Failed to load backlog:', err);
        set({ backlog: [] });
      }
    }
  },

  // Sprint actions
  addSprint: (name) => {
    const { currentProject, sprints } = get();
    const maxOrder = sprints.reduce((max, s) => Math.max(max, s.order), 0);
    const newSprint: Sprint = {
      id: `sprint-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name,
      order: maxOrder + 1,
      createdAt: new Date().toISOString(),
      status: 'planning',
    };
    set((state) => ({ sprints: [...state.sprints, newSprint] }));
    if (currentProject) {
      persistQueued(currentProject.slug, 'sprints', get().sprints, window.api.storage.saveSprints);
    }
  },

  updateSprint: (id, updates) => {
    const { currentProject } = get();
    set((state) => ({
      sprints: state.sprints.map((s) => s.id === id ? { ...s, ...updates } : s),
    }));
    if (currentProject) {
      persistQueued(currentProject.slug, 'sprints', get().sprints, window.api.storage.saveSprints);
    }
  },

  renameSprint: (id, name) => {
    const { currentProject } = get();
    set((state) => ({
      sprints: state.sprints.map((s) => s.id === id ? { ...s, name } : s),
    }));
    if (currentProject) {
      persistQueued(currentProject.slug, 'sprints', get().sprints, window.api.storage.saveSprints);
    }
  },

  removeSprint: (id) => {
    const { currentProject, sprints, backlog } = get();
    const sprint = sprints.find((s) => s.id === id);
    if (!sprint) return;

    const updatedBacklog = backlog.map((item) =>
      item.sprintId === id ? { ...item, sprintId: undefined } : item
    );

    set((state) => ({
      sprints: state.sprints.filter((s) => s.id !== id),
      backlog: updatedBacklog,
    }));
    if (currentProject) {
      persistQueued(currentProject.slug, 'sprints', get().sprints, window.api.storage.saveSprints);
      persistQueued(currentProject.slug, 'backlog', get().backlog, window.api.storage.saveBacklog);
    }
  },

  setSprintStatus: (id, status) => {
    const { currentProject, backlog } = get();

    // Gate: block transition to 'active' if not ready
    if (status === 'active') {
      const sprintItems = backlog.filter((b) => b.sprintId === id);
      const readiness = getSprintReadiness(sprintItems);
      if (!readiness.isReady) {
        if (readiness.isBlocked) {
          get().addToast({
            type: 'warning',
            message: readiness.blockReason || 'Sprint not ready',
            ctaLabel: 'Retry Failed',
            ctaAction: () => get().retryFailedPRDs(id),
          });
        } else {
          get().addToast({
            type: 'warning',
            message: readiness.blockReason || 'Sprint not ready',
          });
        }
        return;
      }
    }

    set((state) => ({
      sprints: state.sprints.map((s) => s.id === id ? { ...s, status } : s),
    }));
    if (currentProject) {
      persistQueued(currentProject.slug, 'sprints', get().sprints, window.api.storage.saveSprints);
    }
    if (status === 'completed') {
      const sprintItems = backlog.filter((b) => b.sprintId === id);
      for (const _item of sprintItems) {
        get().recordActivity('task_completed');
      }
      const completedSprint = get().sprints.find((s) => s.id === id);
      if (currentProject && completedSprint) {
        queueAssistantMessage(currentProject.slug, `${completedSprint.name} complete! Ready to deploy or start the next sprint?`);
      }
    }
  },

  saveSprints: async () => {
    const { currentProject, sprints } = get();
    if (currentProject) {
      try {
        await window.api.storage.saveSprints(currentProject.slug, sprints);
      } catch (err) {
        console.error('Failed to save sprints:', err);
      }
    }
  },

  loadSprints: async () => {
    const { currentProject } = get();
    if (currentProject) {
      try {
        const sprints = await window.api.storage.getSprints(currentProject.slug);
        let migrated = false;
        const migratedSprints = sprints.map((s: Sprint & { archived?: boolean }) => {
          if (s.status === undefined) {
            migrated = true;
            const { archived, ...rest } = s;
            return { ...rest, status: archived ? 'completed' as const : 'active' as const };
          }
          return s;
        });
        set({ sprints: migratedSprints });
        if (migrated) {
          persistQueued(currentProject.slug, 'sprints', migratedSprints, window.api.storage.saveSprints);
        }
      } catch (err) {
        console.error('Failed to load sprints:', err);
        set({ sprints: [] });
      }
    }
  },

  initializeSprintsIfNeeded: () => {
    const { currentProject, sprints, backlog } = get();
    if (!currentProject || sprints.length > 0) return;

    const now = new Date().toISOString();
    const sprint1: Sprint = {
      id: `sprint-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: 'Sprint 1',
      order: 1,
      createdAt: now,
      status: 'planning',
    };
    const sprint2: Sprint = {
      id: `sprint-${Date.now() + 1}-${Math.random().toString(36).substr(2, 9)}`,
      name: 'Sprint 2',
      order: 2,
      createdAt: now,
      status: 'planning',
    };

    const updatedBacklog = backlog.map((item) =>
      !item.sprintId ? { ...item, sprintId: sprint1.id } : item
    );

    set({ sprints: [sprint1, sprint2], backlog: updatedBacklog });
    persistQueued(currentProject.slug, 'sprints', [sprint1, sprint2], window.api.storage.saveSprints);
    if (updatedBacklog.some((item, i) => item !== backlog[i])) {
      persistQueued(currentProject.slug, 'backlog', updatedBacklog, window.api.storage.saveBacklog);
    }
  },

  generateBacklogPRD: async (itemId) => {
    const { currentProject, backlog } = get();
    if (!currentProject) return;
    const item = backlog.find((b) => b.id === itemId);
    if (!item) return;

    get().updateBacklogItem(itemId, { prdStatus: 'generating' });

    try {
      const mainPrd = await window.api.storage.getPRD(currentProject.slug);

      let depthInstruction: string;
      if (item.estimatedEffort === 'quick_fix') {
        depthInstruction = `Write a brief implementation note (100-200 words). Just describe what needs to change and where. No user stories needed.`;
      } else if (item.estimatedEffort === 'significant') {
        depthInstruction = `Write a detailed implementation plan (500-800 words). Include architecture considerations, potential risks, and a breakdown of sub-tasks.`;
      } else {
        depthInstruction = `Write a focused mini-PRD (300-500 words). Include: Overview, User Stories (3-5), Technical Considerations, and Acceptance Criteria.`;
      }

      const prompt = `${depthInstruction}

Project: ${currentProject.name}
${mainPrd ? `\nExisting PRD context:\n${mainPrd.substring(0, 2000)}\n` : ''}
Feature: ${item.title}
Description: ${item.description}
Priority: ${item.priority}

At the very end, on their own lines, include these two estimates:
ESTIMATED_TASKS: <number of implementation tasks needed, e.g. 5>
STORY_POINTS: <fibonacci story points 1-21 estimating total Claude Code effort>

Output markdown only (plus the two estimate lines at the end).`;

      const { promise, chatId } = resilientChat.standard(currentProject.projectPath, prompt, { streaming: true });

      // Subscribe to streaming chunks for live preview
      window.api.claude.onChatOutputForTask(chatId, (chunk: string) => {
        set((state) => ({
          prdStreaming: { ...state.prdStreaming, [itemId]: (state.prdStreaming[itemId] || '') + chunk },
        }));
      });

      const timeoutMs = 90_000;
      const prdContent = await Promise.race([
        promise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Plan generation timed out after 90s')), timeoutMs)
        ),
      ]);

      // Clean up streaming subscription and state
      window.api.claude.offChatOutputForTask(chatId);
      set((state) => {
        const next = { ...state.prdStreaming };
        delete next[itemId];
        return { prdStreaming: next };
      });

      let estimatedTasks: number | undefined;
      let storyPoints: number | undefined;
      let cleanPrd = prdContent;

      const tasksMatch = prdContent.match(/ESTIMATED_TASKS:\s*(\d+)/);
      const pointsMatch = prdContent.match(/STORY_POINTS:\s*(\d+)/);
      if (tasksMatch) estimatedTasks = parseInt(tasksMatch[1], 10);
      if (pointsMatch) storyPoints = parseInt(pointsMatch[1], 10);
      cleanPrd = prdContent.replace(/\n?ESTIMATED_TASKS:\s*\d+/g, '').replace(/\n?STORY_POINTS:\s*\d+/g, '').trim();

      get().updateBacklogItem(itemId, { prd: cleanPrd, prdStatus: 'complete', estimatedTasks, storyPoints });
      get().addToast({ type: 'success', message: `Plan ready: ${item.title}` });
    } catch (err) {
      console.error('Failed to generate backlog PRD:', err);
      get().updateBacklogItem(itemId, { prdStatus: 'failed' });
      set((state) => {
        const next = { ...state.prdStreaming };
        delete next[itemId];
        return { prdStreaming: next };
      });
      get().addToast({
        type: 'warning',
        message: 'Could not generate mini-PRD. You can retry from the backlog.',
      });
    }
  },

  retryFailedPRDs: (sprintId) => {
    const { backlog } = get();
    const failed = backlog.filter((b) => b.sprintId === sprintId && b.prdStatus === 'failed');
    if (failed.length === 0) return;
    get().addToast({ type: 'success', message: `Retrying ${failed.length} failed ${failed.length === 1 ? 'plan' : 'plans'}...` });
    for (const item of failed) {
      get().generateBacklogPRD(item.id);
    }
  },

  ensureAllPRDsGenerating: (sprintId) => {
    const { backlog } = get();
    const pending = backlog.filter(
      (b) => b.sprintId === sprintId && (!b.prdStatus || b.prdStatus === 'pending')
    );
    for (const item of pending) {
      get().generateBacklogPRD(item.id);
    }
  },

  planAndSprint: async (itemId) => {
    const { sprints, backlog } = get();
    const item = backlog.find((b) => b.id === itemId);
    if (!item) return;

    // Find first sprint with status 'planning' or 'active' (by order)
    const sortedSprints = [...sprints].sort((a, b) => a.order - b.order);
    let targetSprint = sortedSprints.find((s) => s.status === 'planning' || s.status === 'active');

    // If none exist, create "Sprint 1"
    if (!targetSprint) {
      get().addSprint('Sprint 1');
      const updatedSprints = get().sprints;
      targetSprint = updatedSprints[updatedSprints.length - 1];
    }

    // Assign item to that sprint
    get().updateBacklogItem(itemId, { sprintId: targetSprint.id });

    // Quick fixes (<= 3 SP): skip PRD generation, use description directly
    const sp = item.storyPoints ?? 3;
    if (sp <= 3 && item.prdStatus !== 'complete') {
      get().updateBacklogItem(itemId, {
        prdStatus: 'complete',
        prd: item.description,
        estimatedTasks: 1,
      });
      get().addToast({
        type: 'success',
        message: `Quick fix added to ${targetSprint.name} — ready to build`,
      });
    } else if (item.prdStatus !== 'complete' && item.prdStatus !== 'generating') {
      // Larger items: generate full PRD
      get().generateBacklogPRD(itemId);
      get().addToast({
        type: 'success',
        message: `Added to ${targetSprint.name} — planning...`,
      });
    }
  },

  planAndSprintIssue: async (issue) => {
    const { currentProject } = get();
    if (!currentProject) return '';

    const sp = issue.storyPoints ?? (issue.estimatedEffort === 'quick_fix' ? 1 : 3);

    // Create backlog item from issue
    const newId = get().addBacklogItem({
      title: `Fix: ${issue.title}`,
      description: issue.description + (issue.file ? `\n\nFile: ${issue.file}` : ''),
      priority: issue.severity === 'critical' ? 'high' : issue.severity === 'warning' ? 'medium' : 'low',
      type: 'bug_fix',
      estimatedEffort: issue.estimatedEffort,
      storyPoints: sp,
    });

    // Plan & sprint the new item (assigns to sprint, then handles PRD)
    await get().planAndSprint(newId);

    // Mark issue as 'planned' in storage
    try {
      const issues = await window.api.storage.getIssues(currentProject.slug);
      const updatedIssues = issues.map((i: CodeIssue) =>
        i.id === issue.id ? { ...i, status: 'planned' as const, backlogItemId: newId } : i
      );
      await window.api.storage.saveIssues(currentProject.slug, updatedIssues);
    } catch (err) {
      console.error('Failed to mark issue as planned:', err);
    }

    return newId;
  },

  checkAutoActivateSprints: () => {
    const { sprints, backlog, currentProject } = get();

    // 1. Activate planning sprints that are ready
    const planningSprints = sprints.filter((s) => s.status === 'planning');
    for (const sprint of planningSprints) {
      const items = backlog.filter((b) => b.sprintId === sprint.id);
      const readiness = getSprintReadiness(items);
      if (readiness.isReady) {
        get().setSprintStatus(sprint.id, 'active');
        if (currentProject) {
          queueAssistantMessage(currentProject.slug, `All plans ready for ${sprint.name}. Sprint activated.`);
        }
      }
    }

    // 2. Auto-start build on active sprints with all quick fixes ready (no build running)
    if (get().buildSessionActive) return;
    const activeSprints = get().sprints.filter((s) => s.status === 'active');
    for (const sprint of activeSprints) {
      const items = backlog.filter((b) => b.sprintId === sprint.id && b.prdStatus === 'complete');
      if (items.length === 0) continue;
      const allQuickFixes = items.every(b => (b.storyPoints ?? 3) <= 3);
      if (allQuickFixes) {
        get().addToast({
          type: 'success',
          message: `Quick fixes ready — auto-starting build...`,
        });
        setTimeout(() => get().startBuild(sprint.id), 500);
        return; // Only auto-start one sprint at a time
      } else {
        get().addToast({
          type: 'success',
          message: `All plans ready for ${sprint.name}. Ready to start.`,
          ctaLabel: 'Start Build',
          ctaAction: () => get().startBuild(sprint.id),
        });
      }
    }
  },

  startBuild: (sprintId) => {
    const { sprints, backlog, buildSessionActive } = get();
    if (buildSessionActive) {
      get().addToast({ type: 'warning', message: 'A build is already running.' });
      return;
    }
    const sprint = sprints.find((s) => s.id === sprintId);
    if (!sprint || sprint.status !== 'active') {
      get().addToast({ type: 'warning', message: 'Sprint must be active to start.' });
      return;
    }
    const items = backlog.filter((b) => b.sprintId === sprintId && b.prdStatus === 'complete');
    if (items.length === 0) {
      get().addToast({ type: 'warning', message: 'No planned items to start.' });
      return;
    }
    const tasks = items.map((item) => ({
      id: `mission-${item.id}-${Date.now()}`,
      title: item.title,
      description: item.prd || item.description,
      completed: false,
      interactionDepth: item.interactionDepth ?? classifyInteractionDepth(item),
    }));
    get().setTasksTransient(tasks);
    get().setOneOffBacklogItemId(null);
    get().goToBuilding();
  },

  checkSprintOverflow: (sprintId) => {
    const { sprints, backlog } = get();
    const sprint = sprints.find((s) => s.id === sprintId);
    if (!sprint || sprint.status !== 'planning') return;

    const items = backlog.filter((b) => b.sprintId === sprintId);
    const totalSP = items.reduce((sum, b) => sum + (b.storyPoints || 0), 0);
    const cap = 21;
    if (totalSP <= cap) return;

    // Sort by priority: high stays, medium/low overflow
    const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
    const sorted = [...items].sort((a, b) => (priorityOrder[a.priority] ?? 1) - (priorityOrder[b.priority] ?? 1));

    let runningTotal = 0;
    const keepItems: string[] = [];
    const overflowItems: BacklogItem[] = [];

    for (const item of sorted) {
      const sp = item.storyPoints || 0;
      if (runningTotal + sp <= cap) {
        runningTotal += sp;
        keepItems.push(item.id);
      } else {
        overflowItems.push(item);
      }
    }

    if (overflowItems.length === 0) return;

    // Find or create next sprint
    const sortedSprints = [...sprints].sort((a, b) => a.order - b.order);
    const currentIdx = sortedSprints.findIndex((s) => s.id === sprintId);
    let nextSprint = sortedSprints.find((s, i) => i > currentIdx && s.status === 'planning');

    if (!nextSprint) {
      const nextOrder = (sortedSprints[sortedSprints.length - 1]?.order ?? 0) + 1;
      get().addSprint(`Sprint ${nextOrder}`);
      nextSprint = get().sprints.find((s) => s.order === nextOrder);
    }

    if (!nextSprint) return;

    // Move overflow items
    for (const item of overflowItems) {
      get().updateBacklogItem(item.id, { sprintId: nextSprint.id });
    }

    get().addToast({
      type: 'success',
      message: `${overflowItems.length} overflow ${overflowItems.length === 1 ? 'item' : 'items'} moved to ${nextSprint.name}`,
    });
  },
});
