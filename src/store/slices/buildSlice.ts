import { StateCreator } from 'zustand';
import type { AppState } from '../useAppStore';
import type { TaskPhase } from '../../types';
import { MAX_TERMINAL_LINES } from '../storeTypes';

export interface BuildSlice {
  terminalOutput: string[];
  buildSessionId: string | null;
  buildTaskPhase: TaskPhase;
  buildCurrentTaskId: string | null;
  buildSessionActive: boolean;

  appendTerminalOutput: (line: string) => void;
  clearTerminalOutput: () => void;
  setBuildSessionId: (sessionId: string | null) => void;
  setBuildTaskPhase: (phase: TaskPhase) => void;
  setBuildCurrentTaskId: (id: string | null) => void;
  setBuildSessionActive: (active: boolean) => void;
}

export const BUILD_INITIAL_STATE = {
  terminalOutput: [] as string[],
  buildSessionId: null as string | null,
  buildTaskPhase: 'idle' as TaskPhase,
  buildCurrentTaskId: null as string | null,
  buildSessionActive: false,
};

export const createBuildSlice: StateCreator<AppState, [], [], BuildSlice> = (set) => ({
  ...BUILD_INITIAL_STATE,

  appendTerminalOutput: (line) => {
    set((state) => {
      const newOutput = [...state.terminalOutput, line];
      if (newOutput.length > MAX_TERMINAL_LINES) {
        return { terminalOutput: newOutput.slice(-MAX_TERMINAL_LINES) };
      }
      return { terminalOutput: newOutput };
    });
  },

  clearTerminalOutput: () => set({ terminalOutput: [] }),
  setBuildSessionId: (sessionId) => set({ buildSessionId: sessionId }),
  setBuildTaskPhase: (phase) => set({ buildTaskPhase: phase }),
  setBuildCurrentTaskId: (id) => set({ buildCurrentTaskId: id }),
  setBuildSessionActive: (active) => set({ buildSessionActive: active }),
});
