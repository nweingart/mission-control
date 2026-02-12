import { spawn, exec, ChildProcess } from 'child_process';
import { promisify } from 'util';
import { homedir } from 'os';
import { join } from 'path';
import { existsSync, readFileSync } from 'fs';

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

  async getOrganizations(): Promise<Array<{ id: string; name: string }>> {
    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';

      const child = spawn('supabase', ['orgs', 'list'], {
        shell: false,
        env: process.env,
      });

      const timeout = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error('Timeout listing Supabase organizations'));
      }, 30000);

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('error', (err) => {
        clearTimeout(timeout);
        reject(new Error(`Failed to list organizations: ${err.message}`));
      });

      child.on('close', (code) => {
        clearTimeout(timeout);
        if (code !== 0) {
          reject(new Error(`Failed to list organizations: ${stderr}`));
          return;
        }

        // Parse table output — rows look like: "  ID  |  NAME  "
        const orgs: Array<{ id: string; name: string }> = [];
        const lines = stdout.split('\n');
        for (const line of lines) {
          // Skip header, separator, and empty lines
          if (!line.includes('|')) continue;
          const parts = line.split('|').map((s) => s.trim());
          if (parts.length < 2) continue;
          const id = parts[0];
          const name = parts[1];
          // Skip header row (contains "ID" or "ORGANIZATION ID")
          if (!id || id.toUpperCase() === 'ID' || id.toUpperCase().includes('ORGANIZATION')) continue;
          // Validate both id and name are non-empty strings
          if (id && name && id.trim().length > 0 && name.trim().length > 0) {
            orgs.push({ id: id.trim(), name: name.trim() });
          }
        }

        resolve(orgs);
      });
    });
  }

  async getProjects(): Promise<Array<{ ref: string; name: string; orgId: string; region: string }>> {
    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';

      const child = spawn('supabase', ['projects', 'list'], {
        shell: false,
        env: process.env,
      });

      const timeout = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error('Timeout listing Supabase projects'));
      }, 30000);

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('error', (err) => {
        clearTimeout(timeout);
        reject(new Error(`Failed to list projects: ${err.message}`));
      });

      child.on('close', (code) => {
        clearTimeout(timeout);
        if (code !== 0) {
          reject(new Error(`Failed to list projects: ${stderr}`));
          return;
        }

        // Parse table output — columns: LINKED | ORG ID | REFERENCE ID | NAME | REGION | CREATED AT
        const projects: Array<{ ref: string; name: string; orgId: string; region: string }> = [];
        const lines = stdout.split('\n');
        for (const line of lines) {
          if (!line.includes('|')) continue;
          const parts = line.split('|').map((s) => s.trim());
          if (parts.length < 5) continue;
          // Skip header/separator rows
          const refCandidate = parts[2];
          if (!refCandidate || refCandidate.toUpperCase() === 'REFERENCE ID' || /^-+$/.test(refCandidate)) continue;
          const orgId = parts[1];
          const name = parts[3];
          const region = parts[4];
          if (refCandidate && refCandidate.trim().length > 0 && name && name.trim().length > 0 && orgId && orgId.trim().length > 0) {
            projects.push({ ref: refCandidate.trim(), name: name.trim(), orgId: orgId.trim(), region: (region || '').trim() });
          }
        }

        resolve(projects);
      });
    });
  }

  async getProjectKeys(ref: string): Promise<SupabaseProject> {
    return this.getProjectInfo(ref);
  }

  async createProject(
    name: string,
    orgId: string,
    onOutput?: OutputCallback
  ): Promise<SupabaseProject> {
    if (!orgId || typeof orgId !== 'string' || orgId.trim().length === 0) {
      throw new Error('Organization ID is missing. Please select an organization and try again.');
    }
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      throw new Error('Project name is missing.');
    }

    // Generate a sanitized slug from the name
    const slug = this.sanitizeSlug(name);

    if (!slug) {
      throw new Error('Invalid project name - must contain at least one alphanumeric character');
    }

    // Sanitize org ID (alphanumeric and hyphens only)
    const sanitizedOrgId = orgId.replace(/[^a-zA-Z0-9-]/g, '');
    if (!sanitizedOrgId) {
      throw new Error('Invalid organization ID');
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
        ['projects', 'create', slug, '--db-password', dbPassword, '--region', 'us-east-1', '--org-id', sanitizedOrgId],
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
          // Retry key retrieval — new projects may need 30-60s to provision
          const maxAttempts = 8;
          const delayMs = 8000;
          let lastErr: Error | null = null;
          for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
              if (attempt > 0) {
                onOutput?.({ type: 'stdout', content: `Waiting for API keys (attempt ${attempt + 1}/${maxAttempts})...\n` });
                await new Promise(r => setTimeout(r, delayMs));
              }
              const projectInfo = await this.getProjectInfo(slug);
              if (projectInfo.anonKey && projectInfo.serviceKey) {
                resolve(projectInfo);
                return;
              }
              lastErr = new Error('API keys not yet available');
            } catch (error) {
              lastErr = error instanceof Error ? error : new Error(String(error));
            }
          }
          reject(new Error(`Supabase project "${slug}" was created, but API keys could not be retrieved after ${maxAttempts} attempts.`));
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
      throw new Error(`Invalid Supabase project reference: "${ref}"`);
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
        if (allTokens.length >= 1 && !anonKey && allTokens[0]) {
          anonKey = allTokens[0];
        }
        if (allTokens.length >= 2 && !serviceKey && allTokens[1]) {
          serviceKey = allTokens[1];
        }
      }

      if (!anonKey || !serviceKey) {
        throw new Error('API keys could not be parsed from Supabase CLI output. The CLI output format may have changed.');
      }

      return {
        ref,
        url: `https://${ref}.supabase.co`,
        anonKey,
        serviceKey,
      };
    } catch (err) {
      throw new Error(`Failed to retrieve API keys for project "${ref}": ${err instanceof Error ? err.message : String(err)}`);
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

  /**
   * Retrieve Supabase Management API access token.
   * Checks macOS Keychain first, then falls back to file-based token.
   */
  async getAccessToken(): Promise<string> {
    // Try macOS Keychain first (where `supabase login` stores it)
    try {
      const { stdout } = await execAsync(
        'security find-generic-password -s "Supabase CLI" -w'
      );
      const token = stdout.trim();
      if (token) return token;
    } catch {
      // Not in keychain, try file fallback
    }

    // Fallback: ~/.supabase/access-token (older CLI versions)
    const tokenPath = join(homedir(), '.supabase', 'access-token');
    if (existsSync(tokenPath)) {
      const token = readFileSync(tokenPath, 'utf-8').trim();
      if (token) return token;
    }

    throw new Error('No Supabase access token found. Run `supabase login` first.');
  }

  /**
   * Execute SQL against a Supabase project via the Management API.
   */
  async executeSql(ref: string, sql: string): Promise<any[]> {
    const token = await this.getAccessToken();
    const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    });
    if (!res.ok) throw new Error(`SQL execution failed (${res.status}): ${await res.text()}`);
    return res.json();
  }

  /**
   * Query information_schema.columns filtered by schema.
   * Returns rows with table/column metadata for the given schema.
   */
  async getSchemaTableInfo(ref: string, schema?: string): Promise<any[]> {
    const targetSchema = schema || 'public';
    // Use parameterized-style quoting by escaping single quotes in the schema name
    const safeSchema = targetSchema.replace(/'/g, "''");
    const sql = `
      SELECT table_schema, table_name, column_name, data_type, udt_name,
             is_nullable, column_default,
             (SELECT true FROM information_schema.table_constraints tc
              JOIN information_schema.key_column_usage kcu
                ON tc.constraint_name = kcu.constraint_name
                AND tc.table_schema = kcu.table_schema
              WHERE tc.constraint_type = 'PRIMARY KEY'
                AND kcu.table_schema = c.table_schema
                AND kcu.table_name = c.table_name
                AND kcu.column_name = c.column_name
              LIMIT 1) AS is_primary_key,
             (SELECT true FROM information_schema.table_constraints tc
              JOIN information_schema.key_column_usage kcu
                ON tc.constraint_name = kcu.constraint_name
                AND tc.table_schema = kcu.table_schema
              WHERE tc.constraint_type = 'FOREIGN KEY'
                AND kcu.table_schema = c.table_schema
                AND kcu.table_name = c.table_name
                AND kcu.column_name = c.column_name
              LIMIT 1) AS is_foreign_key
      FROM information_schema.columns c
      WHERE table_schema = '${safeSchema}'
      ORDER BY table_name, ordinal_position;
    `;
    return this.executeSql(ref, sql);
  }

  /**
   * Drop a schema with CASCADE. Refuses to drop protected schemas.
   */
  async dropSchema(ref: string, schema: string): Promise<void> {
    const protectedSchemas = [
      'public', 'auth', 'storage', 'extensions', 'realtime',
      'supabase_migrations', 'information_schema', 'pg_catalog',
    ];
    if (protectedSchemas.includes(schema)) {
      throw new Error(`Cannot drop protected schema: ${schema}`);
    }
    // Escape the schema name for safe use in SQL
    const safeSchema = schema.replace(/"/g, '""');
    await this.executeSql(ref, `DROP SCHEMA IF EXISTS "${safeSchema}" CASCADE;`);
  }

  /**
   * Delete an entire Supabase project via CLI.
   */
  async deleteSupabaseProject(ref: string): Promise<void> {
    const sanitizedRef = this.sanitizeSlug(ref);
    if (!sanitizedRef) throw new Error('Invalid project ref');
    await this.spawnWithTimeout(
      'supabase',
      ['projects', 'delete', '--ref', sanitizedRef],
      { env: process.env },
      undefined,
      60000
    );
  }

  async fetchOpenApiSpec(supabaseUrl: string, serviceKey: string): Promise<any> {
    const response = await fetch(`${supabaseUrl}/rest/v1/`, {
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
      },
    });
    if (!response.ok) throw new Error(`Failed to fetch schema: ${response.status}`);
    return response.json();
  }

  private generatePassword(): string {
    const { randomBytes } = require('crypto') as typeof import('crypto');
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    const bytes = randomBytes(24);
    let password = '';
    for (let i = 0; i < 24; i++) {
      password += chars.charAt(bytes[i] % chars.length);
    }
    return password;
  }
}
