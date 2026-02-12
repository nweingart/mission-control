import { create } from 'zustand';
import type { Screen, Project, CLIStatus, Task, ChatMessage, BacklogItem, Sprint, PlanningChat, GitEvent, DeploymentRecord, GapAnalysis, TaskPhase } from '../types';

// Maximum number of terminal output lines to keep in memory
const MAX_TERMINAL_LINES = 5000;

// Maximum collection sizes to prevent unbounded memory growth
const MAX_CHAT_MESSAGES = 500;
const MAX_GIT_EVENTS = 1000;
const MAX_DEPLOYMENTS = 100;
const MAX_GAP_ANALYSES = 50;

interface AppState {
  // State
  screen: Screen;
  currentProject: Project | null;
  projects: Project[];
  cliStatus: CLIStatus | null;
  isLoading: boolean;
  error: string | null;
  saveError: string | null;
  tasks: Task[];
  chatMessages: ChatMessage[];
  terminalOutput: string[];
  buildSessionId: string | null;
  flowTestMode: boolean;

  // Git events state
  gitEvents: GitEvent[];

  // Planning V2 state
  backlog: BacklogItem[];
  planningChats: PlanningChat[];
  activePlanningChatId: string | null;

  // Build status (written by useBuildPipeline, read by ProjectHomeScreen)
  buildTaskPhase: TaskPhase;
  buildCurrentTaskId: string | null;
  buildSessionActive: boolean;

  // Project home sidebar tab
  projectHomeTab: 'plan' | 'docs' | 'ship' | 'data' | 'settings';
  planSubTab: 'planning' | 'backlog' | 'roadmap';
  shipSubTab: 'commits' | 'deploys';

  // Actions
  initialize: () => Promise<void>;
  setScreen: (screen: Screen) => void;
  setCurrentProject: (project: Project | null) => void;
  setProjects: (projects: Project[]) => void;
  setCLIStatus: (status: CLIStatus) => void;
  setError: (error: string | null) => void;
  setSaveError: (error: string | null) => void;
  setLoading: (loading: boolean) => void;

  // Project actions
  createProject: (name: string, idea: string) => Promise<Project>;
  updateProject: (updates: Partial<Project>) => Promise<void>;
  loadProject: (slug: string) => Promise<void>;
  refreshProjects: () => Promise<void>;

  // Task actions
  setTasks: (tasks: Task[]) => void;
  addTask: (title: string) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  removeTask: (id: string) => void;
  reorderTasks: (tasks: Task[]) => void;
  saveTasks: () => Promise<void>;
  loadTasks: () => Promise<void>;

  // Chat actions
  addChatMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  setChatMessages: (messages: ChatMessage[]) => void;
  saveChatHistory: () => Promise<void>;
  loadChatHistory: () => Promise<void>;

  // Terminal actions
  appendTerminalOutput: (line: string) => void;
  clearTerminalOutput: () => void;
  setBuildSessionId: (sessionId: string | null) => void;

  // Onboarding actions
  completeOnboarding: () => Promise<void>;
  resetOnboarding: () => Promise<void>;
  completeWorkspaceSetup: (developmentPath: string) => Promise<void>;

  // Flow test mode
  setFlowTestMode: (mode: boolean) => void;

  // Backlog actions
  addBacklogItem: (item: Omit<BacklogItem, 'id' | 'createdAt'>) => void;
  updateBacklogItem: (id: string, updates: Partial<BacklogItem>) => void;
  removeBacklogItem: (id: string) => void;
  reorderBacklog: (items: BacklogItem[]) => void;
  saveBacklog: () => Promise<void>;
  loadBacklog: () => Promise<void>;

  // Sprint actions
  sprints: Sprint[];
  addSprint: (name: string) => void;
  renameSprint: (id: string, name: string) => void;
  removeSprint: (id: string) => void;
  archiveSprint: (id: string) => void;
  saveSprints: () => Promise<void>;
  loadSprints: () => Promise<void>;
  initializeSprintsIfNeeded: () => void;

