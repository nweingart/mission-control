import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'path';
import * as pty from 'node-pty';
import { StorageService } from './services/storage';
import { CLICheckService } from './services/cli-check';
import { ClaudeCodeService } from './services/claude-code';
import { CodexService } from './services/codex';
import { GitHubService } from './services/github';
import { registerShellHandlers } from './ipc/shell-handlers';
import { registerSetupHandlers } from './ipc/setup-handlers';
import { registerDevServerHandlers } from './ipc/devserver-handlers';
import { autoUpdater } from 'electron-updater';

// Prevent EPIPE errors from crashing the app when stdout/stderr pipes break
// (common in Electron on macOS when the parent terminal is closed)
for (const stream of [process.stdout, process.stderr]) {
  if (stream && typeof stream.on === 'function') {
    stream.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EPIPE') return;
      throw err;
    });
  }
}

// Crash logging: write unhandled errors to ~/.mission-control/crash.log
// This provides visibility into production crashes without requiring Sentry setup.
// TODO: Wire up Sentry or similar when ready for hosted error reporting.
function logCrash(type: string, error: Error | unknown) {
  try {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const crashPath = path.join(os.homedir(), '.mission-control', 'crash.log');
    const timestamp = new Date().toISOString();
    const msg = error instanceof Error ? `${error.message}\n${error.stack}` : String(error);
    const entry = `[${timestamp}] ${type}: ${msg}\n\n`;
    fs.appendFileSync(crashPath, entry, 'utf-8');
  } catch { /* can't log the logger failing */ }
}
process.on('uncaughtException', (err) => {
  logCrash('uncaughtException', err);
  console.error('[CRASH] Uncaught exception:', err);
});
process.on('unhandledRejection', (reason) => {
  logCrash('unhandledRejection', reason);
  console.error('[CRASH] Unhandled rejection:', reason);
});

// Track active setup PTY sessions
const setupSessions: Map<string, pty.IPty> = new Map();

// Shared mutable state for dev server session (passed to IPC handler module)
const devServerState: { session: { pty: pty.IPty; sessionId: string } | null } = { session: null };

// Register missioncontrol:// custom protocol for OAuth/Stripe callbacks
if (process.defaultApp) {
  app.setAsDefaultProtocolClient('missioncontrol', process.execPath, [__dirname]);
} else {
  app.setAsDefaultProtocolClient('missioncontrol');
}

let mainWindow: BrowserWindow | null = null;
const storageService = new StorageService();
const cliCheckService = new CLICheckService();
const claudeCodeService = new ClaudeCodeService();
const codexService = new CodexService();
const githubService = new GitHubService();

/**
 * Safely send a message to the renderer process.
 * Checks if window exists and is not destroyed before sending.
 */
function safeSend(channel: string, ...args: unknown[]): boolean {
  try {
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send(channel, ...args);
      return true;
    }
  } catch (err) {
    console.error(`Error sending to ${channel}:`, err);
  }
  return false;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false, // Required for node-pty
    },
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 15 },
  });

  // Enforce CSP via response headers (works in both dev and production)
  const isDev = process.env.NODE_ENV === 'development';
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self';" +
          (isDev
            ? " script-src 'self' 'unsafe-inline' 'unsafe-eval';"
            : " script-src 'self';") +
          " style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;" +
          " font-src 'self' https://fonts.gstatic.com;" +
          " connect-src 'self' http://localhost:* ws://localhost:*;" +
          " img-src 'self' data:;"
        ],
      },
    });
  });

  // Load the app
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    // Kill all PTY sessions when the window closes.
    // On macOS, closing the window doesn't quit the app, so without this
    // Claude, setup, and dev-server PTY processes become zombies.
    claudeCodeService.killAll();
    codexService.cancelChat();
    for (const [id, session] of setupSessions) {
      try { session.kill(); } catch { /* ignore */ }
      setupSessions.delete(id);
    }
    if (devServerState.session) {
      try { devServerState.session.pty.kill(); } catch { /* ignore */ }
      devServerState.session = null;
    }
    mainWindow = null;
  });

  // Handle renderer crashes - recreate window
  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error('[main.ts] Renderer process crashed:', details.reason);
    // Kill any running Claude sessions
    claudeCodeService.killAll();
    // Recreate the window
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.close();
    }
    mainWindow = null;
    createWindow();
  });

  // Handle unresponsive renderer
  mainWindow.on('unresponsive', () => {
    console.warn('[main.ts] Window became unresponsive');
  });

  mainWindow.on('responsive', () => {
    console.log('[main.ts] Window became responsive again');
  });
}

