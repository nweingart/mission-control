import { create } from 'zustand';
import { BuildSlice, createBuildSlice } from './slices/buildSlice';
import { TasksSlice, createTasksSlice } from './slices/tasksSlice';
import { ChatSlice, createChatSlice } from './slices/chatSlice';
import { PlanningChatSlice, createPlanningChatSlice } from './slices/planningChatSlice';
import { AppSlice, createAppSlice } from './slices/appSlice';
import { NotificationsSlice, createNotificationsSlice } from './slices/notificationsSlice';
import { GamificationSlice, createGamificationSlice } from './slices/gamificationSlice';
import { ActivitySlice, createActivitySlice } from './slices/activitySlice';
import { PlanningSlice, createPlanningSlice } from './slices/planningSlice';
import { ProjectSlice, createProjectSlice } from './slices/projectSlice';
import { NavigationSlice, createNavigationSlice } from './slices/navigationSlice';

export type AppState =
  & BuildSlice
  & TasksSlice
  & ChatSlice
  & PlanningChatSlice
  & AppSlice
  & NotificationsSlice
  & GamificationSlice
  & ActivitySlice
  & PlanningSlice
  & ProjectSlice
  & NavigationSlice;

export const useAppStore = create<AppState>((set, get, api) => ({
  ...createBuildSlice(set, get, api),
  ...createTasksSlice(set, get, api),
  ...createChatSlice(set, get, api),
  ...createPlanningChatSlice(set, get, api),
  ...createAppSlice(set, get, api),
  ...createNotificationsSlice(set, get, api),
  ...createGamificationSlice(set, get, api),
  ...createActivitySlice(set, get, api),
  ...createPlanningSlice(set, get, api),
  ...createProjectSlice(set, get, api),
  ...createNavigationSlice(set, get, api),
}));
