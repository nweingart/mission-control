import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron';
import { join } from 'path';
import * as pty from 'node-pty';
import { homedir } from 'os';
import { StorageService } from './services/storage';
import { CLICheckService } from './services/cli-check';
import { ClaudeCodeService } from './services/claude-code';
import { VercelService } from './services/vercel';
import { SupabaseService } from './services/supabase';
import { GitHubService } from './services/github';

// Track active setup PTY sessions
const setupSessions: Map<string, pty.IPty> = new Map();

// Track dev server session
let devServerSession: { pty: pty.IPty; sessionId: string } | null = null;

let mainWindow: BrowserWindow | null = null;
const storageService = new StorageService();
const cliCheckService = new CLICheckService();
const claudeCodeService = new ClaudeCodeService();
const vercelService = new VercelService();
const supabaseService = new SupabaseService();
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

  // Load the app
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
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

// Cleanup PTY sessions before quitting
app.on('before-quit', () => {
  claudeCodeService.killAll();
});

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
ipcMain.handle('storage:getPlanningChats', (_, slug) => storageService.getPlanningChats(slug));
ipcMain.handle('storage:savePlanningChats', (_, slug, chats) => storageService.savePlanningChats(slug, chats));

// IPC Handlers - CLI Check
ipcMain.handle('cli:checkAll', () => cliCheckService.checkAll());
ipcMain.handle('cli:checkClaude', () => cliCheckService.checkClaude());
ipcMain.handle('cli:checkClaudeDeep', () => cliCheckService.checkClaudeDeep());
ipcMain.handle('cli:checkGitHub', () => cliCheckService.checkGitHub());
ipcMain.handle('cli:checkVercel', () => cliCheckService.checkVercel());
ipcMain.handle('cli:checkSupabase', () => cliCheckService.checkSupabase());

// IPC Handler - Save Vercel token directly to config
ipcMain.handle('cli:saveVercelToken', async (_, token: string) => {
  const fs = await import('fs/promises');
  const path = await import('path');
  const os = await import('os');

  const vercelDir = path.join(os.homedir(), '.vercel');
  const authFile = path.join(vercelDir, 'auth.json');

  try {
    // Create .vercel directory if it doesn't exist
    await fs.mkdir(vercelDir, { recursive: true });

    // Write auth.json with the token
    // Vercel CLI expects this format
    const authData = {
      token: token.trim()
    };

    await fs.writeFile(authFile, JSON.stringify(authData, null, 2), 'utf-8');
    console.log('[cli:saveVercelToken] Token saved to', authFile);
    return { success: true };
  } catch (err) {
    console.error('[cli:saveVercelToken] Failed to save token:', err);
    throw err;
  }
});

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
ipcMain.handle('claude:chat', async (event, projectPath, prompt) => {
  console.log('[main.ts] claude:chat IPC handler called');
  console.log('[main.ts] projectPath:', projectPath);
  console.log('[main.ts] prompt length:', prompt?.length);
  try {
    const result = await claudeCodeService.chat(projectPath, prompt, (content) => {
      safeSend('claude:chatOutput', content);
    });
    console.log('[main.ts] claude:chat completed, result length:', result?.length);
    return result;
  } catch (err) {
    console.error('[main.ts] claude:chat error:', err);
    throw err;
  }
});
ipcMain.handle('claude:sendInput', (_, sessionId, input) => claudeCodeService.sendInput(sessionId, input));
ipcMain.handle('claude:resize', (_, sessionId, cols, rows) => claudeCodeService.resize(sessionId, cols, rows));
ipcMain.handle('claude:kill', (_, sessionId) => claudeCodeService.kill(sessionId));

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

// IPC Handlers - Vercel
ipcMain.handle('vercel:deploy', (event, projectPath, envVars) => {
  return vercelService.deploy(projectPath, envVars, (data) => {
    safeSend('vercel:output', data);
  });
});

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
ipcMain.handle('github:getDiff', (_, projectPath: string, base?: string) => {
  return githubService.getDiff(projectPath, base);
});
ipcMain.handle('github:getDiffStat', (_, projectPath: string, base: string) => {
  return githubService.getDiffStat(projectPath, base);
});

