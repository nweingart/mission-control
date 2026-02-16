import { StateCreator } from 'zustand';
import type { AppState } from '../useAppStore';
import type { Task } from '../../types';

export interface TasksSlice {
  tasks: Task[];

  setTasks: (tasks: Task[]) => void;
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

export const createTasksSlice: StateCreator<AppState, [], [], TasksSlice> = (set, get) => ({
  ...TASKS_INITIAL_STATE,

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
