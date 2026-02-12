# Multi-Agent Execution Feature - Implementation Plan

## Overview

Split build tasks into frontend and backend categories, assign each to a specialized agent with tailored context, and run them in parallel. A sequential merge lock prevents conflicts, and Gap Analysis (built prior) serves as the integration safety net.

**Depends on:** Git History feature (agent field on events), Gap Analysis feature (catches integration issues from parallel work).

---

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Task classification | During task generation (planning phase) with user override | Most natural — Claude already understands the task. User can re-tag before building. |
| Dependency handling | Simple parallel, Gap Analysis catches issues | Simplest approach. Gap Analysis is the safety net. Dependency graph can be added later. |
| Merge strategy | Sequential merge lock | Transparent, mirrors real teams. One agent merges at a time, other rebases first. |
| Context files | Template-based with auto-fill | Primes each agent to think like that type of engineer. Templates + detected project info. |
| Parallel UI | Split-panel view | User sees both agents working simultaneously. |

---

## Data Model Changes

### Updated Type: `Task`

```typescript
// src/types/index.ts

interface Task {
  id: string;
  title: string;
  completed: boolean;
  category?: 'frontend' | 'backend' | 'fullstack';  // NEW
}
```

`fullstack` is for tasks that clearly span both (e.g., "add authentication end-to-end"). These get assigned to whichever agent finishes its current task first.

### Updated Type: `GitEvent`

```typescript
// Add to existing GitEvent interface
interface GitEvent {
  // ... existing fields
  agent?: 'frontend' | 'backend';  // NEW — which agent performed the action
}
```

### New Type: `AgentContext`

```typescript
interface AgentContext {
  role: 'frontend' | 'backend';
  contextFilePath: string;     // path to the .md file written to project dir
  assignedTasks: Task[];
  completedTasks: Task[];
  currentTask: Task | null;
  status: 'idle' | 'building' | 'reviewing' | 'merging' | 'waiting' | 'done';
}
```

---

## Context .md Files

Written to `{projectPath}/.kiln/` before agents start. These are included in every Claude prompt for that agent.

### Frontend Context Template

```markdown
# Frontend Agent Context

## Your Role
You are a senior frontend engineer. Your focus is UI/UX implementation,
component architecture, responsive design, and client-side state management.

## Coding Patterns
- Build small, composable components. One component per file.
- Co-locate styles with components. Use the project's existing styling approach.
- Handle loading states, empty states, and error states for every view.
- Keep business logic out of components — use hooks or utility functions.
- Write semantic HTML. Use proper heading hierarchy and ARIA attributes.

## Your Scope
- ONLY modify files in frontend directories (components, pages, styles, hooks, utils).
- Do NOT modify backend files, API routes, database schemas, or server config.
- If you need a backend API endpoint that doesn't exist yet, create a mock/stub
  and add a TODO comment noting what the real endpoint should return.

## Project Info (auto-filled)
- Framework: {framework}
- Styling: {stylingApproach}
- State Management: {stateManagement}
- Component Directory: {componentDir}
- Pages/Routes Directory: {pagesDir}
```

### Backend Context Template

```markdown
# Backend Agent Context

## Your Role
You are a senior backend engineer. Your focus is API design, data modeling,
security, performance, and infrastructure.

## Coding Patterns
- Design RESTful endpoints with consistent naming and status codes.
- Validate all inputs at the boundary. Never trust client data.
- Handle errors explicitly. Return meaningful error messages.
- Write database queries efficiently. Use indexes where appropriate.
- Keep route handlers thin — extract logic into service functions.

## Your Scope
- ONLY modify files in backend directories (api, routes, models, middleware, db).
- Do NOT modify frontend components, styles, or client-side code.
- If you need a frontend change to consume your API, note it in a TODO comment.

## Project Info (auto-filled)
- Runtime: {runtime}
- API Framework: {apiFramework}
- Database: {database}
- API Directory: {apiDir}
- Schema/Models Directory: {modelsDir}
```

### Auto-Fill Logic

A utility function detects project info from:

- `package.json` dependencies → framework, styling, state management
- File structure scan → component dir, pages dir, API dir, models dir
- `tsconfig.json` / config files → additional context

