import * as pty from 'node-pty';

interface IDisposable {
  dispose(): void;
}

interface Session {
  id: string;
  pty: pty.IPty;
  projectPath: string;
  disposables: IDisposable[]; // Track listeners for cleanup
}

interface CompletionState {
  enabled: boolean;
  cumulativeBuffer: string;
  idleTimer: NodeJS.Timeout | null;
  signalDetected: boolean;
  callback: (() => void) | null;
}

type OutputCallback = (data: { sessionId: string; type: 'stdout' | 'stderr'; content: string }) => void;
type ExitCallback = (data: { sessionId: string; code: number }) => void;

export class ClaudeCodeService {
  private sessions: Map<string, Session> = new Map();
  private completionStates: Map<string, CompletionState> = new Map();
  private isProcessing: boolean = false;
  private activeSessionId: string | null = null;

  spawn(
    projectPath: string,
    prompt: string,
    onOutput: OutputCallback,
    onExit: ExitCallback
  ): string {
    const sessionId = this.generateId();

    // If another session is active, kill it
    if (this.isProcessing && this.activeSessionId) {
      console.warn(`Claude session already active (${this.activeSessionId}). Killing previous session.`);
      this.kill(this.activeSessionId);
    }

    this.isProcessing = true;
    this.activeSessionId = sessionId;

    try {
      const homedir = process.env.HOME || '';
      const extraPaths = [
        `${homedir}/.local/bin`,
        '/opt/homebrew/bin',
        '/usr/local/bin',
      ];
      const currentPath = process.env.PATH || '';
      const pathParts = currentPath.split(':');
      const fullPath = [...new Set([...extraPaths, ...pathParts])].join(':');

      // Write prompt to temp file to avoid escaping issues
      const fs = require('fs');
      const os = require('os');
      const path = require('path');
      const tempFile = path.join(os.tmpdir(), `forge-prompt-${sessionId}.txt`);
      fs.writeFileSync(tempFile, prompt, 'utf-8');

      console.log('[ClaudeCode.spawn] Spawning bash --norc --noprofile (skip profile garbage)');

      // Skip profile scripts to avoid garbage output
      const ptyProcess = pty.spawn('/bin/bash', ['--norc', '--noprofile'], {
        name: 'xterm-256color',
        cols: 120,
        rows: 30,
        cwd: projectPath,
        env: {
          ...process.env,
          PATH: fullPath,
          TERM: 'xterm-256color',
          FORCE_COLOR: '1',
        },
      });
      console.log('[ClaudeCode.spawn] PTY spawned, pid:', ptyProcess.pid);

      const result = this.setupSession(sessionId, ptyProcess, projectPath, onOutput, onExit);

      // TEST 1: Simple echo to verify PTY captures stdout
      // TEST 2: Then run Claude to see if its output is captured
      const cmd = `echo "=== TEST: PTY stdout works ==="; echo "Now running Claude..."; claude --dangerously-skip-permissions --output-format text -p "$(cat '${tempFile}')"; echo "=== Claude finished ==="; rm -f '${tempFile}'; exit`;
      ptyProcess.write(`${cmd}\r`);

      return result;
    } catch (err) {
      return this.handleSpawnError(sessionId, err, onOutput, onExit);
    }
  }

  /**
   * Spawn an interactive Claude session (no -p flag)
   * User can type to interact with Claude in real-time
   */
  spawnInteractive(
    projectPath: string,
    onOutput: OutputCallback,
    onExit: ExitCallback
  ): string {
    const sessionId = this.generateId();

    if (this.isProcessing && this.activeSessionId) {
      console.warn(`Claude session already active (${this.activeSessionId}). Killing previous session.`);
      this.kill(this.activeSessionId);
    }

    this.isProcessing = true;
    this.activeSessionId = sessionId;

    try {
      const homedir = process.env.HOME || '';
      const extraPaths = [
        `${homedir}/.local/bin`,
        '/opt/homebrew/bin',
        '/usr/local/bin',
      ];
      const currentPath = process.env.PATH || '';
      const pathParts = currentPath.split(':');
      const fullPath = [...new Set([...extraPaths, ...pathParts])].join(':');

      // Spawn interactive bash, then exec claude
      // Use smaller default dimensions - will be resized by terminal component
      // 80x24 is standard terminal size and closer to half-width layout
      const ptyProcess = pty.spawn('/bin/bash', ['--norc', '--noprofile'], {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: projectPath,
        env: {
          ...process.env,
          PATH: fullPath,
          TERM: 'xterm-256color',
          FORCE_COLOR: '1',
          BASH_SILENCE_DEPRECATION_WARNING: '1',
        },
      });

      const result = this.setupSession(sessionId, ptyProcess, projectPath, onOutput, onExit);

      // Disable echo then exec claude
      ptyProcess.write(`stty -echo; exec claude --dangerously-skip-permissions\n`);

      return result;
    } catch (err) {
      return this.handleSpawnError(sessionId, err, onOutput, onExit);
    }
  }

