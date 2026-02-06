import { create } from 'zustand';
import type { Screen, Project, CLIStatus, Task, ChatMessage, BacklogItem, PlanningChat, GitEvent } from '../types';

// Maximum number of terminal output lines to keep in memory
const MAX_TERMINAL_LINES = 5000;

interface AppState {
  // State
  screen: Screen;
  currentProject: Project | null;
  projects: Project[];
  cliStatus: CLIStatus | null;
  isLoading: boolean;
  error: string | null;
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
  planningChatMessages: ChatMessage[];

  // Actions
  initialize: () => Promise<void>;
  setScreen: (screen: Screen) => void;
  setCurrentProject: (project: Project | null) => void;
  setProjects: (projects: Project[]) => void;
  setCLIStatus: (status: CLIStatus) => void;
  setError: (error: string | null) => void;
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
  saveBacklog: () => Promise<void>;
  loadBacklog: () => Promise<void>;

  // Planning chat actions
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
  tasks: [],
  chatMessages: [],
  terminalOutput: [],
  buildSessionId: null,
  flowTestMode: false,

  // Git events initial state
  gitEvents: [],

  // Planning V2 initial state
  backlog: [],
  planningChats: [],
  activePlanningChatId: null,
  planningChatMessages: [],

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

        // Navigate to appropriate screen based on project status
        switch (project.status) {
          case 'idea':
            set({ screen: 'idea' });
            break;
          case 'discovery':
            set({ screen: 'discovery' });
            break;
          case 'planning':
            set({ screen: 'planning' });
            break;
          case 'building':
            set({ screen: 'building' });
            break;
          case 'previewing':
            set({ screen: 'previewing' });
            break;
          case 'deploying':
            set({ screen: 'deploying' });
            break;
          case 'complete':
            set({ screen: 'complete' });
            break;
          default:
            set({ screen: 'home' });
        }
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
  setTasks: (tasks) => set({ tasks }),

  addTask: (title) => {
    const newTask: Task = {
      id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title,
      completed: false,
    };
    set((state) => ({ tasks: [...state.tasks, newTask] }));
  },

  updateTask: (id, updates) => {
    set((state) => ({
      tasks: state.tasks.map((task) =>
        task.id === id ? { ...task, ...updates } : task
      ),
    }));
  },

  removeTask: (id) => {
    set((state) => ({
      tasks: state.tasks.filter((task) => task.id !== id),
    }));
  },

  reorderTasks: (tasks) => set({ tasks }),

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
    const newMessage: ChatMessage = {
      ...message,
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
    };
    set((state) => ({
      chatMessages: [...state.chatMessages, newMessage],
    }));
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
    const newItem: BacklogItem = {
      ...item,
      id: `backlog-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date().toISOString(),
    };
    set((state) => ({ backlog: [...state.backlog, newItem] }));
  },

  updateBacklogItem: (id, updates) => {
    set((state) => ({
      backlog: state.backlog.map((item) =>
        item.id === id ? { ...item, ...updates } : item
      ),
    }));
  },

  removeBacklogItem: (id) => {
    set((state) => ({
      backlog: state.backlog.filter((item) => item.id !== id),
    }));
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

  // Planning chat actions
  createPlanningChat: (title) => {
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
      planningChatMessages: [],
    }));
    return chatId;
  },

  setActivePlanningChat: (chatId) => {
    const { planningChats } = get();
    const chat = planningChats.find((c) => c.id === chatId);
    set({
      activePlanningChatId: chatId,
      planningChatMessages: chat?.messages || [],
    });
  },

  addPlanningMessage: (message) => {
    const newMessage: ChatMessage = {
      ...message,
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
    };
    set((state) => {
      const updatedMessages = [...state.planningChatMessages, newMessage];
      // Also update the chat in planningChats
      const updatedChats = state.planningChats.map((chat) =>
        chat.id === state.activePlanningChatId
          ? { ...chat, messages: updatedMessages, updatedAt: new Date().toISOString() }
          : chat
      );
      return {
        planningChatMessages: updatedMessages,
        planningChats: updatedChats,
      };
    });
  },

  deletePlanningChat: (chatId) => {
    const { planningChats, activePlanningChatId } = get();
    const filtered = planningChats.filter((c) => c.id !== chatId);

    // If we deleted the active chat, select another or clear
    if (chatId === activePlanningChatId) {
      if (filtered.length > 0) {
        // Select the most recent remaining chat
        const sorted = [...filtered].sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
        set({
          planningChats: filtered,
          activePlanningChatId: sorted[0].id,
          planningChatMessages: sorted[0].messages,
        });
      } else {
        set({
          planningChats: filtered,
          activePlanningChatId: null,
          planningChatMessages: [],
        });
      }
    } else {
      set({ planningChats: filtered });
    }
  },

  renamePlanningChat: (chatId, newTitle) => {
    const { planningChats } = get();
    const updated = planningChats.map((chat) =>
      chat.id === chatId
        ? { ...chat, title: newTitle, updatedAt: new Date().toISOString() }
        : chat
    );
    set({ planningChats: updated });
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
    set((state) => ({ gitEvents: [...state.gitEvents, newEvent] }));
    // Auto-save: capture slug now so even if project changes, we write to the right place
    const slug = currentProject.slug;
    window.api.storage.saveGitEvents(slug, get().gitEvents).catch((err) => {
      console.error('Failed to save git events:', err);
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
      planningChats: [],
      activePlanningChatId: null,
      planningChatMessages: [],
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
      planningChats: [],
      activePlanningChatId: null,
      planningChatMessages: [],
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