```typescript
// src/utils/projectDetector.ts

interface ProjectInfo {
  framework: string;        // 'React', 'Next.js', 'Vue', etc.
  stylingApproach: string;  // 'Tailwind', 'CSS Modules', 'styled-components'
  stateManagement: string;  // 'Zustand', 'Redux', 'Context API'
  runtime: string;          // 'Node.js', 'Bun', 'Deno'
  apiFramework: string;     // 'Express', 'Next.js API Routes', 'Fastify'
  database: string;         // 'Supabase/Postgres', 'MongoDB', 'SQLite'
  componentDir: string;     // detected path
  pagesDir: string;
  apiDir: string;
  modelsDir: string;
}

async function detectProjectInfo(projectPath: string): Promise<ProjectInfo>
```

---

## Parallel Execution Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    BUILD START                                │
│                                                              │
│  1. Classify tasks (already done at planning time)           │
│  2. Generate context .md files from templates + auto-fill    │
│  3. Write .md files to {projectPath}/.kiln/                  │
│  4. Split tasks: frontendTasks[], backendTasks[]             │
│     (fullstack tasks go into a shared queue)                 │
│                                                              │
│  ┌──────────────────────┐  ┌──────────────────────┐         │
│  │  BACKEND AGENT       │  │  FRONTEND AGENT      │         │
│  │                      │  │                      │         │
│  │  For each task:      │  │  For each task:      │         │
│  │  ├─ create branch    │  │  ├─ create branch    │         │
│  │  ├─ spawn Claude     │  │  ├─ spawn Claude     │         │
│  │  │  (with backend    │  │  │  (with frontend   │         │
│  │  │   context.md)     │  │  │   context.md)     │         │
│  │  ├─ commit           │  │  ├─ commit           │         │
│  │  ├─ review           │  │  ├─ review           │         │
│  │  ├─ fix if needed    │  │  ├─ fix if needed    │         │
│  │  ├─ ACQUIRE LOCK     │  │  ├─ ACQUIRE LOCK     │         │
│  │  ├─ pull + rebase    │  │  ├─ pull + rebase    │         │
│  │  ├─ merge to main    │  │  ├─ merge to main    │         │
│  │  ├─ RELEASE LOCK     │  │  ├─ RELEASE LOCK     │         │
│  │  └─ next task        │  │  └─ next task        │         │
│  │                      │  │                      │         │
│  │  When out of tasks:  │  │  When out of tasks:  │         │
│  │  Pick from shared    │  │  Pick from shared    │         │
│  │  fullstack queue     │  │  fullstack queue     │         │
│  │                      │  │                      │         │
│  └──────────────────────┘  └──────────────────────┘         │
│                                                              │
│  Both agents done → Gap Analysis screen                      │
└─────────────────────────────────────────────────────────────┘
```

### Merge Lock

A simple in-memory lock within the build orchestrator:

```typescript
class MergeLock {
  private locked = false;
  private waiting: (() => void)[] = [];

  async acquire(): Promise<void> {
    if (!this.locked) {
      this.locked = true;
      return;
    }
    return new Promise((resolve) => {
      this.waiting.push(() => {
        this.locked = true;
        resolve();
      });
    });
  }

  release(): void {
    if (this.waiting.length > 0) {
      const next = this.waiting.shift()!;
      next();
    } else {
      this.locked = false;
    }
  }
}
```

When an agent is ready to merge:

1. `await mergeLock.acquire()`
2. `git checkout main && git pull`
3. `git checkout {branch} && git rebase main`
4. If rebase conflict → attempt auto-resolve, if impossible → flag to user
5. `git merge {branch}`
6. `mergeLock.release()`

---

## UI: Split-Panel Build View

When tasks have mixed categories (both frontend and backend exist), BuildScreen renders in split-panel mode:

```
┌─────────────────────────────────────────────────────┐
│ Building Project          6/12 tasks complete        │
│                                                      │
│ ┌───────────────────────┬───────────────────────┐   │
│ │ Backend Agent         │ Frontend Agent         │   │
│ │                       │                        │   │
│ │ Task: Setup DB schema │ Task: Build nav bar    │   │
│ │ Phase: ● building     │ Phase: ● reviewing     │   │
│ │ Branch: feat/setup-db │ Branch: feat/nav-bar   │   │
│ │                       │                        │   │
│ │ ┌───────────────────┐ │ ┌────────────────────┐ │   │
│ │ │ terminal output   │ │ │ terminal output    │ │   │
│ │ │ ...               │ │ │ ...                │ │   │
│ │ │                   │ │ │                    │ │   │
│ │ └───────────────────┘ │ └────────────────────┘ │   │
│ │                       │                        │   │
│ │ Completed: 2/5        │ Completed: 4/7         │   │
│ │ ✓ Init project        │ ✓ Setup layout         │   │
│ │ ✓ Create API routes   │ ✓ Build homepage       │   │
│ │                       │ ✓ Build settings page  │   │
│ │                       │ ✓ Add auth UI          │   │
│ └───────────────────────┴───────────────────────┘   │
│                                                      │
│ Shared Queue: 0 fullstack tasks remaining            │
└─────────────────────────────────────────────────────┘
```

**Single-agent fallback:** If all tasks are the same category (e.g., all frontend), BuildScreen renders the existing single-panel view. No wasted parallel overhead.

**Minimized agent:** If one agent finishes all its tasks while the other is still working, its panel shows a "Done — waiting for other agent" state.

---

## Files to Modify

### 1. Types — `src/types/index.ts`

- Add `category` field to `Task` interface: `category?: 'frontend' | 'backend' | 'fullstack'`
- Add `agent` field to `GitEvent` interface: `agent?: 'frontend' | 'backend'`
- Add `AgentContext` interface

### 2. Planning / Task Generation — `src/screens/TasksScreen.tsx`

Update the Claude prompt used to generate tasks to include classification:

```
Break this PRD into implementation tasks. For each task, assign a category:
- "backend" for API, database, server, auth logic, migrations
- "frontend" for UI components, pages, styling, client-side state
- "fullstack" for tasks that require changes to both

