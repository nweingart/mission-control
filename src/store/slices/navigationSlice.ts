import { StateCreator } from 'zustand';
import type { AppState } from '../useAppStore';
import type { Screen } from '../../types';
import { BUILD_INITIAL_STATE } from './buildSlice';
import { TASKS_INITIAL_STATE } from './tasksSlice';
import { CHAT_INITIAL_STATE } from './chatSlice';
import { PLANNING_CHAT_INITIAL_STATE } from './planningChatSlice';
import { PLANNING_INITIAL_STATE } from './planningSlice';
import { ACTIVITY_INITIAL_STATE } from './activitySlice';
import { GAMIFICATION_INITIAL_STATE } from './gamificationSlice';
import { NOTIFICATIONS_INITIAL_STATE } from './notificationsSlice';
import { PROJECT_INITIAL_STATE } from './projectSlice';

export interface NavigationSlice {
  screen: Screen;
  projectHomeTab: 'plan' | 'docs' | 'ship' | 'data' | 'settings';
  planSubTab: 'planning' | 'backlog' | 'roadmap';
  shipSubTab: 'commits' | 'deploys';

  setProjectHomeTab: (tab: 'plan' | 'docs' | 'ship' | 'data' | 'settings') => void;
  setPlanSubTab: (tab: 'planning' | 'backlog' | 'roadmap') => void;
  setShipSubTab: (tab: 'commits' | 'deploys') => void;
  goToProjectHome: () => void;

  goToHome: () => void;
  startNewProject: () => void;
  goToDiscovery: () => void;
  goToPRDReview: () => void;
  goToPlanning: () => void;
  goToBuilding: () => void;
  goToPreview: () => void;
  goToDeploying: () => void;
  goToComplete: () => void;
}

export const NAVIGATION_INITIAL_STATE = {
  screen: 'home' as Screen,
  projectHomeTab: 'plan' as const,
  planSubTab: 'planning' as const,
  shipSubTab: 'commits' as const,
};

const FULL_RESET = {
  ...PROJECT_INITIAL_STATE,
  ...TASKS_INITIAL_STATE,
  ...CHAT_INITIAL_STATE,
  ...BUILD_INITIAL_STATE,
  ...PLANNING_CHAT_INITIAL_STATE,
  ...PLANNING_INITIAL_STATE,
  ...ACTIVITY_INITIAL_STATE,
  ...GAMIFICATION_INITIAL_STATE,
  ...NOTIFICATIONS_INITIAL_STATE,
  projectHomeTab: 'plan' as const,
  planSubTab: 'planning' as const,
  shipSubTab: 'commits' as const,
};

export const createNavigationSlice: StateCreator<AppState, [], [], NavigationSlice> = (set) => ({
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

    set({
      screen: 'home',
      ...FULL_RESET,
    });
  },

  startNewProject: () => {
    set({
      screen: 'idea',
      ...FULL_RESET,
    });
  },

  goToDiscovery: () => set({ screen: 'discovery' }),
  goToPRDReview: () => set({ screen: 'prd-review' }),
  goToPlanning: () => set({ screen: 'planning' }),
  goToBuilding: () => set({ screen: 'building' }),
  goToPreview: () => set({ screen: 'previewing' }),
  goToDeploying: () => set({ screen: 'deploying' }),
  goToComplete: () => set({ screen: 'complete' }),
});
