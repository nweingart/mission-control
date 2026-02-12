import { ipcMain, shell, dialog, BrowserWindow } from 'electron';
import { homedir } from 'os';
import type { StorageService } from '../services/storage';

interface ShellHandlersDeps {
  storageService: StorageService;
  getMainWindow: () => BrowserWindow | null;
}

export function registerShellHandlers({ storageService, getMainWindow }: ShellHandlersDeps) {
  // Security: resolve a path and ensure it falls within a known project directory
  async function validateProjectPath(targetPath: string): Promise<string> {
    const path = await import('path');
    const resolved = path.resolve(targetPath);
    const config = storageService.getConfig();
    const devRoot = path.resolve(config.developmentPath);
    if (!resolved.startsWith(devRoot + path.sep) && resolved !== devRoot) {
      throw new Error(`Access denied: path must be inside ${devRoot}`);
    }
    return resolved;
  }

  // File System (limited operations)
  ipcMain.handle('fs:readdir', async (_, targetPath: string) => {
    const fs = await import('fs/promises');
    const resolved = await validateProjectPath(targetPath);
    return fs.readdir(resolved);
  });

  ipcMain.handle('fs:readFile', async (_, filePath: string) => {
    const fs = await import('fs/promises');
    const resolved = await validateProjectPath(filePath);
    return fs.readFile(resolved, 'utf-8');
  });

  ipcMain.handle('fs:writeFile', async (_, filePath: string, content: string) => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const resolved = await validateProjectPath(filePath);
    const dir = path.dirname(resolved);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(resolved, content, 'utf-8');
  });

  // Shell operations
  ipcMain.handle('shell:openExternal', (_, url: string) => {
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
    if (typeof path !== 'string' || path.length === 0) {
      return Promise.reject(new Error('Invalid path'));
    }
    return shell.openPath(path);
  });

  ipcMain.handle('shell:openInEditor', async (_, targetPath: string) => {
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const execFileAsync = promisify(execFile);

    if (typeof targetPath !== 'string' || targetPath.length === 0) {
      return Promise.reject(new Error('Invalid path'));
    }

    const editors = [
      { cmd: 'cursor', name: 'Cursor' },
      { cmd: 'code', name: 'VS Code' },
    ];

    for (const editor of editors) {
      try {
        await execFileAsync('/usr/bin/which', [editor.cmd]);
        await execFileAsync(editor.cmd, [targetPath]);
        console.log(`[shell:openInEditor] Opened in ${editor.name}`);
        return { editor: editor.name };
      } catch {
        continue;
      }
    }

    console.log('[shell:openInEditor] No code editor found, opening in Finder');
    await shell.openPath(targetPath);
    return { editor: 'Finder' };
  });

  ipcMain.handle('shell:openInTerminal', async (_, command: string) => {
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const execFileAsync = promisify(execFile);
    const { platform } = await import('os');

    if (typeof command !== 'string' || command.length === 0) {
      return Promise.reject(new Error('Invalid command'));
    }

    if (platform() === 'darwin') {
      const escapedCommand = command.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const script = `tell application "Terminal"
      activate
      do script "${escapedCommand}"
    end tell`;
      try {
        await execFileAsync('/usr/bin/osascript', ['-e', script]);
        console.log('[shell:openInTerminal] Opened Terminal with command:', command);
        return { success: true };
      } catch (err) {
        console.error('[shell:openInTerminal] Failed:', err);
        throw err;
      }
    } else {
      return { success: false, message: 'Please run the command manually in your terminal' };
    }
  });

  ipcMain.handle('dialog:selectDirectory', async (_, defaultPath?: string) => {
    const mainWindow = getMainWindow();
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: defaultPath || homedir(),
    });
    return result.canceled ? null : result.filePaths[0];
  });
}
