import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir, platform } from 'os';

const execAsync = promisify(exec);

// Build a PATH that includes common CLI install locations
function getEnhancedPath(): string {
  const home = homedir();
  const extraPaths = [
    `${home}/.local/bin`,      // Claude CLI
    '/opt/homebrew/bin',        // Homebrew on Apple Silicon
    '/usr/local/bin',           // Homebrew on Intel / npm global
    `${home}/.npm-global/bin`,  // npm global installs
  ];
  const currentPath = process.env.PATH || '';
  const pathParts = currentPath.split(':');
  return [...new Set([...extraPaths, ...pathParts])].join(':');
}

const enhancedEnv = {
  ...process.env,
  PATH: getEnhancedPath(),
};

interface CLIStatusItem {
  installed: boolean;
  authenticated: boolean;
}

interface CLIStatus {
  claude: CLIStatusItem;
  github: CLIStatusItem;
  vercel: CLIStatusItem;
  supabase: CLIStatusItem;
}

export class CLICheckService {
  private async commandExists(command: string): Promise<boolean> {
    try {
      // Use 'where' on Windows, 'which' on Unix-like systems
      const checkCommand = platform() === 'win32' ? 'where' : 'which';
      // Add timeout to prevent hanging, use enhanced PATH
      await execAsync(`${checkCommand} ${command}`, { timeout: 5000, env: enhancedEnv });
      return true;
    } catch {
      return false;
    }
  }

  async checkClaude(): Promise<CLIStatusItem> {
    const installed = await this.commandExists('claude');
    console.log('[CLICheck] Claude installed:', installed);
    if (!installed) {
      return { installed: false, authenticated: false };
    }

    // Lightweight check: run `claude --version` to confirm the binary is callable
    try {
      console.log('[CLICheck] Running claude --version...');
      const { stdout } = await execAsync('claude --version 2>&1', { timeout: 5000, env: enhancedEnv });
      console.log('[CLICheck] Claude version:', stdout.trim());
      // If we get a version string back, the binary works
      if (stdout.trim().length > 0) {
        return { installed: true, authenticated: true };
      }
    } catch (err) {
      console.log('[CLICheck] Claude --version failed:', (err as Error).message);
    }

    return { installed: true, authenticated: false };
  }

  /**
   * Deep check: actually invokes Claude with a trivial prompt to verify
   * the full pipeline works (binary + auth + API connectivity).
   * More expensive than checkClaude() — only call on explicit user actions.
   */
  async checkClaudeDeep(): Promise<CLIStatusItem> {
    const installed = await this.commandExists('claude');
    console.log('[CLICheck] Claude deep check — installed:', installed);
    if (!installed) {
      return { installed: false, authenticated: false };
    }

    try {
      console.log('[CLICheck] Running claude -p "ok" --max-turns 1...');
      const { stdout } = await execAsync('claude -p "ok" --max-turns 1 2>&1', { timeout: 30000, env: enhancedEnv });
      console.log('[CLICheck] Claude deep check response:', stdout.substring(0, 100));
      // Any non-empty response means the full pipeline works
      if (stdout.trim().length > 0) {
        return { installed: true, authenticated: true };
      }
    } catch (err) {
      const errorMessage = (err as Error).message || '';
      console.log('[CLICheck] Claude deep check failed:', errorMessage.substring(0, 200));
    }

    return { installed: true, authenticated: false };
  }

  async checkGitHub(): Promise<CLIStatusItem> {
    const installed = await this.commandExists('gh');
    console.log('[CLICheck] GitHub CLI installed:', installed);
    if (!installed) {
      return { installed: false, authenticated: false };
    }

    // Check auth status with gh auth status
    try {
      console.log('[CLICheck] Running gh auth status...');
      const { stdout } = await execAsync('gh auth status 2>&1', { timeout: 10000, env: enhancedEnv });
      console.log('[CLICheck] GitHub auth status:', stdout.substring(0, 100));
      // If it doesn't throw and contains "Logged in", we're authenticated
      if (stdout.includes('Logged in')) {
        return { installed: true, authenticated: true };
      }
      return { installed: true, authenticated: false };
    } catch (err) {
      const errorMessage = (err as Error).message || '';
      console.log('[CLICheck] GitHub auth status error:', errorMessage.substring(0, 100));
      // Check if the error output indicates logged in status
      if (errorMessage.includes('Logged in')) {
        return { installed: true, authenticated: true };
      }
      return { installed: true, authenticated: false };
    }
  }

  async checkVercel(): Promise<CLIStatusItem> {
    const installed = await this.commandExists('vercel');
    console.log('[CLICheck] Vercel installed:', installed);
    if (!installed) {
      return { installed: false, authenticated: false };
    }

    // Primary: run `vercel whoami` — this actually validates the token against the API
    try {
      console.log('[CLICheck] Running vercel whoami...');
      const { stdout } = await execAsync('vercel whoami 2>&1', { timeout: 10000, env: enhancedEnv });
      const result = stdout.trim();
      console.log('[CLICheck] Vercel whoami result:', result);
      // A valid response returns the username. Empty or error means not authenticated.
      if (result.length > 0 && !result.includes('not logged in') && !result.includes('Error')) {
        return { installed: true, authenticated: true };
      }
      return { installed: true, authenticated: false };
    } catch (err) {
      console.log('[CLICheck] Vercel whoami failed:', (err as Error).message);
      return { installed: true, authenticated: false };
    }
  }

  async checkSupabase(): Promise<CLIStatusItem> {
    const installed = await this.commandExists('supabase');
    console.log('[CLICheck] Supabase installed:', installed);
    if (!installed) {
      return { installed: false, authenticated: false };
    }

    // Primary: run `supabase projects list` — this actually validates the token against the API
    try {
      console.log('[CLICheck] Running supabase projects list...');
      const { stdout, stderr } = await execAsync('supabase projects list 2>&1', { timeout: 15000, env: enhancedEnv });
      const output = stdout + stderr;
      console.log('[CLICheck] Supabase projects list output:', output.substring(0, 200));
      // Check for auth error messages — these mean token is missing or expired
      if (output.includes('Access token not provided') ||
          output.includes('not logged in') ||
          output.includes('Unauthorized') ||
          output.includes('invalid token') ||
          output.includes('token is expired') ||
          output.includes('login')) {
        return { installed: true, authenticated: false };
      }
      // Command succeeded without auth errors — user is actually authenticated
      return { installed: true, authenticated: true };
    } catch (error) {
      const errorMessage = (error as Error).message || '';
      console.log('[CLICheck] Supabase projects list error:', errorMessage.substring(0, 200));
      if (errorMessage.includes('Access token') ||
          errorMessage.includes('not logged in') ||
          errorMessage.includes('Unauthorized') ||
          errorMessage.includes('invalid token') ||
          errorMessage.includes('token is expired') ||
          errorMessage.includes('login')) {
        return { installed: true, authenticated: false };
      }
      // Other errors (network timeout, etc.) — assume not authenticated to be safe
      return { installed: true, authenticated: false };
    }
  }

  async checkAll(): Promise<CLIStatus> {
    const [claude, github, vercel, supabase] = await Promise.all([
      this.checkClaude(),
      this.checkGitHub(),
      this.checkVercel(),
      this.checkSupabase(),
    ]);

    return { claude, github, vercel, supabase };
  }
}
