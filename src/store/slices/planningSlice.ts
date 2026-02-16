import { StateCreator } from 'zustand';
import type { AppState } from '../useAppStore';
import type { BacklogItem, Sprint, SprintStatus } from '../../types';
import { resilientChat } from '../../utils/resilient-chat';

export interface PlanningSlice {
  backlog: BacklogItem[];
  sprints: Sprint[];

  addBacklogItem: (item: Omit<BacklogItem, 'id' | 'createdAt'>) => void;
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
}

export const PLANNING_INITIAL_STATE = {
  backlog: [] as BacklogItem[],
  sprints: [] as Sprint[],
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
      window.api.storage.saveBacklog(currentProject.slug, get().backlog).catch((err) => {
        console.error('Failed to save backlog:', err);
        set({ saveError: 'Failed to save backlog. Your changes may not persist.' });
      });
      get().generateBacklogPRD(newItem.id);
    }
  },

  updateBacklogItem: (id, updates) => {
    const { currentProject } = get();
    set((state) => ({
      backlog: state.backlog.map((item) =>
        item.id === id ? { ...item, ...updates } : item
      ),
    }));
    if (currentProject) {
      window.api.storage.saveBacklog(currentProject.slug, get().backlog).catch((err) => {
        console.error('Failed to save backlog:', err);
        set({ saveError: 'Failed to save backlog. Your changes may not persist.' });
      });
    }
  },

  removeBacklogItem: (id) => {
    const { currentProject } = get();
    set((state) => ({
      backlog: state.backlog.filter((item) => item.id !== id),
    }));
    if (currentProject) {
      window.api.storage.saveBacklog(currentProject.slug, get().backlog).catch((err) => {
        console.error('Failed to save backlog:', err);
        set({ saveError: 'Failed to save backlog. Your changes may not persist.' });
      });
    }
  },

  reorderBacklog: (items) => {
    const { currentProject } = get();
    set({ backlog: items });
    if (currentProject) {
      window.api.storage.saveBacklog(currentProject.slug, items).catch((err) => {
        console.error('Failed to save backlog:', err);
        set({ saveError: 'Failed to save backlog. Your changes may not persist.' });
      });
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
      window.api.storage.saveSprints(currentProject.slug, get().sprints).catch((err) => {
        console.error('Failed to save sprints:', err);
        set({ saveError: 'Failed to save sprints. Your changes may not persist.' });
      });
    }
  },

  updateSprint: (id, updates) => {
    const { currentProject } = get();
    set((state) => ({
      sprints: state.sprints.map((s) => s.id === id ? { ...s, ...updates } : s),
    }));
    if (currentProject) {
      window.api.storage.saveSprints(currentProject.slug, get().sprints).catch((err) => {
        console.error('Failed to save sprints:', err);
        set({ saveError: 'Failed to save sprints. Your changes may not persist.' });
      });
    }
  },

  renameSprint: (id, name) => {
    const { currentProject } = get();
    set((state) => ({
      sprints: state.sprints.map((s) => s.id === id ? { ...s, name } : s),
    }));
    if (currentProject) {
      window.api.storage.saveSprints(currentProject.slug, get().sprints).catch((err) => {
        console.error('Failed to save sprints:', err);
        set({ saveError: 'Failed to save sprints. Your changes may not persist.' });
      });
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
      window.api.storage.saveSprints(currentProject.slug, get().sprints).catch((err) => {
        console.error('Failed to save sprints:', err);
      });
      window.api.storage.saveBacklog(currentProject.slug, get().backlog).catch((err) => {
        console.error('Failed to save backlog:', err);
      });
    }
  },

  setSprintStatus: (id, status) => {
    const { currentProject, backlog } = get();
    set((state) => ({
      sprints: state.sprints.map((s) => s.id === id ? { ...s, status } : s),
    }));
    if (currentProject) {
      window.api.storage.saveSprints(currentProject.slug, get().sprints).catch((err) => {
        console.error('Failed to save sprints:', err);
      });
    }
    if (status === 'completed') {
      const sprintItems = backlog.filter((b) => b.sprintId === id);
      for (const _item of sprintItems) {
        get().recordActivity('task_landed');
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
          window.api.storage.saveSprints(currentProject.slug, migratedSprints).catch((err) => {
            console.error('Failed to save migrated sprints:', err);
          });
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
      name: 'Mission 1',
      order: 1,
      createdAt: now,
      status: 'planning',
    };
    const sprint2: Sprint = {
      id: `sprint-${Date.now() + 1}-${Math.random().toString(36).substr(2, 9)}`,
      name: 'Mission 2',
      order: 2,
      createdAt: now,
      status: 'planning',
    };

    const updatedBacklog = backlog.map((item) =>
      !item.sprintId ? { ...item, sprintId: sprint1.id } : item
    );

    set({ sprints: [sprint1, sprint2], backlog: updatedBacklog });
    window.api.storage.saveSprints(currentProject.slug, [sprint1, sprint2]).catch((err) => {
      console.error('Failed to save initial sprints:', err);
    });
    if (updatedBacklog.some((item, i) => item !== backlog[i])) {
      window.api.storage.saveBacklog(currentProject.slug, updatedBacklog).catch((err) => {
        console.error('Failed to save backlog with sprint assignments:', err);
      });
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
      const prompt = `Write a focused mini-PRD for the following feature. Keep it concise (300-500 words). Include: Overview, User Stories (3-5), Technical Considerations, and Acceptance Criteria.

Project: ${currentProject.name}
${mainPrd ? `\nExisting PRD context:\n${mainPrd.substring(0, 2000)}\n` : ''}
Feature: ${item.title}
Description: ${item.description}
Priority: ${item.priority}

At the very end, on their own lines, include these two estimates:
ESTIMATED_TASKS: <number of implementation tasks needed, e.g. 5>
STORY_POINTS: <fibonacci story points 1-21 estimating total Claude Code effort>

Output markdown only (plus the two estimate lines at the end).`;

      const { promise } = resilientChat.standard(currentProject.projectPath, prompt);
      const prdContent = await promise;

      let estimatedTasks: number | undefined;
      let storyPoints: number | undefined;
      let cleanPrd = prdContent;

      const tasksMatch = prdContent.match(/ESTIMATED_TASKS:\s*(\d+)/);
      const pointsMatch = prdContent.match(/STORY_POINTS:\s*(\d+)/);
      if (tasksMatch) estimatedTasks = parseInt(tasksMatch[1], 10);
      if (pointsMatch) storyPoints = parseInt(pointsMatch[1], 10);
      cleanPrd = prdContent.replace(/\n?ESTIMATED_TASKS:\s*\d+/g, '').replace(/\n?STORY_POINTS:\s*\d+/g, '').trim();

      get().updateBacklogItem(itemId, { prd: cleanPrd, prdStatus: 'complete', estimatedTasks, storyPoints });
    } catch (err) {
      console.error('Failed to generate backlog PRD:', err);
      get().updateBacklogItem(itemId, { prdStatus: 'failed' });
      get().addToast({
        type: 'warning',
        message: 'Could not generate mini-PRD. You can retry from the backlog.',
      });
    }
  },
});
