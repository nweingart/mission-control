# Multi-Agent Mode: Claude + Codex Collaboration

## Context

Houston currently uses Claude Code CLI as the sole AI agent for its build pipeline. Each task goes through: build (Claude writes code) -> review (Claude reviews the diff) -> fix (Claude fixes issues). These are three **independent** `window.api.claude.chat()` calls -- not a conversation. This means we can route each call to a different agent without changing the pipeline's structure.

This plan adds an opt-in "Multi-Agent Mode" where the user configures which agent (Claude or Codex) handles the **builder** role (writes code) and which handles the **reviewer** role (reviews + fixes). Default behavior is preserved -- single-agent Claude when the feature is off.

## Decisions

- **Codex invocation**: Spawn `codex` CLI as a child process (same pattern as Claude CLI)
- **Role assignment**: Configurable in settings (user picks who writes, who reviews)
- **Activation**: Opt-in toggle, default single-agent

---

## Codex Review Feedback (Incorporated)

The following adjustments were made based on Codex's code review of the original plan:

1. **Auth check fix (High)**: `checkCodex()` now uses a lightweight `codex exec` smoke test instead of `codex --version` to verify the CLI can actually execute tasks, not just that the binary exists.

2. **Scoped cancellation (High)**: `cancelAllAgents()` replaced with `cancelBuildAgents(chatIds)` that only cancels build-owned chatIds. Other flows (discovery, gap analysis, e2e runner) are not affected by build cleanup.

3. **Unified preflight source of truth (Medium)**: `useCLIMonitor` updated to accept dynamic required services, so both BuildScreen and the CLI monitor use the same config-driven service list.

4. **Config read-at-build-start (Medium)**: Agent config is intentionally read once at build start (not reactive). Changing settings mid-build is not supported — the config snapshot is taken when the pipeline begins. This is documented in the Settings UI.

5. **Unit tests (Medium)**: Added Phase 9 with unit tests for Codex JSONL parsing, agent routing, and scoped cancellation.

---

## Phase 1: Types and Configuration

### 1a. `src/types/index.ts` -- New types + extend Config and CLIStatus

Add after line 169 (after `Config`):

```ts
export type AgentProvider = 'claude' | 'codex';

export interface AgentRoleConfig {
  builder: AgentProvider;   // writes code (build phase)
  reviewer: AgentProvider;  // reviews + fixes (review & fix phases)
}
```

Extend `Config` (line 162):

```ts
export interface Config {
  // ... existing fields ...
  multiAgentEnabled?: boolean;        // NEW
  agentRoles?: AgentRoleConfig;       // NEW
}
```

Extend `CLIStatus` (line 132) -- make `codex` optional for backward compat:

```ts
export interface CLIStatus {
  claude: { installed: boolean; authenticated: boolean };
  github: { installed: boolean; authenticated: boolean };
  codex?: { installed: boolean; authenticated: boolean };  // NEW
}
```

Extend `ChatResult` (line 105) -- add agent attribution:

```ts
export interface ChatResult {
  // ... existing fields ...
  agent?: AgentProvider;  // NEW -- which agent produced this result
}
```

Extend `TaskTokenUsage` (line 81) -- track which agent did what:

```ts
export interface TaskTokenUsage {
  // ... existing fields ...
  buildAgent?: AgentProvider;   // NEW
  reviewAgent?: AgentProvider;  // NEW
}
```

### 1b. `src/types/electron.d.ts` -- Add `codex` namespace to ElectronAPI

After the `claude` block (~line 62), add:

```ts
codex: {
  chat: (projectPath: string, prompt: string, inactivityTimeoutMs?: number, chatId?: string) => Promise<ChatResult>;
  onChatOutputForTask: (chatId: string, callback: (content: string) => void) => void;
  offChatOutputForTask: (chatId: string) => void;
  cancelChat: (chatId?: string) => Promise<void>;
  removeListeners: () => void;
};
```

Add inside the `cli` block:

```ts
checkCodex: () => Promise<{ installed: boolean; authenticated: boolean }>;
```

---

## Phase 2: Codex Service (Electron Main Process)

### 2a. Create `electron/services/codex.ts` (NEW FILE)

Mirrors `ClaudeCodeService.chat()` (claude-code.ts lines 399-545) but spawns the Codex CLI. Only needs the `chat()` method -- no interactive PTY features needed for v1.

