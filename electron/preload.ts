import { contextBridge, ipcRenderer } from 'electron';

// Type for output callbacks
type OutputCallback = (data: { sessionId?: string; type: 'stdout' | 'stderr'; content: string }) => void;
type ExitCallback = (data: { sessionId: string; code: number }) => void;

// Use a Map for efficient listener management - one listener per channel
const listenerMap = new Map<string, (...args: unknown[]) => void>();

/**
 * Creates a listener for a channel, replacing any existing listener for that channel.
 * This prevents listener accumulation when components re-register.
 */
function createListener(channel: string, callback: (...args: unknown[]) => void) {
  // Remove existing listener for this channel if present
  const existingListener = listenerMap.get(channel);
  if (existingListener) {
    ipcRenderer.removeListener(channel, existingListener);
  }

  // Create and register new listener
  const listener = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => {
    try {
      callback(...args);
    } catch (err) {
      console.error(`Error in listener callback for ${channel}:`, err);
    }
  };

  ipcRenderer.on(channel, listener);
  listenerMap.set(channel, listener);
}

/**
 * Removes all listeners for channels that start with the given prefix.
 */
function removeAllListeners(prefix: string) {
  const channelsToRemove: string[] = [];

  listenerMap.forEach((listener, channel) => {
    if (channel.startsWith(prefix)) {
      ipcRenderer.removeListener(channel, listener);
      channelsToRemove.push(channel);
    }
  });

  // Clean up the map
  channelsToRemove.forEach(channel => listenerMap.delete(channel));
}

