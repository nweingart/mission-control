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
  oneOffBacklogItemId: string | null;
  activeBuildChatIds: string[];

  appendTerminalOutput: (line: string) => void;
  clearTerminalOutput: () => void;
  setBuildSessionId: (sessionId: string | null) => void;
  setBuildTaskPhase: (phase: TaskPhase) => void;
  setBuildCurrentTaskId: (id: string | null) => void;
  setBuildSessionActive: (active: boolean) => void;
  setOneOffBacklogItemId: (id: string | null) => void;
  setActiveBuildChatIds: (ids: string[]) => void;

  // Pipeline callback slots — registered by useBuildPipeline, consumed by Assistant directives
  buildPipelineResume: (() => void) | null;
  setBuildPipelineResume: (fn: (() => void) | null) => void;
  resumeBuildPipeline: () => void;

  buildPipelineAutoApprove: ((value: boolean) => void) | null;
  setBuildPipelineAutoApprove: (fn: ((v: boolean) => void) | null) => void;
}

export const BUILD_INITIAL_STATE = {
  terminalOutput: [] as string[],
  buildSessionId: null as string | null,
  buildTaskPhase: 'idle' as TaskPhase,
  buildCurrentTaskId: null as string | null,
  buildSessionActive: false,
  oneOffBacklogItemId: null as string | null,
  activeBuildChatIds: [] as string[],
  buildPipelineResume: null as (() => void) | null,
  buildPipelineAutoApprove: null as ((value: boolean) => void) | null,
};

export const createBuildSlice: StateCreator<AppState, [], [], BuildSlice> = (set, get) => ({
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
  setOneOffBacklogItemId: (id) => set({ oneOffBacklogItemId: id }),
  setActiveBuildChatIds: (ids) => set({ activeBuildChatIds: ids }),

  setBuildPipelineResume: (fn) => set({ buildPipelineResume: fn }),
  resumeBuildPipeline: () => {
    const fn = get().buildPipelineResume;
    if (fn) fn();
  },
  setBuildPipelineAutoApprove: (fn) => set({ buildPipelineAutoApprove: fn }),
});
