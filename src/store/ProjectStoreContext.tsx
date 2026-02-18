import { createContext, useContext } from 'react';
import { useStore, type StoreApi } from 'zustand';
import type { AppState } from './useAppStore';
import { useAppStore } from './useAppStore';
import { projectStoreRegistry } from './projectStoreRegistry';
import { createProjectStore } from './createProjectStore';

const ProjectStoreCtx = createContext<StoreApi<AppState> | null>(null);

export function ProjectStoreProvider({ store, children }: { store: StoreApi<AppState>; children: React.ReactNode }) {
  return <ProjectStoreCtx.Provider value={store}>{children}</ProjectStoreCtx.Provider>;
}

export function useProjectStore(): AppState;
export function useProjectStore<T>(selector: (state: AppState) => T): T;
export function useProjectStore<T>(selector?: (state: AppState) => T) {
  const store = useContext(ProjectStoreCtx);
  if (!store) throw new Error('useProjectStore must be used inside ProjectStoreProvider');
  return selector ? useStore(store, selector) : useStore(store);
}

export function useProjectStoreApi(): StoreApi<AppState> {
  const store = useContext(ProjectStoreCtx);
  if (!store) throw new Error('useProjectStoreApi must be used inside ProjectStoreProvider');
  return store;
}

// Empty fallback store for when no project is active
const EMPTY_STORE = createProjectStore();

export function useActiveProjectStore<T>(selector: (state: AppState) => T): T {
  const activeSlug = useAppStore(s => s.activeProjectSlug);
  const store = activeSlug ? (projectStoreRegistry.get(activeSlug) ?? EMPTY_STORE) : EMPTY_STORE;
  return useStore(store, selector);
}
