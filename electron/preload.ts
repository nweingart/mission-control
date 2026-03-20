import { contextBridge, ipcRenderer } from 'electron';

// Type for output callbacks
type OutputCallback = (data: { sessionId?: string; type: 'stdout' | 'stderr'; content: string }) => void;
type ExitCallback = (data: { sessionId: string; code: number }) => void;

/** Validate that an IPC message has the expected fields with the expected types */
function validateIPC<T>(data: unknown, shape: Record<string, string>, channel: string): T | null {
  if (typeof data !== 'object' || data === null) {
    console.warn(`[IPC:${channel}] Expected object, got ${typeof data}`);
    return null;
  }
  const obj = data as Record<string, unknown>;
  for (const [key, expectedType] of Object.entries(shape)) {
    if (expectedType === 'any') continue; // skip validation for unknown/any fields
    if (!(key in obj) || typeof obj[key] !== expectedType) {
      console.warn(`[IPC:${channel}] Field "${key}" expected ${expectedType}, got ${typeof obj[key]}`);
      return null;
    }
  }
  return data as T;
}

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

// Per-task chat output handler registry for parallel execution
const chatOutputHandlers = new Map<string, (content: string) => void>();

// Per-task stream event handler registry for structured JSON streaming
const streamEventHandlers = new Map<string, (event: unknown) => void>();

// Per-task codex output handler registry (mirrors chatOutputHandlers)
const codexOutputHandlers = new Map<string, (content: string) => void>();

// Route codex chat output to per-task handlers
ipcRenderer.on('codex:chatOutput', (_event, data: unknown) => {
  const msg = validateIPC<{ chatId: string; content: string }>(data, { chatId: 'string', content: 'string' }, 'codex:chatOutput');
  if (msg) {
    const handler = codexOutputHandlers.get(msg.chatId);
    if (handler) handler(msg.content);
  }
});

// Route stream events to per-task handlers
ipcRenderer.on('claude:streamEvent', (_event, data: unknown) => {
  const msg = validateIPC<{ chatId: string; event: unknown }>(data, { chatId: 'string', event: 'any' }, 'claude:streamEvent');
  if (msg) {
    const handler = streamEventHandlers.get(msg.chatId);
    if (handler) handler(msg.event);
  }
});

