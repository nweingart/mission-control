import { vi } from 'vitest';
import { EventEmitter } from 'events';

/**
 * Create a mock child_process.spawn result with controllable stdin/stdout/stderr/events.
 */
export function createMockChild(overrides?: {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
}) {
  const stdout = new EventEmitter() as EventEmitter & { pipe: ReturnType<typeof vi.fn> };
  const stderr = new EventEmitter() as EventEmitter & { pipe: ReturnType<typeof vi.fn> };
  const child = new EventEmitter() as EventEmitter & {
    stdout: typeof stdout;
    stderr: typeof stderr;
    stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
    pid: number;
    kill: ReturnType<typeof vi.fn>;
  };

  child.stdout = stdout;
  child.stderr = stderr;
  child.stdin = { write: vi.fn(), end: vi.fn() };
  child.pid = 12345;
  child.kill = vi.fn();

  // Auto-emit data and close events on next tick if data provided
  if (overrides) {
    process.nextTick(() => {
      if (overrides.stdout) {
        child.stdout.emit('data', Buffer.from(overrides.stdout));
      }
      if (overrides.stderr) {
        child.stderr.emit('data', Buffer.from(overrides.stderr));
      }
      child.emit('close', overrides.exitCode ?? 0);
    });
  }

  return child;
}

/**
 * Create a mock node-pty IPty instance.
 */
export function createMockPty() {
  const onDataListeners: Array<(data: string) => void> = [];
  const onExitListeners: Array<(e: { exitCode: number; signal?: number }) => void> = [];

  return {
    pid: 99999,
    cols: 120,
    rows: 30,
    process: 'mock-pty',
    handleFlowControl: false,

    onData: vi.fn((cb: (data: string) => void) => {
      onDataListeners.push(cb);
      return { dispose: vi.fn() };
    }),

    onExit: vi.fn((cb: (e: { exitCode: number; signal?: number }) => void) => {
      onExitListeners.push(cb);
      return { dispose: vi.fn() };
    }),

    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    clear: vi.fn(),

    // Test helpers to trigger events
    _emitData(data: string) {
      for (const cb of onDataListeners) cb(data);
    },
    _emitExit(code: number) {
      for (const cb of onExitListeners) cb({ exitCode: code });
    },
  };
}
