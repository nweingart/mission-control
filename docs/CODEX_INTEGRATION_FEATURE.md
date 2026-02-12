# Agent Abstraction & Codex Integration - Implementation Plan

## Overview

Create a generic agent abstraction layer so Kiln can work with any coding agent — Claude Code, OpenAI Codex, or future agents. Users pair at least one agent during setup, set a global default, and can override per-project. Existing Claude Code usage migrates gradually to the new abstraction.

**Depends on:** All prior features should be stable before this refactor. Multi-Agent Execution's `useTaskPipeline` hook is the main consumer of the agent interface.

---

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Switching granularity | Per-project with global default | Try new agents on new projects without affecting existing ones. |
| Migration strategy | Gradual — add `agent:*` alongside `claude:*` | Less risk. Screens migrate one by one. Old calls still work. |
| Setup requirement | At least one agent paired to continue | Agents are the core — can't build without one. |
| Provider model | Plugin-style registry | Adding a new agent = one new file implementing the interface + registering it. |

---

## Agent Provider Interface

The core abstraction. Every agent implements this:

```typescript
// electron/services/agents/types.ts

interface AgentProvider {
  /** Unique identifier: 'claude-code', 'openai-codex', etc. */
  id: string;

  /** Display name: 'Claude Code', 'OpenAI Codex' */
  name: string;

  /** Short description shown in agent picker */
  description: string;

  /**
   * Spawn a non-interactive session that executes a prompt and exits.
   * Returns a sessionId for tracking output/exit events.
   */
  spawn(projectPath: string, prompt: string, contextFile?: string): Promise<string>;

  /**
   * Spawn an interactive terminal session.
   * Returns a sessionId for sending input and tracking output.
   */
  spawnInteractive(projectPath: string): Promise<string>;

  /**
   * Single-turn chat: send prompt, get response string.
   * Used for reviews, gap analysis, task generation, etc.
   */
  chat(projectPath: string, prompt: string): Promise<string>;

  /** Send input to an interactive session. */
  sendInput(sessionId: string, input: string): Promise<void>;

  /** Resize terminal for a session. */
  resize(sessionId: string, cols: number, rows: number): Promise<void>;

  /** Kill a running session. */
  kill(sessionId: string): Promise<void>;

  /** Check if CLI is installed and authenticated. */
  checkStatus(): Promise<{ installed: boolean; authenticated: boolean }>;

  /** Get install instructions for this agent. */
  getSetupInstructions(): { installCommand: string; authCommand: string; docsUrl: string };
}

interface AgentProviderEvents {
  onOutput: (callback: (data: { sessionId: string; type: 'stdout' | 'stderr'; content: string }) => void) => void;
  onExit: (callback: (data: { sessionId: string; code: number }) => void) => void;
  removeListeners: () => void;
}
```

---

## Agent Registry

Manages available providers, tracks which are configured, routes calls to the active provider:

```typescript
// electron/services/agents/registry.ts

class AgentRegistry {
  private providers: Map<string, AgentProvider & AgentProviderEvents> = new Map();

  /** Register a provider at startup. */
  register(provider: AgentProvider & AgentProviderEvents): void;

  /** Get all registered providers. */
  listProviders(): Array<{ id: string; name: string; description: string }>;

  /** Get a specific provider by ID. */
  getProvider(id: string): (AgentProvider & AgentProviderEvents) | undefined;

  /** Check status of all registered providers. */
  checkAllStatus(): Promise<Array<{ id: string; name: string; installed: boolean; authenticated: boolean }>>;
}
```

Instantiated once in `electron/main.ts`:

```typescript
const agentRegistry = new AgentRegistry();
agentRegistry.register(new ClaudeCodeProvider());
agentRegistry.register(new CodexProvider());
```

---

## Provider Implementations

### Claude Code Provider

Refactored from the existing `electron/services/claude-code.ts`:

