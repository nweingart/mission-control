import { vi } from 'vitest';

// Mock electron module globally
vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name === 'home') return '/mock-home';
      if (name === 'userData') return '/mock-home/.kiln';
      return `/mock-${name}`;
    },
  },
  BrowserWindow: vi.fn(),
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
  },
}));

// Mock node-pty globally
vi.mock('node-pty', () => ({
  default: {
    spawn: vi.fn(),
  },
  spawn: vi.fn(),
}));