contextBridge.exposeInMainWorld('api', {
  // Storage
  storage: {
    getConfig: () => ipcRenderer.invoke('storage:getConfig'),
    saveConfig: (config: unknown) => ipcRenderer.invoke('storage:saveConfig', config),
    listProjects: () => ipcRenderer.invoke('storage:listProjects'),
    getProject: (slug: string) => ipcRenderer.invoke('storage:getProject', slug),
    createProject: (name: string, idea: string) => ipcRenderer.invoke('storage:createProject', name, idea),
    updateProject: (slug: string, updates: unknown) => ipcRenderer.invoke('storage:updateProject', slug, updates),
    deleteProject: (slug: string) => ipcRenderer.invoke('storage:deleteProject', slug),
    getTasks: (slug: string) => ipcRenderer.invoke('storage:getTasks', slug),
    saveTasks: (slug: string, tasks: unknown) => ipcRenderer.invoke('storage:saveTasks', slug, tasks),
    getPRD: (slug: string) => ipcRenderer.invoke('storage:getPRD', slug),
    savePRD: (slug: string, prd: string) => ipcRenderer.invoke('storage:savePRD', slug, prd),
    getChatHistory: (slug: string) => ipcRenderer.invoke('storage:getChatHistory', slug),
    saveChatHistory: (slug: string, messages: unknown) => ipcRenderer.invoke('storage:saveChatHistory', slug, messages),
    getBacklog: (slug: string) => ipcRenderer.invoke('storage:getBacklog', slug),
    saveBacklog: (slug: string, items: unknown) => ipcRenderer.invoke('storage:saveBacklog', slug, items),
    getPlanningChats: (slug: string) => ipcRenderer.invoke('storage:getPlanningChats', slug),
    savePlanningChats: (slug: string, chats: unknown) => ipcRenderer.invoke('storage:savePlanningChats', slug, chats),
  },

  // CLI Check
  cli: {
    checkAll: () => ipcRenderer.invoke('cli:checkAll'),
    checkClaude: () => ipcRenderer.invoke('cli:checkClaude'),
    checkClaudeDeep: () => ipcRenderer.invoke('cli:checkClaudeDeep'),
    checkGitHub: () => ipcRenderer.invoke('cli:checkGitHub'),
    checkVercel: () => ipcRenderer.invoke('cli:checkVercel'),
    checkSupabase: () => ipcRenderer.invoke('cli:checkSupabase'),
    saveVercelToken: (token: string) => ipcRenderer.invoke('cli:saveVercelToken', token),
  },

  // Claude Code
  claude: {
    spawn: (projectPath: string, prompt: string) => {
      console.log('[preload] claude.spawn called, projectPath:', projectPath);
      return ipcRenderer.invoke('claude:spawn', projectPath, prompt);
    },
    spawnInteractive: (projectPath: string) => {
      console.log('[preload] claude.spawnInteractive called, projectPath:', projectPath);
      return ipcRenderer.invoke('claude:spawnInteractive', projectPath);
    },
    chat: (projectPath: string, prompt: string) => {
      console.log('[preload] claude.chat called');
      console.log('[preload] projectPath:', projectPath);
      console.log('[preload] prompt length:', prompt?.length);
      const result = ipcRenderer.invoke('claude:chat', projectPath, prompt) as Promise<string>;
      result.then(
        (response) => console.log('[preload] claude.chat resolved, response length:', response?.length),
        (error) => console.error('[preload] claude.chat rejected:', error)
      );
      return result;
    },
    onOutput: (callback: OutputCallback) => createListener('claude:output', callback),
    onChatOutput: (callback: (content: string) => void) => createListener('claude:chatOutput', callback),
    onExit: (callback: ExitCallback) => createListener('claude:exit', callback),
    sendInput: (sessionId: string, input: string) => ipcRenderer.invoke('claude:sendInput', sessionId, input),
    resize: (sessionId: string, cols: number, rows: number) => ipcRenderer.invoke('claude:resize', sessionId, cols, rows),
    kill: (sessionId: string) => ipcRenderer.invoke('claude:kill', sessionId),
    removeListeners: () => removeAllListeners('claude:'),
  },

  // Vercel
  vercel: {
    deploy: (projectPath: string, envVars?: Record<string, string>) =>
      ipcRenderer.invoke('vercel:deploy', projectPath, envVars),
    onOutput: (callback: OutputCallback) => createListener('vercel:output', callback),
    removeListeners: () => removeAllListeners('vercel:'),
  },

  // GitHub
  github: {
    checkGitStatus: (projectPath: string) =>
      ipcRenderer.invoke('github:checkGitStatus', projectPath),
    gitInit: (projectPath: string) =>
      ipcRenderer.invoke('github:gitInit', projectPath),
    ensureGitignore: (projectPath: string) =>
      ipcRenderer.invoke('github:ensureGitignore', projectPath),
    ensureGitConfig: (projectPath: string, username: string) =>
      ipcRenderer.invoke('github:ensureGitConfig', projectPath, username),
    gitAddAndCommit: (projectPath: string, message: string) =>
      ipcRenderer.invoke('github:gitAddAndCommit', projectPath, message),
    createRepoAndPush: (projectPath: string, name: string) =>
      ipcRenderer.invoke('github:createRepoAndPush', projectPath, name),
    gitPush: (projectPath: string) =>
      ipcRenderer.invoke('github:gitPush', projectPath),
    getUsername: () =>
      ipcRenderer.invoke('github:getUsername'),
    resetWorkingTree: (projectPath: string) =>
      ipcRenderer.invoke('github:resetWorkingTree', projectPath),
    getCurrentBranch: (projectPath: string) =>
      ipcRenderer.invoke('github:getCurrentBranch', projectPath),
    createAndCheckoutBranch: (projectPath: string, branchName: string) =>
      ipcRenderer.invoke('github:createAndCheckoutBranch', projectPath, branchName),
    checkoutBranch: (projectPath: string, branchName: string) =>
      ipcRenderer.invoke('github:checkoutBranch', projectPath, branchName),
    mergeBranch: (projectPath: string, branchName: string) =>
      ipcRenderer.invoke('github:mergeBranch', projectPath, branchName),
    renameBranch: (projectPath: string, newName: string) =>
      ipcRenderer.invoke('github:renameBranch', projectPath, newName),
    deleteBranch: (projectPath: string, branchName: string) =>
      ipcRenderer.invoke('github:deleteBranch', projectPath, branchName),
    getDiff: (projectPath: string, base?: string) =>
      ipcRenderer.invoke('github:getDiff', projectPath, base),
    getDiffStat: (projectPath: string, base: string) =>
      ipcRenderer.invoke('github:getDiffStat', projectPath, base),
    onOutput: (callback: OutputCallback) => createListener('github:output', callback),
    removeListeners: () => removeAllListeners('github:'),
  },

  // Supabase
  supabase: {
    createProject: (name: string) => ipcRenderer.invoke('supabase:createProject', name),
    runMigrations: (projectPath: string, supabaseRef: string) =>
      ipcRenderer.invoke('supabase:runMigrations', projectPath, supabaseRef),
    onOutput: (callback: OutputCallback) => createListener('supabase:output', callback),
    removeListeners: () => removeAllListeners('supabase:'),
  },

  // Dialog
  dialog: {
    selectDirectory: (defaultPath?: string) => ipcRenderer.invoke('dialog:selectDirectory', defaultPath),
  },

  // File System (limited operations for E2E testing)
  fs: {
    readdir: (path: string) => ipcRenderer.invoke('fs:readdir', path),
  },

  // Shell
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
    openPath: (path: string) => ipcRenderer.invoke('shell:openPath', path),
    openInEditor: (path: string) => ipcRenderer.invoke('shell:openInEditor', path),
    openInTerminal: (command: string) => ipcRenderer.invoke('shell:openInTerminal', command),
  },

  // Dev Server (for preview)
  devServer: {
    start: (projectPath: string) => ipcRenderer.invoke('devServer:start', projectPath),
    stop: () => ipcRenderer.invoke('devServer:stop'),
    openBrowser: (url: string) => ipcRenderer.invoke('devServer:openBrowser', url),
    onOutput: (callback: (data: { sessionId: string; content: string }) => void) =>
      createListener('devServer:output', callback),
    onExit: (callback: (data: { sessionId: string; code: number }) => void) =>
      createListener('devServer:exit', callback),
    removeListeners: () => removeAllListeners('devServer:'),
  },

  // Setup (for running install/auth commands)
  setup: {
    runCommand: (command: string, sessionId: string) =>
      ipcRenderer.invoke('setup:runCommand', command, sessionId),
    sendInput: (sessionId: string, input: string) =>
      ipcRenderer.invoke('setup:sendInput', sessionId, input),
    killSession: (sessionId: string) =>
      ipcRenderer.invoke('setup:killSession', sessionId),
    openInTerminal: (command: string) =>
      ipcRenderer.invoke('setup:openInTerminal', command),
    onOutput: (callback: (data: { sessionId: string; content: string }) => void) =>
      createListener('setup:output', callback),
    onExit: (callback: (data: { sessionId: string; code: number }) => void) =>
      createListener('setup:exit', callback),
    removeListeners: () => removeAllListeners('setup:'),
  },
});