  /**
   * Common session setup logic for both spawn and spawnInteractive
   */
  private setupSession(
    sessionId: string,
    ptyProcess: pty.IPty,
    projectPath: string,
    onOutput: OutputCallback,
    onExit: ExitCallback
  ): string {
    console.log('[ClaudeCode.setupSession] Setting up session:', sessionId);
    console.log('[ClaudeCode.setupSession] PTY pid:', ptyProcess.pid);

    // Track disposables for cleanup
    const disposables: IDisposable[] = [];

    // Output throttling to prevent overwhelming the renderer
    // Batch data and flush at ~60fps (16ms intervals)
    let outputBuffer = '';
    let flushTimer: NodeJS.Timeout | null = null;
    const FLUSH_INTERVAL = 16; // ms

    const flushOutput = () => {
      if (outputBuffer.length > 0) {
        try {
          onOutput({
            sessionId,
            type: 'stdout',
            content: outputBuffer,
          });
        } catch (err) {
          console.error('[ClaudeCode.onData] Error in onOutput callback:', err);
        }
        outputBuffer = '';
      }
      flushTimer = null;
    };

    // Handle output with throttling
    const dataDisposable = ptyProcess.onData((data) => {
      // Accumulate data in buffer
      outputBuffer += data;

      // Schedule flush if not already scheduled
      if (!flushTimer) {
        flushTimer = setTimeout(flushOutput, FLUSH_INTERVAL);
      }

      // Feed data to completion detection
      this.handleCompletionOutput(sessionId, data);
    });
    console.log('[ClaudeCode.setupSession] onData handler registered with throttling');
    disposables.push(dataDisposable);

    // Clean up flush timer on dispose
    disposables.push({
      dispose: () => {
        if (flushTimer) {
          clearTimeout(flushTimer);
          flushOutput(); // Flush any remaining data
        }
      }
    });

    // Handle exit
    const exitDisposable = ptyProcess.onExit(({ exitCode }) => {
      console.log('[ClaudeCode.onExit] Process exited with code:', exitCode);
      try {
        onExit({
          sessionId,
          code: exitCode,
        });
        console.log('[ClaudeCode.onExit] Successfully called onExit callback');
      } catch (err) {
        console.error('[ClaudeCode.onExit] Error in onExit callback:', err);
      } finally {
        // Clean up disposables
        this.cleanupSession(sessionId);
      }
    });
    console.log('[ClaudeCode.setupSession] onExit handler registered');
    disposables.push(exitDisposable);

    const session: Session = {
      id: sessionId,
      pty: ptyProcess,
      projectPath,
      disposables,
    };

    this.sessions.set(sessionId, session);

    return sessionId;
  }

  /**
   * Handle spawn errors for both spawn and spawnInteractive
   */
  private handleSpawnError(
    sessionId: string,
    err: unknown,
    onOutput: OutputCallback,
    onExit: ExitCallback
  ): string {
    // Clean up state on spawn failure
    this.isProcessing = false;
    this.activeSessionId = null;

    // Notify the caller about the spawn failure through the exit callback
    const errorMessage = err instanceof Error ? err.message : 'Failed to spawn PTY process';
    console.error('PTY spawn error:', errorMessage);

    // Call onOutput with the error message so user sees what happened
    try {
      onOutput({
        sessionId,
        type: 'stderr',
        content: `Error: ${errorMessage}\n`,
      });
    } catch (callbackErr) {
      console.error('Error in onOutput callback:', callbackErr);
    }

    // Call onExit with error code
    setTimeout(() => {
      try {
        onExit({
          sessionId,
          code: 1, // Non-zero exit code indicates failure
        });
      } catch (callbackErr) {
        console.error('Error in onExit callback:', callbackErr);
      }
    }, 0);

    return sessionId; // Return session ID so caller can track it
  }

