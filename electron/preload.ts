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
  },

  // CLI Check
  cli: {
    checkAll: () => ipcRenderer.invoke('cli:checkAll'),
    checkClaude: () => ipcRenderer.invoke('cli:checkClaude'),
    checkClaudeDeep: () => ipcRenderer.invoke('cli:checkClaudeDeep'),
    checkGitHub: () => ipcRenderer.invoke('cli:checkGitHub'),
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
    chat: (projectPath: string, prompt: string, inactivityTimeoutMs?: number, chatId?: string) =>
      ipcRenderer.invoke('claude:chat', projectPath, prompt, inactivityTimeoutMs, chatId) as Promise<string>,
    onOutput: (callback: OutputCallback) => createListener('claude:output', callback),
    onChatOutput: (callback: (content: string) => void) => createListener('claude:chatOutput', callback),
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
    removeListeners: () => removeAllListeners('claude:'),
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
    deleteRepo: (repoUrl: string) => ipcRenderer.invoke('github:deleteRepo', repoUrl),
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