// Single raw listener that routes based on chatId
ipcRenderer.on('claude:chatOutput', (_event, data: unknown) => {
  const msg = validateIPC<{ chatId: string; content: string }>(data, { chatId: 'string', content: 'string' }, 'claude:chatOutput');
  if (msg) {
    const handler = chatOutputHandlers.get(msg.chatId);
    if (handler) handler(msg.content);
    // Also fire legacy handler if one exists
    const legacy = chatOutputHandlers.get('__legacy__');
    if (legacy && msg.chatId !== '__legacy__') legacy(msg.content);
  } else if (typeof data === 'string') {
    // Backward compat: old-format string message
    const legacy = chatOutputHandlers.get('__legacy__');
    if (legacy) legacy(data);
  }
});

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
    getSprints: (slug: string) => ipcRenderer.invoke('storage:getSprints', slug),
    saveSprints: (slug: string, sprints: unknown) => ipcRenderer.invoke('storage:saveSprints', slug, sprints),
    getPlanningChats: (slug: string) => ipcRenderer.invoke('storage:getPlanningChats', slug),
    savePlanningChats: (slug: string, chats: unknown) => ipcRenderer.invoke('storage:savePlanningChats', slug, chats),
    getGitEvents: (slug: string) => ipcRenderer.invoke('storage:getGitEvents', slug),
    saveGitEvents: (slug: string, events: unknown) => ipcRenderer.invoke('storage:saveGitEvents', slug, events),
    getDeployments: (slug: string) => ipcRenderer.invoke('storage:getDeployments', slug),
    saveDeployments: (slug: string, deployments: unknown) => ipcRenderer.invoke('storage:saveDeployments', slug, deployments),
    getGapAnalysis: (slug: string) => ipcRenderer.invoke('storage:getGapAnalysis', slug),
    saveGapAnalysis: (slug: string, analyses: unknown) => ipcRenderer.invoke('storage:saveGapAnalysis', slug, analyses),
    getGamification: (slug: string) => ipcRenderer.invoke('storage:getGamification', slug),
    saveGamification: (slug: string, stats: unknown) => ipcRenderer.invoke('storage:saveGamification', slug, stats),

    // V2: Features, Issues, Scan History, Import
    getFeatures: (slug: string) => ipcRenderer.invoke('storage:getFeatures', slug),
    saveFeatures: (slug: string, features: unknown) => ipcRenderer.invoke('storage:saveFeatures', slug, features),
    getIssues: (slug: string) => ipcRenderer.invoke('storage:getIssues', slug),
    saveIssues: (slug: string, issues: unknown) => ipcRenderer.invoke('storage:saveIssues', slug, issues),
    getScanHistory: (slug: string) => ipcRenderer.invoke('storage:getScanHistory', slug),
    saveScanHistory: (slug: string, snapshots: unknown) => ipcRenderer.invoke('storage:saveScanHistory', slug, snapshots),
    importProject: (name: string, githubRepo: string, projectPath: string) => ipcRenderer.invoke('storage:importProject', name, githubRepo, projectPath),
  },

  // CLI Check
  cli: {
    checkAll: () => ipcRenderer.invoke('cli:checkAll'),
    checkClaude: () => ipcRenderer.invoke('cli:checkClaude'),
    checkClaudeDeep: () => ipcRenderer.invoke('cli:checkClaudeDeep'),
    checkGitHub: () => ipcRenderer.invoke('cli:checkGitHub'),
    checkCodex: () => ipcRenderer.invoke('cli:checkCodex'),
    checkCodexDeep: () => ipcRenderer.invoke('cli:checkCodexDeep'),
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
    chat: async (projectPath: string, prompt: string, inactivityTimeoutMs?: number, chatId?: string) => {
      const response = await ipcRenderer.invoke('claude:chat', projectPath, prompt, inactivityTimeoutMs, chatId) as string;
      return { response };
    },
    chatStreaming: async (projectPath: string, prompt: string, inactivityTimeoutMs?: number, chatId?: string) => {
      const response = await ipcRenderer.invoke('claude:chatStreaming', projectPath, prompt, inactivityTimeoutMs, chatId) as string;
      return { response };
    },
    chatWithResume: async (projectPath: string, prompt: string, sessionId: string | null, inactivityTimeoutMs?: number, chatId?: string) => {
      return await ipcRenderer.invoke('claude:chatWithResume', projectPath, prompt, sessionId, inactivityTimeoutMs, chatId) as { response: string; sessionId: string };
    },
    onOutput: (callback: OutputCallback) => createListener('claude:output', callback),
    onChatOutput: (callback: (content: string) => void) => {
      chatOutputHandlers.set('__legacy__', callback);
    },
    onChatOutputForTask: (chatId: string, callback: (content: string) => void) => {
      // Safety bound: if the Map grows beyond 50 entries (normal is 1-3),
      // purge all but the 10 most recent to prevent unbounded growth from missed cleanups.
      if (chatOutputHandlers.size > 50) {
        const keys = Array.from(chatOutputHandlers.keys());
        const toRemove = keys.slice(0, keys.length - 10);
        for (const k of toRemove) chatOutputHandlers.delete(k);
      }
      chatOutputHandlers.set(chatId, callback);
    },
    offChatOutputForTask: (chatId: string) => {
      chatOutputHandlers.delete(chatId);
    },
    onStreamEventForTask: (chatId: string, callback: (event: unknown) => void) => {
      if (streamEventHandlers.size > 50) {
        const keys = Array.from(streamEventHandlers.keys());
        const toRemove = keys.slice(0, keys.length - 10);
        for (const k of toRemove) streamEventHandlers.delete(k);
      }
      streamEventHandlers.set(chatId, callback);
    },
    offStreamEventForTask: (chatId: string) => {
      streamEventHandlers.delete(chatId);
    },
    onExit: (callback: ExitCallback) => createListener('claude:exit', callback),
    sendInput: (sessionId: string, input: string) => ipcRenderer.invoke('claude:sendInput', sessionId, input),
    resize: (sessionId: string, cols: number, rows: number) => ipcRenderer.invoke('claude:resize', sessionId, cols, rows),
    kill: (sessionId: string) => ipcRenderer.invoke('claude:kill', sessionId),
    cancelChat: (chatId?: string) => ipcRenderer.invoke('claude:cancelChat', chatId),
    enableCompletionDetection: (sessionId: string) => ipcRenderer.invoke('claude:enableCompletionDetection', sessionId),
    resetCompletionDetection: (sessionId: string) => ipcRenderer.invoke('claude:resetCompletionDetection', sessionId),
    confirmCompletion: (sessionId: string) => ipcRenderer.invoke('claude:confirmCompletion', sessionId),
    onCompletionDetected: (callback: (data: { sessionId: string }) => void) =>
      createListener('claude:completionDetected', callback),
    removeListeners: () => {
      removeAllListeners('claude:');
      chatOutputHandlers.clear();
      streamEventHandlers.clear();
    },
  },

  // Codex CLI
  codex: {
    chat: async (projectPath: string, prompt: string, inactivityTimeoutMs?: number, chatId?: string) => {
      const response = await ipcRenderer.invoke('codex:chat', projectPath, prompt, inactivityTimeoutMs, chatId) as string;
      return { response };
    },
    onChatOutputForTask: (chatId: string, callback: (content: string) => void) => {
      // Safety bound: same as claude handler — prevent unbounded growth
      if (codexOutputHandlers.size > 50) {
        const keys = Array.from(codexOutputHandlers.keys());
        const toRemove = keys.slice(0, keys.length - 10);
        for (const k of toRemove) codexOutputHandlers.delete(k);
      }
      codexOutputHandlers.set(chatId, callback);
    },
    offChatOutputForTask: (chatId: string) => {
      codexOutputHandlers.delete(chatId);
    },
    cancelChat: (chatId?: string) => ipcRenderer.invoke('codex:cancelChat', chatId),
    removeListeners: () => {
      removeAllListeners('codex:');
      codexOutputHandlers.clear();
    },
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
    branchExists: (projectPath: string, branchName: string) =>
      ipcRenderer.invoke('github:branchExists', projectPath, branchName),
    getDiff: (projectPath: string, base?: string) =>
      ipcRenderer.invoke('github:getDiff', projectPath, base),
    getDiffStat: (projectPath: string, base: string) =>
      ipcRenderer.invoke('github:getDiffStat', projectPath, base),
    getCommitDiff: (projectPath: string, commitHash: string) =>
      ipcRenderer.invoke('github:getCommitDiff', projectPath, commitHash),
    getTaskDiff: (projectPath: string, commitHashes: string[]) =>
      ipcRenderer.invoke('github:getTaskDiff', projectPath, commitHashes),
    setSecret: (repoFullName: string, name: string, value: string) =>
      ipcRenderer.invoke('github:setSecret', repoFullName, name, value),
    getWorkflowRuns: (projectPath: string, limit?: number) =>
      ipcRenderer.invoke('github:getWorkflowRuns', projectPath, limit),
    writeWorkflowFile: (projectPath: string, content: string) =>
      ipcRenderer.invoke('github:writeWorkflowFile', projectPath, content),
    runShellCommand: (cwd: string, command: string, args?: string[]) =>
      ipcRenderer.invoke('github:runShellCommand', cwd, command, args) as Promise<string>,
    deleteRepo: (repoUrl: string) => ipcRenderer.invoke('github:deleteRepo', repoUrl),
    createWorktree: (repoPath: string, worktreePath: string, branchName: string, startPoint?: string) =>
      ipcRenderer.invoke('github:createWorktree', repoPath, worktreePath, branchName, startPoint),
    removeWorktree: (repoPath: string, worktreePath: string) =>
      ipcRenderer.invoke('github:removeWorktree', repoPath, worktreePath),
    onOutput: (callback: OutputCallback) => createListener('github:output', callback),
    removeListeners: () => removeAllListeners('github:'),
  },

  // Dialog
  dialog: {
    selectDirectory: (defaultPath?: string) => ipcRenderer.invoke('dialog:selectDirectory', defaultPath),
  },

  // File System (limited operations)
  fs: {
    readdir: (path: string) => ipcRenderer.invoke('fs:readdir', path),
    readFile: (filePath: string) => ipcRenderer.invoke('fs:readFile', filePath),
    writeFile: (filePath: string, content: string) => ipcRenderer.invoke('fs:writeFile', filePath, content),
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

  // Deep Links
  onDeepLink: (callback: (url: string) => void) => createListener('deep-link', callback),

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
