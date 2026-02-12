import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted runs *before* vi.mock hoisting, so these variables are available
// inside the mock factories that get hoisted to the top of the file.
const { execMock, platformMock } = vi.hoisted(() => ({
  execMock: vi.fn(),
  platformMock: vi.fn(() => 'darwin'),
}));

// Mock child_process.exec at the module level so that promisify(exec) in the
// source module picks up the mock when the module is first evaluated.
vi.mock('child_process', () => ({
  exec: execMock,
}));

// Mock os.platform so we can control the which/where choice
vi.mock('os', async () => {
  const actual = await vi.importActual<typeof import('os')>('os');
  return {
    ...actual,
    platform: () => platformMock(),
    homedir: () => '/mock-home',
  };
});

import { CLICheckService } from '../../../electron/services/cli-check';

/**
 * Helper that configures `execMock` to resolve/reject based on the command
 * string. Each entry in `behaviors` maps a substring (matched against the
 * command) to either:
 *   - `{ stdout, stderr }` for success
 *   - `{ error: Error }` for failure
 *
 * The first matching entry wins. If no entry matches the call rejects with a
 * generic error so tests fail loudly if an unexpected command is executed.
 */
type ExecBehavior =
  | { stdout: string; stderr?: string }
  | { error: Error };

function setupExec(behaviors: [substring: string, behavior: ExecBehavior][]) {
  execMock.mockImplementation(
    (cmd: string, _opts: unknown, callback: (err: Error | null, result: { stdout: string; stderr: string }) => void) => {
      for (const [substring, behavior] of behaviors) {
        if (cmd.includes(substring)) {
          if ('error' in behavior) {
            callback(behavior.error, { stdout: '', stderr: '' });
          } else {
            callback(null, { stdout: behavior.stdout, stderr: behavior.stderr ?? '' });
          }
          return;
        }
      }
      // No match -- fail explicitly so missing stubs are caught
      callback(new Error(`unmocked command: ${cmd}`), { stdout: '', stderr: '' });
    },
  );
}