Key differences from Claude:
- **Command**: `codex exec --json --dangerously-bypass-approvals-and-sandbox "<prompt>"` (Codex CLI equivalent of `claude -p --output-format json --dangerously-skip-permissions`)
- **Output format**: Codex emits **JSONL** (newline-delimited JSON events), not a single JSON blob. Need a `parseCodexOutput()` method that iterates lines and extracts the final assistant message from `item.completed` events and usage from `turn.completed` events
- **Fallback**: If JSONL parsing fails, fall back to raw stdout (defensive)

Structure:

```ts
export class CodexService {
  private activeChatChildren: Map<string, ChildProcess> = new Map();

  async chat(projectPath, prompt, onOutput?, inactivityTimeoutMs?, chatId?): Promise<ChatResult>
    // Same pattern as ClaudeCodeService.chat():
    // - Validate input
    // - Build enhanced PATH (same extraPaths logic)
    // - spawn('codex', ['exec', '--json', '--dangerously-bypass-approvals-and-sandbox', prompt])
    // - Wire stdout/stderr with inactivity timeout
    // - Parse output on close, return ChatResult with agent: 'codex'

  private parseCodexOutput(rawOutput: string): ChatResult
    // Parse JSONL, extract final message + usage

  cancelChat(chatId?: string): void
    // Kill one or all active chat children
}
```

**IMPORTANT**: The exact Codex CLI flags and JSONL event schema should be verified empirically during implementation by running `codex exec --json "say hello"` and inspecting the output. The parser should be written defensively.

---

## Phase 3: IPC and Preload Bridge

### 3a. `electron/main.ts` -- Register CodexService + IPC handlers

At top, add import and instantiation alongside existing services:

```ts
import { CodexService } from './services/codex';
const codexService = new CodexService();
```

Add IPC handlers after the Claude handlers (after line 259):

```ts
ipcMain.handle('codex:chat', async (event, projectPath, prompt, inactivityTimeoutMs?, chatId?) => {
  const result = await codexService.chat(projectPath, prompt, (content) => {
    safeSend('codex:chatOutput', { chatId: chatId || '__legacy__', content });
  }, inactivityTimeoutMs, chatId);
  return result;
});
ipcMain.handle('codex:cancelChat', (_, chatId?) => codexService.cancelChat(chatId));
```

Add cleanup in `mainWindow.on('closed')` (line 102) and `app.on('before-quit')` (line 168):

```ts
codexService.cancelChat();
```

### 3b. `electron/preload.ts` -- Add `codex` namespace

Add a parallel `codexOutputHandlers` Map (same pattern as `chatOutputHandlers` at line 52):

```ts
const codexOutputHandlers = new Map<string, (content: string) => void>();
ipcRenderer.on('codex:chatOutput', (_event, data) => {
  const { chatId, content } = data as { chatId: string; content: string };
  const handler = codexOutputHandlers.get(chatId);
  if (handler) handler(content);
});
```

Inside `contextBridge.exposeInMainWorld('api', { ... })`, add `codex` namespace after `claude`:

```ts
codex: {
  chat: (projectPath, prompt, inactivityTimeoutMs?, chatId?) =>
    ipcRenderer.invoke('codex:chat', projectPath, prompt, inactivityTimeoutMs, chatId),
  onChatOutputForTask: (chatId, cb) => codexOutputHandlers.set(chatId, cb),
  offChatOutputForTask: (chatId) => codexOutputHandlers.delete(chatId),
  cancelChat: (chatId?) => ipcRenderer.invoke('codex:cancelChat', chatId),
  removeListeners: () => { removeAllListeners('codex:'); codexOutputHandlers.clear(); },
},
```

---

## Phase 4: CLI Check and Preflight

### 4a. `electron/services/cli-check.ts` -- Add `checkCodex()`

Add method to `CLICheckService`:

```ts
async checkCodex(): Promise<CLIStatusItem> {
  const installed = await this.commandExists('codex');
  if (!installed) return { installed: false, authenticated: false };
  // Smoke test: actually run a minimal codex exec to verify auth/session validity.
  // codex --version only proves install, not that the CLI can execute tasks.
  try {
    const { stdout } = await execAsync(
      'codex exec --json "respond with ok" 2>&1',
      { timeout: 15000, env: enhancedEnv }
    );
    if (stdout.trim().length > 0) return { installed: true, authenticated: true };
  } catch {}
  return { installed: true, authenticated: false };
}
```

Update `checkAll()` to include codex and update its `CLIStatus` interface to add `codex?`:

```ts
async checkAll(): Promise<CLIStatus> {
  const [claude, github, codex] = await Promise.all([
    this.checkClaude(), this.checkGitHub(), this.checkCodex(),
  ]);
  return { claude, github, codex };
}
```

Add IPC handler in `main.ts`:

```ts
ipcMain.handle('cli:checkCodex', () => cliCheckService.checkCodex());
```

### 4b. `src/constants/preflight-requirements.ts` -- Add codex service

```ts
export type ServiceKey = 'claude' | 'github' | 'codex';

// Add to SERVICE_REGISTRY:
codex: {
  name: 'OpenAI Codex CLI',
  installCommand: 'npm install -g @openai/codex',
  authCommand: 'codex login',
  description: 'AI coding agent from OpenAI',
},
```

Do NOT change `STEP_REQUIREMENTS` statically -- the build screen will dynamically add `'codex'` when multi-agent is enabled (see Phase 6).

### 4d. `src/hooks/useCLIMonitor.ts` -- Accept dynamic required services

Update `useCLIMonitor` to accept an optional `requiredServices` parameter so that both BuildScreen and any other consumer can pass in the config-driven service list. When `codex` is in the required list, the monitor should also call `cli.checkCodex()` and include it in its status. This ensures a single source of truth for preflight requirements rather than hardcoding them in multiple places.

### 4c. Preload + types -- Add `cli.checkCodex`

In `electron/preload.ts`, add inside the `cli` block:

```ts
checkCodex: () => ipcRenderer.invoke('cli:checkCodex'),
```

---

## Phase 5: Agent Router (Renderer)

### 5a. Create `src/utils/agent-router.ts` (NEW FILE)

This is the key abstraction -- routes pipeline calls to the correct agent API based on config, so the pipeline doesn't need `if/else` everywhere.

```ts
import type { ChatResult, AgentProvider, AgentRoleConfig } from '../types';

export type PipelineRole = 'builder' | 'reviewer';

interface AgentAPI {
  chat: (projectPath: string, prompt: string, timeoutMs?: number, chatId?: string) => Promise<ChatResult>;
  onChatOutputForTask: (chatId: string, cb: (content: string) => void) => void;
  offChatOutputForTask: (chatId: string) => void;
  cancelChat: (chatId?: string) => Promise<void>;
  provider: AgentProvider;
}

const DEFAULT_ROLES: AgentRoleConfig = { builder: 'claude', reviewer: 'claude' };

export function getAgentForRole(
  multiAgentEnabled: boolean,
  agentRoles: AgentRoleConfig | undefined,
  role: PipelineRole
): AgentAPI {
  const roles = agentRoles ?? DEFAULT_ROLES;
  const provider = multiAgentEnabled ? roles[role] : 'claude';

  const api = provider === 'codex' ? window.api.codex : window.api.claude;
  return { ...api, provider };
}

export async function cancelBuildAgents(chatIds: string[]): Promise<void> {
  // Only cancel build-owned chatIds — don't nuke other flows (discovery, gap analysis, etc.)
  await Promise.allSettled(
    chatIds.map((id) => {
      // Cancel on both agents — safe even if the chatId doesn't belong to that agent
      return Promise.allSettled([
        window.api.claude.cancelChat(id),
        window.api.codex?.cancelChat(id),
      ]);
    })
  );
}
```

When `multiAgentEnabled` is false, `getAgentForRole()` always returns `window.api.claude` -- zero behavioral change. `cancelBuildAgents` only cancels chatIds owned by the build pipeline, leaving other flows unaffected.

---

## Phase 6: Pipeline Integration

### 6a. `src/hooks/useBuildPipeline.ts` -- Load config + create agent refs

Near the top of the hook (after line 91), add:

```ts
const [agentConfig, setAgentConfig] = useState<{
  multiAgentEnabled: boolean;
  agentRoles?: AgentRoleConfig;
}>({ multiAgentEnabled: false });

useEffect(() => {
  window.api.storage.getConfig().then((config) => {
    setAgentConfig({
      multiAgentEnabled: config.multiAgentEnabled ?? false,
      agentRoles: config.agentRoles,
    });
  });
}, []);

const builderAgent = getAgentForRole(agentConfig.multiAgentEnabled, agentConfig.agentRoles, 'builder');
const reviewerAgent = getAgentForRole(agentConfig.multiAgentEnabled, agentConfig.agentRoles, 'reviewer');
```

### 6b. Replace `window.api.claude.chat()` calls -- 6 call sites

**In `buildTaskInWorktree` (parallel path):**

