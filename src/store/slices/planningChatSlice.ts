import { StateCreator } from 'zustand';
import type { AppState } from '../useAppStore';
import type { ChatMessage, PlanningChat } from '../../types';

export interface PlanningChatSlice {
  planningChats: PlanningChat[];
  activePlanningChatId: string | null;

  getActivePlanningMessages: () => ChatMessage[];
  createPlanningChat: (title?: string) => string;
  setActivePlanningChat: (chatId: string | null) => void;
  addPlanningMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  deletePlanningChat: (chatId: string) => void;
  renamePlanningChat: (chatId: string, newTitle: string) => void;
  savePlanningChats: () => Promise<void>;
  loadPlanningChats: () => Promise<void>;
  goToPlanningChats: () => void;
}

export const PLANNING_CHAT_INITIAL_STATE = {
  planningChats: [] as PlanningChat[],
  activePlanningChatId: null as string | null,
};

export const createPlanningChatSlice: StateCreator<AppState, [], [], PlanningChatSlice> = (set, get) => ({
  ...PLANNING_CHAT_INITIAL_STATE,

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
});
