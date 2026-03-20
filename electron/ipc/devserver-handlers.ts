import { ipcMain, shell } from 'electron';
import * as pty from 'node-pty';
import { homedir } from 'os';
import { buildEnhancedPath } from './env';

interface DevServerState {
  session: { pty: pty.IPty; sessionId: string } | null;
}

interface DevServerHandlersDeps {
  state: DevServerState;
  safeSend: (channel: string, ...args: unknown[]) => boolean;
}

export function registerDevServerHandlers({ state, safeSend }: DevServerHandlersDeps) {
  ipcMain.handle('devServer:start', async (event, projectPath: string) => {
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const execFileAsync = promisify(execFile);

    // Kill existing dev server session if running
    if (state.session) {
      try { state.session.pty.kill(); } catch { /* ignore */ }
      state.session = null;
    }

    // Kill any process on ports 3000 and 3001 to ensure we always use port 3000
    console.log('[devServer:start] Killing any process on ports 3000/3001...');

    const killPort = async (port: number) => {
      try {
        const { stdout } = await execFileAsync('/usr/sbin/lsof', ['-ti:' + port]);
        const pids = stdout.trim().split('\n').filter(p => p);
        if (pids.length > 0) {
          console.log(`[devServer:start] Found PIDs on port ${port}:`, pids);
          for (const pid of pids) {
            const numPid = Number(pid);
            if (!Number.isInteger(numPid) || numPid <= 0) {
              console.log(`[devServer:start] Skipping invalid PID: ${pid}`);
              continue;
            }
            try {
              process.kill(numPid, 'SIGKILL');
              console.log(`[devServer:start] Killed PID ${numPid}`);
            } catch (killErr) {
              console.log(`[devServer:start] Could not kill PID ${numPid}:`, killErr);
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
      const fullPath = buildEnhancedPath();

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

      state.session = { pty: ptyProcess, sessionId };

      ptyProcess.onData((data) => {
        safeSend('devServer:output', { sessionId, content: data });
      });

      ptyProcess.onExit(({ exitCode }) => {
        console.log('[devServer:start] Dev server exited with code:', exitCode);
        safeSend('devServer:exit', { sessionId, code: exitCode });
        state.session = null;
      });

      // Start the dev server
      ptyProcess.write('npm run dev\r');

      resolve(sessionId);
    });
  });

  ipcMain.handle('devServer:stop', () => {
    if (state.session) {
      console.log('[devServer:stop] Stopping dev server');
      try { state.session.pty.kill(); } catch (e) {
        console.error('[devServer:stop] Error killing dev server:', e);
      }
      state.session = null;
    }
    return { success: true };
  });

  ipcMain.handle('devServer:openBrowser', async (_, url: string) => {
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
}
