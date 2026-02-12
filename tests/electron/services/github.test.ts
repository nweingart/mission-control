import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockChild } from '../../helpers';

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------

const mockSpawn = vi.fn();
vi.mock('child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
}));

const mockExistsSync = vi.fn();
const mockWriteFileSync = vi.fn();
const mockReadFileSync = vi.fn();
vi.mock('fs', () => ({
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
  writeFileSync: (...args: unknown[]) => mockWriteFileSync(...args),
  readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
}));

// ---------------------------------------------------------------------------
// Import *after* mocks are wired up
// ---------------------------------------------------------------------------

import { GitHubService } from '../../../electron/services/github';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Queue a series of mock spawn results. Each entry in `calls` is consumed in
 * order. The helper uses `createMockChild` from the project helpers so that
 * stdout / stderr / close events fire on the next tick exactly as the real
 * implementation expects.
 */
function queueSpawn(
  calls: Array<{ stdout?: string; stderr?: string; exitCode?: number }>
) {
  const queue = [...calls];
  mockSpawn.mockImplementation(() => {
    const next = queue.shift();
    if (!next) {
      // Fallback – succeeds with empty output
      return createMockChild({ stdout: '', stderr: '', exitCode: 0 });
    }
    return createMockChild(next);
  });
}

/**
 * Queue a spawn that emits an `error` event (e.g. ENOENT) instead of data +
 * close.
 */
function queueSpawnError(errorMessage: string) {
  mockSpawn.mockImplementationOnce(() => {
    const child = createMockChild(); // no auto-emit overrides
    process.nextTick(() => {
      child.emit('error', new Error(errorMessage));
    });
    return child;
  });
}