| Line | Phase | Change |
|------|-------|--------|
| 369 | build output handler | `window.api.claude.onChatOutputForTask(chatId, ...)` -> `builderAgent.onChatOutputForTask(chatId, ...)` |
| 377 | build chat | `window.api.claude.chat(worktreePath, ...)` -> `builderAgent.chat(worktreePath, ...)` |
| 381 | build cleanup | `window.api.claude.offChatOutputForTask(chatId)` -> `builderAgent.offChatOutputForTask(chatId)` |
| 403 | review output handler | `window.api.claude.onChatOutputForTask(reviewChatId, ...)` -> `reviewerAgent.onChatOutputForTask(...)` |
| 406 | review chat | `window.api.claude.chat(worktreePath, ...)` -> `reviewerAgent.chat(worktreePath, ...)` |
| 419 | fix output handler | `window.api.claude.onChatOutputForTask(fixChatId, ...)` -> `reviewerAgent.onChatOutputForTask(...)` |
| 422 | fix chat | `window.api.claude.chat(worktreePath, ...)` -> `reviewerAgent.chat(worktreePath, ...)` |
| 427 | fix cleanup | `window.api.claude.offChatOutputForTask(fixChatId)` -> `reviewerAgent.offChatOutputForTask(fixChatId)` |
| 441 | review cleanup | `window.api.claude.offChatOutputForTask(reviewChatId)` -> `reviewerAgent.offChatOutputForTask(reviewChatId)` |

**In `runTaskPipeline` (sequential path):**

| Line | Phase | Change |
|------|-------|--------|
| 571 | build chat | `window.api.claude.chat(projectPath, ...)` -> `builderAgent.chat(projectPath, ...)` |
| 623 | review output | `window.api.claude.onChatOutput(...)` -> `reviewerAgent.onChatOutputForTask(reviewChatId, ...)` (also switch from legacy global handler to per-task handler for consistency) |
| 629 | review chat | `window.api.claude.chat(projectPath, ...)` -> `reviewerAgent.chat(projectPath, ...)` |
| 646 | fix chat | `window.api.claude.chat(projectPath, ...)` -> `reviewerAgent.chat(projectPath, ...)` |

### 6c. Token attribution

Where `TaskTokenUsage` is assembled (lines 451-457 and 683-688), add agent info:

```ts
const tokenUsage: TaskTokenUsage = {
  build: buildTokens,
  review: reviewTokens,
  fix: fixTokens,
  total: { input: totalInput, output: totalOutput },
  buildAgent: builderAgent.provider,    // NEW
  reviewAgent: reviewerAgent.provider,  // NEW
};
```

### 6d. Cleanup

Replace `window.api.claude.cancelChat()` in cleanup functions with `cancelBuildAgents(activeChatIds)` where `activeChatIds` is a collected list of chatIds created during the current build run. The pipeline should track all chatIds it creates (build, review, fix) and pass them to the scoped cancel function.

### 6e. `src/screens/BuildScreen.tsx` -- Dynamic preflight

Change line 24 from static to dynamic:

```ts
// Before:
const requiredServices: ServiceKey[] = ['claude', 'github'];

// After:
const [requiredServices, setRequiredServices] = useState<ServiceKey[]>(['claude', 'github']);

useEffect(() => {
  window.api.storage.getConfig().then((config) => {
    const services: ServiceKey[] = ['github'];
    const roles = config.agentRoles ?? { builder: 'claude', reviewer: 'claude' };
    if (!config.multiAgentEnabled || roles.builder === 'claude' || roles.reviewer === 'claude') {
      services.push('claude');
    }
    if (config.multiAgentEnabled && (roles.builder === 'codex' || roles.reviewer === 'codex')) {
      services.push('codex');
    }
    setRequiredServices(services);
  });
}, []);
```

---

## Phase 7: Settings UI

### 7a. `src/screens/SettingsScreen.tsx` -- Add multi-agent section

Add a new section in the settings screen with:
- Toggle for "Enable Multi-Agent Mode"
- When enabled, two dropdowns: Builder (Claude/Codex) and Reviewer (Claude/Codex)
- Warning banner if Codex CLI is not installed/authenticated
- Load/save via `window.api.storage.getConfig()` / `saveConfig()`

State needed:

```ts
const [multiAgentEnabled, setMultiAgentEnabled] = useState(false);
const [agentRoles, setAgentRoles] = useState<AgentRoleConfig>({ builder: 'claude', reviewer: 'claude' });
const [codexReady, setCodexReady] = useState(false);

useEffect(() => {
  window.api.storage.getConfig().then((config) => {
    setMultiAgentEnabled(config.multiAgentEnabled ?? false);
    setAgentRoles(config.agentRoles ?? { builder: 'claude', reviewer: 'claude' });
  });
  window.api.cli.checkCodex().then((s) => setCodexReady(s.installed && s.authenticated));
}, []);
```

---

## Phase 8: Resilient Chat (Agent-Agnostic)

### 8a. `src/utils/resilient-chat.ts` -- Add optional agent parameter

```ts
interface ResilientChatOptions {
  // ... existing fields ...
  agent?: AgentProvider;  // NEW -- default 'claude'
}
```

In the core function, select the API based on agent:

```ts
const chatFn = options.agent === 'codex' ? window.api.codex.chat : window.api.claude.chat;
const cancelFn = options.agent === 'codex' ? window.api.codex.cancelChat : window.api.claude.cancelChat;
```

Replace hardcoded `window.api.claude.chat(...)` and `window.api.claude.cancelChat(...)` with `chatFn(...)` and `cancelFn(...)`.

---

## Files Changed Summary

| File | Action | Phase |
|------|--------|-------|
| `src/types/index.ts` | Edit -- add `AgentProvider`, `AgentRoleConfig`, extend `Config`, `CLIStatus`, `ChatResult`, `TaskTokenUsage` | 1 |
| `src/types/electron.d.ts` | Edit -- add `codex` namespace, `cli.checkCodex` | 1 |
| `electron/services/codex.ts` | **NEW** -- CodexService with `chat()` + JSONL parser | 2 |
| `electron/main.ts` | Edit -- import CodexService, add `codex:*` IPC handlers, cleanup | 3 |
| `electron/preload.ts` | Edit -- add `codexOutputHandlers`, `codex` namespace, `cli.checkCodex` | 3 |
| `electron/services/cli-check.ts` | Edit -- add `checkCodex()`, update `checkAll()` and interface | 4 |
| `src/constants/preflight-requirements.ts` | Edit -- add `'codex'` to `ServiceKey` + `SERVICE_REGISTRY` | 4 |
| `src/hooks/useCLIMonitor.ts` | Edit -- accept dynamic required services param | 4 |
| `src/utils/agent-router.ts` | **NEW** -- `getAgentForRole()` + `cancelBuildAgents()` | 5 |
| `src/hooks/useBuildPipeline.ts` | Edit -- load config, replace 6 `claude.chat()` call sites, token attribution | 6 |
| `src/screens/BuildScreen.tsx` | Edit -- dynamic preflight services | 6 |
| `src/screens/SettingsScreen.tsx` | Edit -- multi-agent toggle + role config UI | 7 |
| `src/utils/resilient-chat.ts` | Edit -- add `agent` option, make agent-agnostic | 8 |

**2 new files, 11 modified files.**

---

## Risks and Mitigations

1. **Codex JSONL parsing** -- The exact event schema needs empirical verification. Parser is written defensively with raw-stdout fallback. Only `codex.ts` needs updating if schema differs.

2. **Review JSON format** -- Both agents get the same prompt requesting structured JSON output. `parseReviewResponse` in `build-helpers.ts` already has a fallback for non-JSON responses -- degrades gracefully.

3. **Zero regression guarantee** -- When `multiAgentEnabled` is false (default), `getAgentForRole()` always returns `window.api.claude.*`. The CodexService is instantiated in main.ts but never called in the hot path. Pipeline follows the exact same code path.

4. **Config backward compat** -- `multiAgentEnabled` and `agentRoles` are optional fields on `Config`. Old configs missing them default to `false`/`undefined`.

---

## Verification

1. **Single-agent regression**: With `multiAgentEnabled: false`, run a full build -> identical behavior, all calls go through Claude
2. **Codex CLI detection**: Verify `codex exec` smoke test. Test with Codex not installed -> shows "Not installed" in settings, blocks preflight if enabled
3. **Claude builds, Codex reviews**: Enable multi-agent, set roles. Run a task -> verify build uses Claude, review/fix use Codex
4. **Codex builds, Claude reviews**: Inverse of above
5. **Cancel mid-build**: Verify only build-owned chatIds are killed, other flows unaffected
6. **Preflight gate**: Enable multi-agent with Codex -> preflight requires Codex CLI (both BuildScreen and CLI monitor agree)
7. **Token tracking**: Build metrics correctly attribute tokens per agent
8. **Build with `npx electron-vite build`** after each phase (not `npx vite build`)