// App lifecycle
app.whenReady().then(() => {
  createWindow();

  // Auto-update: check for updates silently after launch
  // In development, autoUpdater will skip (no published releases)
  autoUpdater.logger = {
    info: (msg: string) => console.log('[updater]', msg),
    warn: (msg: string) => console.warn('[updater]', msg),
    error: (msg: string) => console.error('[updater]', msg),
  } as unknown as typeof autoUpdater.logger;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.checkForUpdatesAndNotify().catch((err) => {
    // Non-fatal: dev builds, no internet, etc.
    console.log('[updater] Update check skipped:', err?.message || err);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle missioncontrol:// deep links (macOS)
app.on('open-url', (event, url) => {
  event.preventDefault();
  // Validate the URL before forwarding to renderer
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'missioncontrol:') {
      console.warn('[deep-link] Blocked non-missioncontrol URL:', parsed.protocol);
      return;
    }
  } catch {
    console.warn('[deep-link] Invalid URL received:', url);
    return;
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus();
    mainWindow.webContents.send('deep-link', url);
  }
});

// Cleanup PTY sessions before quitting
app.on('before-quit', () => {
  claudeCodeService.killAll();
  codexService.cancelChat();
});

// Clean up stale worktrees on signal-based exit (force-quit, Ctrl-C)
function cleanupWorktreesSync() {
  try {
    const fs = require('fs');
    const { execSync } = require('child_process');
    const worktreeRoot = '/tmp/mc-worktrees';
    if (fs.existsSync(worktreeRoot)) {
      execSync(`rm -rf ${worktreeRoot}`, { timeout: 5000 });
      console.log('[cleanup] Removed stale worktrees');
    }
  } catch { /* best effort on exit */ }
}
process.on('SIGINT', () => { cleanupWorktreesSync(); process.exit(0); });
process.on('SIGTERM', () => { cleanupWorktreesSync(); process.exit(0); });

// IPC Handlers - Storage
ipcMain.handle('storage:getConfig', () => storageService.getConfig());
ipcMain.handle('storage:saveConfig', (_, config) => storageService.saveConfig(config));
ipcMain.handle('storage:listProjects', () => storageService.listProjects());
ipcMain.handle('storage:getProject', (_, slug) => storageService.getProject(slug));
ipcMain.handle('storage:createProject', (_, name, idea) => storageService.createProject(name, idea));
ipcMain.handle('storage:updateProject', (_, slug, updates) => storageService.updateProject(slug, updates));
ipcMain.handle('storage:deleteProject', (_, slug) => storageService.deleteProject(slug));
ipcMain.handle('storage:getTasks', (_, slug) => storageService.getTasks(slug));
ipcMain.handle('storage:saveTasks', (_, slug, tasks) => storageService.saveTasks(slug, tasks));
ipcMain.handle('storage:getPRD', (_, slug) => storageService.getPRD(slug));
ipcMain.handle('storage:savePRD', (_, slug, prd) => storageService.savePRD(slug, prd));
ipcMain.handle('storage:getChatHistory', (_, slug) => storageService.getChatHistory(slug));
ipcMain.handle('storage:saveChatHistory', (_, slug, messages) => storageService.saveChatHistory(slug, messages));
ipcMain.handle('storage:getBacklog', (_, slug) => storageService.getBacklog(slug));
ipcMain.handle('storage:saveBacklog', (_, slug, items) => storageService.saveBacklog(slug, items));
ipcMain.handle('storage:getSprints', (_, slug) => storageService.getSprints(slug));
ipcMain.handle('storage:saveSprints', (_, slug, sprints) => storageService.saveSprints(slug, sprints));
ipcMain.handle('storage:getPlanningChats', (_, slug) => storageService.getPlanningChats(slug));
ipcMain.handle('storage:savePlanningChats', (_, slug, chats) => storageService.savePlanningChats(slug, chats));
ipcMain.handle('storage:getGitEvents', (_, slug) => storageService.getGitEvents(slug));
ipcMain.handle('storage:saveGitEvents', (_, slug, events) => storageService.saveGitEvents(slug, events));
ipcMain.handle('storage:getDeployments', (_, slug) => storageService.getDeployments(slug));
ipcMain.handle('storage:saveDeployments', (_, slug, deployments) => storageService.saveDeployments(slug, deployments));
ipcMain.handle('storage:getGapAnalysis', (_, slug) => storageService.getGapAnalysis(slug));
ipcMain.handle('storage:saveGapAnalysis', (_, slug, analyses) => storageService.saveGapAnalysis(slug, analyses));
ipcMain.handle('storage:getGamification', (_, slug) => storageService.getGamification(slug));
ipcMain.handle('storage:saveGamification', (_, slug, stats) => storageService.saveGamification(slug, stats));

// V2: Features, Issues, Scan History, Import
ipcMain.handle('storage:getFeatures', (_, slug) => storageService.getFeatures(slug));
ipcMain.handle('storage:saveFeatures', (_, slug, features) => storageService.saveFeatures(slug, features));
ipcMain.handle('storage:getIssues', (_, slug) => storageService.getIssues(slug));
ipcMain.handle('storage:saveIssues', (_, slug, issues) => storageService.saveIssues(slug, issues));
ipcMain.handle('storage:getScanHistory', (_, slug) => storageService.getScanHistory(slug));
ipcMain.handle('storage:saveScanHistory', (_, slug, snapshots) => storageService.saveScanHistory(slug, snapshots));
ipcMain.handle('storage:importProject', (_, name, githubRepo, projectPath) => storageService.importProject(name, githubRepo, projectPath));

// IPC Handlers - CLI Check
ipcMain.handle('cli:checkAll', () => cliCheckService.checkAll());
ipcMain.handle('cli:checkClaude', () => cliCheckService.checkClaude());
ipcMain.handle('cli:checkClaudeDeep', () => cliCheckService.checkClaudeDeep());
ipcMain.handle('cli:checkGitHub', () => cliCheckService.checkGitHub());

// IPC Handlers - Claude Code
ipcMain.handle('claude:spawn', (event, projectPath, prompt) => {
  console.log('[main.ts] claude:spawn called, projectPath:', projectPath);
  console.log('[main.ts] claude:spawn prompt length:', prompt?.length);
  return claudeCodeService.spawn(projectPath, prompt, (data) => {
    safeSend('claude:output', data);
  }, (data) => {
    console.log('[main.ts] claude:exit callback, code:', data.code);
    safeSend('claude:exit', data);
  });
});
ipcMain.handle('claude:spawnInteractive', (event, projectPath) => {
  console.log('[main.ts] claude:spawnInteractive called, projectPath:', projectPath);
  return claudeCodeService.spawnInteractive(projectPath, (data) => {
    safeSend('claude:output', data);
  }, (data) => {
    console.log('[main.ts] claude:exit callback (interactive), code:', data.code);
    safeSend('claude:exit', data);
  });
});
ipcMain.handle('claude:chat', async (event, projectPath, prompt, inactivityTimeoutMs?, chatId?) => {
  console.log('[main.ts] claude:chat IPC handler called');
  console.log('[main.ts] projectPath:', projectPath);
  console.log('[main.ts] prompt length:', prompt?.length);
  try {
    const result = await claudeCodeService.chat(projectPath, prompt, (content) => {
      safeSend('claude:chatOutput', { chatId: chatId || '__legacy__', content });
    }, inactivityTimeoutMs, chatId);
    console.log('[main.ts] claude:chat completed, result length:', result?.length);
    return result;
  } catch (err) {
    console.error('[main.ts] claude:chat error:', err);
    throw err;
  }
});
ipcMain.handle('claude:chatStreaming', async (event, projectPath, prompt, inactivityTimeoutMs?, chatId?) => {
  console.log('[main.ts] claude:chatStreaming IPC handler called');
  try {
    const result = await claudeCodeService.chatStreaming(projectPath, prompt, (streamEvent) => {
      safeSend('claude:streamEvent', { chatId: chatId || '__legacy__', event: streamEvent });
    }, (content) => {
      safeSend('claude:chatOutput', { chatId: chatId || '__legacy__', content });
    }, inactivityTimeoutMs, chatId);
    return result;
  } catch (err) {
    console.error('[main.ts] claude:chatStreaming error:', err);
    throw err;
  }
});
ipcMain.handle('claude:chatWithResume', async (event, projectPath, prompt, sessionId, inactivityTimeoutMs?, chatId?) => {
  console.log('[main.ts] claude:chatWithResume IPC handler called, session:', sessionId || 'new');
  try {
    const result = await claudeCodeService.chatWithResume(projectPath, prompt, sessionId, (streamEvent) => {
      safeSend('claude:streamEvent', { chatId: chatId || '__legacy__', event: streamEvent });
    }, (content) => {
      safeSend('claude:chatOutput', { chatId: chatId || '__legacy__', content });
    }, inactivityTimeoutMs, chatId);
    return result;
  } catch (err) {
    console.error('[main.ts] claude:chatWithResume error:', err);
    throw err;
  }
});
ipcMain.handle('claude:sendInput', (_, sessionId, input) => claudeCodeService.sendInput(sessionId, input));
ipcMain.handle('claude:resize', (_, sessionId, cols, rows) => claudeCodeService.resize(sessionId, cols, rows));
ipcMain.handle('claude:kill', (_, sessionId) => claudeCodeService.kill(sessionId));
ipcMain.handle('claude:cancelChat', (_, chatId?) => claudeCodeService.cancelChat(chatId));

// Completion detection IPC handlers
ipcMain.handle('claude:enableCompletionDetection', (_, sessionId: string) => {
  claudeCodeService.enableCompletionDetection(sessionId, () => {
    console.log('[main.ts] Completion detected for session:', sessionId);
    safeSend('claude:completionDetected', { sessionId });
  });
});
ipcMain.handle('claude:resetCompletionDetection', (_, sessionId: string) => {
  claudeCodeService.resetCompletionDetection(sessionId);
});
ipcMain.handle('claude:confirmCompletion', (_, sessionId: string) => {
  claudeCodeService.disableCompletionDetection(sessionId);
});

// IPC Handlers - Codex
ipcMain.handle('codex:chat', async (event, projectPath, prompt, inactivityTimeoutMs?, chatId?) => {
  console.log('[main.ts] codex:chat IPC handler called');
  try {
    const result = await codexService.chat(projectPath, prompt, (content) => {
      safeSend('codex:chatOutput', { chatId: chatId || '__legacy__', content });
    }, inactivityTimeoutMs, chatId);
    return result;
  } catch (err) {
    console.error('[main.ts] codex:chat error:', err);
    throw err;
  }
});
ipcMain.handle('codex:cancelChat', (_, chatId?) => codexService.cancelChat(chatId));

// IPC Handlers - CLI Check (Codex)
ipcMain.handle('cli:checkCodex', () => cliCheckService.checkCodex());
ipcMain.handle('cli:checkCodexDeep', () => cliCheckService.checkCodexDeep());

// IPC Handlers - GitHub
ipcMain.handle('github:checkGitStatus', (_, projectPath: string) => {
  return githubService.checkGitStatus(projectPath);
});
ipcMain.handle('github:gitInit', (_, projectPath: string) => {
  return githubService.gitInit(projectPath, (data) => {
    safeSend('github:output', data);
  });
});
ipcMain.handle('github:ensureGitignore', (_, projectPath: string) => {
  return githubService.ensureGitignore(projectPath);
});
ipcMain.handle('github:ensureGitConfig', (_, projectPath: string, username: string) => {
  return githubService.ensureGitConfig(projectPath, username);
});
ipcMain.handle('github:gitAddAndCommit', (_, projectPath: string, message: string) => {
  return githubService.gitAddAndCommit(projectPath, message, (data) => {
    safeSend('github:output', data);
  });
});
ipcMain.handle('github:createRepoAndPush', (_, projectPath: string, name: string) => {
  return githubService.createGitHubRepoAndPush(projectPath, name, (data) => {
    safeSend('github:output', data);
  });
});
ipcMain.handle('github:gitPush', (_, projectPath: string) => {
  return githubService.gitPush(projectPath, (data) => {
    safeSend('github:output', data);
  });
});
ipcMain.handle('github:getUsername', () => {
  return githubService.getGitHubUsername();
});
ipcMain.handle('github:resetWorkingTree', (_, projectPath: string) => {
  return githubService.resetWorkingTree(projectPath);
});
ipcMain.handle('github:getCurrentBranch', (_, projectPath: string) => {
  return githubService.getCurrentBranch(projectPath);
});
ipcMain.handle('github:createAndCheckoutBranch', (_, projectPath: string, branchName: string) => {
  return githubService.createAndCheckoutBranch(projectPath, branchName);
});
ipcMain.handle('github:checkoutBranch', (_, projectPath: string, branchName: string) => {
  return githubService.checkoutBranch(projectPath, branchName);
});
ipcMain.handle('github:mergeBranch', (_, projectPath: string, branchName: string) => {
  return githubService.mergeBranch(projectPath, branchName, (data) => {
    safeSend('github:output', data);
  });
});
ipcMain.handle('github:renameBranch', (_, projectPath: string, newName: string) => {
  return githubService.renameBranch(projectPath, newName);
});
ipcMain.handle('github:deleteBranch', (_, projectPath: string, branchName: string) => {
  return githubService.deleteBranch(projectPath, branchName);
});
ipcMain.handle('github:branchExists', (_, projectPath: string, branchName: string) => {
  return githubService.branchExists(projectPath, branchName);
});
ipcMain.handle('github:getDiff', (_, projectPath: string, base?: string) => {
  return githubService.getDiff(projectPath, base);
});
ipcMain.handle('github:getDiffStat', (_, projectPath: string, base: string) => {
  return githubService.getDiffStat(projectPath, base);
});
ipcMain.handle('github:getCommitDiff', (_, projectPath: string, commitHash: string) => {
  return githubService.getCommitDiff(projectPath, commitHash);
});
ipcMain.handle('github:getTaskDiff', (_, projectPath: string, commitHashes: string[]) => {
  return githubService.getTaskDiff(projectPath, commitHashes);
});

ipcMain.handle('github:setSecret', (_, repoFullName: string, name: string, value: string) => {
  return githubService.setSecret(repoFullName, name, value);
});
ipcMain.handle('github:getWorkflowRuns', (_, projectPath: string, limit?: number) => {
  return githubService.getWorkflowRuns(projectPath, limit);
});
ipcMain.handle('github:writeWorkflowFile', (_, projectPath: string, content: string) => {
  return githubService.writeWorkflowFile(projectPath, content);
});
ipcMain.handle('github:runShellCommand', (_, cwd: string, command: string, args?: string[]) => {
  return githubService.runShellCommand(cwd, command, args);
});
ipcMain.handle('github:deleteRepo', (_, repoUrl: string) => githubService.deleteRepo(repoUrl));
ipcMain.handle('github:createWorktree', (_, repoPath: string, worktreePath: string, branchName: string, startPoint?: string) =>
  githubService.createWorktree(repoPath, worktreePath, branchName, startPoint));
ipcMain.handle('github:removeWorktree', (_, repoPath: string, worktreePath: string) =>
  githubService.removeWorktree(repoPath, worktreePath));

// Register modular IPC handlers
registerShellHandlers({
  storageService,
  getMainWindow: () => mainWindow,
});

registerSetupHandlers({
  setupSessions,
  safeSend,
});

registerDevServerHandlers({
  state: devServerState,
  safeSend,
});
