import { StateCreator } from 'zustand';
import type { AppState } from '../useAppStore';
import type { Toast } from '../storeTypes';
import { buildTaskCompleteMessage, buildErrorMessage } from '../../utils/houstonGreeting';

export interface NotificationsSlice {
  houstonGreeting: string | null;
  houstonApproval: {
    taskTitle: string;
    completedCount: number;
    totalCount: number;
    remaining: number;
  } | null;
  houstonErrorContext: {
    taskTitle: string;
    errorHint: string;
    timestamp: number;
  } | null;
  toasts: Toast[];

  clearHoustonGreeting: () => void;
  notifyHoustonBuildComplete: (taskTitle: string) => void;
  notifyHoustonBuildError: (taskTitle: string, errorHint?: string) => void;
  notifyHoustonTaskApproval: (taskTitle: string, completedCount: number, totalCount: number, remaining: number) => void;
  clearHoustonApproval: () => void;
  clearHoustonErrorContext: () => void;
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

export const NOTIFICATIONS_INITIAL_STATE = {
  houstonGreeting: null as string | null,
  houstonApproval: null as NotificationsSlice['houstonApproval'],
  houstonErrorContext: null as NotificationsSlice['houstonErrorContext'],
  toasts: [] as Toast[],
};

export const createNotificationsSlice: StateCreator<AppState, [], [], NotificationsSlice> = (set, get) => ({
  ...NOTIFICATIONS_INITIAL_STATE,

  clearHoustonGreeting: () => set({ houstonGreeting: null }),

  notifyHoustonBuildComplete: (taskTitle) => {
    const { tasks } = get();
    const completedCount = tasks.filter((t) => t.completed).length;
    const msg = buildTaskCompleteMessage(taskTitle, completedCount, tasks.length);
    set({ houstonGreeting: msg });
  },

  notifyHoustonBuildError: (taskTitle, errorHint) => {
    const msg = buildErrorMessage(taskTitle, errorHint);
    set({
      houstonGreeting: msg,
      houstonErrorContext: {
        taskTitle,
        errorHint: errorHint || 'Check the build log for details.',
        timestamp: Date.now(),
      },
    });
  },

  notifyHoustonTaskApproval: (taskTitle, completedCount, totalCount, remaining) => {
    set({
      houstonApproval: { taskTitle, completedCount, totalCount, remaining },
    });
  },

  clearHoustonApproval: () => set({ houstonApproval: null }),
  clearHoustonErrorContext: () => set({ houstonErrorContext: null }),

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
