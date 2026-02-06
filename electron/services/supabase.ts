import { spawn, exec, ChildProcess } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

type OutputCallback = (data: { type: 'stdout' | 'stderr'; content: string }) => void;

interface SupabaseProject {
  ref: string;
  url: string;
  anonKey: string;
  serviceKey: string;
}

// Default timeout for CLI operations (5 minutes)
const DEFAULT_PROCESS_TIMEOUT = 5 * 60 * 1000;

export class SupabaseService {
  /**
   * Sanitize a project slug for safe use in CLI commands.
   * Only allows lowercase letters, numbers, and hyphens.
   */
  private sanitizeSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 50); // Limit length
  }

  async createProject(
    name: string,
    onOutput?: OutputCallback
  ): Promise<SupabaseProject> {
    // Generate a sanitized slug from the name
    const slug = this.sanitizeSlug(name);

    if (!slug) {
      throw new Error('Invalid project name - must contain at least one alphanumeric character');
    }

    // Generate a random database password
    const dbPassword = this.generatePassword();

    return new Promise((resolve, reject) => {
      let isResolved = false;
      let stderr = '';

      // Set up timeout (3 minutes for project creation)
      const timeoutHandle = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          try {
            child.kill('SIGTERM');
          } catch (err) {
            console.error('Error killing process on timeout:', err);
          }
          reject(new Error('Supabase project creation timed out after 3 minutes'));
        }
      }, 3 * 60 * 1000);

      // Use shell: false for security - arguments are passed directly
      const child = spawn(
        'supabase',
        ['projects', 'create', slug, '--db-password', dbPassword, '--region', 'us-east-1'],
        {
          env: {
            ...process.env,
            FORCE_COLOR: '1',
          },
          shell: false,
        }
      );

      child.stdout.on('data', (data) => {
        const content = data.toString();
        onOutput?.({ type: 'stdout', content });
      });

      child.stderr.on('data', (data) => {
        const content = data.toString();
        stderr += content;
        onOutput?.({ type: 'stderr', content });
      });

      child.on('error', (error) => {
        clearTimeout(timeoutHandle);
        if (!isResolved) {
          isResolved = true;
          reject(new Error(`Failed to create Supabase project: ${error.message}`));
        }
      });

      child.on('close', async (code) => {
        clearTimeout(timeoutHandle);
        if (isResolved) return;
        isResolved = true;

        if (code === 0) {
          try {
            // Get project details including API keys
            const projectInfo = await this.getProjectInfo(slug);
            resolve(projectInfo);
          } catch (error) {
            // If we can't get full details, return partial info
            resolve({
              ref: slug,
              url: `https://${slug}.supabase.co`,
              anonKey: '',
              serviceKey: '',
            });
          }
        } else {
          reject(new Error(`Supabase project creation failed with code ${code}: ${stderr}`));
        }
      });
    });
  }

  private async getProjectInfo(ref: string): Promise<SupabaseProject> {
    // Sanitize the ref to prevent any potential injection
    const sanitizedRef = this.sanitizeSlug(ref);
    if (!sanitizedRef) {
      return {
        ref,
        url: `https://${ref}.supabase.co`,
        anonKey: '',
        serviceKey: '',
      };
    }

    try {
      // Use spawn with args array instead of execAsync to prevent shell injection
      const keysOutput = await new Promise<string>((resolve, reject) => {
        let stdout = '';
        let stderr = '';

        const child = spawn('supabase', ['projects', 'api-keys', '--project-ref', sanitizedRef], {
          shell: false,
          env: process.env,
        });

        // Set timeout (30 seconds)
        const timeout = setTimeout(() => {
          child.kill('SIGTERM');
          reject(new Error('Timeout getting API keys'));
        }, 30000);

        child.stdout?.on('data', (data) => {
          stdout += data.toString();
        });

        child.stderr?.on('data', (data) => {
          stderr += data.toString();
        });

        child.on('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });

        child.on('close', (code) => {
          clearTimeout(timeout);
          if (code === 0) {
            resolve(stdout);
          } else {
            reject(new Error(`Failed to get API keys: ${stderr}`));
          }
        });
      });

      // JWT tokens are base64url encoded with format: header.payload.signature
      // Base64url uses: A-Z, a-z, 0-9, -, _ (no padding = in middle)
      const jwtPattern = /[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;

      // Parse the output line by line
      const lines = keysOutput.split('\n');
      let anonKey = '';
      let serviceKey = '';

      for (const line of lines) {
        const lowerLine = line.toLowerCase();
        const tokens = line.match(jwtPattern);

        if (tokens && tokens.length > 0) {
          if (lowerLine.includes('anon')) {
            anonKey = tokens[0];
          } else if (lowerLine.includes('service_role') || lowerLine.includes('service role')) {
            serviceKey = tokens[0];
          }
        }
      }

      // Fallback: if line-by-line didn't work, try to find any JWTs in order
      if (!anonKey || !serviceKey) {
        const allTokens = keysOutput.match(jwtPattern) || [];
        if (allTokens.length >= 1 && !anonKey) {
          anonKey = allTokens[0];
        }
        if (allTokens.length >= 2 && !serviceKey) {
          serviceKey = allTokens[1];
        }
      }

      return {
        ref,
        url: `https://${ref}.supabase.co`,
        anonKey,
        serviceKey,
      };
    } catch {
      return {
        ref,
        url: `https://${ref}.supabase.co`,
        anonKey: '',
        serviceKey: '',
      };
    }
  }

  /**
   * Helper to spawn a process with timeout and proper error handling
   */
  private spawnWithTimeout(
    command: string,
    args: string[],
    options: { cwd?: string; env?: NodeJS.ProcessEnv },
    onOutput?: OutputCallback,
    timeoutMs: number = DEFAULT_PROCESS_TIMEOUT
  ): Promise<number> {
    return new Promise((resolve, reject) => {
      let isResolved = false;
      let timeoutHandle: NodeJS.Timeout | null = null;

      const child = spawn(command, args, {
        ...options,
        shell: false,
      });

      // Set up timeout
      timeoutHandle = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          try {
            child.kill('SIGTERM');
          } catch (err) {
            console.error('Error killing process on timeout:', err);
          }
          reject(new Error(`Process timed out after ${timeoutMs / 1000} seconds`));
        }
      }, timeoutMs);

      child.stdout?.on('data', (data) => {
        onOutput?.({ type: 'stdout', content: data.toString() });
      });

      child.stderr?.on('data', (data) => {
        onOutput?.({ type: 'stderr', content: data.toString() });
      });

      child.on('error', (error) => {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        if (!isResolved) {
          isResolved = true;
          reject(new Error(`Process error: ${error.message}`));
        }
      });

      child.on('close', (code) => {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        if (!isResolved) {
          isResolved = true;
          resolve(code ?? 1);
        }
      });
    });
  }

  async runMigrations(
    projectPath: string,
    supabaseRef: string,
    onOutput?: OutputCallback
  ): Promise<void> {
    // Sanitize the supabase ref to prevent injection
    const sanitizedRef = this.sanitizeSlug(supabaseRef);
    if (!sanitizedRef) {
      throw new Error('Invalid Supabase project reference');
    }

    // Link the project first (allow failure - might already be linked)
    try {
      await this.spawnWithTimeout(
        'supabase',
        ['link', '--project-ref', sanitizedRef],
        { cwd: projectPath, env: process.env },
        onOutput,
        2 * 60 * 1000 // 2 minute timeout for link
      );
    } catch (err) {
      // Log but continue - might already be linked
      console.warn('Supabase link warning:', err);
      onOutput?.({ type: 'stderr', content: `Link warning: ${err}\n` });
    }

    // Run migrations
    try {
      await this.spawnWithTimeout(
        'supabase',
        ['db', 'push'],
        { cwd: projectPath, env: process.env },
        onOutput,
        5 * 60 * 1000 // 5 minute timeout for migrations
      );
    } catch (err) {
      // Don't fail if migrations fail - might not have any
      console.warn('Supabase migrations warning:', err);
      onOutput?.({ type: 'stderr', content: `Migrations warning: ${err}\n` });
    }
  }

  private generatePassword(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < 24; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }
}