const PROJECT = '/fake/project';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GitHubService', () => {
  let service: GitHubService;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: false });
    service = new GitHubService();
  });

  // ── checkGitStatus ──────────────────────────────────────────────────────

  describe('checkGitStatus', () => {
    it('returns hasGitRepo=false for a non-git directory', async () => {
      queueSpawn([{ stdout: '', stderr: '', exitCode: 128 }]);

      const status = await service.checkGitStatus(PROJECT);

      expect(status).toEqual({
        hasGitRepo: false,
        hasRemote: false,
        remoteUrl: '',
        isDirty: false,
      });
    });

    it('detects an existing repo with a remote', async () => {
      queueSpawn([
        // rev-parse --is-inside-work-tree
        { stdout: 'true\n', exitCode: 0 },
        // remote get-url origin
        { stdout: 'https://github.com/user/repo\n', exitCode: 0 },
        // status --porcelain
        { stdout: '', exitCode: 0 },
      ]);

      const status = await service.checkGitStatus(PROJECT);

      expect(status).toEqual({
        hasGitRepo: true,
        hasRemote: true,
        remoteUrl: 'https://github.com/user/repo',
        isDirty: false,
      });
    });

    it('detects dirty working tree', async () => {
      queueSpawn([
        { stdout: 'true\n', exitCode: 0 },
        { stdout: 'https://github.com/user/repo\n', exitCode: 0 },
        { stdout: ' M src/index.ts\n', exitCode: 0 },
      ]);

      const status = await service.checkGitStatus(PROJECT);

      expect(status.isDirty).toBe(true);
    });
  });

  // ── gitInit ─────────────────────────────────────────────────────────────

  describe('gitInit', () => {
    it('succeeds when git init exits with code 0', async () => {
      queueSpawn([{ stdout: 'Initialized empty Git repository\n', exitCode: 0 }]);

      await expect(service.gitInit(PROJECT)).resolves.toBeUndefined();
      expect(mockSpawn).toHaveBeenCalledWith(
        'git',
        ['init'],
        expect.objectContaining({ cwd: PROJECT }),
      );
    });

    it('throws when git init fails', async () => {
      queueSpawn([{ stderr: 'fatal: cannot mkdir', exitCode: 128 }]);

      await expect(service.gitInit(PROJECT)).rejects.toThrow('git init failed');
    });
  });

  // ── ensureGitignore ─────────────────────────────────────────────────────

  describe('ensureGitignore', () => {
    it('creates a new .gitignore from the template when none exists', async () => {
      mockExistsSync.mockReturnValue(false);

      await service.ensureGitignore(PROJECT);

      expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
      const [path, content] = mockWriteFileSync.mock.calls[0];
      expect(path).toContain('.gitignore');
      expect(content).toContain('node_modules/');
      expect(content).toContain('.next/');
      expect(content).toContain('.env');
    });

    it('appends missing entries to an existing .gitignore', async () => {
      mockExistsSync.mockReturnValue(true);
      // Existing gitignore only has node_modules
      mockReadFileSync.mockReturnValue('node_modules/\n');

      await service.ensureGitignore(PROJECT);

      expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
      const written: string = mockWriteFileSync.mock.calls[0][1];
      expect(written).toContain('# Added by Kiln');
      expect(written).toContain('.next/');
      expect(written).toContain('.env');
      expect(written).toContain('.vercel/');
      expect(written).toContain('.DS_Store');
      // Should NOT re-add node_modules since it already exists
      expect(written.match(/node_modules/g)?.length).toBe(1);
    });
  });

  // ── ensureGitConfig ─────────────────────────────────────────────────────

  describe('ensureGitConfig', () => {
    it('skips setting config if user.name is already set', async () => {
      queueSpawn([
        // git config user.name → already set
        { stdout: 'existinguser\n', exitCode: 0 },
      ]);

      await service.ensureGitConfig(PROJECT, 'newuser');

      // Only 1 spawn call (the check), no setter calls
      expect(mockSpawn).toHaveBeenCalledTimes(1);
    });

    it('sets user.name and user.email when not configured', async () => {
      queueSpawn([
        // git config user.name → not set
        { stdout: '', exitCode: 1 },
        // git config user.name <username>
        { stdout: '', exitCode: 0 },
        // git config user.email <email>
        { stdout: '', exitCode: 0 },
      ]);

      await service.ensureGitConfig(PROJECT, 'octocat');

      expect(mockSpawn).toHaveBeenCalledTimes(3);
      // Second call: set user.name
      expect(mockSpawn.mock.calls[1][1]).toEqual(['config', 'user.name', 'octocat']);
      // Third call: set user.email
      expect(mockSpawn.mock.calls[2][1]).toEqual([
        'config',
        'user.email',
        'octocat@users.noreply.github.com',
      ]);
    });
  });

  // ── gitAddAndCommit ─────────────────────────────────────────────────────

  describe('gitAddAndCommit', () => {
    it('returns commit hash with isNewCommit=true on success', async () => {
      queueSpawn([
        // git add .
        { stdout: '', exitCode: 0 },
        // git status --porcelain (has changes)
        { stdout: 'A  newfile.ts\n', exitCode: 0 },
        // git commit -m
        { stdout: '', exitCode: 0 },
        // git rev-parse --short HEAD
        { stdout: 'abc1234\n', exitCode: 0 },
      ]);

      const result = await service.gitAddAndCommit(PROJECT, 'initial commit');

      expect(result).toEqual({ commitHash: 'abc1234', isNewCommit: true });
    });

    it('returns isNewCommit=false when nothing to commit', async () => {
      queueSpawn([
        // git add .
        { stdout: '', exitCode: 0 },
        // git status --porcelain (clean)
        { stdout: '', exitCode: 0 },
        // git rev-parse --short HEAD (existing hash)
        { stdout: 'def5678\n', exitCode: 0 },
      ]);

      const result = await service.gitAddAndCommit(PROJECT, 'nothing changed');

      expect(result).toEqual({ commitHash: 'def5678', isNewCommit: false });
    });

    it('throws when git add fails', async () => {
      queueSpawn([
        { stderr: 'fatal: not a git repository', exitCode: 128 },
      ]);

      await expect(service.gitAddAndCommit(PROJECT, 'msg')).rejects.toThrow(
        'git add failed',
      );
    });
  });

  // ── createGitHubRepoAndPush ─────────────────────────────────────────────

  describe('createGitHubRepoAndPush', () => {
    it('sanitizes the repo name (replaces special chars, trims hyphens)', async () => {
      queueSpawn([
        {
          stdout: 'https://github.com/user/my-cool-project\n',
          exitCode: 0,
        },
      ]);

      await service.createGitHubRepoAndPush(PROJECT, '  My Cool Project! ');

      // The name passed to gh should be sanitized
      const ghArgs = mockSpawn.mock.calls[0][1] as string[];
      expect(ghArgs[2]).toBe('My-Cool-Project');
    });

    it('throws on auth error', async () => {
      queueSpawn([
        {
          stderr: 'not logged into any GitHub hosts. Run gh auth login',
          exitCode: 1,
        },
      ]);

      await expect(
        service.createGitHubRepoAndPush(PROJECT, 'repo'),
      ).rejects.toThrow('GitHub CLI is not authenticated');
    });

    it('throws on name collision', async () => {
      queueSpawn([
        {
          stderr: 'Name already exists on this account',
          exitCode: 1,
        },
      ]);

      await expect(
        service.createGitHubRepoAndPush(PROJECT, 'repo'),
      ).rejects.toThrow('Name already exists');
    });
  });

  // ── gitPush ─────────────────────────────────────────────────────────────

  describe('gitPush', () => {
    it('throws on SSH auth failure', async () => {
      queueSpawn([
        {
          stderr: 'Permission denied (publickey)',
          exitCode: 128,
        },
      ]);

      await expect(service.gitPush(PROJECT)).rejects.toThrow(
        'SSH key authentication failed during push',
      );
    });

    it('throws on network error', async () => {
      queueSpawn([
        {
          stderr: 'fatal: Could not resolve host github.com',
          exitCode: 128,
        },
      ]);

      await expect(service.gitPush(PROJECT)).rejects.toThrow(
        'Network error during git push',
      );
    });
  });

  // ── getCurrentBranch ────────────────────────────────────────────────────

  describe('getCurrentBranch', () => {
    it('returns the trimmed branch name', async () => {
      queueSpawn([{ stdout: 'feature/cool-thing\n', exitCode: 0 }]);

      const branch = await service.getCurrentBranch(PROJECT);

      expect(branch).toBe('feature/cool-thing');
    });
  });

  // ── runCommand internals ────────────────────────────────────────────────

  describe('runCommand (via public methods)', () => {
    it('times out after the configured duration', async () => {
      // Create a child that never closes
      mockSpawn.mockImplementationOnce(() => {
        return createMockChild(); // no overrides → never auto-emits
      });

      // gitInit calls runCommand with default GIT_TIMEOUT (2 minutes)
      const promise = service.gitInit(PROJECT);

      // Advance timers past the 2-minute timeout
      vi.advanceTimersByTime(2 * 60 * 1000 + 100);

      await expect(promise).rejects.toThrow('timed out');
    });

    it('maps ENOENT for "gh" to a friendly message', async () => {
      queueSpawnError('spawn gh ENOENT');

      await expect(service.getGitHubUsername()).rejects.toThrow(
        'GitHub CLI (gh) not found',
      );
    });
  });

  // ── Branch operations ───────────────────────────────────────────────────

  describe('branch operations', () => {
    it('createAndCheckoutBranch spawns git checkout -b', async () => {
      queueSpawn([{ stdout: '', exitCode: 0 }]);

      await service.createAndCheckoutBranch(PROJECT, 'feature/xyz');

      expect(mockSpawn).toHaveBeenCalledWith(
        'git',
        ['checkout', '-b', 'feature/xyz'],
        expect.objectContaining({ cwd: PROJECT }),
      );
    });

    it('checkoutBranch spawns git checkout', async () => {
      queueSpawn([{ stdout: '', exitCode: 0 }]);

      await service.checkoutBranch(PROJECT, 'main');

      expect(mockSpawn).toHaveBeenCalledWith(
        'git',
        ['checkout', 'main'],
        expect.objectContaining({ cwd: PROJECT }),
      );
    });

    it('mergeBranch spawns git merge --no-ff', async () => {
      queueSpawn([{ stdout: '', exitCode: 0 }]);

      await service.mergeBranch(PROJECT, 'feature/xyz');

      expect(mockSpawn).toHaveBeenCalledWith(
        'git',
        ['merge', 'feature/xyz', '--no-ff', '-m', 'Merge feature/xyz'],
        expect.objectContaining({ cwd: PROJECT }),
      );
    });
  });

  // ── getGitHubUsername ───────────────────────────────────────────────────

  describe('getGitHubUsername', () => {
    it('returns the trimmed username', async () => {
      queueSpawn([{ stdout: 'octocat\n', exitCode: 0 }]);

      const username = await service.getGitHubUsername();

      expect(username).toBe('octocat');
    });

    it('throws a friendly message on auth error', async () => {
      queueSpawn([
        {
          stderr: 'not logged into any GitHub hosts. Run gh auth login',
          exitCode: 1,
        },
      ]);

      await expect(service.getGitHubUsername()).rejects.toThrow(
        'GitHub CLI is not authenticated',
      );
    });
  });
});