describe('CLICheckService', () => {
  let service: CLICheckService;

  beforeEach(() => {
    vi.clearAllMocks();
    platformMock.mockReturnValue('darwin');
    service = new CLICheckService();
  });

  // ---------------------------------------------------------------------------
  // commandExists (tested indirectly via the public methods)
  // ---------------------------------------------------------------------------
  describe('commandExists (via checkClaude)', () => {
    it('returns true when the command is found', async () => {
      setupExec([
        ['which claude', { stdout: '/usr/local/bin/claude' }],
        ['claude --version', { stdout: '1.0.0' }],
      ]);

      const result = await service.checkClaude();
      expect(result.installed).toBe(true);
    });

    it('returns false when the command is not found', async () => {
      setupExec([
        ['which claude', { error: new Error('not found') }],
      ]);

      const result = await service.checkClaude();
      expect(result.installed).toBe(false);
      expect(result.authenticated).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // checkClaude
  // ---------------------------------------------------------------------------
  describe('checkClaude', () => {
    it('returns not installed when which fails', async () => {
      setupExec([
        ['which claude', { error: new Error('not found') }],
      ]);

      const result = await service.checkClaude();
      expect(result).toEqual({ installed: false, authenticated: false });
    });

    it('returns installed and authenticated when version succeeds with output', async () => {
      setupExec([
        ['which claude', { stdout: '/usr/local/bin/claude' }],
        ['claude --version', { stdout: '1.2.3' }],
      ]);

      const result = await service.checkClaude();
      expect(result).toEqual({ installed: true, authenticated: true });
    });

    it('returns installed but not authenticated when version command fails', async () => {
      setupExec([
        ['which claude', { stdout: '/usr/local/bin/claude' }],
        ['claude --version', { error: new Error('timeout') }],
      ]);

      const result = await service.checkClaude();
      expect(result).toEqual({ installed: true, authenticated: false });
    });
  });

  // ---------------------------------------------------------------------------
  // checkClaudeDeep
  // ---------------------------------------------------------------------------
  describe('checkClaudeDeep', () => {
    it('returns installed and authenticated on a successful deep check', async () => {
      setupExec([
        ['which claude', { stdout: '/usr/local/bin/claude' }],
        ['claude -p "ok" --max-turns 1', { stdout: 'OK, I understand.' }],
      ]);

      const result = await service.checkClaudeDeep();
      expect(result).toEqual({ installed: true, authenticated: true });
    });

    it('returns installed but not authenticated when deep check fails', async () => {
      setupExec([
        ['which claude', { stdout: '/usr/local/bin/claude' }],
        ['claude -p "ok" --max-turns 1', { error: new Error('auth error') }],
      ]);

      const result = await service.checkClaudeDeep();
      expect(result).toEqual({ installed: true, authenticated: false });
    });
  });

  // ---------------------------------------------------------------------------
  // checkGitHub
  // ---------------------------------------------------------------------------
  describe('checkGitHub', () => {
    it('returns not installed when which fails', async () => {
      setupExec([
        ['which gh', { error: new Error('not found') }],
      ]);

      const result = await service.checkGitHub();
      expect(result).toEqual({ installed: false, authenticated: false });
    });

    it('returns authenticated when "Logged in" appears in stdout', async () => {
      setupExec([
        ['which gh', { stdout: '/usr/local/bin/gh' }],
        ['gh auth status', { stdout: 'github.com\n  Logged in to github.com account user (token)' }],
      ]);

      const result = await service.checkGitHub();
      expect(result).toEqual({ installed: true, authenticated: true });
    });

    it('returns authenticated when "Logged in" appears in the error message', async () => {
      setupExec([
        ['which gh', { stdout: '/usr/local/bin/gh' }],
        ['gh auth status', { error: new Error('Logged in to github.com account user') }],
      ]);

      const result = await service.checkGitHub();
      expect(result).toEqual({ installed: true, authenticated: true });
    });

    it('returns not authenticated when "Logged in" is absent', async () => {
      setupExec([
        ['which gh', { stdout: '/usr/local/bin/gh' }],
        ['gh auth status', { stdout: 'You are not logged in to any GitHub hosts' }],
      ]);

      const result = await service.checkGitHub();
      expect(result).toEqual({ installed: true, authenticated: false });
    });
  });

  // ---------------------------------------------------------------------------
  // checkVercel
  // ---------------------------------------------------------------------------
  describe('checkVercel', () => {
    it('returns not installed when which fails', async () => {
      setupExec([
        ['which vercel', { error: new Error('not found') }],
      ]);

      const result = await service.checkVercel();
      expect(result).toEqual({ installed: false, authenticated: false });
    });

    it('returns authenticated when whoami returns a valid username', async () => {
      setupExec([
        ['which vercel', { stdout: '/usr/local/bin/vercel' }],
        ['vercel whoami', { stdout: 'johndoe\n' }],
      ]);

      const result = await service.checkVercel();
      expect(result).toEqual({ installed: true, authenticated: true });
    });

    it('returns not authenticated when output includes "not logged in"', async () => {
      setupExec([
        ['which vercel', { stdout: '/usr/local/bin/vercel' }],
        ['vercel whoami', { stdout: 'not logged in\n' }],
      ]);

      const result = await service.checkVercel();
      expect(result).toEqual({ installed: true, authenticated: false });
    });

    it('returns not authenticated when output includes "Error"', async () => {
      setupExec([
        ['which vercel', { stdout: '/usr/local/bin/vercel' }],
        ['vercel whoami', { stdout: 'Error: some problem occurred' }],
      ]);

      const result = await service.checkVercel();
      expect(result).toEqual({ installed: true, authenticated: false });
    });
  });

  // ---------------------------------------------------------------------------
  // checkSupabase
  // ---------------------------------------------------------------------------
  describe('checkSupabase', () => {
    it('returns not installed when which fails', async () => {
      setupExec([
        ['which supabase', { error: new Error('not found') }],
      ]);

      const result = await service.checkSupabase();
      expect(result).toEqual({ installed: false, authenticated: false });
    });

    it('returns authenticated when projects list succeeds without auth errors', async () => {
      setupExec([
        ['which supabase', { stdout: '/usr/local/bin/supabase' }],
        ['supabase projects list', { stdout: 'ID | NAME\n123 | my-project' }],
      ]);

      const result = await service.checkSupabase();
      expect(result).toEqual({ installed: true, authenticated: true });
    });

    it('returns not authenticated when output contains "Access token not provided"', async () => {
      setupExec([
        ['which supabase', { stdout: '/usr/local/bin/supabase' }],
        ['supabase projects list', { stdout: 'Error: Access token not provided' }],
      ]);

      const result = await service.checkSupabase();
      expect(result).toEqual({ installed: true, authenticated: false });
    });

    it('returns not authenticated when output contains "not logged in"', async () => {
      setupExec([
        ['which supabase', { stdout: '/usr/local/bin/supabase' }],
        ['supabase projects list', { stdout: 'You are not logged in' }],
      ]);

      const result = await service.checkSupabase();
      expect(result).toEqual({ installed: true, authenticated: false });
    });

    it('returns not authenticated when error message contains auth phrases', async () => {
      setupExec([
        ['which supabase', { stdout: '/usr/local/bin/supabase' }],
        ['supabase projects list', { error: new Error('Unauthorized: invalid token') }],
      ]);

      const result = await service.checkSupabase();
      expect(result).toEqual({ installed: true, authenticated: false });
    });

    it('returns not authenticated on non-auth errors (e.g. network timeout)', async () => {
      setupExec([
        ['which supabase', { stdout: '/usr/local/bin/supabase' }],
        ['supabase projects list', { error: new Error('ETIMEDOUT') }],
      ]);

      const result = await service.checkSupabase();
      expect(result).toEqual({ installed: true, authenticated: false });
    });
  });

  // ---------------------------------------------------------------------------
  // checkAll
  // ---------------------------------------------------------------------------
  describe('checkAll', () => {
    it('runs all checks in parallel and returns combined results', async () => {
      setupExec([
        // claude
        ['which claude', { stdout: '/usr/local/bin/claude' }],
        ['claude --version', { stdout: '1.0.0' }],
        // gh
        ['which gh', { stdout: '/usr/local/bin/gh' }],
        ['gh auth status', { stdout: 'Logged in to github.com' }],
        // vercel
        ['which vercel', { stdout: '/usr/local/bin/vercel' }],
        ['vercel whoami', { stdout: 'myuser' }],
        // supabase
        ['which supabase', { error: new Error('not found') }],
      ]);

      const result = await service.checkAll();

      expect(result).toEqual({
        claude: { installed: true, authenticated: true },
        github: { installed: true, authenticated: true },
        vercel: { installed: true, authenticated: true },
        supabase: { installed: false, authenticated: false },
      });
    });
  });
});
