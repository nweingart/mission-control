import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import { VercelService } from '../../../electron/services/vercel';

// Mock child_process at the module level
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

const mockSpawn = vi.mocked(spawn);

// ---------------------------------------------------------------------------
// Helper: create a mock ChildProcess with controllable stdout/stderr/events
// ---------------------------------------------------------------------------
function createMockChild() {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
    pid: number;
    kill: ReturnType<typeof vi.fn>;
  };

  child.stdout = stdout;
  child.stderr = stderr;
  child.stdin = { write: vi.fn(), end: vi.fn() };
  child.pid = 12345;
  child.kill = vi.fn();

  return child;
}

// ---------------------------------------------------------------------------
// Helpers to drive mock child lifecycle
// ---------------------------------------------------------------------------
function emitStdout(child: ReturnType<typeof createMockChild>, data: string) {
  child.stdout.emit('data', Buffer.from(data));
}

function emitStderr(child: ReturnType<typeof createMockChild>, data: string) {
  child.stderr.emit('data', Buffer.from(data));
}

function emitClose(child: ReturnType<typeof createMockChild>, code: number) {
  child.emit('close', code);
}

function emitError(child: ReturnType<typeof createMockChild>, error: Error) {
  child.emit('error', error);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('VercelService', () => {
  beforeEach(() => {
    mockSpawn.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -----------------------------------------------------------------------
  // sanitizeEnvVar -- tested indirectly through deploy by inspecting the
  // args array passed to spawn. The function is module-private so we
  // verify its behaviour via the public deploy interface.
  // -----------------------------------------------------------------------

  describe('sanitizeEnvVar (via deploy)', () => {
    it('rejects keys starting with a number or containing special characters', async () => {
      const child = createMockChild();
      mockSpawn.mockReturnValue(child as any);

      const service = new VercelService();
      const promise = service.deploy('/project', {
        '1INVALID': 'value1',
        'BAD-KEY': 'value2',
        'has spaces': 'value3',
        'ok@key': 'value4',
      });

      process.nextTick(() => {
        emitStdout(child, 'https://my-app.vercel.app\n');
        emitClose(child, 0);
      });

      await promise;

      // spawn should have been called with NO --env flags because all keys are invalid
      const args = mockSpawn.mock.calls[0][1] as string[];
      expect(args).not.toContain('--env');
    });

    it('accepts valid keys (letters, underscores, digits after first char)', async () => {
      const child = createMockChild();
      mockSpawn.mockReturnValue(child as any);

      const service = new VercelService();
      const promise = service.deploy('/project', {
        VALID_KEY: 'value1',
        _also_valid: 'value2',
        A123: 'value3',
      });

      process.nextTick(() => {
        emitStdout(child, 'https://my-app.vercel.app\n');
        emitClose(child, 0);
      });

      await promise;

      const args = mockSpawn.mock.calls[0][1] as string[];
      // All three keys should be accepted and present as --env pairs
      expect(args).toContain('--env');

      const envPairs = args.filter((_a, i) => i > 0 && args[i - 1] === '--env');
      expect(envPairs).toEqual(
        expect.arrayContaining([
          'VALID_KEY=value1',
          '_also_valid=value2',
          'A123=value3',
        ])
      );
      expect(envPairs).toHaveLength(3);
    });

    it('removes control characters from values', async () => {
      const child = createMockChild();
      mockSpawn.mockReturnValue(child as any);

      const service = new VercelService();
      const promise = service.deploy('/project', {
        MY_VAR: 'hello\x00world\r\nfoo',
      });

      process.nextTick(() => {
        emitStdout(child, 'https://my-app.vercel.app\n');
        emitClose(child, 0);
      });

      await promise;

      const args = mockSpawn.mock.calls[0][1] as string[];
      const envPairs = args.filter((_a, i) => i > 0 && args[i - 1] === '--env');
      // Control characters (\x00), carriage return (\r), and newline (\n) should be stripped
      expect(envPairs).toContain('MY_VAR=helloworldfoo');
    });

    it('returns null (skips env var) when value is empty after sanitization', async () => {
      const child = createMockChild();
      mockSpawn.mockReturnValue(child as any);

      const service = new VercelService();
      // Value consisting solely of control characters should become empty after sanitization
      const promise = service.deploy('/project', {
        EMPTY_AFTER: '\x00\x01\x02\r\n',
      });

      process.nextTick(() => {
        emitStdout(child, 'https://my-app.vercel.app\n');
        emitClose(child, 0);
      });

      await promise;

      const args = mockSpawn.mock.calls[0][1] as string[];
      // The env var should have been dropped entirely
      expect(args).not.toContain('--env');
    });
  });

  // -----------------------------------------------------------------------
  // deploy -- core behaviour
  // -----------------------------------------------------------------------

  describe('deploy', () => {
    it('resolves with URL and projectId on successful deploy (.vercel.app match)', async () => {
      const child = createMockChild();
      mockSpawn.mockReturnValue(child as any);

      const service = new VercelService();
      const promise = service.deploy('/my/project');

      process.nextTick(() => {
        emitStdout(child, 'Deploying...\n');
        emitStdout(child, 'Project: my-cool-project\n');
        emitStdout(child, 'https://my-cool-project-abc123.vercel.app\n');
        emitClose(child, 0);
      });

      const result = await promise;

      expect(result.url).toBe('https://my-cool-project-abc123.vercel.app');
      expect(result.projectId).toBe('my-cool-project');

      // Verify spawn was called with the correct base args
      expect(mockSpawn).toHaveBeenCalledWith(
        'vercel',
        ['deploy', '--yes', '--prod'],
        expect.objectContaining({
          cwd: '/my/project',
          shell: false,
        })
      );

      // Verify FORCE_COLOR is set
      const spawnEnv = mockSpawn.mock.calls[0][2]?.env as Record<string, string>;
      expect(spawnEnv.FORCE_COLOR).toBe('1');
    });

    it('resolves with fallback URL when no .vercel.app domain is present', async () => {
      const child = createMockChild();
      mockSpawn.mockReturnValue(child as any);

      const service = new VercelService();
      const promise = service.deploy('/my/project');

      process.nextTick(() => {
        emitStdout(child, 'Deploying...\n');
        emitStdout(child, 'https://custom-domain.example.com\n');
        emitClose(child, 0);
      });

      const result = await promise;

      // Should fall back to the last https URL found
      expect(result.url).toBe('https://custom-domain.example.com');
    });

    it('passes sanitized env vars as --env KEY=VALUE arguments', async () => {
      const child = createMockChild();
      mockSpawn.mockReturnValue(child as any);

      const service = new VercelService();
      const promise = service.deploy('/my/project', {
        API_KEY: 'secret123',
        DB_HOST: 'localhost',
      });

      process.nextTick(() => {
        emitStdout(child, 'https://app.vercel.app\n');
        emitClose(child, 0);
      });

      await promise;

      const args = mockSpawn.mock.calls[0][1] as string[];
      expect(args).toEqual([
        'deploy',
        '--yes',
        '--prod',
        '--env',
        'API_KEY=secret123',
        '--env',
        'DB_HOST=localhost',
      ]);
    });

    it('rejects with friendly message when Vercel CLI is not found (ENOENT)', async () => {
      const child = createMockChild();
      mockSpawn.mockReturnValue(child as any);

      const service = new VercelService();
      const promise = service.deploy('/my/project');

      process.nextTick(() => {
        const error = new Error('spawn vercel ENOENT');
        emitError(child, error);
      });

      await expect(promise).rejects.toThrow(
        'Vercel CLI not found. Please install it with "npm i -g vercel" and try again.'
      );
    });

    it('rejects with auth message when not logged in', async () => {
      const child = createMockChild();
      mockSpawn.mockReturnValue(child as any);

      const service = new VercelService();
      const promise = service.deploy('/my/project');

      process.nextTick(() => {
        emitStderr(child, 'Error: not logged in\n');
        emitClose(child, 1);
      });

      await expect(promise).rejects.toThrow(
        'Vercel CLI is not authenticated. Please run "vercel login" in your terminal and try again.'
      );
    });

    it('rejects with network message on network errors', async () => {
      const child = createMockChild();
      mockSpawn.mockReturnValue(child as any);

      const service = new VercelService();
      const promise = service.deploy('/my/project');

      process.nextTick(() => {
        emitStderr(child, 'Error: getaddrinfo ENOTFOUND api.vercel.com\n');
        emitClose(child, 1);
      });

      await expect(promise).rejects.toThrow(
        'Network error during Vercel deployment. Please check your internet connection and try again.'
      );
    });

    it('rejects on timeout after 10 minutes and kills the child process', async () => {
      vi.useFakeTimers();

      const child = createMockChild();
      mockSpawn.mockReturnValue(child as any);

      const service = new VercelService();
      const promise = service.deploy('/my/project');

      // Advance time by 10 minutes to trigger the timeout
      vi.advanceTimersByTime(10 * 60 * 1000);

      await expect(promise).rejects.toThrow(
        'Vercel deployment timed out after 10 minutes'
      );

      // Verify the child process was killed
      expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('extracts projectId from "Project: xxx" in stdout', async () => {
      const child = createMockChild();
      mockSpawn.mockReturnValue(child as any);

      const service = new VercelService();
      const promise = service.deploy('/my/project');

      process.nextTick(() => {
        emitStdout(child, 'Inspect: https://vercel.com/team/project/abc\n');
        emitStdout(child, 'Project: my-awesome-project\n');
        emitStdout(child, 'https://my-awesome-project-123.vercel.app\n');
        emitClose(child, 0);
      });

      const result = await promise;

      expect(result.projectId).toBe('my-awesome-project');
    });
  });
});