```typescript
// electron/services/agents/claude-code.ts

class ClaudeCodeProvider implements AgentProvider, AgentProviderEvents {
  id = 'claude-code';
  name = 'Claude Code';
  description = 'Anthropic\'s AI coding agent';

  async spawn(projectPath: string, prompt: string, contextFile?: string): Promise<string> {
    // Existing PTY spawn logic, moved from claude-code.ts
    // If contextFile provided, prepend to prompt or pass as flag
    const args = ['--print', prompt];
    // ... spawn via node-pty
  }

  async chat(projectPath: string, prompt: string): Promise<string> {
    // Existing chat logic
  }

  async checkStatus(): Promise<{ installed: boolean; authenticated: boolean }> {
    // Existing check logic from cli-check.ts
  }

  getSetupInstructions() {
    return {
      installCommand: 'npm install -g @anthropic-ai/claude-code',
      authCommand: 'claude auth',
      docsUrl: 'https://docs.anthropic.com/claude-code',
    };
  }

  // ... remaining methods
}
```

### OpenAI Codex Provider

New implementation following the same pattern:

```typescript
// electron/services/agents/codex.ts

class CodexProvider implements AgentProvider, AgentProviderEvents {
  id = 'openai-codex';
  name = 'OpenAI Codex';
  description = 'OpenAI\'s AI coding agent';

  async spawn(projectPath: string, prompt: string, contextFile?: string): Promise<string> {
    // Spawn 'codex' CLI via PTY
    // Codex CLI args may differ from Claude
    const args = [prompt];
    if (contextFile) {
      args.unshift('--context', contextFile);
    }
    // ... spawn via node-pty
  }

  async chat(projectPath: string, prompt: string): Promise<string> {
    // Codex equivalent of single-turn chat
  }

  async checkStatus(): Promise<{ installed: boolean; authenticated: boolean }> {
    // Check if 'codex' is in PATH and authenticated
  }

  getSetupInstructions() {
    return {
      installCommand: 'npm install -g @openai/codex',
      authCommand: 'codex auth',
      docsUrl: 'https://platform.openai.com/docs/codex',
    };
  }

  // ... remaining methods
}
```

### Adding a Future Agent

Adding a new agent (e.g., Gemini Code Assist) is:

1. Create `electron/services/agents/gemini.ts` implementing `AgentProvider`
2. Register it in `main.ts`: `agentRegistry.register(new GeminiProvider())`
3. Done — it shows up in the agent picker automatically

---

## Data Model Changes

### Updated Type: `Config`

```typescript
// src/types/index.ts

interface Config {
  developmentPath: string;
  theme?: 'light' | 'dark';
  hasCompletedOnboarding?: boolean;
  hasSetWorkspace?: boolean;
  defaultAgentId?: string;              // NEW — global default agent
  configuredAgents?: AgentSetup[];      // NEW — list of paired agents
}

interface AgentSetup {
  id: string;           // 'claude-code' | 'openai-codex'
  configured: boolean;  // has passed status check
  configuredAt: string; // ISO timestamp
}
```

### Updated Type: `Project`

```typescript
interface Project {
  // ... existing fields
  agentId?: string;     // NEW — override agent for this project (defaults to global)
}
```

### New Type: `AgentInfo`

```typescript
// Used on the renderer side for display
interface AgentInfo {
  id: string;
  name: string;
  description: string;
  installed: boolean;
  authenticated: boolean;
  setupInstructions: {
    installCommand: string;
    authCommand: string;
    docsUrl: string;
  };
}
```

---

## IPC Layer

### New `agent:*` Channels

```typescript
// electron/main.ts — new IPC handlers

// Agent registry
ipcMain.handle('agent:list', async () => {
  return agentRegistry.listProviders();
});

ipcMain.handle('agent:checkAll', async () => {
  return agentRegistry.checkAllStatus();
});

ipcMain.handle('agent:checkOne', async (_, agentId: string) => {
  const provider = agentRegistry.getProvider(agentId);
  if (!provider) throw new Error(`Unknown agent: ${agentId}`);
  const status = await provider.checkStatus();
  return { id: agentId, ...status, setupInstructions: provider.getSetupInstructions() };
});

// Agent operations — routed through registry
ipcMain.handle('agent:spawn', async (_, agentId: string, projectPath: string, prompt: string, contextFile?: string) => {
  const provider = agentRegistry.getProvider(agentId);
  if (!provider) throw new Error(`Unknown agent: ${agentId}`);
  return provider.spawn(projectPath, prompt, contextFile);
});

ipcMain.handle('agent:chat', async (_, agentId: string, projectPath: string, prompt: string) => {
  const provider = agentRegistry.getProvider(agentId);
  if (!provider) throw new Error(`Unknown agent: ${agentId}`);
  return provider.chat(projectPath, prompt);
});

ipcMain.handle('agent:sendInput', async (_, agentId: string, sessionId: string, input: string) => {
  const provider = agentRegistry.getProvider(agentId);
  if (!provider) throw new Error(`Unknown agent: ${agentId}`);
  return provider.sendInput(sessionId, input);
});

ipcMain.handle('agent:kill', async (_, agentId: string, sessionId: string) => {
  const provider = agentRegistry.getProvider(agentId);
  if (!provider) throw new Error(`Unknown agent: ${agentId}`);
  return provider.kill(sessionId);
});

ipcMain.handle('agent:resize', async (_, agentId: string, sessionId: string, cols: number, rows: number) => {
  const provider = agentRegistry.getProvider(agentId);
  if (!provider) throw new Error(`Unknown agent: ${agentId}`);
  return provider.resize(sessionId, cols, rows);
});

ipcMain.handle('agent:getSetupInstructions', async (_, agentId: string) => {
  const provider = agentRegistry.getProvider(agentId);
  if (!provider) throw new Error(`Unknown agent: ${agentId}`);
  return provider.getSetupInstructions();
});
```

