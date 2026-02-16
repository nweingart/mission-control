export interface AuthUser {
  id: string;
  email: string;
  username: string;
}

export type Toast = {
  id: string;
  type: 'success' | 'warning' | 'error' | 'urgent';
  message: string;
  ctaLabel?: string;
  ctaAction?: () => void;
};

// Maximum collection sizes to prevent unbounded memory growth
export const MAX_TERMINAL_LINES = 5000;
export const MAX_CHAT_MESSAGES = 500;
export const MAX_GIT_EVENTS = 1000;
export const MAX_DEPLOYMENTS = 100;
export const MAX_GAP_ANALYSES = 50;