// IPC Handlers - Supabase
ipcMain.handle('supabase:createProject', (event, name) => {
  return supabaseService.createProject(name, (data) => {
    safeSend('supabase:output', data);
  });
});
ipcMain.handle('supabase:runMigrations', (event, projectPath, supabaseRef) => {
  return supabaseService.runMigrations(projectPath, supabaseRef, (data) => {
    safeSend('supabase:output', data);
  });
});

// IPC Handlers - File System (limited operations)
ipcMain.handle('fs:readdir', async (_, path: string) => {
  const fs = await import('fs/promises');
  return fs.readdir(path);
});

// IPC Handlers - Shell
ipcMain.handle('shell:openExternal', (_, url: string) => {
  // Validate URL to prevent opening malicious protocols
  // Only allow http:// and https:// URLs
  if (typeof url !== 'string') {
    console.warn('Invalid URL type provided to shell:openExternal');
    return Promise.reject(new Error('Invalid URL'));
  }

  try {
    const parsedUrl = new URL(url);
    const allowedProtocols = ['http:', 'https:'];

    if (!allowedProtocols.includes(parsedUrl.protocol)) {
      console.warn(`Blocked attempt to open URL with protocol: ${parsedUrl.protocol}`);
      return Promise.reject(new Error(`Blocked protocol: ${parsedUrl.protocol}`));
    }

    return shell.openExternal(url);
  } catch (err) {
    console.warn('Invalid URL provided to shell:openExternal:', url);
    return Promise.reject(new Error('Invalid URL format'));
  }
});
ipcMain.handle('shell:openPath', (_, path: string) => {
  // Basic validation for path
  if (typeof path !== 'string' || path.length === 0) {
    return Promise.reject(new Error('Invalid path'));
  }
  return shell.openPath(path);
});

// Open path in code editor (tries Cursor, then VS Code, then falls back to Finder)
ipcMain.handle('shell:openInEditor', async (_, path: string) => {
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);

  if (typeof path !== 'string' || path.length === 0) {
    return Promise.reject(new Error('Invalid path'));
  }

  // Try editors in order of preference
  const editors = [
    { cmd: 'cursor', name: 'Cursor' },
    { cmd: 'code', name: 'VS Code' },
  ];

  for (const editor of editors) {
    try {
      // Check if the editor command exists
      await execAsync(`which ${editor.cmd}`);
      // If it exists, open the path
      await execAsync(`${editor.cmd} "${path}"`);
      console.log(`[shell:openInEditor] Opened in ${editor.name}`);
      return { editor: editor.name };
    } catch {
      // Editor not found, try next
      continue;
    }
  }

  // Fall back to opening in Finder
  console.log('[shell:openInEditor] No code editor found, opening in Finder');
  await shell.openPath(path);
  return { editor: 'Finder' };
});

