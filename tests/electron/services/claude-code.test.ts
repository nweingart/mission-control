import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockPty, createMockChild } from '../../helpers';

// ---- Module-level mocks ----

let mockPty: ReturnType<typeof createMockPty>;

vi.mock('node-pty', () => ({
  spawn: vi.fn(),
}));

// We need to intercept require('child_process') used inside the `chat` method.
// The chat method does `const { spawn } = require('child_process')`.
const mockCpSpawn = vi.fn();
vi.mock('child_process', () => ({
  spawn: mockCpSpawn,
}));

// Mock fs, os, path used via require/import inside spawn and chat
const mockWriteFileSync = vi.fn();
const mockUnlinkSync = vi.fn();
vi.mock('fs', () => ({
  default: { writeFileSync: mockWriteFileSync, unlinkSync: mockUnlinkSync },
  writeFileSync: mockWriteFileSync,
  unlinkSync: mockUnlinkSync,
}));

vi.mock('os', () => ({
  default: { tmpdir: () => '/tmp' },
  tmpdir: () => '/tmp',
}));

vi.mock('path', () => ({
  default: { join: (...parts: string[]) => parts.join('/') },
  join: (...parts: string[]) => parts.join('/'),
}));

// ---- Import the module under test AFTER mocks are set up ----
import { ClaudeCodeService } from '../../../electron/services/claude-code';
import * as pty from 'node-pty';

