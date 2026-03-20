import { StateCreator } from 'zustand';
import type { AppState } from '../useAppStore';
import type { Screen } from '../../types';
import { getOrCreateProjectStore, destroyProjectStore, getProjectStoreBySlug } from '../projectStoreRegistry';
import { cancelBuildAgents } from '../../utils/agent-router';
import { clearProjectChat } from '../../utils/assistant-chat-state';

const MAX_OPEN_PROJECTS = 5;

export interface NavigationSlice {
  screen: Screen;
  projectHomeTab: 'plan' | 'docs' | 'ship' | 'data' | 'settings';
  planSubTab: 'planning' | 'backlog' | 'roadmap';
  shipSubTab: 'commits' | 'deploys';

  // Multi-project state
  openProjectSlugs: string[];
  activeProjectSlug: string | null;

  setProjectHomeTab: (tab: 'plan' | 'docs' | 'ship' | 'data' | 'settings') => void;
  setPlanSubTab: (tab: 'planning' | 'backlog' | 'roadmap') => void;
  setShipSubTab: (tab: 'commits' | 'deploys') => void;
  goToProjectHome: () => void;

  goToHome: () => void;
  startImportProject: () => void;
  goToPlanning: () => void;
  goToBuilding: () => void;
  goToPreview: () => void;
  goToDeploying: () => void;
  goToComplete: () => void;

  // Multi-project actions
  openProject: (slug: string) => Promise<void>;
  switchProject: (slug: string) => void;
  closeProject: (slug: string) => Promise<void>;
}

export const NAVIGATION_INITIAL_STATE = {
  screen: 'home' as Screen,
  projectHomeTab: 'plan' as const,
  planSubTab: 'planning' as const,
  shipSubTab: 'commits' as const,
  openProjectSlugs: [] as string[],
  activeProjectSlug: null as string | null,
};

export const createNavigationSlice: StateCreator<AppState, [], [], NavigationSlice> = (set, get) => ({
  ...NAVIGATION_INITIAL_STATE,

  setProjectHomeTab: (tab) => set({ projectHomeTab: tab }),
  setPlanSubTab: (tab) => set({ planSubTab: tab }),
  setShipSubTab: (tab) => set({ shipSubTab: tab }),
  goToProjectHome: () => set({ screen: 'project-home' }),

  goToHome: async () => {
    // Refresh CLI status for display purposes, but don't block navigation
    try {
      const cliStatus = await window.api.cli.checkAll();
      set({ cliStatus });
    } catch (err) {
      console.error('Failed to check CLI status:', err);
    }

    // Just deactivate the current project — project trees stay mounted
    set({
      screen: 'home',
      activeProjectSlug: null,
    });
  },

  startImportProject: () => {
    set({
      screen: 'import',
      activeProjectSlug: null,
    });
  },

  goToPlanning: () => set({ screen: 'planning' }),
  goToBuilding: () => set({ screen: 'building' }),
  goToPreview: () => set({ screen: 'previewing' }),
  goToDeploying: () => set({ screen: 'deploying' }),
  goToComplete: () => set({ screen: 'complete' }),

  openProject: async (slug: string) => {
    const { openProjectSlugs } = get();

    // If already open, just switch to it
    if (openProjectSlugs.includes(slug)) {
      set({ activeProjectSlug: slug });
      return;
    }

    // Enforce max open projects
    if (openProjectSlugs.length >= MAX_OPEN_PROJECTS) {
      // Close the oldest project that isn't currently active
      const oldestSlug = openProjectSlugs[0];
      const store = getProjectStoreBySlug(oldestSlug);
      if (store) {
        // Cancel any running builds before destroying
        try {
          const chatIds = store.getState().activeBuildChatIds;
          await cancelBuildAgents(chatIds);
        } catch { /* best effort */ }
        destroyProjectStore(oldestSlug);
        clearProjectChat(oldestSlug);
      }
      set({ openProjectSlugs: openProjectSlugs.slice(1) });
    }

    // Create the per-project store and hydrate it
    const projectStore = getOrCreateProjectStore(slug);
    await projectStore.getState().loadProject(slug);

    set({
      openProjectSlugs: [...get().openProjectSlugs, slug],
      activeProjectSlug: slug,
    });
  },

  switchProject: (slug: string) => {
    const { openProjectSlugs } = get();
    if (!openProjectSlugs.includes(slug)) return;
    set({ activeProjectSlug: slug });
  },

  closeProject: async (slug: string) => {
    const { openProjectSlugs, activeProjectSlug } = get();
    if (!openProjectSlugs.includes(slug)) return;

    // Cancel any running builds in the project store before destroying
    const store = getProjectStoreBySlug(slug);
    if (store) {
      const buildActive = store.getState().buildSessionActive;
      if (buildActive) {
        const confirmed = window.confirm(
          'A build is running in this project. Close anyway? The build will be cancelled.'
        );
        if (!confirmed) return;
        try {
          const chatIds = store.getState().activeBuildChatIds;
          await cancelBuildAgents(chatIds);
        } catch { /* best effort */ }
      }
    }

    // Remove from open list
    const newSlugs = openProjectSlugs.filter(s => s !== slug);
    destroyProjectStore(slug);
    clearProjectChat(slug);

    // If closing the active project, switch to the next one or go home
    let newActive = activeProjectSlug;
    if (activeProjectSlug === slug) {
      newActive = newSlugs.length > 0 ? newSlugs[newSlugs.length - 1] : null;
    }

    set({
      openProjectSlugs: newSlugs,
      activeProjectSlug: newActive,
      ...(newActive === null ? { screen: 'home' as Screen } : {}),
    });
  },
});