### Existing `claude:*` Channels

**Keep them working.** They continue to route to `ClaudeCodeProvider` directly. Screens that haven't been migrated yet still work. Over time, screens switch from `window.api.claude.spawn(...)` to `window.api.agent.spawn('claude-code', ...)`.

### Preload — `electron/preload.ts`

```typescript
agent: {
  list: () => ipcRenderer.invoke('agent:list'),
  checkAll: () => ipcRenderer.invoke('agent:checkAll'),
  checkOne: (agentId: string) => ipcRenderer.invoke('agent:checkOne', agentId),
  spawn: (agentId: string, projectPath: string, prompt: string, contextFile?: string) =>
    ipcRenderer.invoke('agent:spawn', agentId, projectPath, prompt, contextFile),
  chat: (agentId: string, projectPath: string, prompt: string) =>
    ipcRenderer.invoke('agent:chat', agentId, projectPath, prompt),
  sendInput: (agentId: string, sessionId: string, input: string) =>
    ipcRenderer.invoke('agent:sendInput', agentId, sessionId, input),
  kill: (agentId: string, sessionId: string) =>
    ipcRenderer.invoke('agent:kill', agentId, sessionId),
  resize: (agentId: string, sessionId: string, cols: number, rows: number) =>
    ipcRenderer.invoke('agent:resize', agentId, sessionId, cols, rows),
  getSetupInstructions: (agentId: string) =>
    ipcRenderer.invoke('agent:getSetupInstructions', agentId),
  onOutput: (callback: (data: { sessionId: string; type: string; content: string }) => void) =>
    ipcRenderer.on('agent:output', (_, data) => callback(data)),
  onExit: (callback: (data: { sessionId: string; code: number }) => void) =>
    ipcRenderer.on('agent:exit', (_, data) => callback(data)),
  removeListeners: () => {
    ipcRenderer.removeAllListeners('agent:output');
    ipcRenderer.removeAllListeners('agent:exit');
  },
},
```

### Electron API Type — `src/types/electron.d.ts`

Add `agent` section to `ElectronAPI` matching the preload bridge above.

---

## Setup Flow Changes

### Current Flow

```
Welcome → Workflow → SetupWorkspace → SetupDeploy → SetupReady → Home
```

SetupDeploy currently checks: Claude (required) + GitHub + Vercel + Supabase.

### New Flow

```
Welcome → Workflow → SetupWorkspace → SetupAgents → SetupDeploy → SetupReady → Home
```

A new **SetupAgentsScreen** is inserted before SetupDeploy. SetupDeploy continues to handle GitHub, Vercel, and Supabase.

### SetupAgentsScreen UI

```
┌─────────────────────────────────────────────────────┐
│              Pair a Coding Agent                     │
│                                                      │
│  Kiln works with AI coding agents to build your    │
│  projects. Add at least one to continue.             │
│                                                      │
│  ┌─────────────────────────────────────────────┐    │
│  │  Claude Code                         PAIRED  │    │
│  │  Anthropic's AI coding agent                 │    │
│  │  ✓ Installed  ✓ Authenticated               │    │
│  └─────────────────────────────────────────────┘    │
│                                                      │
│  ┌─────────────────────────────────────────────┐    │
│  │  OpenAI Codex                     NOT PAIRED │    │
│  │  OpenAI's AI coding agent                    │    │
│  │  ✗ Not installed                             │    │
│  │  [Setup Instructions ↗]                      │    │
│  └─────────────────────────────────────────────┘    │
│                                                      │
│  ┌──────────────────────────┐                       │
│  │   Continue →              │  (enabled when ≥1    │
│  └──────────────────────────┘    agent is paired)   │
│                                                      │
└─────────────────────────────────────────────────────┘
```

