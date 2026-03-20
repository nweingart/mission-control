import { StateCreator } from 'zustand';
import type { AppState } from '../useAppStore';
import type { ChatMessage } from '../../types';
import { MAX_CHAT_MESSAGES } from '../storeTypes';
import { persistQueued } from '../../utils/persist';

export interface ChatSlice {
  chatMessages: ChatMessage[];

  addChatMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  setChatMessages: (messages: ChatMessage[]) => void;
  saveChatHistory: () => Promise<void>;
  loadChatHistory: () => Promise<void>;
}

export const CHAT_INITIAL_STATE = {
  chatMessages: [] as ChatMessage[],
};

export const createChatSlice: StateCreator<AppState, [], [], ChatSlice> = (set, get) => ({
  ...CHAT_INITIAL_STATE,

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
      persistQueued(currentProject.slug, 'chatMessages', get().chatMessages, window.api.storage.saveChatHistory);
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
        set({ chatMessages: [] });
      }
    }
  },
});
