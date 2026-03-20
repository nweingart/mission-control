import { StateCreator } from 'zustand';
import type { AppState } from '../useAppStore';
import type { Task } from '../../types';
import { persistQueued } from '../../utils/persist';

export interface TasksSlice {
  tasks: Task[];

  setTasks: (tasks: Task[]) => void;
  setTasksTransient: (tasks: Task[]) => void;
  addTask: (title: string) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  removeTask: (id: string) => void;
  reorderTasks: (tasks: Task[]) => void;
  saveTasks: () => Promise<void>;
  loadTasks: () => Promise<void>;
}

export const TASKS_INITIAL_STATE = {
  tasks: [] as Task[],
};

function saveTasks(get: () => AppState): void {
  const { currentProject, tasks } = get();
  if (currentProject) {
    persistQueued(currentProject.slug, 'tasks', tasks, window.api.storage.saveTasks);
  }
}

export const createTasksSlice: StateCreator<AppState, [], [], TasksSlice> = (set, get) => ({
  ...TASKS_INITIAL_STATE,

  setTasks: (tasks) => {
    set({ tasks });
    saveTasks(get);
  },

  setTasksTransient: (tasks) => {
    set({ tasks });
  },

  addTask: (title) => {
    const newTask: Task = {
      id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title,
      completed: false,
    };
    set((state) => ({ tasks: [...state.tasks, newTask] }));
    saveTasks(get);
  },

  updateTask: (id, updates) => {
    set((state) => ({
      tasks: state.tasks.map((task) =>
        task.id === id ? { ...task, ...updates } : task
      ),
    }));
    saveTasks(get);
  },

  removeTask: (id) => {
    set((state) => ({
      tasks: state.tasks.filter((task) => task.id !== id),
    }));
    saveTasks(get);
  },

  reorderTasks: (tasks) => {
    set({ tasks });
    saveTasks(get);
  },

  saveTasks: async () => {
    const { currentProject, tasks } = get();
    if (currentProject) {
      try {
        await window.api.storage.saveTasks(currentProject.slug, tasks);
      } catch (err) {
        console.error('Failed to save tasks:', err);
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
        set({ tasks: [] });
      }
    }
  },
});