  // Maximum input size (1MB)
  private static readonly MAX_INPUT_SIZE = 1024 * 1024;

  sendInput(sessionId: string, input: string): void {
    console.log('[ClaudeCode.sendInput] Called with sessionId:', sessionId, 'input length:', input.length);
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.error('[ClaudeCode.sendInput] Session not found:', sessionId);
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Validate input
    if (typeof input !== 'string') {
      throw new Error('Input must be a string');
    }

    // Check input size to prevent buffer issues
    if (input.length > ClaudeCodeService.MAX_INPUT_SIZE) {
      throw new Error(`Input too large: ${input.length} bytes (max: ${ClaudeCodeService.MAX_INPUT_SIZE})`);
    }

    console.log('[ClaudeCode.sendInput] Writing to PTY...');
    session.pty.write(input);
    console.log('[ClaudeCode.sendInput] Write completed');
  }

  /**
   * Resize the PTY to match terminal dimensions
   */
  resize(sessionId: string, cols: number, rows: number): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return; // Silently ignore if session doesn't exist
    }

    try {
      session.pty.resize(cols, rows);
      console.log(`[ClaudeCode.resize] Resized session ${sessionId} to ${cols}x${rows}`);
    } catch (err) {
      console.error('[ClaudeCode.resize] Error resizing PTY:', err);
    }
  }

  /**
   * Clean up a session's resources (listeners, state)
   */
  private cleanupSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Dispose all listeners
    for (const disposable of session.disposables) {
      try {
        disposable.dispose();
      } catch (err) {
        console.error('Error disposing listener:', err);
      }
    }

    // Clean up completion detection
    this.disableCompletionDetection(sessionId);

    this.sessions.delete(sessionId);

    if (this.activeSessionId === sessionId) {
      this.isProcessing = false;
      this.activeSessionId = null;
    }
  }

  kill(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    // Kill the PTY process
    try {
      session.pty.kill();
    } catch (err) {
      console.error('Error killing PTY process:', err);
    }

    // Clean up listeners and state
    this.cleanupSession(sessionId);
  }

  killAll(): void {
    for (const [sessionId] of this.sessions) {
      this.kill(sessionId);
    }
    // Reset state
    this.isProcessing = false;
    this.activeSessionId = null;
  }

  /**
   * Send a single prompt to Claude and get a response (non-interactive mode)
   * Used for chat/discovery phase where we need simple request/response
   * @param projectPath - The working directory for Claude
   * @param prompt - The prompt to send
   * @param onOutput - Optional callback for streaming output
   * @param timeoutMs - Timeout in milliseconds (default: 5 minutes)
   */
  async chat(
    projectPath: string,
    prompt: string,
    onOutput?: (content: string) => void,
    timeoutMs: number = 5 * 60 * 1000 // 5 minutes default
  ): Promise<string> {
    console.log('[ClaudeCode.chat] Starting chat request');
    console.log('[ClaudeCode.chat] projectPath:', projectPath);
    console.log('[ClaudeCode.chat] prompt length:', prompt.length);

    // Import fs and path for temp file handling
    const fs = await import('fs');
    const path = await import('path');
    const os = await import('os');

    // Write prompt to a temp file to avoid shell escaping issues
    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `forge-prompt-${Date.now()}.txt`);
    fs.writeFileSync(tempFile, prompt, 'utf-8');
    console.log('[ClaudeCode.chat] Wrote prompt to temp file:', tempFile);

    return new Promise((resolve, reject) => {
      let isResolved = false;
      let timeoutHandle: NodeJS.Timeout | null = null;

      // Ensure PATH includes common locations for claude CLI
      const homedir = process.env.HOME || '';
      const extraPaths = [
        `${homedir}/.local/bin`,
        '/opt/homebrew/bin',
        '/usr/local/bin',
      ];
      const currentPath = process.env.PATH || '';
      const pathParts = currentPath.split(':');
      const fullPath = [...new Set([...extraPaths, ...pathParts])].join(':');

      // Use child_process.spawn directly instead of PTY for cleaner output
      const { spawn } = require('child_process');

      // Run: cat tempfile | claude --print --dangerously-skip-permissions
      const child = spawn('bash', ['-c', `cat "${tempFile}" | claude --print --dangerously-skip-permissions`], {
        cwd: projectPath,
        env: {
          ...process.env,
          PATH: fullPath,
        },
      });

      console.log('[ClaudeCode.chat] Spawned child process, pid:', child.pid);

      // Set up timeout
      timeoutHandle = setTimeout(() => {
        console.log('[ClaudeCode.chat] TIMEOUT triggered');
        if (!isResolved) {
          isResolved = true;
          child.kill();
          // Clean up temp file
          try { fs.unlinkSync(tempFile); } catch (e) { /* ignore */ }
          reject(new Error(`Claude request timed out after ${timeoutMs / 1000} seconds`));
        }
      }, timeoutMs);

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data: Buffer) => {
        const text = data.toString();
        console.log('[ClaudeCode.chat] stdout chunk:', text.length, 'chars');
        stdout += text;
        try {
          onOutput?.(text);
        } catch (err) {
          console.error('[ClaudeCode.chat] Error in onOutput callback:', err);
        }
      });

      child.stderr.on('data', (data: Buffer) => {
        const text = data.toString();
        console.log('[ClaudeCode.chat] stderr:', text);
        stderr += text;
      });

      child.on('close', (code: number) => {
        console.log('[ClaudeCode.chat] Process closed with code:', code);
        console.log('[ClaudeCode.chat] stdout length:', stdout.length);

        // Clear timeout
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
          timeoutHandle = null;
        }

        // Clean up temp file
        try { fs.unlinkSync(tempFile); } catch (e) { /* ignore */ }

        if (isResolved) return;
        isResolved = true;

        if (code === 0) {
          // Output should be clean since we're not using PTY
          const cleanOutput = stdout.trim();
          console.log('[ClaudeCode.chat] Success! Output length:', cleanOutput.length);
          console.log('[ClaudeCode.chat] Output preview:', cleanOutput.substring(0, 300));
          resolve(cleanOutput);
        } else {
          console.error('[ClaudeCode.chat] Process failed with code:', code);
          console.error('[ClaudeCode.chat] stderr:', stderr);
          reject(new Error(`Claude exited with code ${code}: ${stderr}`));
        }
      });

      child.on('error', (err: Error) => {
        console.error('[ClaudeCode.chat] Process error:', err);
        // Clean up temp file
        try { fs.unlinkSync(tempFile); } catch (e) { /* ignore */ }

        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }

        if (!isResolved) {
          isResolved = true;
          reject(err);
        }
      });
    });
  }

  /**
   * Clean terminal output by removing ANSI escape codes and shell artifacts
   */
  private cleanTerminalOutput(output: string): string {
    console.log('[ClaudeCode.cleanTerminalOutput] Raw output length:', output.length);

    let cleaned = output
      // Remove ANSI escape codes (CSI sequences)
      // eslint-disable-next-line no-control-regex
      .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')
      // Remove OSC sequences (title setting, etc)
      // eslint-disable-next-line no-control-regex
      .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
      // Remove other escape sequences
      // eslint-disable-next-line no-control-regex
      .replace(/\x1b[PX^_][^\x1b]*\x1b\\/g, '')
      // Remove any remaining escape characters
      // eslint-disable-next-line no-control-regex
      .replace(/\x1b/g, '')
      // Remove carriage returns
      .replace(/\r/g, '')
      // Remove bracketed paste mode markers
      .replace(/\[\?2004[hl]/g, '')
      .replace(/\[\?1004[hl]/g, '')
      .replace(/\[\?25[hl]/g, '')
      .replace(/\[<u/g, '');

    // Split into lines for processing
    const lines = cleaned.split('\n');

    // Patterns that indicate shell/prompt noise (not Claude's actual response)
    const noisePatterns = [
      /^Restored session:/i,
      /^The default interactive shell/i,
      /^To update your account/i,
      /^For more details.*visit/i,
      /support\.apple\.com/i,
      /^Saving session/i,
      /^\.\.\.saving/i,
      /^\.\.\.truncating/i,
      /^\.\.\.completed/i,
      /claude --print/,
      /^echo\s+'/,
      /^\$\s/,
      /^%\s/,
      /^\[.*\]\$/,
      /bash-\d/,
      /^exit\s*$/i,
      /^logout\s*$/i,
      /^ulogout\s*$/i,
      /FORGE_CHAT_EOF/,
      // Shell errors
      /^date:\s+illegal/i,
      /^bash:\s+.*:\s+command not found/i,
      /^usage:\s+date/i,
      /^\s*\[\s*-[a-z]/i,  // Usage lines like "[ -z output_zone ]"
      /^\[\[\[/,  // Date format hints
      // Skip the echoed system prompt parts
      /^You are helping a user plan/,
      /^1\.\s+Ask clarifying questions/,
      /^2\.\s+Understand their requirements/,
      /^3\.\s+Help them refine/,
      /^Keep responses concise/,
      /^When the user says they/,
      /^Project:/,
      /^Initial Idea:/,
      /^Conversation so far:/,
      /^User:\s*$/,
      /^User:\s+I'/,  // Repeated echo fragments
      /^Assistant:\s*$/,
      // Skip markdown-quoted echoed content
      /^>\s*(1\.|2\.|3\.|Project:|Initial|Keep|When|You are|User:)/,
      // Skip Neds-MacBook prompt
      /^Neds-MacBook/,
    ];

    const filteredLines: string[] = [];
    let inClaudeResponse = false;

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip empty lines before we find real content
      if (!inClaudeResponse && trimmed === '') continue;

      // Check if this line is noise
      let isNoise = false;
      for (const pattern of noisePatterns) {
        if (pattern.test(trimmed)) {
          isNoise = true;
          break;
        }
      }
      if (isNoise) continue;

      // Skip lines that are just ">" or escape code remnants
      if (trimmed === '>' || trimmed === 'u' || /^\[[\d;?]*[a-zA-Z]?$/.test(trimmed)) continue;

      // Skip lines that look like repeated User: fragments
      if (/^(User:\s*I')+/.test(trimmed)) continue;

      // Once we find real content, we're in Claude's response
      inClaudeResponse = true;
      filteredLines.push(line);
    }

    // Remove trailing noise from the end
    while (filteredLines.length > 0) {
      const last = filteredLines[filteredLines.length - 1].trim().toLowerCase();
      if (last === '' ||
          last === 'logout' ||
          last === 'ulogout' ||
          last.startsWith('saving') ||
          last.startsWith('...') ||
          /^\[.*\]$/.test(last)) {
        filteredLines.pop();
      } else {
        break;
      }
    }

    const result = filteredLines.join('\n').trim();
    console.log('[ClaudeCode.cleanTerminalOutput] Cleaned output length:', result.length);
    console.log('[ClaudeCode.cleanTerminalOutput] Cleaned preview:', result.substring(0, 200));

    return result;
  }

  /**
   * Strip ANSI escape codes from terminal output for clean text matching
   */
  stripAnsiCodes(text: string): string {
    return text
      // CSI sequences (colors, cursor movement, etc.)
      // eslint-disable-next-line no-control-regex
      .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')
      // OSC sequences (title setting, etc.)
      // eslint-disable-next-line no-control-regex
      .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
      // Other escape sequences (DCS, PM, APC, etc.)
      // eslint-disable-next-line no-control-regex
      .replace(/\x1b[PX^_][^\x1b]*\x1b\\/g, '')
      // Remaining lone escape characters
      // eslint-disable-next-line no-control-regex
      .replace(/\x1b/g, '')
      // Carriage returns
      .replace(/\r/g, '')
      // Bracketed paste mode and other terminal mode markers
      .replace(/\[\?2004[hl]/g, '')
      .replace(/\[\?1004[hl]/g, '')
      .replace(/\[\?25[hl]/g, '');
  }

  /**
   * Enable completion detection for a session.
   * After detecting "TASK COMPLETE" at a line boundary followed by 4s of idle,
   * the callback will be invoked.
   */
  enableCompletionDetection(sessionId: string, callback: () => void): void {
    // Clean up any existing state
    this.resetCompletionDetection(sessionId);

    this.completionStates.set(sessionId, {
      enabled: true,
      cumulativeBuffer: '',
      idleTimer: null,
      signalDetected: false,
      callback,
    });
    console.log('[ClaudeCode] Completion detection enabled for session:', sessionId);
  }

  /**
   * Reset completion detection (e.g., user cancelled the toast).
   * Clears timers and state but keeps the callback so it can re-trigger.
   */
  resetCompletionDetection(sessionId: string): void {
    const state = this.completionStates.get(sessionId);
    if (!state) return;

    if (state.idleTimer) {
      clearTimeout(state.idleTimer);
      state.idleTimer = null;
    }
    state.signalDetected = false;
    state.cumulativeBuffer = '';
    console.log('[ClaudeCode] Completion detection reset for session:', sessionId);
  }

  /**
   * Disable and remove completion detection entirely (e.g., after advancing).
   */
  disableCompletionDetection(sessionId: string): void {
    const state = this.completionStates.get(sessionId);
    if (state?.idleTimer) {
      clearTimeout(state.idleTimer);
    }
    this.completionStates.delete(sessionId);
    console.log('[ClaudeCode] Completion detection disabled for session:', sessionId);
  }

  /**
   * Check if "TASK COMPLETE" appears at a line boundary and not inside a fenced code block.
   */
  private checkCompletionSignal(sessionId: string): void {
    const state = this.completionStates.get(sessionId);
    if (!state || !state.enabled || state.signalDetected) return;

    const buffer = state.cumulativeBuffer;
    const pattern = /^\s*task\s*complete\s*$/im;
    const match = pattern.exec(buffer);
    if (!match) return;

    // Reject if inside a fenced code block (odd number of ``` markers before the match)
    const textBefore = buffer.slice(0, match.index);
    const fenceCount = (textBefore.match(/```/g) || []).length;
    if (fenceCount % 2 !== 0) {
      // Inside a code block — ignore this match
      return;
    }

    console.log('[ClaudeCode] Completion signal detected for session:', sessionId);
    state.signalDetected = true;
    this.startIdleTimer(sessionId);
  }

  /**
   * Start (or restart) the 4-second idle timer after a completion signal is detected.
   */
  private startIdleTimer(sessionId: string): void {
    const state = this.completionStates.get(sessionId);
    if (!state) return;

    // Clear any existing idle timer
    if (state.idleTimer) {
      clearTimeout(state.idleTimer);
    }

    state.idleTimer = setTimeout(() => {
      // 4 seconds of silence after the signal — fire the callback
      console.log('[ClaudeCode] Idle timer fired (4s silence) for session:', sessionId);
      state.idleTimer = null;
      if (state.callback) {
        state.callback();
      }
    }, 4000);
  }

  /**
   * Called when new PTY output arrives. Appends to cumulative buffer and checks for completion.
   */
  private handleCompletionOutput(sessionId: string, rawData: string): void {
    const state = this.completionStates.get(sessionId);
    if (!state || !state.enabled) return;

    const cleaned = this.stripAnsiCodes(rawData);
    state.cumulativeBuffer += cleaned;

    // Keep buffer manageable — retain last 10k chars
    if (state.cumulativeBuffer.length > 10000) {
      state.cumulativeBuffer = state.cumulativeBuffer.slice(-10000);
    }

    if (state.signalDetected) {
      // New output arrived after signal — reset the idle timer
      this.startIdleTimer(sessionId);
    } else {
      // Check for the completion signal
      this.checkCompletionSignal(sessionId);
    }
  }

  private generateId(): string {
    // Simple ID generation without external deps
    return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
