import { spawn } from 'child_process';

type OutputCallback = (data: { type: 'stdout' | 'stderr'; content: string }) => void;

interface DeployResult {
  url: string;
  projectId: string;
}

/**
 * Validate and sanitize environment variable key/value pairs.
 * Keys must be valid environment variable names.
 * Values are validated to prevent shell injection.
 */
function sanitizeEnvVar(key: string, value: string): { key: string; value: string } | null {
  // Validate key: must be alphanumeric with underscores, starting with letter or underscore
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    console.warn(`Invalid environment variable key: ${key}`);
    return null;
  }

  // For values, we use a whitelist approach
  // Allow: alphanumeric, URL-safe characters, common punctuation
  // Since we're using shell: false with spawn and passing as array args,
  // the main concern is ensuring the value doesn't contain newlines or null bytes
  const sanitizedValue = value
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '') // Remove control characters except tab/newline
    .replace(/[\r\n]/g, '') // Remove newlines
    .trim();

  if (sanitizedValue !== value) {
    console.warn(`Environment variable value for ${key} was sanitized (control characters removed)`);
  }

  // Verify value isn't empty after sanitization
  if (sanitizedValue.length === 0 && value.length > 0) {
    console.warn(`Environment variable ${key} was empty after sanitization`);
    return null;
  }

  return { key, value: sanitizedValue };
}

// Default timeout for Vercel deploy (10 minutes)
const VERCEL_DEPLOY_TIMEOUT = 10 * 60 * 1000;

export class VercelService {
  async deploy(
    projectPath: string,
    envVars?: Record<string, string>,
    onOutput?: OutputCallback
  ): Promise<DeployResult> {
    return new Promise((resolve, reject) => {
      let isResolved = false;

      // Build the vercel deploy command
      const args = ['deploy', '--yes', '--prod'];

      // Add environment variables with validation
      if (envVars) {
        for (const [key, value] of Object.entries(envVars)) {
          const sanitized = sanitizeEnvVar(key, value);
          if (sanitized) {
            args.push('--env', `${sanitized.key}=${sanitized.value}`);
          }
        }
      }

      // Get home directory for Vercel auth
      const homedir = process.env.HOME || require('os').homedir();

      // Build PATH with common CLI locations
      const extraPaths = [
        `${homedir}/.local/bin`,
        '/opt/homebrew/bin',
        '/usr/local/bin',
      ];
      const currentPath = process.env.PATH || '';
      const fullPath = [...extraPaths, ...currentPath.split(':')].join(':');

      // Use shell: false for security - arguments are passed directly without shell interpretation
      const child = spawn('vercel', args, {
        cwd: projectPath,
        env: {
          ...process.env,
          HOME: homedir,
          PATH: fullPath,
          FORCE_COLOR: '1',
        },
        shell: false,
      });

      // Set up timeout
      const timeoutHandle = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          try {
            child.kill('SIGTERM');
          } catch (err) {
            console.error('Error killing Vercel process on timeout:', err);
          }
          reject(new Error('Vercel deployment timed out after 10 minutes'));
        }
      }, VERCEL_DEPLOY_TIMEOUT);

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        const content = data.toString();
        stdout += content;
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
          if (error.message.includes('ENOENT')) {
            reject(new Error('Vercel CLI not found. Please install it with "npm i -g vercel" and try again.'));
          } else {
            reject(new Error(`Failed to start Vercel deploy: ${error.message}`));
          }
        }
      });

      child.on('close', (code) => {
        clearTimeout(timeoutHandle);
        if (isResolved) return;
        isResolved = true;

        if (code === 0) {
          // Parse the URL from stdout
          let url = '';

          // Try .vercel.app first (most common)
          const vercelAppMatch = stdout.match(/https:\/\/[^\s]+\.vercel\.app/);
          if (vercelAppMatch) {
            url = vercelAppMatch[0];
          } else {
            // Try any https URL that looks like a deployment URL
            const httpsMatches = stdout.match(/https:\/\/[a-zA-Z0-9][-a-zA-Z0-9]*[a-zA-Z0-9]\.[^\s]+/g);
            if (httpsMatches && httpsMatches.length > 0) {
              url = httpsMatches[httpsMatches.length - 1];
              url = url.replace(/[,;:!?]+$/, '');
            }
          }

          // Try to parse project ID from output
          const projectIdMatch = stdout.match(/Project: ([^\s]+)/);
          const projectId = projectIdMatch ? projectIdMatch[1] : '';

          resolve({ url, projectId });
        } else {
          // Map known error patterns to actionable messages
          const combined = stderr + stdout;
          let message: string;
          if (combined.includes('not logged in') || combined.includes('No credentials found') || combined.includes('Invalid token')) {
            message = 'Vercel CLI is not authenticated. Please run "vercel login" in your terminal and try again.';
          } else if (combined.includes('ENOTFOUND') || combined.includes('network') || combined.includes('ETIMEDOUT')) {
            message = 'Network error during Vercel deployment. Please check your internet connection and try again.';
          } else {
            message = `Vercel deploy failed (exit code ${code}): ${stderr.slice(0, 500)}`;
          }
          reject(new Error(message));
        }
      });
    });
  }
}