Output as JSON:
[
  { "title": "...", "category": "backend" },
  { "title": "...", "category": "frontend" },
  ...
]
```

Add category badges to the task list UI with ability to re-tag (click to cycle: frontend → backend → fullstack).

### 3. New Utility — `src/utils/projectDetector.ts`

Detects project info from package.json, file structure, config files. Used to auto-fill the context .md templates.

```typescript
export async function detectProjectInfo(projectPath: string): Promise<ProjectInfo>
```

Uses existing `window.api.fs.readdir` and file reading capabilities.

### 4. New Utility — `src/utils/agentContext.ts`

Generates and writes the context .md files:

```typescript
export async function generateAgentContextFiles(
  projectPath: string,
  projectInfo: ProjectInfo
): Promise<{ frontendPath: string; backendPath: string }>
```

Fills templates with detected project info, writes to `{projectPath}/.kiln/frontend-context.md` and `backend-context.md`.

### 5. New Hook — `src/hooks/useTaskPipeline.ts`

Extracts the core per-task execution logic that currently lives in BuildScreen into a reusable hook:

```typescript
interface UseTaskPipelineOptions {
  projectPath: string;
  agent: 'frontend' | 'backend';
  contextFilePath: string;
  mergeLock: MergeLock;
  onTaskComplete: (task: Task) => void;
  onEvent: (event: Omit<GitEvent, 'id' | 'timestamp'>) => void;
}

interface TaskPipelineState {
  currentTask: Task | null;
  phase: TaskPhase;
  reviewArtifact: ReviewArtifact | null;
  currentBranch: string;
  terminalOutput: string[];
  completedCount: number;
}

function useTaskPipeline(
  tasks: Task[],
  options: UseTaskPipelineOptions
): TaskPipelineState & { start: () => void; pause: () => void }
```

This is the biggest refactor — pulling pipeline logic out of BuildScreen's 47KB into a composable hook. The hook manages:
- Branch creation
- Claude Code spawning (with agent context .md prepended to prompt)
- Commit, review, fix cycle
- Merge lock acquire/release
- GitEvent emission

### 6. New Component — `src/components/AgentPanel.tsx`

Renders one agent's build progress (terminal output, current task, phase, completed tasks). Used twice in the split view:

```typescript
interface AgentPanelProps {
  agent: 'frontend' | 'backend';
  pipeline: TaskPipelineState;
  totalTasks: number;
}
```

### 7. BuildScreen — `src/screens/BuildScreen.tsx`

Major changes:

- Detect if tasks have mixed categories → choose single vs parallel mode
- **Single mode:** Use `useTaskPipeline` hook once (same behavior as today, just refactored)
- **Parallel mode:** Use `useTaskPipeline` twice, render two `AgentPanel` components side by side
- Create `MergeLock` instance shared between both pipelines
- Generate context .md files before starting
- Track shared fullstack task queue
- When both pipelines complete → navigate to `gap-analysis`

The refactor is significant but the end result is a cleaner BuildScreen — the core pipeline logic lives in the hook, and BuildScreen becomes primarily an orchestrator + layout.

### 8. IPC / Electron — `electron/main.ts` and `electron/preload.ts`

Need to support writing files to the project directory for context .md files. Check if existing capabilities cover this — the Claude Code service already writes to project dirs via PTY. May need:

```typescript
// If not already available
ipcMain.handle('fs:writeFile', async (_, filePath: string, content: string) => {
  await fs.writeFile(filePath, content, 'utf-8');
});
```

And expose through preload + `ElectronAPI`:

```typescript
fs: {
  readdir: (path: string) => Promise<string[]>;
  writeFile: (path: string, content: string) => Promise<void>;  // NEW
  readFile: (path: string) => Promise<string>;                   // NEW (for project detection)
}
```

### 9. Store — `src/store/useAppStore.ts`

Minimal changes — the parallel execution state lives in BuildScreen/hooks, not the global store. But add:

```typescript
// Track which mode was used for the build (useful for Git History display)
buildMode: 'single' | 'parallel';
setBuildMode: (mode: 'single' | 'parallel') => void;
```

### 10. Git History Integration

No changes to GitHistoryScreen needed — it already renders GitEvents. The new `agent` field on events means the timeline naturally shows:

```
● Task 3: Build nav bar                    [frontend]
  ├─ Branch created: feat/build-nav-bar
  ├─ ...
  └─ Merged to main ✓