  // Planning chat actions
  getActivePlanningMessages: () => ChatMessage[];
  createPlanningChat: (title?: string) => string;
  setActivePlanningChat: (chatId: string | null) => void;
  addPlanningMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  deletePlanningChat: (chatId: string) => void;
  renamePlanningChat: (chatId: string, newTitle: string) => void;
  savePlanningChats: () => Promise<void>;
  loadPlanningChats: () => Promise<void>;
  goToPlanningChats: () => void;

  // Git events actions
  addGitEvent: (event: Omit<GitEvent, 'id' | 'timestamp'>) => void;
  saveGitEvents: () => Promise<void>;
  loadGitEvents: () => Promise<void>;
  goToGitHistory: () => void;

  // Deployment records
  deployments: DeploymentRecord[];
  addDeployment: (record: DeploymentRecord) => void;
  updateDeployment: (id: string, updates: Partial<DeploymentRecord>) => void;
  saveDeployments: () => Promise<void>;
  loadDeployments: () => Promise<void>;
  goToDeployments: () => void;

  // Gap analysis records
  gapAnalyses: GapAnalysis[];
  addGapAnalysis: (analysis: GapAnalysis) => void;
  saveGapAnalyses: () => Promise<void>;
  loadGapAnalyses: () => Promise<void>;
  goToGapAnalysis: () => void;

  // Build status actions
  setBuildTaskPhase: (phase: TaskPhase) => void;
  setBuildCurrentTaskId: (id: string | null) => void;
  setBuildSessionActive: (active: boolean) => void;

  // Project home actions
  setProjectHomeTab: (tab: 'plan' | 'docs' | 'ship' | 'data' | 'settings') => void;
  setPlanSubTab: (tab: 'planning' | 'backlog' | 'roadmap') => void;
  setShipSubTab: (tab: 'commits' | 'deploys') => void;
  goToProjectHome: () => void;
  generateBacklogPRD: (itemId: string) => Promise<void>;

