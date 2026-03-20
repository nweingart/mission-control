import type { ChildProcess } from 'child_process';
import { randomUUID } from 'crypto';
import { buildEnhancedPath } from '../ipc/env';

export interface ChatResult {
  response: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  model?: string;
  costUsd?: number;
  durationMs?: number;
  numTurns?: number;
  agent?: 'claude' | 'codex';
}

// Maximum input size (1MB)
const MAX_INPUT_SIZE = 1024 * 1024;

export class CodexService {
  private activeChatChildren: Map<string, ChildProcess> = new Map();

  /**
   * Send a single prompt to Codex and get a response (non-interactive mode).
   * Mirrors ClaudeCodeService.chat() but spawns the Codex CLI.
   */
  async chat(
    projectPath: string,
    prompt: string,
    onOutput?: (content: string) => void,
    inactivityTimeoutMs: number = 10 * 60 * 1000,
    chatId: string = `codex-chat-${randomUUID()}`
  ): Promise<ChatResult> {
    console.log('[CodexService.chat] Starting chat request');
    console.log('[CodexService.chat] projectPath:', projectPath);
    console.log('[CodexService.chat] prompt length:', prompt.length);

    if (typeof prompt !== 'string') {
      throw new Error('Prompt must be a string');
    }
    if (prompt.length > MAX_INPUT_SIZE) {
      throw new Error(`Prompt too large: ${prompt.length} bytes (max: ${MAX_INPUT_SIZE})`);
    }

    return new Promise((resolve, reject) => {
      let isResolved = false;
      let timeoutHandle: NodeJS.Timeout | null = null;

      const fullPath = buildEnhancedPath();

      const { spawn } = require('child_process');

      const cleanEnv = { ...process.env, PATH: fullPath };
      // Remove CLAUDECODE env var to avoid conflicts
      delete cleanEnv.CLAUDECODE;

      // Codex CLI: exec mode with JSON output and auto-approval.
      // --dangerously-bypass-approvals-and-sandbox is required: Mission Control orchestrates
      // Codex as a sub-agent in a controlled build pipeline where every invocation is
      // programmatic. The user has already granted trust at the Mission Control app level.
      const child = spawn('codex', [
        'exec',
        '--json',
        '--dangerously-bypass-approvals-and-sandbox',
        prompt,
      ], {
        cwd: projectPath,
        env: cleanEnv,
        shell: false,
      });

      this.activeChatChildren.set(chatId, child);
      console.log('[CodexService.chat] Spawned child process, pid:', child.pid, 'chatId:', chatId);

      // Activity-based timeout: resets every time stdout/stderr produces output
      const resetTimeout = () => {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        timeoutHandle = setTimeout(() => {
          console.log(`[CodexService.chat] INACTIVITY TIMEOUT — no output for ${inactivityTimeoutMs / 1000}s`);
          if (!isResolved) {
            isResolved = true;
            child.kill();
            reject(new Error(`Codex process produced no output for ${inactivityTimeoutMs / 1000} seconds`));
          }
        }, inactivityTimeoutMs);
      };
      resetTimeout();

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data: Buffer) => {
        const text = data.toString();
        console.log('[CodexService.chat] stdout chunk:', text.length, 'chars');
        stdout += text;
        resetTimeout();
        try {
          onOutput?.(text);
        } catch (err) {
          console.error('[CodexService.chat] Error in onOutput callback:', err);
        }
      });

      child.stderr.on('data', (data: Buffer) => {
        const text = data.toString();
        console.log('[CodexService.chat] stderr:', text);
        stderr += text;
        resetTimeout();
      });

      child.on('close', (code: number) => {
        this.activeChatChildren.delete(chatId);
        console.log('[CodexService.chat] Process closed with code:', code);
        console.log('[CodexService.chat] stdout length:', stdout.length);

        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
          timeoutHandle = null;
        }

        if (isResolved) return;
        isResolved = true;

        if (code === 0) {
          const result = this.parseCodexOutput(stdout.trim());
          resolve(result);
        } else {
          console.error('[CodexService.chat] Process failed with code:', code);
          console.error('[CodexService.chat] stderr:', stderr);
          reject(new Error(`Codex exited with code ${code}: ${stderr}`));
        }
      });