**Behavior:**
- Calls `window.api.agent.checkAll()` to get status of all registered agents
- Each agent card shows install + auth status
- Clicking an unconfigured agent expands setup instructions (install command, auth command, link to docs)
- Can run setup commands inline (using existing PTY setup infrastructure from SetupDeployScreen)
- "Continue" button enabled once at least one agent shows installed + authenticated
- Saves configured agents to config via `configuredAgents`

### Agent Picker (for per-project override)

In the project creation flow (IdeaScreen) or in a project settings panel, add an agent picker:

```
┌──────────────────────────────┐
│  Agent: Claude Code  [▼]     │
│  ┌────────────────────────┐  │
│  │ ● Claude Code (default)│  │
│  │   OpenAI Codex         │  │
│  └────────────────────────┘  │
└──────────────────────────────┘
```

Only shows agents that are configured/paired. Selected agent is saved as `project.agentId`.

---

## Screen Migration Guide

Screens currently using `window.api.claude.*` need to migrate to `window.api.agent.*`. This happens gradually:

### Migration Pattern

Before:
```typescript
const sessionId = await window.api.claude.spawn(projectPath, prompt);
window.api.claude.onOutput((data) => { /* handle */ });
window.api.claude.onExit((data) => { /* handle */ });
```

After:
```typescript
const agentId = currentProject?.agentId || config.defaultAgentId || 'claude-code';
const sessionId = await window.api.agent.spawn(agentId, projectPath, prompt);
window.api.agent.onOutput((data) => { /* handle */ });
window.api.agent.onExit((data) => { /* handle */ });
```

### Screens to Migrate (in priority order)

| Screen | Usage | Complexity |
|--------|-------|-----------|
| `useTaskPipeline` hook | Core build execution | Medium — single point of change, all build tasks go through here |
| `DiscoveryScreen` | Chat with agent for PRD generation | Low — one spawn call |
| `GapAnalysisScreen` | Gap analysis + meta-review + fix prompts | Medium — multiple spawn/chat calls |
| `BuildScreen` | Orchestrator, delegates to useTaskPipeline | Low — if hook is migrated, this follows |
| `PlanningChatsScreen` | Planning chat sessions | Low — one spawn call |
| `E2ETestRunner` | Test harness | Low priority — test infra, migrate last |
| `FlowTestRunner` | Test harness | Low priority |

The `useTaskPipeline` hook (from Multi-Agent feature) is the highest-value migration — it handles all build execution, so migrating it covers the most usage with one change.

---

## Files Summary

### New Files

| File | Purpose |
|------|---------|
| `electron/services/agents/types.ts` | `AgentProvider` + `AgentProviderEvents` interfaces |
| `electron/services/agents/registry.ts` | `AgentRegistry` class |
| `electron/services/agents/claude-code.ts` | Claude Code provider (refactored from existing) |
| `electron/services/agents/codex.ts` | OpenAI Codex provider |
| `src/screens/SetupAgentsScreen.tsx` | Agent pairing screen in onboarding |
| `src/components/AgentPicker.tsx` | Dropdown for per-project agent selection |

### Modified Files

| File | Change |
|------|--------|
| `src/types/index.ts` | Add `AgentSetup`, `AgentInfo` types. Add `agentId` to `Project`. Add `'setup-agents'` to `Screen`. |
| `src/types/electron.d.ts` | Add `agent` section to `ElectronAPI` |
| `electron/main.ts` | Instantiate registry, register providers, add `agent:*` IPC handlers |
| `electron/preload.ts` | Add `agent` bridge |
| `electron/services/claude-code.ts` | Refactor into provider class (or keep as-is and create wrapper) |
| `src/store/useAppStore.ts` | Add `activeAgentId` derived from project/config. Add `configuredAgents` state. |
| `src/App.tsx` | Add `setup-agents` route |
| `src/components/ProjectLayout.tsx` | Show active agent indicator (small badge showing which agent is being used) |
| `src/screens/SetupDeployScreen.tsx` | Remove Claude check (moved to SetupAgentsScreen). Navigate to `setup-agents` if no agents paired. |
| `src/screens/IdeaScreen.tsx` | Add agent picker to project creation |

