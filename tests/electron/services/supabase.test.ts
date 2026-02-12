import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import type { ChildProcess } from 'child_process';

vi.mock('child_process', () => ({
  spawn: vi.fn(),
  exec: vi.fn(),
}));

import { spawn } from 'child_process';
import { SupabaseService } from '../../../electron/services/supabase';

const mockedSpawn = vi.mocked(spawn);

/**
 * Creates a mock ChildProcess that emits events like a real spawned process.
 * stdout and stderr are themselves EventEmitters supporting 'data' events.
 */
function createMockChildProcess(): ChildProcess {
  const cp = new EventEmitter() as ChildProcess;
  (cp as any).stdout = new EventEmitter();
  (cp as any).stderr = new EventEmitter();
  cp.kill = vi.fn();
  (cp as any).pid = 1234;
  return cp;
}

describe('SupabaseService', () => {
  let service: SupabaseService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SupabaseService();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Access private methods for unit testing
  const callSanitizeSlug = (svc: SupabaseService, name: string): string => {
    return (svc as any).sanitizeSlug(name);
  };

  const callGeneratePassword = (svc: SupabaseService): string => {
    return (svc as any).generatePassword();
  };

  // ─── sanitizeSlug ───────────────────────────────────────────────────

  describe('sanitizeSlug', () => {
    it('converts to lowercase and replaces special characters with hyphens', () => {
      const result = callSanitizeSlug(service, 'My Cool Project!@#');
      expect(result).toBe('my-cool-project');
    });

    it('trims leading and trailing hyphens', () => {
      const result = callSanitizeSlug(service, '---hello-world---');
      expect(result).toBe('hello-world');
    });

    it('limits output to 50 characters', () => {
      const longName = 'a'.repeat(100);
      const result = callSanitizeSlug(service, longName);
      expect(result).toHaveLength(50);
      expect(result).toBe('a'.repeat(50));
    });

    it('returns empty string for input with no alphanumeric characters', () => {
      const result = callSanitizeSlug(service, '!!!@@@###');
      expect(result).toBe('');
    });
  });

  // ─── createProject ─────────────────────────────────────────────────

  describe('createProject', () => {
    it('throws for invalid name that produces an empty slug', async () => {
      await expect(service.createProject('!!!')).rejects.toThrow(
        'Invalid project name - must contain at least one alphanumeric character'
      );
      expect(mockedSpawn).not.toHaveBeenCalled();
    });

    it('spawns supabase CLI with correct arguments', async () => {
      // First spawn: createProject
      const createChild = createMockChildProcess();
      // Second spawn: getProjectInfo
      const apiKeysChild = createMockChildProcess();

      mockedSpawn
        .mockReturnValueOnce(createChild as any)
        .mockReturnValueOnce(apiKeysChild as any);

      const promise = service.createProject('My Test Project');

      // Let the create child succeed
      process.nextTick(() => {
        createChild.emit('close', 0);

        // After close, getProjectInfo is called and spawns another process
        process.nextTick(() => {
          const apiKeysOutput = [
            '  anon     | eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSJ9.abc123',
            '  service_role | eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSJ9.xyz789',
          ].join('\n');

          (apiKeysChild as any).stdout.emit('data', Buffer.from(apiKeysOutput));
          apiKeysChild.emit('close', 0);
        });
      });

      await promise;

      // Verify the first spawn call (createProject)
      expect(mockedSpawn).toHaveBeenCalledWith(
        'supabase',
        expect.arrayContaining(['projects', 'create', 'my-test-project']),
        expect.objectContaining({ shell: false })
      );

      const firstCallArgs = mockedSpawn.mock.calls[0][1] as string[];
      expect(firstCallArgs).toContain('--db-password');
      expect(firstCallArgs).toContain('--region');
      expect(firstCallArgs).toContain('us-east-1');
    });

    it('calls getProjectInfo on successful creation and returns project info', async () => {
      const createChild = createMockChildProcess();
      const apiKeysChild = createMockChildProcess();

      mockedSpawn
        .mockReturnValueOnce(createChild as any)
        .mockReturnValueOnce(apiKeysChild as any);

      const promise = service.createProject('myproject');

      process.nextTick(() => {
        createChild.emit('close', 0);

        process.nextTick(() => {
          const apiKeysOutput = [
            '  anon     | eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSJ9.anonkey',
            '  service_role | eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSJ9.svckey',
          ].join('\n');

          (apiKeysChild as any).stdout.emit('data', Buffer.from(apiKeysOutput));
          apiKeysChild.emit('close', 0);
        });
      });

      const result = await promise;

      // Verify getProjectInfo was called (second spawn)
      expect(mockedSpawn).toHaveBeenCalledTimes(2);
      expect(mockedSpawn).toHaveBeenNthCalledWith(
        2,
        'supabase',
        ['projects', 'api-keys', '--project-ref', 'myproject'],
        expect.objectContaining({ shell: false })
      );

      expect(result).toEqual({
        ref: 'myproject',
        url: 'https://myproject.supabase.co',
        anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSJ9.anonkey',
        serviceKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSJ9.svckey',
      });
    });

    it('rejects when the spawn process exits with a non-zero code', async () => {
      const createChild = createMockChildProcess();
      mockedSpawn.mockReturnValueOnce(createChild as any);

      const promise = service.createProject('myproject');

      process.nextTick(() => {
        (createChild as any).stderr.emit('data', Buffer.from('some error occurred'));
        createChild.emit('close', 1);
      });

      await expect(promise).rejects.toThrow('Supabase project creation failed with code 1');
    });

    it('rejects with timeout error after 3 minutes', async () => {
      vi.useFakeTimers();
      const createChild = createMockChildProcess();
      mockedSpawn.mockReturnValueOnce(createChild as any);

      const promise = service.createProject('myproject');

      // Advance time past the 3-minute timeout
      vi.advanceTimersByTime(3 * 60 * 1000);

      await expect(promise).rejects.toThrow('Supabase project creation timed out after 3 minutes');
      expect(createChild.kill).toHaveBeenCalledWith('SIGTERM');
    });
  });

  // ─── getProjectInfo ─────────────────────────────────────────────────

  describe('getProjectInfo', () => {
    const callGetProjectInfo = (svc: SupabaseService, ref: string) => {
      return (svc as any).getProjectInfo(ref);
    };

    it('parses anon and service_role keys from labeled output lines', async () => {
      const apiKeysChild = createMockChildProcess();
      mockedSpawn.mockReturnValueOnce(apiKeysChild as any);

      const promise = callGetProjectInfo(service, 'test-ref');

      process.nextTick(() => {
        const output = [
          '  anon     | eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSJ9.abc123',
          '  service_role | eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSJ9.xyz789',
        ].join('\n');

        (apiKeysChild as any).stdout.emit('data', Buffer.from(output));
        apiKeysChild.emit('close', 0);
      });

      const result = await promise;

      expect(result).toEqual({
        ref: 'test-ref',
        url: 'https://test-ref.supabase.co',
        anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSJ9.abc123',
        serviceKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSJ9.xyz789',
      });
    });

    it('falls back to positional JWT matching when labels are absent', async () => {
      const apiKeysChild = createMockChildProcess();
      mockedSpawn.mockReturnValueOnce(apiKeysChild as any);

      const promise = callGetProjectInfo(service, 'test-ref');

      process.nextTick(() => {
        // Output without anon/service_role labels -- just two JWT tokens on separate lines
        const output = [
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSJ9.firsttoken',
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSJ9.secondtoken',
        ].join('\n');

        (apiKeysChild as any).stdout.emit('data', Buffer.from(output));
        apiKeysChild.emit('close', 0);
      });

      const result = await promise;

      expect(result.anonKey).toBe(
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSJ9.firsttoken'
      );
      expect(result.serviceKey).toBe(
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSJ9.secondtoken'
      );
    });
  });

  // ─── generatePassword ──────────────────────────────────────────────

  describe('generatePassword', () => {
    it('returns a 24-character string from the expected charset', () => {
      const password = callGeneratePassword(service);
      expect(password).toHaveLength(24);

      const allowedChars =
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
      for (const char of password) {
        expect(allowedChars).toContain(char);
      }
    });
  });

  // ─── runMigrations ─────────────────────────────────────────────────

  describe('runMigrations', () => {
    it('runs link then push commands in sequence', async () => {
      // Use mockImplementation so each spawned child auto-closes on next tick
      mockedSpawn.mockImplementation(() => {
        const child = createMockChildProcess();
        process.nextTick(() => {
          child.emit('close', 0);
        });
        return child as any;
      });

      await service.runMigrations('/path/to/project', 'my-ref');

      expect(mockedSpawn).toHaveBeenCalledTimes(2);

      // First call: link
      expect(mockedSpawn).toHaveBeenNthCalledWith(
        1,
        'supabase',
        ['link', '--project-ref', 'my-ref'],
        expect.objectContaining({ cwd: '/path/to/project', shell: false })
      );

      // Second call: db push
      expect(mockedSpawn).toHaveBeenNthCalledWith(
        2,
        'supabase',
        ['db', 'push'],
        expect.objectContaining({ cwd: '/path/to/project', shell: false })
      );
    });

    it('continues to run push even when link fails', async () => {
      // Suppress the console.warn from the link failure
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      let callCount = 0;
      mockedSpawn.mockImplementation(() => {
        callCount++;
        const child = createMockChildProcess();
        process.nextTick(() => {
          if (callCount === 1) {
            // Link child fails with an error
            child.emit('error', new Error('link failed'));
          } else {
            // Push child succeeds
            child.emit('close', 0);
          }
        });
        return child as any;
      });

      await service.runMigrations('/path/to/project', 'my-ref');

      // Both commands should have been spawned
      expect(mockedSpawn).toHaveBeenCalledTimes(2);

      // Second call should still be db push
      expect(mockedSpawn).toHaveBeenNthCalledWith(
        2,
        'supabase',
        ['db', 'push'],
        expect.objectContaining({ cwd: '/path/to/project', shell: false })
      );

      warnSpy.mockRestore();
    });
  });
});