      child.on('error', (err: Error) => {
        this.activeChatChildren.delete(chatId);
        console.error('[CodexService.chat] Process error:', err);

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
   * Parse Codex JSONL output.
   * Codex emits newline-delimited JSON events. We extract:
   * - Final assistant message text from message/output events
   * - Token usage from usage/summary events
   * Written defensively — falls back to raw stdout if parsing fails.
   */
  private parseCodexOutput(rawOutput: string): ChatResult {
    console.log('[CodexService.parseCodexOutput] Raw output length:', rawOutput.length);
    console.log('[CodexService.parseCodexOutput] Preview:', rawOutput.substring(0, 300));

    // Try to parse as JSONL (newline-delimited JSON events)
    try {
      const lines = rawOutput.split('\n').filter(l => l.trim().length > 0);
      let finalMessage = '';
      let usage: ChatResult['usage'] | undefined;
      let model: string | undefined;

      for (const line of lines) {
        try {
          const event = JSON.parse(line);

          // Extract message content from various Codex event types
          // The exact schema should be verified empirically
          if (event.type === 'item.completed' && event.item?.content) {
            // item.completed events contain the assistant's response
            for (const content of event.item.content) {
              if (content.type === 'output_text' && content.text) {
                finalMessage = content.text;
              }
            }
          } else if (event.type === 'response.completed' && event.response) {
            // response.completed may contain usage info
            if (event.response.usage) {
              usage = {
                input_tokens: event.response.usage.input_tokens ?? 0,
                output_tokens: event.response.usage.output_tokens ?? 0,
              };
            }
            if (event.response.model) {
              model = event.response.model;
            }
            // Also check for output in the response
            if (event.response.output) {
              for (const item of event.response.output) {
                if (item.content) {
                  for (const content of item.content) {
                    if (content.type === 'output_text' && content.text) {
                      finalMessage = content.text;
                    }
                  }
                }
              }
            }
          } else if (event.type === 'turn.completed') {
            // turn.completed may have usage/summary
            if (event.usage) {
              usage = {
                input_tokens: event.usage.input_tokens ?? 0,
                output_tokens: event.usage.output_tokens ?? 0,
              };
            }
          }

          // Also handle simpler event formats
          if (event.message || event.text || event.output) {
            const text = event.message || event.text || event.output;
            if (typeof text === 'string') {
              finalMessage = text;
            }
          }

          // Handle result/response wrapper (single JSON blob fallback)
          if (event.result || event.response) {
            const text = event.result ?? event.response;
            if (typeof text === 'string') {
              finalMessage = text;
            }
          }
        } catch {
          // Individual line parse failure — skip it
        }
      }

      if (finalMessage) {
        console.log('[CodexService.parseCodexOutput] Parsed JSONL, response length:', finalMessage.length);
        return {
          response: finalMessage,
          usage,
          model,
          agent: 'codex',
        };
      }

      // If JSONL parsing found no message, try parsing the whole output as a single JSON blob
      const parsed = JSON.parse(rawOutput);
      const response = parsed.result ?? parsed.response ?? parsed.text ?? parsed.message ?? rawOutput;
      return {
        response: typeof response === 'string' ? response : rawOutput,
        usage: parsed.usage ? {
          input_tokens: parsed.usage.input_tokens ?? 0,
          output_tokens: parsed.usage.output_tokens ?? 0,
        } : undefined,
        model: parsed.model,
        agent: 'codex',
      };
    } catch {
      // Fallback: treat entire stdout as plain text
      console.log('[CodexService.parseCodexOutput] JSON parse failed, falling back to plain text');
      return {
        response: rawOutput,
        usage: undefined,
        agent: 'codex',
      };
    }
  }

  /**
   * Kill active chat child processes.
   * When chatId is provided, only kills that specific chat.
   * Otherwise kills all active chat processes.
   */
  cancelChat(chatId?: string): void {
    if (chatId) {
      const child = this.activeChatChildren.get(chatId);
      if (child) {
        console.log('[CodexService.cancelChat] Killing chat:', chatId);
        try { child.kill(); } catch { /* best effort */ }
        this.activeChatChildren.delete(chatId);
      }
    } else {
      console.log('[CodexService.cancelChat] Killing all active chat processes:', this.activeChatChildren.size);
      for (const [, child] of this.activeChatChildren) {
        try { child.kill(); } catch { /* best effort */ }
      }
      this.activeChatChildren.clear();
    }
  }
}
