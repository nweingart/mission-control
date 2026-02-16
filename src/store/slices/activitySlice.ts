import { StateCreator } from 'zustand';
import type { AppState } from '../useAppStore';
import type { GitEvent, DeploymentRecord, GapAnalysis } from '../../types';
import { MAX_GIT_EVENTS, MAX_DEPLOYMENTS, MAX_GAP_ANALYSES } from '../storeTypes';

export interface ActivitySlice {
  gitEvents: GitEvent[];
  deployments: DeploymentRecord[];
  gapAnalyses: GapAnalysis[];

  addGitEvent: (event: Omit<GitEvent, 'id' | 'timestamp'>) => void;
  saveGitEvents: () => Promise<void>;
  loadGitEvents: () => Promise<void>;
  goToGitHistory: () => void;

  addDeployment: (record: DeploymentRecord) => void;
  updateDeployment: (id: string, updates: Partial<DeploymentRecord>) => void;
  saveDeployments: () => Promise<void>;
  loadDeployments: () => Promise<void>;
  goToDeployments: () => void;

  addGapAnalysis: (analysis: GapAnalysis) => void;
  saveGapAnalyses: () => Promise<void>;
  loadGapAnalyses: () => Promise<void>;
  goToGapAnalysis: () => void;
}

export const ACTIVITY_INITIAL_STATE = {
  gitEvents: [] as GitEvent[],
  deployments: [] as DeploymentRecord[],
  gapAnalyses: [] as GapAnalysis[],
};

export const createActivitySlice: StateCreator<AppState, [], [], ActivitySlice> = (set, get) => ({
  ...ACTIVITY_INITIAL_STATE,

  // Git events actions
  addGitEvent: (event) => {
    const { currentProject } = get();
    if (!currentProject) {
      console.warn('addGitEvent called without a current project — event will not be persisted');
      return;
    }
    const newEvent: GitEvent = {
      ...event,
      id: `git-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
    };
    set((state) => {
      const updated = [...state.gitEvents, newEvent];
      return { gitEvents: updated.length > MAX_GIT_EVENTS ? updated.slice(-MAX_GIT_EVENTS) : updated };
    });
    const slug = currentProject.slug;
    window.api.storage.saveGitEvents(slug, get().gitEvents).catch((err) => {
      console.error('Failed to save git events:', err);
      set({ saveError: 'Failed to save git events. Your changes may not persist.' });
    });
  },

  saveGitEvents: async () => {
    const { currentProject, gitEvents } = get();
    if (!currentProject) {
      console.warn('saveGitEvents called without a current project');
      return;
    }
    try {
      await window.api.storage.saveGitEvents(currentProject.slug, gitEvents);
    } catch (err) {
      console.error('Failed to save git events:', err);
    }
  },

  loadGitEvents: async () => {
    const { currentProject } = get();
    if (currentProject) {
      try {
        const events = await window.api.storage.getGitEvents(currentProject.slug);
        set({ gitEvents: events });
      } catch (err) {
        console.error('Failed to load git events:', err);
        set({ gitEvents: [] });
      }
    }
  },

  goToGitHistory: () => {
    if (!get().currentProject) return;
    set({ screen: 'git-history' });
  },

  // Deployment records actions
  addDeployment: (record) => {
    const { currentProject } = get();
    if (!currentProject) {
      console.warn('addDeployment called without a current project');
      return;
    }
    set((state) => {
      const updated = [...state.deployments, record];
      return { deployments: updated.length > MAX_DEPLOYMENTS ? updated.slice(-MAX_DEPLOYMENTS) : updated };
    });
    const slug = currentProject.slug;
    window.api.storage.saveDeployments(slug, get().deployments).catch((err) => {
      console.error('Failed to save deployments:', err);
      set({ saveError: 'Failed to save deployments. Your changes may not persist.' });
    });
    if (record.status === 'success') {
      get().addToast({ type: 'success', message: 'Deploy successful.', ctaLabel: 'View Logs', ctaAction: () => get().goToDeployments() });
    } else if (record.status === 'failed') {
      get().addToast({ type: 'urgent', message: `Deploy failed.${record.error ? ' ' + record.error : ''}`, ctaLabel: 'View Logs', ctaAction: () => get().goToDeployments() });
    }
  },

  updateDeployment: (id, updates) => {
    const { currentProject, deployments } = get();
    if (!currentProject) return;
    const oldStatus = deployments.find((d) => d.id === id)?.status;
    set((state) => ({
      deployments: state.deployments.map((d) =>
        d.id === id ? { ...d, ...updates } : d
      ),
    }));
    const slug = currentProject.slug;
    window.api.storage.saveDeployments(slug, get().deployments).catch((err) => {
      console.error('Failed to save deployments:', err);
      set({ saveError: 'Failed to save deployments. Your changes may not persist.' });
    });
    if (updates.status && updates.status !== oldStatus) {
      if (updates.status === 'success') {
        get().addToast({ type: 'success', message: 'Deploy successful.', ctaLabel: 'View', ctaAction: () => get().goToDeployments() });
      } else if (updates.status === 'failed') {
        get().addToast({ type: 'urgent', message: `Deploy failed.${updates.error ? ' ' + updates.error : ''}`, ctaLabel: 'Logs', ctaAction: () => get().goToDeployments() });
      }
    }
  },

  saveDeployments: async () => {
    const { currentProject, deployments } = get();
    if (!currentProject) {
      console.warn('saveDeployments called without a current project');
      return;
    }
    try {
      await window.api.storage.saveDeployments(currentProject.slug, deployments);
    } catch (err) {
      console.error('Failed to save deployments:', err);
    }
  },

  loadDeployments: async () => {
    const { currentProject } = get();
    if (currentProject) {
      try {
        const deployments = await window.api.storage.getDeployments(currentProject.slug);
        set({ deployments });
      } catch (err) {
        console.error('Failed to load deployments:', err);
        set({ deployments: [] });
      }
    }
  },

  goToDeployments: () => {
    if (!get().currentProject) return;
    set({ screen: 'deployments' });
  },

  // Gap analysis actions
  addGapAnalysis: (analysis) => {
    const { currentProject } = get();
    if (!currentProject) {
      console.warn('addGapAnalysis called without a current project');
      return;
    }
    set((state) => {
      const updated = [...state.gapAnalyses, analysis];
      return { gapAnalyses: updated.length > MAX_GAP_ANALYSES ? updated.slice(-MAX_GAP_ANALYSES) : updated };
    });
    const slug = currentProject.slug;
    window.api.storage.saveGapAnalysis(slug, get().gapAnalyses).catch((err) => {
      console.error('Failed to save gap analyses:', err);
      set({ saveError: 'Failed to save gap analyses. Your changes may not persist.' });
    });
  },

  saveGapAnalyses: async () => {
    const { currentProject, gapAnalyses } = get();
    if (!currentProject) {
      console.warn('saveGapAnalyses called without a current project');
      return;
    }
    try {
      await window.api.storage.saveGapAnalysis(currentProject.slug, gapAnalyses);
    } catch (err) {
      console.error('Failed to save gap analyses:', err);
    }
  },

  loadGapAnalyses: async () => {
    const { currentProject } = get();
    if (currentProject) {
      try {
        const analyses = await window.api.storage.getGapAnalysis(currentProject.slug);
        set({ gapAnalyses: analyses });
      } catch (err) {
        console.error('Failed to load gap analyses:', err);
        set({ gapAnalyses: [] });
      }
    }
  },

  goToGapAnalysis: () => {
    if (!get().currentProject) return;
    set({ screen: 'gap-analysis' });
  },
});
