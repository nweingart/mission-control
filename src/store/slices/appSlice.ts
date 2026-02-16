import { StateCreator } from 'zustand';
import type { AppState } from '../useAppStore';
import type { CLIStatus, Screen } from '../../types';
import type { AuthUser } from '../storeTypes';

export interface AppSlice {
  isLoading: boolean;
  error: string | null;
  saveError: string | null;
  cliStatus: CLIStatus | null;
  flowTestMode: boolean;
  authUser: AuthUser | null;
  subscriptionStatus: 'active' | 'inactive' | null;

  setError: (error: string | null) => void;
  setSaveError: (error: string | null) => void;
  setLoading: (loading: boolean) => void;
  setCLIStatus: (status: CLIStatus) => void;
  setFlowTestMode: (mode: boolean) => void;

  // Onboarding actions
  completeOnboardingStage: (stage: number, data?: { workspacePath?: string }) => Promise<void>;
  resetOnboarding: () => Promise<void>;

  // Auth & subscription actions
  setAuthUser: (user: AuthUser | null) => void;
  setSubscriptionStatus: (status: 'active' | 'inactive') => void;
  signOut: () => Promise<void>;
  checkSubscription: () => Promise<void>;
}

export const APP_INITIAL_STATE = {
  isLoading: true,
  error: null as string | null,
  saveError: null as string | null,
  cliStatus: null as CLIStatus | null,
  flowTestMode: false,
  authUser: null as AuthUser | null,
  subscriptionStatus: null as 'active' | 'inactive' | null,
};

export const createAppSlice: StateCreator<AppState, [], [], AppSlice> = (set) => ({
  ...APP_INITIAL_STATE,

  setError: (error) => set({ error }),
  setSaveError: (error) => set({ saveError: error }),
  setLoading: (loading) => set({ isLoading: loading }),
  setCLIStatus: (status) => set({ cliStatus: status }),
  setFlowTestMode: (mode) => set({ flowTestMode: mode }),

  completeOnboardingStage: async (stage, data) => {
    try {
      const config = await window.api.storage.getConfig();
      if (stage === 1) {
        await window.api.storage.saveConfig({ ...config, hasCompletedOnboarding: true });
      } else if (stage === 2 && data?.workspacePath) {
        await window.api.storage.saveConfig({ ...config, developmentPath: data.workspacePath, hasSetWorkspace: true });
      }
    } catch (err) {
      console.error('Failed to complete onboarding stage:', err);
    }
  },

  resetOnboarding: async () => {
    try {
      const config = await window.api.storage.getConfig();
      await window.api.storage.saveConfig({ ...config, hasCompletedOnboarding: false, hasSetWorkspace: false });
      set({ screen: 'onboarding' } as Partial<AppState>);
    } catch (err) {
      console.error('Failed to reset onboarding:', err);
    }
  },

  setAuthUser: (user) => set({ authUser: user }),
  setSubscriptionStatus: (status) => set({ subscriptionStatus: status }),

  signOut: async () => {
    set({ authUser: null, subscriptionStatus: null });
  },

  checkSubscription: async () => {
    // Subscription checks not yet implemented
  },
});