### Gradually Migrated Files (not required at launch)

| File | Migration |
|------|-----------|
| `src/hooks/useTaskPipeline.ts` | `claude.spawn` → `agent.spawn` |
| `src/screens/DiscoveryScreen.tsx` | `claude.chat` → `agent.chat` |
| `src/screens/GapAnalysisScreen.tsx` | `claude.spawn/chat` → `agent.spawn/chat` |
| `src/screens/PlanningChatsScreen.tsx` | `claude.spawn` → `agent.spawn` |
| `src/components/E2ETestRunner.tsx` | `claude.spawn` → `agent.spawn` |

---

## Implementation Order

### Phase 1: Agent Abstraction Layer

1. Create `electron/services/agents/types.ts` — define `AgentProvider` interface
2. Create `electron/services/agents/registry.ts` — implement `AgentRegistry`
3. Create `electron/services/agents/claude-code.ts` — refactor existing Claude Code service into provider class
4. Create `electron/services/agents/codex.ts` — implement Codex provider
5. Register both providers in `electron/main.ts`

### Phase 2: IPC Layer

6. Add `agent:*` IPC handlers in `main.ts`
7. Add `agent` bridge in `preload.ts`
8. Add `agent` section to `ElectronAPI` type
9. Verify existing `claude:*` channels still work (backward compatibility)

### Phase 3: Config & Types

10. Add `AgentSetup`, `AgentInfo` to `src/types/index.ts`
11. Add `agentId` to `Project` type
12. Add `'setup-agents'` to `Screen` type
13. Add `defaultAgentId`, `configuredAgents` to `Config` type
14. Update `useAppStore.ts` with agent state

### Phase 4: Setup Flow

15. Create `SetupAgentsScreen.tsx`
16. Update onboarding flow: insert between SetupWorkspace and SetupDeploy
17. Update `SetupDeployScreen.tsx` — remove Claude-specific check
18. Update `App.tsx` with new route
19. Test: fresh onboarding pairs Claude, continues to deploy setup

### Phase 5: Agent Picker

20. Create `AgentPicker.tsx` component
21. Add to `IdeaScreen.tsx` (project creation)
22. Add agent badge to `ProjectLayout.tsx`
23. Add agent selection to project settings (if a settings panel exists)

### Phase 6: Gradual Screen Migration

24. Migrate `useTaskPipeline.ts` — highest impact, covers all build execution
25. Migrate `DiscoveryScreen.tsx`
26. Migrate `GapAnalysisScreen.tsx`
27. Migrate `PlanningChatsScreen.tsx`
28. Migrate test runners (lowest priority)

---

## Edge Cases to Handle

- **Agent CLI not found**: Show clear install instructions. Don't crash — fall back gracefully.
- **Agent auth expires mid-build**: Catch auth errors, pause build, prompt user to re-authenticate.
- **Agent removed after project creation**: If a project's `agentId` points to a now-unconfigured agent, prompt user to pick a different one when they open the project.
- **Different response formats**: Each provider's `chat()` method is responsible for returning a clean string. Prompt formatting differences are handled inside the provider, not by the caller.
- **Codex CLI changes**: OpenAI may update their CLI. The provider implementation isolates this — only `codex.ts` needs to change.
- **No agents configured**: Block at SetupAgentsScreen. If all agents are later removed (uninstalled), redirect to SetupAgentsScreen on next app launch.

---

## Future Extensions (not in this PR)

- **Per-task agent selection**: In Multi-Agent mode, assign Claude to backend and Codex to frontend (or vice versa)
- **Agent performance tracking**: Compare build times, review quality, gap analysis grades across agents
- **Custom agent providers**: User can register their own agent by pointing to a CLI binary that implements a basic protocol
- **Agent marketplace**: Browse and install new agent providers from a catalog
- **Fallback chains**: If primary agent fails, automatically try secondary agent
- **Agent-specific prompts**: Tune prompts per agent for optimal output (Claude and Codex may respond better to different prompt styles)
