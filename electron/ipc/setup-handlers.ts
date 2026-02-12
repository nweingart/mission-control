import { ipcMain } from 'electron';
import * as pty from 'node-pty';
import { homedir } from 'os';
import { buildEnhancedPath } from './env';

interface SetupHandlersDeps {
  setupSessions: Map<string, pty.IPty>;
  safeSend: (channel: string, ...args: unknown[]) => boolean;
}

export function registerSetupHandlers({ setupSessions, safeSend }: SetupHandlersDeps) {
  ipcMain.handle('setup:runCommand', (event, command: string, sessionId: string) => {
    return new Promise<void>((resolve, reject) => {
      // Kill existing session if any
      const existing = setupSessions.get(sessionId);
      if (existing) {
        try { existing.kill(); } catch { /* ignore */ }
        setupSessions.delete(sessionId);
      }

      const shellProgram = process.platform === 'win32' ? 'powershell.exe' : '/bin/bash';
      const shellArgs = process.platform === 'win32' ? [] : ['-l'];
      const home = homedir();
      const fullPath = buildEnhancedPath();

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
            HOME: home,
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
      try { session.kill(); } catch { /* ignore */ }
      setupSessions.delete(sessionId);
    }
  });

  ipcMain.handle('setup:openInTerminal', async (_, command: string) => {
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const execFileAsync = promisify(execFile);

    if (typeof command !== 'string' || command.length === 0) {
      throw new Error('Invalid command');
    }

    if (process.platform === 'darwin') {
      const escapedCommand = command.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const script = `tell application "Terminal"
      activate
      do script "${escapedCommand}"
    end tell`;
      await execFileAsync('/usr/bin/osascript', ['-e', script]);
    } else if (process.platform === 'win32') {
      await execFileAsync('cmd.exe', ['/k', command]);
    } else {
      const terminals = [
        { cmd: 'gnome-terminal', args: ['--', command] },
        { cmd: 'konsole', args: ['-e', command] },
        { cmd: 'xterm', args: ['-e', command] },
      ];
      for (const term of terminals) {
        try {
          await execFileAsync('/usr/bin/which', [term.cmd]);
          await execFileAsync(term.cmd, term.args);
          return;
        } catch {
          continue;
        }
      }
      throw new Error('No supported terminal emulator found');
    }
  });
}