  // Navigation helpers
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

export const useAppStore = create<AppState>((set, get) => ({
  // Initial state
  screen: 'home',
  currentProject: null,
  projects: [],
  cliStatus: null,
  isLoading: true,
  error: null,
  saveError: null,
  tasks: [],
  chatMessages: [],
  terminalOutput: [],
  buildSessionId: null,
  flowTestMode: false,

  // Git events initial state
  gitEvents: [],

  // Deployment records initial state
  deployments: [],

  // Gap analysis initial state
  gapAnalyses: [],

  // Planning V2 initial state
  backlog: [],
  planningChats: [],
  activePlanningChatId: null,

  // Sprints initial state
  sprints: [],

  // Build status initial state
  buildTaskPhase: 'idle',
  buildCurrentTaskId: null,
  buildSessionActive: false,

  // Project home initial state
  projectHomeTab: 'plan',
  planSubTab: 'planning',
  shipSubTab: 'commits',

  setFlowTestMode: (mode) => set({ flowTestMode: mode }),

  // Initialize app
  initialize: async () => {
    try {
      set({ isLoading: true, error: null });

      // Load config to check onboarding status
      const config = await window.api.storage.getConfig();

      // Check CLI status
      const cliStatus = await window.api.cli.checkAll();
      set({ cliStatus });

      // Load projects
      const projects = await window.api.storage.listProjects();
      set({ projects });

      // Check if onboarding has been completed
      if (!config.hasCompletedOnboarding) {
        set({ screen: 'onboarding', isLoading: false });
        return;
      }

      // Check if workspace has been set up
      if (!config.hasSetWorkspace) {
        set({ screen: 'setup-workspace', isLoading: false });
        return;
      }

      // Determine initial screen based on setup progress
      const allReady = cliStatus.claude.installed && cliStatus.claude.authenticated &&
                       cliStatus.github.installed && cliStatus.github.authenticated &&
                       cliStatus.vercel.installed && cliStatus.vercel.authenticated &&
                       cliStatus.supabase.installed && cliStatus.supabase.authenticated;

      if (!allReady) {
        set({ screen: 'setup-deploy' });
      } else {
        set({ screen: 'home' });
      }

      set({ isLoading: false });
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to initialize',
      });
    }
  },

  // Basic setters
  setScreen: (screen) => set({ screen }),
  setCurrentProject: (project) => set({ currentProject: project }),
  setProjects: (projects) => set({ projects }),
  setCLIStatus: (status) => set({ cliStatus: status }),
  setError: (error) => set({ error }),
  setSaveError: (error) => set({ saveError: error }),
  setLoading: (loading) => set({ isLoading: loading }),

  // Project actions
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
        try {
          await get().loadTasks();
        } catch (err) {
          console.error('Failed to load tasks:', err);
        }

        try {
          await get().loadChatHistory();
        } catch (err) {
          console.error('Failed to load chat history:', err);
        }

        try {
          await get().loadGitEvents();
        } catch (err) {
          console.error('Failed to load git events:', err);
        }

        try {
          await get().loadDeployments();
        } catch (err) {
          console.error('Failed to load deployments:', err);
        }

        try {
          await get().loadGapAnalyses();
        } catch (err) {
          console.error('Failed to load gap analyses:', err);
        }

        try {
          await get().loadBacklog();
        } catch (err) {
          console.error('Failed to load backlog:', err);
        }

        try {
          await get().loadSprints();
        } catch (err) {
          console.error('Failed to load sprints:', err);
        }

        // Auto-create default sprints if none exist
        try {
          get().initializeSprintsIfNeeded();
        } catch (err) {
          console.error('Failed to initialize sprints:', err);
        }

        try {
          await get().loadPlanningChats();
        } catch (err) {
          console.error('Failed to load planning chats:', err);
        }

        // Navigate to project home dashboard
        set({ screen: 'project-home', projectHomeTab: 'plan' });
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

  // Task actions
  setTasks: (tasks) => {
    const { currentProject } = get();
    set({ tasks });
    if (currentProject) {
      window.api.storage.saveTasks(currentProject.slug, tasks).catch((err) => {
        console.error('Failed to save tasks:', err);
        set({ saveError: 'Failed to save tasks. Your changes may not persist.' });
      });
    }
  },

  addTask: (title) => {
    const { currentProject } = get();
    const newTask: Task = {
      id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title,
      completed: false,
    };
    set((state) => ({ tasks: [...state.tasks, newTask] }));
    if (currentProject) {
      window.api.storage.saveTasks(currentProject.slug, get().tasks).catch((err) => {
        console.error('Failed to save tasks:', err);
        set({ saveError: 'Failed to save tasks. Your changes may not persist.' });
      });
    }
  },

  updateTask: (id, updates) => {
    const { currentProject } = get();
    set((state) => ({
      tasks: state.tasks.map((task) =>
        task.id === id ? { ...task, ...updates } : task
      ),
    }));
    if (currentProject) {
      window.api.storage.saveTasks(currentProject.slug, get().tasks).catch((err) => {
        console.error('Failed to save tasks:', err);
        set({ saveError: 'Failed to save tasks. Your changes may not persist.' });
      });
    }
  },

  removeTask: (id) => {
    const { currentProject } = get();
    set((state) => ({
      tasks: state.tasks.filter((task) => task.id !== id),
    }));
    if (currentProject) {
      window.api.storage.saveTasks(currentProject.slug, get().tasks).catch((err) => {
        console.error('Failed to save tasks:', err);
        set({ saveError: 'Failed to save tasks. Your changes may not persist.' });
      });
    }
  },

  reorderTasks: (tasks) => {
    const { currentProject } = get();
    set({ tasks });
    if (currentProject) {
      window.api.storage.saveTasks(currentProject.slug, get().tasks).catch((err) => {
        console.error('Failed to save tasks:', err);
        set({ saveError: 'Failed to save tasks. Your changes may not persist.' });
      });
    }
  },

  saveTasks: async () => {
    const { currentProject, tasks } = get();
    if (currentProject) {
      try {
        await window.api.storage.saveTasks(currentProject.slug, tasks);
      } catch (err) {
        console.error('Failed to save tasks:', err);
        // Don't throw - tasks are already in memory, just failed to persist
      }
    }
  },

  loadTasks: async () => {
    const { currentProject } = get();
    if (currentProject) {
      try {
        const tasks = await window.api.storage.getTasks(currentProject.slug);
        set({ tasks });
      } catch (err) {
        console.error('Failed to load tasks:', err);
        set({ tasks: [] }); // Reset to empty on failure
      }
    }
  },

  // Chat actions
  addChatMessage: (message) => {
    const { currentProject } = get();
    const newMessage: ChatMessage = {
      ...message,
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
    };
    set((state) => {
      const updated = [...state.chatMessages, newMessage];
      return { chatMessages: updated.length > MAX_CHAT_MESSAGES ? updated.slice(-MAX_CHAT_MESSAGES) : updated };
    });
    if (currentProject) {
      window.api.storage.saveChatHistory(currentProject.slug, get().chatMessages).catch((err) => {
        console.error('Failed to save chat history:', err);
        set({ saveError: 'Failed to save chat history. Your changes may not persist.' });
      });
    }
  },

  setChatMessages: (messages) => set({ chatMessages: messages }),

  saveChatHistory: async () => {
    const { currentProject, chatMessages } = get();
    if (currentProject) {
      try {
        await window.api.storage.saveChatHistory(currentProject.slug, chatMessages);
      } catch (err) {
        console.error('Failed to save chat history:', err);
        // Don't throw - messages are already in memory, just failed to persist
      }
    }
  },

  loadChatHistory: async () => {
    const { currentProject } = get();
    if (currentProject) {
      try {
        const messages = await window.api.storage.getChatHistory(currentProject.slug);
        set({ chatMessages: messages });
      } catch (err) {
        console.error('Failed to load chat history:', err);
        set({ chatMessages: [] }); // Reset to empty on failure
      }
    }
  },

  // Terminal actions
  appendTerminalOutput: (line) => {
    set((state) => {
      const newOutput = [...state.terminalOutput, line];
      // Limit buffer size to prevent memory issues during long builds
      if (newOutput.length > MAX_TERMINAL_LINES) {
        // Remove oldest entries, keeping the most recent ones
        return { terminalOutput: newOutput.slice(-MAX_TERMINAL_LINES) };
      }
      return { terminalOutput: newOutput };
    });
  },

  clearTerminalOutput: () => set({ terminalOutput: [] }),

  setBuildSessionId: (sessionId) => set({ buildSessionId: sessionId }),

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
      // Auto-generate mini-PRD for new backlog items
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
    };
    set((state) => ({ sprints: [...state.sprints, newSprint] }));
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

