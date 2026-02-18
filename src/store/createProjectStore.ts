import { createStore } from 'zustand';
import type { AppState } from './useAppStore';
import { createProjectSlice } from './slices/projectSlice';
import { createTasksSlice } from './slices/tasksSlice';
import { createBuildSlice } from './slices/buildSlice';
import { createChatSlice } from './slices/chatSlice';
import { createPlanningChatSlice } from './slices/planningChatSlice';
import { createPlanningSlice } from './slices/planningSlice';
import { createActivitySlice } from './slices/activitySlice';
import { createGamificationSlice } from './slices/gamificationSlice';
import { createNavigationSlice } from './slices/navigationSlice';
import { createNotificationsSlice } from './slices/notificationsSlice';
import { createAppSlice } from './slices/appSlice';

export function createProjectStore() {
  return createStore<AppState>((...args) => ({
    ...createProjectSlice(...args),
    ...createTasksSlice(...args),
    ...createBuildSlice(...args),
    ...createChatSlice(...args),
    ...createPlanningChatSlice(...args),
    ...createPlanningSlice(...args),
    ...createActivitySlice(...args),
    ...createGamificationSlice(...args),
    ...createNavigationSlice(...args),
    ...createNotificationsSlice(...args),
    ...createAppSlice(...args),
  }));
}
