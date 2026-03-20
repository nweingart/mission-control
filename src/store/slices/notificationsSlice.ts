import { StateCreator } from 'zustand';
import type { AppState } from '../useAppStore';
import type { Toast } from '../storeTypes';
import type { HumanTask } from '../../types';
import { buildTaskCompleteMessage, buildErrorMessage } from '../../utils/assistantMessages';

export interface NotificationsSlice {
  assistantGreeting: string | null;
  assistantApproval: {
    taskTitle: string;
    completedCount: number;
    totalCount: number;
    remaining: number;
    tierCompletedTaskTitles: string[];
    diffStat: string;
    reviewSummary: string;
  } | null;
  assistantErrorContext: {
    taskTitle: string;
    errorHint: string;
    errorOutput: string;
    timestamp: number;
  } | null;
  assistantHumanTaskContext: {
    tasks: HumanTask[];
    timestamp: number;
  } | null;
  toasts: Toast[];

  clearAssistantGreeting: () => void;
  notifyAssistantBuildComplete: (taskTitle: string) => void;
  notifyAssistantBuildError: (taskTitle: string, errorHint?: string, errorOutput?: string) => void;
  notifyAssistantTaskApproval: (taskTitle: string, completedCount: number, totalCount: number, remaining: number, tierCompletedTaskTitles?: string[], diffStat?: string, reviewSummary?: string) => void;
  clearAssistantApproval: () => void;
  clearAssistantErrorContext: () => void;
  notifyAssistantHumanTasks: (tasks: HumanTask[]) => void;
  clearAssistantHumanTaskContext: () => void;
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

export const NOTIFICATIONS_INITIAL_STATE = {
  assistantGreeting: null as string | null,
  assistantApproval: null as NotificationsSlice['assistantApproval'],
  assistantErrorContext: null as NotificationsSlice['assistantErrorContext'],
  assistantHumanTaskContext: null as NotificationsSlice['assistantHumanTaskContext'],
  toasts: [] as Toast[],
};

export const createNotificationsSlice: StateCreator<AppState, [], [], NotificationsSlice> = (set, get) => ({
  ...NOTIFICATIONS_INITIAL_STATE,

  clearAssistantGreeting: () => set({ assistantGreeting: null }),

  notifyAssistantBuildComplete: (taskTitle) => {
    const { tasks } = get();
    const completedCount = tasks.filter((t) => t.completed).length;
    const msg = buildTaskCompleteMessage(taskTitle, completedCount, tasks.length);
    set({ assistantGreeting: msg });
  },

  notifyAssistantBuildError: (taskTitle, errorHint, errorOutput) => {
    const msg = buildErrorMessage(taskTitle, errorHint);
    set({
      assistantGreeting: msg,
      assistantErrorContext: {
        taskTitle,
        errorHint: errorHint || 'Check the build log for details.',
        errorOutput: errorOutput || '',
        timestamp: Date.now(),
      },
    });
  },

  notifyAssistantTaskApproval: (taskTitle, completedCount, totalCount, remaining, tierCompletedTaskTitles, diffStat, reviewSummary) => {
    set({
      assistantApproval: {
        taskTitle,
        completedCount,
        totalCount,
        remaining,
        tierCompletedTaskTitles: tierCompletedTaskTitles || [],
        diffStat: diffStat || '',
        reviewSummary: reviewSummary || '',
      },
    });
  },

  clearAssistantApproval: () => set({ assistantApproval: null }),
  clearAssistantErrorContext: () => set({ assistantErrorContext: null }),

  notifyAssistantHumanTasks: (tasks) => {
    set({
      assistantHumanTaskContext: {
        tasks,
        timestamp: Date.now(),
      },
    });
  },

  clearAssistantHumanTaskContext: () => set({ assistantHumanTaskContext: null }),

  addToast: (toast) => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    set((state) => ({
      toasts: [...state.toasts.slice(-4), { ...toast, id }],
    }));
  },

  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },
});