// Open native Terminal app with a command (macOS only for now)
ipcMain.handle('shell:openInTerminal', async (_, command: string) => {
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);
  const { platform } = await import('os');

  if (typeof command !== 'string' || command.length === 0) {
    return Promise.reject(new Error('Invalid command'));
  }

  // Sanitize command to prevent injection (basic escaping)
  const sanitizedCommand = command.replace(/"/g, '\\"');

  if (platform() === 'darwin') {
    // macOS: Use osascript to open Terminal.app with the command
    const script = `tell application "Terminal"
      activate
      do script "${sanitizedCommand}"
    end tell`;
    try {
      await execAsync(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`);
      console.log('[shell:openInTerminal] Opened Terminal with command:', command);
      return { success: true };
    } catch (err) {
      console.error('[shell:openInTerminal] Failed:', err);
      throw err;
    }
  } else {
    // For other platforms, just return instructions
    return { success: false, message: 'Please run the command manually in your terminal' };
  }
});

// IPC Handler - Directory picker dialog
ipcMain.handle('dialog:selectDirectory', async (_, defaultPath?: string) => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: defaultPath || homedir(),
  });
  return result.canceled ? null : result.filePaths[0];
});

// IPC Handlers - Setup commands (run install/auth commands with PTY)
ipcMain.handle('setup:runCommand', (event, command: string, sessionId: string) => {
  return new Promise<void>((resolve, reject) => {
    // Kill existing session if any
    const existing = setupSessions.get(sessionId);
    if (existing) {
      try {
        existing.kill();
      } catch (e) {
        // Ignore
      }
      setupSessions.delete(sessionId);
    }

    const shellProgram = process.platform === 'win32' ? 'powershell.exe' : '/bin/bash';
    const shellArgs = process.platform === 'win32' ? [] : ['-l'];
    const home = homedir();

    // Build enhanced PATH including common CLI locations
    const extraPaths = [
      `${home}/.local/bin`,
      '/opt/homebrew/bin',
      '/usr/local/bin',
    ];
    const currentPath = process.env.PATH || '';
    const fullPath = [...extraPaths, ...currentPath.split(':')].join(':');

    console.log('[setup:runCommand] Running command:', command);
    console.log('[setup:runCommand] HOME:', home);
    console.log('[setup:runCommand] Shell:', shellProgram);

    let ptyProcess: pty.IPty;
    try {
      ptyProcess = pty.spawn(shellProgram, shellArgs, {
        name: 'xterm-256color',
        cols: 100,
        rows: 30,
        cwd: home,
        env: {
          ...process.env,
          HOME: home,  // Explicitly set HOME
          TERM: 'xterm-256color',
          PATH: fullPath,
        },
      });
      console.log('[setup:runCommand] PTY spawned, pid:', ptyProcess.pid);
    } catch (err) {
      console.error('[setup:runCommand] Failed to spawn PTY:', err);
      reject(err);
      return;
    }

    setupSessions.set(sessionId, ptyProcess);

    ptyProcess.onData((data) => {
      safeSend('setup:output', { sessionId, content: data });
    });

    ptyProcess.onExit(({ exitCode }) => {
      console.log('[setup:runCommand] Command exited with code:', exitCode);
      setupSessions.delete(sessionId);
      safeSend('setup:exit', { sessionId, code: exitCode });
      if (exitCode === 0) {
        resolve();
      } else {
        reject(new Error(`Command exited with code ${exitCode}`));
      }
    });

    // Send the command, then exit the shell when done
    // Only keep shell open for 'claude' which is a fully interactive session
    const isInteractive = command.trim() === 'claude';
    const commandToRun = isInteractive ? command : `${command}; exit`;
    console.log('[setup:runCommand] Sending:', commandToRun.substring(0, 100) + '...');
    ptyProcess.write(`${commandToRun}\r`);
  });
});

ipcMain.handle('setup:sendInput', (_, sessionId: string, input: string) => {
  const session = setupSessions.get(sessionId);
  if (session) {
    session.write(input);
  }
});

ipcMain.handle('setup:killSession', (_, sessionId: string) => {
  const session = setupSessions.get(sessionId);
  if (session) {
    try {
      session.kill();
    } catch (e) {
      // Ignore
    }
    setupSessions.delete(sessionId);
  }
});

// Open command in system terminal (for interactive commands like 'claude')
ipcMain.handle('setup:openInTerminal', async (_, command: string) => {
  const { exec } = await import('child_process');

  return new Promise<void>((resolve, reject) => {
    if (process.platform === 'darwin') {
      // macOS: Use AppleScript to open Terminal.app and run the command
      const script = `tell application "Terminal"
        activate
        do script "${command.replace(/"/g, '\\"')}"
      end tell`;

      exec(`osascript -e '${script}'`, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    } else if (process.platform === 'win32') {
      // Windows: Open cmd with the command
      exec(`start cmd /k ${command}`, (error) => {
        if (error) reject(error);
        else resolve();
      });
    } else {
      // Linux: Try common terminal emulators
      const terminals = ['gnome-terminal', 'konsole', 'xterm'];
      let found = false;

      for (const term of terminals) {
        try {
          exec(`which ${term}`, (err) => {
            if (!err && !found) {
              found = true;
              exec(`${term} -e "${command}"`, (execErr) => {
                if (execErr) reject(execErr);
                else resolve();
              });
            }
          });
        } catch {
          // Continue to next terminal
        }
      }

      if (!found) {
        reject(new Error('No supported terminal emulator found'));
      }
    }
  });
});

// IPC Handlers - Dev Server (for preview)
ipcMain.handle('devServer:start', async (event, projectPath: string) => {
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);

  // Kill existing dev server session if running
  if (devServerSession) {
    try {
      devServerSession.pty.kill();
    } catch (e) {
      // Ignore
    }
    devServerSession = null;
  }

  // Kill any process on ports 3000 and 3001 to ensure we always use port 3000
  console.log('[devServer:start] Killing any process on ports 3000/3001...');

  // Use full path to lsof and be more aggressive
  const killPort = async (port: number) => {
    try {
      const { stdout } = await execAsync(`/usr/sbin/lsof -ti:${port}`);
      const pids = stdout.trim().split('\n').filter(p => p);
      if (pids.length > 0) {
        console.log(`[devServer:start] Found PIDs on port ${port}:`, pids);
        for (const pid of pids) {
          try {
            await execAsync(`kill -9 ${pid}`);
            console.log(`[devServer:start] Killed PID ${pid}`);
          } catch (killErr) {
            console.log(`[devServer:start] Could not kill PID ${pid}:`, killErr);
          }
        }
      } else {
        console.log(`[devServer:start] Port ${port} is free`);
      }
    } catch (e) {
      console.log(`[devServer:start] Port ${port} appears to be free (lsof returned nothing)`);
    }
  };

  await killPort(3000);
  await killPort(3001);

  // Give time for ports to be released
  await new Promise(resolve => setTimeout(resolve, 1000));
  console.log('[devServer:start] Port cleanup complete');

  return new Promise<string>((resolve, reject) => {
    const sessionId = `dev-${Date.now()}`;
    const home = homedir();

    // Build enhanced PATH
    const extraPaths = [
      `${home}/.local/bin`,
      '/opt/homebrew/bin',
      '/usr/local/bin',
    ];
    const currentPath = process.env.PATH || '';
    const fullPath = [...extraPaths, ...currentPath.split(':')].join(':');

    console.log('[devServer:start] Starting dev server in:', projectPath);

    let ptyProcess: pty.IPty;
    try {
      ptyProcess = pty.spawn('/bin/bash', ['--norc', '--noprofile'], {
        name: 'xterm-256color',
        cols: 100,
        rows: 30,
        cwd: projectPath,
        env: {
          ...process.env,
          HOME: home,
          TERM: 'xterm-256color',
          PATH: fullPath,
          FORCE_COLOR: '1',
        },
      });
      console.log('[devServer:start] PTY spawned, pid:', ptyProcess.pid);
    } catch (err) {
      console.error('[devServer:start] Failed to spawn PTY:', err);
      reject(err);
      return;
    }

    devServerSession = { pty: ptyProcess, sessionId };

    ptyProcess.onData((data) => {
      safeSend('devServer:output', { sessionId, content: data });
    });

    ptyProcess.onExit(({ exitCode }) => {
      console.log('[devServer:start] Dev server exited with code:', exitCode);
      safeSend('devServer:exit', { sessionId, code: exitCode });
      devServerSession = null;
    });

    // Start the dev server
    ptyProcess.write('npm run dev\r');

    resolve(sessionId);
  });
});

ipcMain.handle('devServer:stop', () => {
  if (devServerSession) {
    console.log('[devServer:stop] Stopping dev server');
    try {
      devServerSession.pty.kill();
    } catch (e) {
      console.error('[devServer:stop] Error killing dev server:', e);
    }
    devServerSession = null;
  }
  return { success: true };
});

ipcMain.handle('devServer:openBrowser', async (_, url: string) => {
  // Validate it's a localhost URL
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
      return Promise.reject(new Error('Only localhost URLs allowed'));
    }
    return shell.openExternal(url);
  } catch {
    return Promise.reject(new Error('Invalid URL'));
  }
});