    // Unassign items from the deleted sprint
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

  archiveSprint: (id) => {
    const { currentProject } = get();
    set((state) => ({
      sprints: state.sprints.map((s) => s.id === id ? { ...s, archived: true } : s),
    }));
    if (currentProject) {
      window.api.storage.saveSprints(currentProject.slug, get().sprints).catch((err) => {
        console.error('Failed to save sprints:', err);
      });
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
        set({ sprints });
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
    };
    const sprint2: Sprint = {
      id: `sprint-${Date.now() + 1}-${Math.random().toString(36).substr(2, 9)}`,
      name: 'Sprint 2',
      order: 2,
      createdAt: now,
    };

    // Assign all existing backlog items without a sprintId to Sprint 1
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

  // Planning chat actions
  getActivePlanningMessages: () => {
    const { planningChats, activePlanningChatId } = get();
    if (!activePlanningChatId) return [];
    const chat = planningChats.find((c) => c.id === activePlanningChatId);
    return chat?.messages || [];
  },

  createPlanningChat: (title) => {
    const { currentProject } = get();
    const chatId = `chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();
    const newChat: PlanningChat = {
      id: chatId,
      title: title || `Planning Session ${new Date().toLocaleDateString()}`,
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
    set((state) => ({
      planningChats: [...state.planningChats, newChat],
      activePlanningChatId: chatId,
    }));
    if (currentProject) {
      window.api.storage.savePlanningChats(currentProject.slug, get().planningChats).catch((err) => {
        console.error('Failed to save planning chats:', err);
        set({ saveError: 'Failed to save planning chats. Your changes may not persist.' });
      });
    }
    return chatId;
  },

  setActivePlanningChat: (chatId) => {
    set({ activePlanningChatId: chatId });
  },

  addPlanningMessage: (message) => {
    const { currentProject } = get();
    const newMessage: ChatMessage = {
      ...message,
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
    };
    set((state) => {
      const updatedChats = state.planningChats.map((chat) =>
        chat.id === state.activePlanningChatId
          ? { ...chat, messages: [...chat.messages, newMessage], updatedAt: new Date().toISOString() }
          : chat
      );
      return { planningChats: updatedChats };
    });
    if (currentProject) {
      window.api.storage.savePlanningChats(currentProject.slug, get().planningChats).catch((err) => {
        console.error('Failed to save planning chats:', err);
        set({ saveError: 'Failed to save planning chats. Your changes may not persist.' });
      });
    }
  },

  deletePlanningChat: (chatId) => {
    const { currentProject, planningChats, activePlanningChatId } = get();
    const filtered = planningChats.filter((c) => c.id !== chatId);

    // If we deleted the active chat, select another or clear
    if (chatId === activePlanningChatId) {
      if (filtered.length > 0) {
        const sorted = [...filtered].sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
        set({
          planningChats: filtered,
          activePlanningChatId: sorted[0].id,
        });
      } else {
        set({
          planningChats: filtered,
          activePlanningChatId: null,
        });
      }
    } else {
      set({ planningChats: filtered });
    }
    if (currentProject) {
      window.api.storage.savePlanningChats(currentProject.slug, get().planningChats).catch((err) => {
        console.error('Failed to save planning chats:', err);
        set({ saveError: 'Failed to save planning chats. Your changes may not persist.' });
      });
    }
  },

  renamePlanningChat: (chatId, newTitle) => {
    const { currentProject, planningChats } = get();
    const updated = planningChats.map((chat) =>
      chat.id === chatId
        ? { ...chat, title: newTitle, updatedAt: new Date().toISOString() }
        : chat
    );
    set({ planningChats: updated });
    if (currentProject) {
      window.api.storage.savePlanningChats(currentProject.slug, get().planningChats).catch((err) => {
        console.error('Failed to save planning chats:', err);
        set({ saveError: 'Failed to save planning chats. Your changes may not persist.' });
      });
    }
  },

  savePlanningChats: async () => {
    const { currentProject, planningChats } = get();
    if (currentProject) {
      try {
        await window.api.storage.savePlanningChats(currentProject.slug, planningChats);
      } catch (err) {
        console.error('Failed to save planning chats:', err);
      }
    }
  },

  loadPlanningChats: async () => {
    const { currentProject } = get();
    if (currentProject) {
      try {
        const chats = await window.api.storage.getPlanningChats(currentProject.slug);
        set({ planningChats: chats });
      } catch (err) {
        console.error('Failed to load planning chats:', err);
        set({ planningChats: [] });
      }
    }
  },

  goToPlanningChats: () => set({ screen: 'planning-chats' }),

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
    // Auto-save: capture slug now so even if project changes, we write to the right place
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
  },

  updateDeployment: (id, updates) => {
    const { currentProject } = get();
    if (!currentProject) return;
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

  // Onboarding actions
  completeOnboarding: async () => {
    try {
      const config = await window.api.storage.getConfig();
      await window.api.storage.saveConfig({ ...config, hasCompletedOnboarding: true });
      set({ screen: 'setup-workspace' });
    } catch (err) {
      console.error('Failed to complete onboarding:', err);
      set({ screen: 'setup-workspace' });
    }
  },

  resetOnboarding: async () => {
    try {
      const config = await window.api.storage.getConfig();
      await window.api.storage.saveConfig({ ...config, hasCompletedOnboarding: false, hasSetWorkspace: false });
      set({ screen: 'onboarding' });
    } catch (err) {
      console.error('Failed to reset onboarding:', err);
    }
  },

  completeWorkspaceSetup: async (developmentPath: string) => {
    try {
      const config = await window.api.storage.getConfig();
      await window.api.storage.saveConfig({ ...config, developmentPath, hasSetWorkspace: true });
    } catch (err) {
      console.error('Failed to save workspace setup:', err);
    }
    set({ screen: 'setup-deploy' });
  },

  // Build status actions
  setBuildTaskPhase: (phase) => set({ buildTaskPhase: phase }),
  setBuildCurrentTaskId: (id) => set({ buildCurrentTaskId: id }),
  setBuildSessionActive: (active) => set({ buildSessionActive: active }),

  // Project home actions
  setProjectHomeTab: (tab) => set({ projectHomeTab: tab }),
  setPlanSubTab: (tab) => set({ planSubTab: tab }),
  setShipSubTab: (tab) => set({ shipSubTab: tab }),
  goToProjectHome: () => set({ screen: 'project-home' }),

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

      const prdContent = await window.api.claude.chat(currentProject.projectPath, prompt);

      // Parse estimated tasks and story points from the end of the response
      let estimatedTasks: number | undefined;
      let storyPoints: number | undefined;
      let cleanPrd = prdContent;

      const tasksMatch = prdContent.match(/ESTIMATED_TASKS:\s*(\d+)/);
      const pointsMatch = prdContent.match(/STORY_POINTS:\s*(\d+)/);
      if (tasksMatch) estimatedTasks = parseInt(tasksMatch[1], 10);
      if (pointsMatch) storyPoints = parseInt(pointsMatch[1], 10);
      // Remove the estimate lines from the PRD content
      cleanPrd = prdContent.replace(/\n?ESTIMATED_TASKS:\s*\d+/g, '').replace(/\n?STORY_POINTS:\s*\d+/g, '').trim();

      get().updateBacklogItem(itemId, { prd: cleanPrd, prdStatus: 'complete', estimatedTasks, storyPoints });
    } catch (err) {
      console.error('Failed to generate backlog PRD:', err);
      get().updateBacklogItem(itemId, { prdStatus: 'failed' });
    }
  },

  // Navigation helpers
  goToHome: async () => {
    // Recheck CLI status before going home
    try {
      const cliStatus = await window.api.cli.checkAll();
      set({ cliStatus });

      const allReady = cliStatus.claude.installed && cliStatus.claude.authenticated &&
                       cliStatus.github.installed && cliStatus.github.authenticated &&
                       cliStatus.vercel.installed && cliStatus.vercel.authenticated &&
                       cliStatus.supabase.installed && cliStatus.supabase.authenticated;

      if (!allReady) {
        set({ screen: 'setup-deploy' });
        return;
      }
    } catch (err) {
      console.error('Failed to check CLI status:', err);
    }

    set({
      screen: 'home',
      currentProject: null,
      tasks: [],
      chatMessages: [],
      terminalOutput: [],
      buildSessionId: null,
      gitEvents: [],
      backlog: [],
      sprints: [],
      planningChats: [],
      activePlanningChatId: null,
      projectHomeTab: 'plan',
      planSubTab: 'planning',
      shipSubTab: 'commits',
      buildTaskPhase: 'idle',
      buildCurrentTaskId: null,
      buildSessionActive: false,

      deployments: [],
      gapAnalyses: [],
    });
  },

  startNewProject: () => {
    // Go directly to idea screen - no blocking checks
    set({
      screen: 'idea',
      currentProject: null,
      tasks: [],
      chatMessages: [],
      terminalOutput: [],
      gitEvents: [],
      backlog: [],
      sprints: [],
      planningChats: [],
      activePlanningChatId: null,
      projectHomeTab: 'plan',
      planSubTab: 'planning',
      shipSubTab: 'commits',
      buildTaskPhase: 'idle',
      buildCurrentTaskId: null,
      buildSessionActive: false,

      deployments: [],
      gapAnalyses: [],
    });
  },

  goToDiscovery: () => set({ screen: 'discovery' }),
  goToPRDReview: () => set({ screen: 'prd-review' }),
  goToPlanning: () => set({ screen: 'planning' }),
  goToBuilding: () => set({ screen: 'building' }),
  goToPreview: () => set({ screen: 'previewing' }),
  goToDeploying: () => set({ screen: 'deploying' }),
  goToComplete: () => set({ screen: 'complete' }),
}));
