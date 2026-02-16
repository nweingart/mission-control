import { StateCreator } from 'zustand';
import type { AppState } from '../useAppStore';
import type { Project, Screen } from '../../types';

export interface ProjectSlice {
  currentProject: Project | null;
  projects: Project[];

  initialize: () => Promise<void>;
  setScreen: (screen: Screen) => void;
  setCurrentProject: (project: Project | null) => void;
  setProjects: (projects: Project[]) => void;
  createProject: (name: string, idea: string) => Promise<Project>;
  updateProject: (updates: Partial<Project>) => Promise<void>;
  loadProject: (slug: string) => Promise<void>;
  refreshProjects: () => Promise<void>;
}

export const PROJECT_INITIAL_STATE = {
  currentProject: null as Project | null,
  projects: [] as Project[],
};

export const createProjectSlice: StateCreator<AppState, [], [], ProjectSlice> = (set, get) => ({
  ...PROJECT_INITIAL_STATE,

  initialize: async () => {
    try {
      set({ isLoading: true, error: null });

      const config = await window.api.storage.getConfig();

      const cliStatus = await window.api.cli.checkAll();
      set({ cliStatus });

      const projects = await window.api.storage.listProjects();
      set({ projects });

      const onboardingComplete = config.hasCompletedOnboarding && config.hasSetWorkspace;

      if (!onboardingComplete) {
        set({ screen: 'onboarding', isLoading: false });
      } else {
        set({ screen: 'home', isLoading: false });
      }
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to initialize',
      });
    }
  },

  setScreen: (screen) => set({ screen }),
  setCurrentProject: (project) => set({ currentProject: project }),
  setProjects: (projects) => set({ projects }),

  createProject: async (name, idea) => {
    try {
      const project = await window.api.storage.createProject(name, idea);
      set((state) => ({
        projects: [project, ...state.projects],
        currentProject: project,
        error: null,
      }));
      return project;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create project';
      set({ error: errorMessage });
      throw err;
    }
  },

  updateProject: async (updates) => {
    const { currentProject } = get();
    if (!currentProject) return;

    try {
      const updated = await window.api.storage.updateProject(currentProject.slug, updates);
      set((state) => ({
        currentProject: updated,
        projects: state.projects.map((p) =>
          p.slug === updated.slug ? updated : p
        ),
        error: null,
      }));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update project';
      set({ error: errorMessage });
      throw err;
    }
  },

  loadProject: async (slug) => {
    try {
      const project = await window.api.storage.getProject(slug);
      if (project) {
        set({ currentProject: project, error: null });

        // Load associated data (don't fail if these fail)
        try { await get().loadTasks(); } catch (err) { console.error('Failed to load tasks:', err); }
        try { await get().loadChatHistory(); } catch (err) { console.error('Failed to load chat history:', err); }
        try { await get().loadGitEvents(); } catch (err) { console.error('Failed to load git events:', err); }
        try { await get().loadDeployments(); } catch (err) { console.error('Failed to load deployments:', err); }
        try { await get().loadGapAnalyses(); } catch (err) { console.error('Failed to load gap analyses:', err); }
        try { await get().loadBacklog(); } catch (err) { console.error('Failed to load backlog:', err); }
        try { await get().loadSprints(); } catch (err) { console.error('Failed to load sprints:', err); }

        try { get().initializeSprintsIfNeeded(); } catch (err) { console.error('Failed to initialize sprints:', err); }

        try { await get().loadPlanningChats(); } catch (err) { console.error('Failed to load planning chats:', err); }

        try {
          await get().loadGamification();
          get().checkAndUpdateStreak();
        } catch (err) { console.error('Failed to load gamification:', err); }

        // Check sprint deadlines for warning toasts
        const loadedSprints = get().sprints.filter((s) => s.status !== 'completed' && s.deadline);
        const now = Date.now();
        for (const sprint of loadedSprints) {
          const deadline = new Date(sprint.deadline!).getTime();
          const hoursLeft = (deadline - now) / (1000 * 60 * 60);
          if (hoursLeft > 0 && hoursLeft <= 24) {
            get().addToast({
              type: 'warning',
              message: `${sprint.name} deadline in ${Math.ceil(hoursLeft)} hours.`,
              ctaLabel: 'View',
              ctaAction: () => set({ projectHomeTab: 'plan', planSubTab: 'roadmap' }),
            });
          }
        }

        // Navigate to the correct screen based on project status
        const statusToScreen: Record<string, string> = {
          idea: 'idea',
          discovery: 'discovery',
          prd_review: 'prd-review',
          planning: 'building',
          building: 'building',
          previewing: 'building',
          deploying: 'building',
          complete: 'building',
        };
        const targetScreen = statusToScreen[project.status] || 'building';
        set({ screen: targetScreen });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load project';
      set({ error: errorMessage });
      throw err;
    }
  },

  refreshProjects: async () => {
    try {
      const projects = await window.api.storage.listProjects();
      set({ projects, error: null });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to refresh projects';
      set({ error: errorMessage });
      throw err;
    }
  },
});
