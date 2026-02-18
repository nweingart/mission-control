import type { StoreApi } from 'zustand';
import type { AppState } from './useAppStore';
import { createProjectStore } from './createProjectStore';

const stores = new Map<string, StoreApi<AppState>>();

export function getOrCreateProjectStore(slug: string): StoreApi<AppState> {
  let store = stores.get(slug);
  if (!store) {
    store = createProjectStore();
    stores.set(slug, store);
  }
  return store;
}

export function getProjectStoreBySlug(slug: string): StoreApi<AppState> | undefined {
  return stores.get(slug);
}

export function destroyProjectStore(slug: string): void {
  stores.delete(slug);
}

export const projectStoreRegistry = {
  get: getProjectStoreBySlug,
  getOrCreate: getOrCreateProjectStore,
  destroy: destroyProjectStore,
};