● Task 2: Setup API routes                 [backend]
  ├─ Branch created: feat/setup-api
  ├─ ...
  └─ Merged to main ✓
```

GitHistoryScreen can optionally add a filter toggle: "All | Frontend | Backend" — but that's a polish item, not required.

---

## Implementation Order

### Phase 1: Task Classification

1. Add `category` field to `Task` type in `src/types/index.ts`
2. Update task generation prompt in `TasksScreen.tsx` to include classification
3. Add category badges + re-tag UI to task list
4. Add `agent` field to `GitEvent` type

### Phase 2: Context System

5. Create `src/utils/projectDetector.ts`
6. Create `src/utils/agentContext.ts` with templates
7. Add `fs.writeFile` / `fs.readFile` to IPC if needed
8. Test context file generation on a sample project

### Phase 3: Pipeline Extraction (biggest piece)

9. Create `src/hooks/useTaskPipeline.ts` — extract core build logic from BuildScreen
10. Create `MergeLock` class (can live in the same file or `src/utils/mergeLock.ts`)
11. Refactor BuildScreen to use `useTaskPipeline` in single-agent mode
12. Verify existing single-agent build still works identically

### Phase 4: Parallel Execution

13. Create `src/components/AgentPanel.tsx`
14. Add parallel mode to BuildScreen — detect mixed categories, split tasks, run two pipelines
15. Implement fullstack task shared queue
16. Wire up merge lock between both pipelines
17. Add `buildMode` to store
18. Test parallel execution end-to-end

### Phase 5: Polish

19. Add agent badges to Git History timeline events
20. Add filter toggle to Git History (All | Frontend | Backend)
21. Handle edge cases (one agent errors, rebase conflicts, all tasks same category)
22. Update E2ETestRunner to test parallel mode

---

## Edge Cases to Handle

- **All tasks same category**: Fall back to single-agent mode. No wasted overhead.
- **Rebase conflict during merge**: Attempt auto-resolve. If impossible, pause both agents, show conflict to user with options (resolve manually, skip task, abort).
- **One agent errors**: Other agent continues. Errored agent's remaining tasks move to shared queue for the healthy agent to pick up.
- **Claude rate limiting**: If one agent gets rate-limited, it waits and retries. Other agent continues unaffected.
- **Uneven task distribution**: 1 backend task, 11 frontend tasks — backend agent finishes fast, picks up fullstack tasks, then idles. This is fine.
- **Context .md detection fails**: Fall back to minimal template with just the role description. No auto-fill is better than wrong auto-fill.

---

## Future Extensions (not in this PR)

- **More agent types**: 'testing', 'devops', 'design-system' agents with their own context
- **Dependency graph**: Claude identifies task dependencies at planning time, orchestrator respects ordering
- **Agent-to-agent communication**: Frontend agent can request a backend endpoint, backend agent picks it up as an ad-hoc task
- **Per-agent Gap Analysis**: Run separate quality checks per agent before the full gap analysis
- **Custom context files**: User edits the .md templates to match their team's conventions
- **Three+ parallel agents**: For larger projects, split further (e.g., separate DB/API/auth agents)