describe('ClaudeCodeService', () => {
  let service: ClaudeCodeService;

  beforeEach(() => {
    // Create a fresh mock PTY for each test
    mockPty = createMockPty();
    vi.mocked(pty.spawn).mockReturnValue(mockPty as unknown as pty.IPty);

    service = new ClaudeCodeService();

    // Reset call counts on fs mocks
    mockWriteFileSync.mockClear();
    mockUnlinkSync.mockClear();
    mockCpSpawn.mockClear();
  });

  afterEach(() => {
    // Kill all sessions to prevent timers leaking
    service.killAll();
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------
  // 1. spawn returns a session ID
  // -------------------------------------------------------
  describe('spawn', () => {
    it('returns a session ID matching the expected format', () => {
      const onOutput = vi.fn();
      const onExit = vi.fn();

      const sessionId = service.spawn('/project', 'hello', onOutput, onExit);

      expect(sessionId).toMatch(/^session-\d+-[a-z0-9]+$/);
    });

    // -------------------------------------------------------
    // 2. spawn kills previous active session
    // -------------------------------------------------------
    it('kills the previous active session when a new one is spawned', () => {
      const onOutput1 = vi.fn();
      const onExit1 = vi.fn();
      const onOutput2 = vi.fn();
      const onExit2 = vi.fn();

      const firstPty = createMockPty();
      vi.mocked(pty.spawn).mockReturnValueOnce(firstPty as unknown as pty.IPty);

      const firstId = service.spawn('/project', 'prompt1', onOutput1, onExit1);

      // Second spawn should kill the first session
      const secondPty = createMockPty();
      vi.mocked(pty.spawn).mockReturnValueOnce(secondPty as unknown as pty.IPty);

      const secondId = service.spawn('/project', 'prompt2', onOutput2, onExit2);

      expect(firstPty.kill).toHaveBeenCalled();
      expect(firstId).not.toBe(secondId);
    });

    // -------------------------------------------------------
    // 3. spawn calls onOutput with data from PTY
    // -------------------------------------------------------
    it('calls onOutput with data from PTY after flush interval', () => {
      vi.useFakeTimers();

      const onOutput = vi.fn();
      const onExit = vi.fn();

      const sessionId = service.spawn('/project', 'hello', onOutput, onExit);

      // Emit data from the mock PTY
      mockPty._emitData('some output');

      // Output is throttled at 16ms intervals
      vi.advanceTimersByTime(16);

      expect(onOutput).toHaveBeenCalledWith({
        sessionId,
        type: 'stdout',
        content: 'some output',
      });

      vi.useRealTimers();
    });

    // -------------------------------------------------------
    // 4. spawn calls onExit when PTY exits
    // -------------------------------------------------------
    it('calls onExit when the PTY process exits', () => {
      const onOutput = vi.fn();
      const onExit = vi.fn();

      const sessionId = service.spawn('/project', 'hello', onOutput, onExit);

      mockPty._emitExit(0);

      expect(onExit).toHaveBeenCalledWith({
        sessionId,
        code: 0,
      });
    });
  });

  // -------------------------------------------------------
  // 5. spawnInteractive returns a session ID
  // -------------------------------------------------------
  describe('spawnInteractive', () => {
    it('returns a session ID matching the expected format', () => {
      const onOutput = vi.fn();
      const onExit = vi.fn();

      const sessionId = service.spawnInteractive('/project', onOutput, onExit);

      expect(sessionId).toMatch(/^session-\d+-[a-z0-9]+$/);
    });
  });

  // -------------------------------------------------------
  // 6-9. sendInput
  // -------------------------------------------------------
  describe('sendInput', () => {
    // 6. sendInput writes to PTY
    it('writes the input string to the PTY', () => {
      const onOutput = vi.fn();
      const onExit = vi.fn();
      const sessionId = service.spawn('/project', 'hello', onOutput, onExit);

      service.sendInput(sessionId, 'test input');

      expect(mockPty.write).toHaveBeenCalledWith('test input');
    });

    // 7. sendInput throws for missing session
    it('throws an error when the session does not exist', () => {
      expect(() => {
        service.sendInput('nonexistent-session', 'data');
      }).toThrow('Session not found: nonexistent-session');
    });

    // 8. sendInput throws for input exceeding MAX_INPUT_SIZE (1MB)
    it('throws an error when input exceeds MAX_INPUT_SIZE', () => {
      const onOutput = vi.fn();
      const onExit = vi.fn();
      const sessionId = service.spawn('/project', 'hello', onOutput, onExit);

      const largeInput = 'x'.repeat(1024 * 1024 + 1);

      expect(() => {
        service.sendInput(sessionId, largeInput);
      }).toThrow(/Input too large/);
    });

    // 9. sendInput throws for non-string input
    it('throws an error when input is not a string', () => {
      const onOutput = vi.fn();
      const onExit = vi.fn();
      const sessionId = service.spawn('/project', 'hello', onOutput, onExit);

      expect(() => {
        service.sendInput(sessionId, 42 as unknown as string);
      }).toThrow('Input must be a string');
    });
  });

  // -------------------------------------------------------
  // 10-11. resize
  // -------------------------------------------------------
  describe('resize', () => {
    // 10. resize calls pty.resize
    it('calls pty.resize with the specified dimensions', () => {
      const onOutput = vi.fn();
      const onExit = vi.fn();
      const sessionId = service.spawn('/project', 'hello', onOutput, onExit);

      service.resize(sessionId, 100, 50);

      expect(mockPty.resize).toHaveBeenCalledWith(100, 50);
    });

    // 11. resize silently ignores missing session
    it('silently ignores resize for a non-existent session', () => {
      // Should not throw
      expect(() => {
        service.resize('nonexistent-session', 80, 24);
      }).not.toThrow();
    });
  });

  // -------------------------------------------------------
  // 12. kill calls pty.kill and cleans up session
  // -------------------------------------------------------
  describe('kill', () => {
    it('kills the PTY and removes the session', () => {
      const onOutput = vi.fn();
      const onExit = vi.fn();
      const sessionId = service.spawn('/project', 'hello', onOutput, onExit);

      service.kill(sessionId);

      expect(mockPty.kill).toHaveBeenCalled();

      // After killing, sendInput should fail because the session is gone
      expect(() => {
        service.sendInput(sessionId, 'data');
      }).toThrow(`Session not found: ${sessionId}`);
    });
  });

  // -------------------------------------------------------
  // 13. killAll kills all sessions
  // -------------------------------------------------------
  describe('killAll', () => {
    it('kills all active sessions', () => {
      const pty1 = createMockPty();
      const pty2 = createMockPty();

      vi.mocked(pty.spawn)
        .mockReturnValueOnce(pty1 as unknown as pty.IPty)
        .mockReturnValueOnce(pty2 as unknown as pty.IPty);

      const onOutput = vi.fn();
      const onExit = vi.fn();

      // Spawn first - it becomes active
      const id1 = service.spawnInteractive('/project1', onOutput, onExit);
      // Spawn second - first gets killed, second becomes active
      // But we want to test killAll with multiple sessions tracked.
      // Since spawn kills the previous active session, we need a different approach.
      // Let's directly use spawnInteractive twice but note the first gets killed on second spawn.
      // Instead, let's spawn one, then manually add a second by spawning interactive.
      // Actually, the service kills the previous active on second spawn. Let's just test
      // that killAll cleans up whatever sessions remain.

      // After first spawn, kill tracking via spawn's "kill previous" mechanism:
      // We spawn a second; the first PTY is killed but the second is alive.
      const id2 = service.spawnInteractive('/project2', onOutput, onExit);

      // pty1 was killed by the second spawn
      expect(pty1.kill).toHaveBeenCalled();

      // Now killAll should kill pty2
      service.killAll();

      expect(pty2.kill).toHaveBeenCalled();

      // All sessions should be gone
      expect(() => {
        service.sendInput(id2, 'data');
      }).toThrow(/Session not found/);
    });
  });

  // -------------------------------------------------------
  // 14-16. stripAnsiCodes
  // -------------------------------------------------------
  describe('stripAnsiCodes', () => {
    // 14. Removes CSI sequences
    it('removes CSI (Control Sequence Introducer) escape sequences', () => {
      const input = '\x1b[31mred text\x1b[0m normal';
      const result = service.stripAnsiCodes(input);
      expect(result).toBe('red text normal');
    });

    // 15. Removes OSC sequences
    it('removes OSC (Operating System Command) sequences', () => {
      // OSC terminated by BEL (\x07)
      const inputBel = '\x1b]0;Window Title\x07some text';
      expect(service.stripAnsiCodes(inputBel)).toBe('some text');

      // OSC terminated by ST (\x1b\\)
      const inputSt = '\x1b]0;Window Title\x1b\\some text';
      expect(service.stripAnsiCodes(inputSt)).toBe('some text');
    });

    // 16. Removes carriage returns and bracketed paste markers
    it('removes carriage returns and bracketed paste mode markers', () => {
      const input = 'line1\r\nline2\r[?2004hsome text[?2004l';
      const result = service.stripAnsiCodes(input);
      expect(result).toBe('line1\nline2some text');
    });

    it('removes DCS and other escape sequences', () => {
      const input = '\x1bP0;1|17/ab\x1b\\rest of text';
      const result = service.stripAnsiCodes(input);
      expect(result).toBe('rest of text');
    });

    it('removes lone escape characters', () => {
      const input = 'before\x1bafter';
      const result = service.stripAnsiCodes(input);
      expect(result).toBe('beforeafter');
    });

    it('removes cursor visibility markers', () => {
      const input = '[?25hvisible text[?25l';
      const result = service.stripAnsiCodes(input);
      expect(result).toBe('visible text');
    });
  });

  // -------------------------------------------------------
  // 17-18. Completion detection
  // -------------------------------------------------------
  describe('completion detection', () => {
    // 17. enableCompletionDetection detects "TASK COMPLETE" after idle period
    it('fires callback when "TASK COMPLETE" is detected followed by 4s idle', () => {
      vi.useFakeTimers();

      const onOutput = vi.fn();
      const onExit = vi.fn();
      const sessionId = service.spawn('/project', 'hello', onOutput, onExit);

      const completionCallback = vi.fn();
      service.enableCompletionDetection(sessionId, completionCallback);

      // Emit data containing the completion signal
      mockPty._emitData('TASK COMPLETE\n');

      // Callback should NOT be called immediately
      expect(completionCallback).not.toHaveBeenCalled();

      // Advance past the 4-second idle timer
      vi.advanceTimersByTime(4000);

      expect(completionCallback).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });

    it('resets idle timer when new output arrives after signal', () => {
      vi.useFakeTimers();

      const onOutput = vi.fn();
      const onExit = vi.fn();
      const sessionId = service.spawn('/project', 'hello', onOutput, onExit);

      const completionCallback = vi.fn();
      service.enableCompletionDetection(sessionId, completionCallback);

      // Emit completion signal
      mockPty._emitData('TASK COMPLETE\n');

      // Wait 3 seconds (not enough)
      vi.advanceTimersByTime(3000);
      expect(completionCallback).not.toHaveBeenCalled();

      // New output arrives - resets the 4s timer
      mockPty._emitData('more output\n');

      // Wait another 3 seconds (total 6s, but only 3s since last output)
      vi.advanceTimersByTime(3000);
      expect(completionCallback).not.toHaveBeenCalled();

      // Wait 1 more second (4s since last output)
      vi.advanceTimersByTime(1000);
      expect(completionCallback).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });

    // 18. completion detection rejects signal inside code fence
    it('ignores "TASK COMPLETE" when inside a fenced code block', () => {
      vi.useFakeTimers();

      const onOutput = vi.fn();
      const onExit = vi.fn();
      const sessionId = service.spawn('/project', 'hello', onOutput, onExit);

      const completionCallback = vi.fn();
      service.enableCompletionDetection(sessionId, completionCallback);

      // Emit data with TASK COMPLETE inside a code fence (odd number of ``` before it)
      mockPty._emitData('```\nTASK COMPLETE\n');

      // Even after 4 seconds, callback should NOT fire because it's inside a code fence
      vi.advanceTimersByTime(4000);

      expect(completionCallback).not.toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('detects "TASK COMPLETE" after code fence is closed', () => {
      vi.useFakeTimers();

      const onOutput = vi.fn();
      const onExit = vi.fn();
      const sessionId = service.spawn('/project', 'hello', onOutput, onExit);

      const completionCallback = vi.fn();
      service.enableCompletionDetection(sessionId, completionCallback);

      // Open and close a code fence, then signal
      mockPty._emitData('```\nsome code\n```\nTASK COMPLETE\n');

      vi.advanceTimersByTime(4000);

      expect(completionCallback).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });

    it('detects case-insensitive "task complete" with extra whitespace', () => {
      vi.useFakeTimers();

      const onOutput = vi.fn();
      const onExit = vi.fn();
      const sessionId = service.spawn('/project', 'hello', onOutput, onExit);

      const completionCallback = vi.fn();
      service.enableCompletionDetection(sessionId, completionCallback);

      mockPty._emitData('  Task  Complete  \n');

      vi.advanceTimersByTime(4000);

      expect(completionCallback).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });
  });

  // -------------------------------------------------------
  // 19. resetCompletionDetection clears state but keeps callback
  // -------------------------------------------------------
  describe('resetCompletionDetection', () => {
    it('clears detection state but keeps the callback so it can re-trigger', () => {
      vi.useFakeTimers();

      const onOutput = vi.fn();
      const onExit = vi.fn();
      const sessionId = service.spawn('/project', 'hello', onOutput, onExit);

      const completionCallback = vi.fn();
      service.enableCompletionDetection(sessionId, completionCallback);

      // Emit the signal
      mockPty._emitData('TASK COMPLETE\n');

      // Reset before the idle timer fires
      service.resetCompletionDetection(sessionId);

      // Advance time - callback should NOT fire because we reset
      vi.advanceTimersByTime(4000);
      expect(completionCallback).not.toHaveBeenCalled();

      // But the callback is still registered, so emitting the signal again should work
      mockPty._emitData('TASK COMPLETE\n');
      vi.advanceTimersByTime(4000);
      expect(completionCallback).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });
  });

  // -------------------------------------------------------
  // 20. disableCompletionDetection removes state entirely
  // -------------------------------------------------------
  describe('disableCompletionDetection', () => {
    it('removes completion detection entirely so signals are ignored', () => {
      vi.useFakeTimers();

      const onOutput = vi.fn();
      const onExit = vi.fn();
      const sessionId = service.spawn('/project', 'hello', onOutput, onExit);

      const completionCallback = vi.fn();
      service.enableCompletionDetection(sessionId, completionCallback);

      // Disable entirely
      service.disableCompletionDetection(sessionId);

      // Emit the signal
      mockPty._emitData('TASK COMPLETE\n');

      // Advance time - callback should NOT fire because detection is fully removed
      vi.advanceTimersByTime(4000);

      expect(completionCallback).not.toHaveBeenCalled();

      vi.useRealTimers();
    });
  });
});
