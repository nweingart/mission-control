# Phase 3: Parallel Execution Within Tiers

## Overview

The big payoff. Change the inner tier loop from sequential task execution to concurrent execution with a cap of 3 simultaneous Claude sessions. Handle partial failures, concurrent merge ordering, and update the UI for multiple in-flight tasks.

**Depends on:** Phase 2 (tier-aware sequential execution, tier boundary reconciliation, stop-after-tier, failed task demotion).

**Risk level:** High. Concurrent Claude sessions, git worktree management, partial failures, merge ordering. Phase 2 de-risks this significantly by validating all tier boundary logic first.

---

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Concurrency cap | 3 simultaneous tasks (configurable) | Diminishing returns beyond 3. More concurrent tasks = more merge conflicts, harder to debug, higher API cost on retries. |
| Concurrent execution | `Promise.allSettled()` | Need to handle partial failures gracefully. `Promise.all()` would abort on first failure. |
| Merge ordering | Sequential merges after all tasks in tier complete | All tasks build on the same base (main at tier start). After all finish, merge one at a time. Order doesn't matter since they're independent. |
| Partial failure | Demote failed tasks to next tier (from Phase 2) | Already built and tested. No new logic needed for the demotion itself. |
| Claude session management | Unique `chatId` per concurrent task | `ClaudeCodeService.chat()` already supports concurrent sessions via its `Map<chatId, ChildProcess>`. |
| **Git isolation** | **Git worktrees** (one per parallel task) | **Each parallel task needs its own working directory.** A single git repo can only have one branch checked out at a time. Git worktrees solve this by creating linked working directories that share the same .git objects but each have their own HEAD, index, and working tree. |
| **IPC output routing** | **Per-task chatId in output messages** | **The current `claude:chatOutput` IPC channel has a single listener slot** (preload's `createListener` replaces previous listeners). Concurrent tasks need per-task output routing. |
| UI model | Multiple tasks in "In Progress" on kanban | KanbanBoard already handles multiple in-progress tasks visually. Status indicators need per-task phase tracking. |
| **Pause during parallel** | **No per-task pausing** | **`pauseResolverRef` is a single slot** — two tasks pausing simultaneously would deadlock. Tiers are atomic: no pausing within a parallel tier. Pause only happens at tier boundaries (already implemented in Phase 2). |

---

## Critical Design: Git Worktrees

### The Problem

Git only allows one branch to be checked out per working directory. The current pipeline does `git checkout feature-branch` → build → `git checkout main` → merge. With 3 parallel tasks, three `git checkout` calls would fight over the same HEAD, working tree, and index — corrupting everything.

### The Solution: `git worktree`

Git worktrees create additional working directories linked to the same repository. Each worktree has its own:
- HEAD (can be on a different branch)
- Index (staging area)
- Working tree (the actual files)

But they share:
- The `.git` object store (commits, blobs, trees)
- All refs (branches, tags)

```bash
# Create a worktree for task "auth-component" branching from main
git worktree add /tmp/houston-worktrees/my-project/task-auth -b feature/task-auth main

# Claude builds in /tmp/houston-worktrees/my-project/task-auth/
# (completely independent from the main working directory)

# After build completes, back in the main repo:
git checkout main
git merge feature/task-auth

# Cleanup
git worktree remove /tmp/houston-worktrees/my-project/task-auth
git branch -d feature/task-auth
```

### Worktree Lifecycle Per Parallel Tier

```
1. Snapshot current main HEAD

2. For each task in tier (up to concurrency cap):
   a. Create worktree: git worktree add <worktreePath> -b <branchName> main
   b. Run npm install in the worktree (dependencies may differ from main)
   c. Run build + commit + review + fix — all using worktreePath as cwd
   d. Do NOT merge yet — stay on feature branch in the worktree

3. Wait for all tasks to complete (Promise.allSettled)

4. Collect results: successes and failures

5. For each successful task (sequentially, in the main repo):
   a. git checkout main (in main repo — should already be there)
   b. git merge <branchName>
   c. git worktree remove <worktreePath>
   d. git branch -d <branchName>

6. For each failed task:
   a. git worktree remove <worktreePath> (cleanup)
   b. git branch -D <branchName> (force delete — may have partial commits)
   c. Add to demoted queue for next tier

7. Run tier boundary reconciliation (npm install in main repo, commit)
```

### Worktree Path Convention

```
/tmp/houston-worktrees/<project-slug>/task-<taskId>/
```

Example: `/tmp/houston-worktrees/my-saas-app/task-1708012345-3/`

### node_modules in Worktrees

Each worktree needs its own `node_modules`. After creating the worktree, run `npm install` before building. This adds ~10-20s overhead per worktree but is necessary for correct builds (tasks may add different dependencies).

**Optimization for later:** If all tasks in a tier don't touch package.json, skip npm install and symlink node_modules from the main repo. But for v1, always run npm install — correctness over speed.

### Worktree Cleanup on Crash/Cancel

If the app crashes or the user cancels mid-build, stale worktrees may remain on disk. On pipeline start, check for and clean up any existing worktrees:

```typescript
// At the start of runAllTasks:
await cleanupStaleWorktrees(projectPath);

async function cleanupStaleWorktrees(projectPath: string) {
  const worktreeDir = `/tmp/houston-worktrees/${projectSlug}`;
  if (await fs.exists(worktreeDir)) {
    // List all worktrees, remove any that exist
    const entries = await fs.readdir(worktreeDir);
    for (const entry of entries) {
      try {
        await window.api.github.removeWorktree(projectPath, `${worktreeDir}/${entry}`);
      } catch { /* best effort */ }
    }
  }
}
```

---

## Critical Design: Per-Task IPC Output Routing

### The Problem

The preload's `createListener` function (line 14) replaces any existing listener for a channel:

```typescript
function createListener(channel: string, callback: (...args: unknown[]) => void) {
  const existingListener = listenerMap.get(channel);
  if (existingListener) {
    ipcRenderer.removeListener(channel, existingListener);  // ← kills previous
  }
  // ...registers new one
}
```

Two concurrent tasks calling `window.api.claude.onChatOutput(callback)` would overwrite each other's callback. Only the last one would receive output.

### The Solution: Route by chatId

**Step 1 — Main process includes chatId in output messages:**

```typescript
// electron/services/claude-code.ts — in chat() method
// Instead of:
this.mainWindow.webContents.send('claude:chatOutput', content);

// Send:
this.mainWindow.webContents.send('claude:chatOutput', { chatId, content });
```

**Step 2 — Preload maintains a handler registry:**

```typescript
// electron/preload.ts

// New: per-task output handler registry
const chatOutputHandlers = new Map<string, (content: string) => void>();

// Single IPC listener that routes based on chatId
ipcRenderer.on('claude:chatOutput', (_event, data: { chatId: string; content: string }) => {
  if (typeof data === 'object' && data.chatId) {
    // New format: route to specific handler
    const handler = chatOutputHandlers.get(data.chatId);
    if (handler) handler(data.content);
  } else if (typeof data === 'string') {
    // Legacy format: broadcast to legacy handler (backward compat)
    const legacyHandler = chatOutputHandlers.get('__legacy__');
    if (legacyHandler) legacyHandler(data);
  }
});

// API exposed to renderer:
claude: {
  // Existing (backward compat — registers as __legacy__ handler):
  onChatOutput: (callback: (content: string) => void) => {
    chatOutputHandlers.set('__legacy__', callback);
  },

  // New: register handler for a specific chatId
  onChatOutputForTask: (chatId: string, callback: (content: string) => void) => {
    chatOutputHandlers.set(chatId, callback);
  },

  // New: unregister handler when task completes
  offChatOutputForTask: (chatId: string) => {
    chatOutputHandlers.delete(chatId);
  },
}
```

**Step 3 — Pipeline registers per-task handlers:**

```typescript
// In buildTaskOnBranch():
const chatId = `build-${task.id}-${Date.now()}`;

// Register output handler for this task
window.api.claude.onChatOutputForTask(chatId, (content) => {
  updateTaskOutput(task.id, content);  // writes to per-task state
});

try {
  await window.api.claude.chat(worktreePath, buildPrompt, timeout, chatId);
} finally {
  window.api.claude.offChatOutputForTask(chatId);
}
```

### Backward Compatibility

The existing `onChatOutput` call (used in non-parallel contexts like onboarding, mini-chat) continues to work via the `__legacy__` handler. No changes needed to existing callers.

---

## Concurrency Safety Audit

The gap analysis identified several shared-state hazards. Here's how each is addressed:

| Hazard | Fix |
|--------|-----|
| Git working tree is shared | Git worktrees — each task gets its own directory |
| `createListener` single slot | Per-task IPC routing via chatId (see above) |
| `pauseResolverRef` single slot | No pausing during parallel tiers — tiers are atomic |
| `pipelineErrorRef` stops all tasks | Don't set it on individual task failures during parallel execution. Only set it on unrecoverable errors (e.g., git corruption). |
| `setBuildTaskPhase` / `setBuildCurrentTaskId` global store | Replace with `activeTasks` Map (per-task phase tracking) |
| `setReviewOutput` / `setReviewArtifact` local state | Move to per-task state Map |
| `spawn()` kills previous session | Only `chat()` is used during builds — verify `spawn()` is never called in the pipeline. |
| `updateTask` storage races | Zustand `set()` is synchronous so in-memory state is correct. Storage writes are fire-and-forget — acceptable for v1. Add write queue in future if needed. |
| `cancelChat()` kills ALL chats | Use `cancelChat(chatId)` for per-task cancel. `cancelChat()` (no args) only on full pipeline abort. |

---

## Build Pipeline Changes

### File: `src/hooks/useBuildPipeline.ts`

#### 1. Split `runTaskPipeline` into build and merge phases

Currently `runTaskPipeline` does everything: branch → build → commit → review → fix → merge → push. For parallel execution, we need to separate the "build" part (can run concurrently in worktrees) from the "merge" part (must run sequentially in the main repo).

**New function: `buildTaskInWorktree`**
- Creates worktree from main HEAD
- Runs npm install in worktree
- Builds, commits, reviews, fixes — all within the worktree
- Does NOT merge or push
- Returns `{ branchName, worktreePath }` on success, throws on failure

**New function: `mergeTaskBranch`**
- In the main repo: checkout main, merge the branch, push
- Remove the worktree
- Delete the feature branch
- Runs sequentially after all parallel builds complete

#### 2. Parallel execution within tier loop

```typescript
// Inside the tier loop (replacing the sequential for-loop from Phase 2):

const CONCURRENCY_CAP = 3;
const tierTasks = /* tasks for this tier */;

// Execute in batches of CONCURRENCY_CAP
for (let batchStart = 0; batchStart < tierTasks.length; batchStart += CONCURRENCY_CAP) {
  const batch = tierTasks.slice(batchStart, batchStart + CONCURRENCY_CAP);

  // Run all tasks in batch concurrently — each in its own worktree
  const results = await Promise.allSettled(
    batch.map((task) => {
      return buildTaskInWorktree(task, myRunId);
    })
  );

  // Collect successes and failures
  const successes: { task: Task; branchName: string; worktreePath: string }[] = [];
  const failures: Task[] = [];

  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      successes.push({
        task: batch[i],
        branchName: result.value.branchName,
        worktreePath: result.value.worktreePath,
      });
    } else {
      failures.push(batch[i]);
      // Best-effort cleanup of the worktree on failure
      cleanupWorktree(batch[i]);
    }
  });

  // Merge successes sequentially (in the main repo)
  for (const { task, branchName, worktreePath } of successes) {
    try {
      await mergeTaskBranch(task, branchName, worktreePath, myRunId);
    } catch {
      // Merge conflict — demote this task too
      failures.push(task);
      // Cleanup the worktree and branch
      try {
        await window.api.github.removeWorktree(projectPath, worktreePath);
        await window.api.github.checkoutBranch(projectPath, 'main');
        await window.api.github.deleteBranch(projectPath, branchName);
      } catch { /* best effort */ }
    }
  }

  // Demote failures
  demotedTasks.push(...failures.map(t => ({
    task: t, attempts: 1, lastError: 'build or merge failed'
  })));
}
```

#### 3. Per-task state tracking for concurrent execution

Currently `taskPhase`, `currentTaskId`, `sessionActive` etc. are single values. With concurrent execution, we need per-task tracking.

**New state:**

```typescript
interface TaskPipelineStatus {
  taskId: string;
  phase: TaskPhase;
  branchName: string;
  worktreePath: string;
  chatId: string;
  output: string;  // accumulated stdout for this task
}

// Replace single-value state with a Map:
const [activeTasks, setActiveTasks] = useState<Map<string, TaskPipelineStatus>>(new Map());

// Helper to update a single task's status:
function updateActiveTask(taskId: string, updates: Partial<TaskPipelineStatus>) {
  setActiveTasks(prev => {
    const next = new Map(prev);
    const existing = next.get(taskId);
    if (existing) {
      next.set(taskId, { ...existing, ...updates });
    } else {
      next.set(taskId, { taskId, phase: 'idle', branchName: '', worktreePath: '', chatId: '', output: '', ...updates });
    }
    return next;
  });
}
```

The UI reads `activeTasks` to show multiple spinners/phases simultaneously.

#### 4. Unique chatId per concurrent task

Each concurrent `buildTaskInWorktree` call uses a unique `chatId` for its Claude `chat()` calls:

```typescript
const chatId = `build-${task.id}-${Date.now()}`;

// Register per-task output handler
window.api.claude.onChatOutputForTask(chatId, (content) => {
  updateActiveTask(task.id, {
    output: (activeTasks.get(task.id)?.output || '') + content
  });
});

// Pass worktreePath (not projectPath) as cwd — Claude works in the isolated worktree
await window.api.claude.chat(worktreePath, buildPrompt, timeout, chatId);
```

This ensures the `ClaudeCodeService.chat()` method's `activeChatChildren` Map tracks each session independently.

---

## Git Service Changes

### File: `electron/services/github.ts`

New methods for worktree management:

```typescript
async createWorktree(repoPath: string, worktreePath: string, branchName: string, startPoint: string = 'main'): Promise<void> {
  // Ensure parent directory exists
  await fs.mkdir(path.dirname(worktreePath), { recursive: true });
  await this.execGit(repoPath, ['worktree', 'add', worktreePath, '-b', branchName, startPoint]);
}

async removeWorktree(repoPath: string, worktreePath: string): Promise<void> {
  try {
    await this.execGit(repoPath, ['worktree', 'remove', worktreePath, '--force']);
  } catch {
    // If git worktree remove fails, manually delete the directory
    await fs.rm(worktreePath, { recursive: true, force: true });
    // Prune worktree references
    await this.execGit(repoPath, ['worktree', 'prune']);
  }
}

async listWorktrees(repoPath: string): Promise<string[]> {
  const output = await this.execGit(repoPath, ['worktree', 'list', '--porcelain']);
  return output.split('\n')
    .filter(line => line.startsWith('worktree '))
    .map(line => line.replace('worktree ', ''));
}
```

### File: `electron/preload.ts` + `electron/main.ts`

Add worktree IPC calls:

```typescript
// preload.ts
createWorktree: (repoPath: string, worktreePath: string, branchName: string, startPoint?: string) =>
  ipcRenderer.invoke('github:create-worktree', repoPath, worktreePath, branchName, startPoint),
removeWorktree: (repoPath: string, worktreePath: string) =>
  ipcRenderer.invoke('github:remove-worktree', repoPath, worktreePath),
listWorktrees: (repoPath: string) =>
  ipcRenderer.invoke('github:list-worktrees', repoPath),

// main.ts
ipcMain.handle('github:create-worktree', async (_event, repoPath, worktreePath, branchName, startPoint) => {
  return githubService.createWorktree(repoPath, worktreePath, branchName, startPoint);
});
ipcMain.handle('github:remove-worktree', async (_event, repoPath, worktreePath) => {
  return githubService.removeWorktree(repoPath, worktreePath);
});
ipcMain.handle('github:list-worktrees', async (_event, repoPath) => {
  return githubService.listWorktrees(repoPath);
});
```

---

## Claude Code Service Changes

### File: `electron/services/claude-code.ts`

1. **Include chatId in output messages** — when streaming stdout from a `chat()` call, include the chatId so the renderer can route output to the correct task:

```typescript
// In chat() method, when emitting output:
// Instead of:
this.mainWindow.webContents.send('claude:chatOutput', content);
// Send:
this.mainWindow.webContents.send('claude:chatOutput', { chatId, content });
```

2. **Allow caller to pass a `chatId`** — already supported (the parameter exists), but make sure it's consistently threaded through.

3. **Verify `spawn()` is never called during builds** — `spawn()` has an `isProcessing` guard that kills previous sessions. Only `chat()` should be used in the pipeline. Add a comment/guard if needed.

4. **`cancelChat(chatId)` for per-task cancel** — already exists. The existing `cancelChat()` (no args) kills ALL chats, which is correct for full pipeline abort via `cleanupAndRestoreMain()`.

---

## UI Changes

### File: `src/screens/BuildScreen.tsx`

#### 1. Multiple in-flight tasks on kanban

- Currently: `currentTaskId` is a single value → one card shows as active
- New: `activeTasks` is a Map → multiple cards show as active simultaneously

Each active task shows its own phase indicator (branching, building, reviewing, etc.).

#### 2. Tier progress with parallel indicator

```
Tier 2 of 4 — Building 3 tasks in parallel
  ⟳ Auth component          [Building...]
  ⟳ Settings page           [Reviewing...]
  ✓ API routes              [Merging...]
```

#### 3. Per-task output

During parallel execution, streaming output is NOT shown interleaved. Instead:
- Show the phase indicator per task (Building... / Reviewing... / Fixing...)
- After a task completes, its full output is available in an expandable detail view
- This avoids the confusing experience of 3 interleaved Claude outputs

#### 4. Cancel behavior

The "Stop after this tier" button from Phase 2 still works. When clicked during parallel execution:
- The flag is set
- All running tasks in the current tier finish (each in its own worktree)
- Merges happen
- Worktrees cleaned up
- Pipeline stops

No individual task cancellation — the tier is atomic.

### File: `src/components/KanbanBoard.tsx`

Update to accept multiple active tasks:

```typescript
interface KanbanBoardProps {
  tasks: Task[];
  activeTasks?: Map<string, TaskPipelineStatus>;  // replaces currentTaskId + taskPhase
  // backward compat:
  currentTaskId?: string | null;
  taskPhase?: TaskPhase;
}
```

Column bucketing logic updated: if `activeTasks` is provided, any task whose ID is in the map goes to "In Progress" with the phase from the map. Falls back to existing `currentTaskId` logic if `activeTasks` is not provided.

### File: `src/screens/BuildScreen.tsx`

Progress computation updated:

```typescript
// Instead of:
const activeTasks = completedTasks + (currentTaskId ? 1 : 0);
// Use:
const inFlightCount = activeTasksMap?.size || (currentTaskId ? 1 : 0);
const progress = tasks.length > 0 ? ((completedTasks + inFlightCount) / tasks.length) * 100 : 0;
```

---

## Files to Create

| File | Purpose |
|------|---------|
| None | All changes are modifications to existing files. |

## Files to Modify

| File | Change |
|------|--------|
| `src/hooks/useBuildPipeline.ts` | Split `runTaskPipeline` into `buildTaskInWorktree` + `mergeTaskBranch`. Add `Promise.allSettled` batch execution. Add per-task state tracking (`activeTasks` Map). Add concurrency cap. Add worktree lifecycle management. Add stale worktree cleanup on start. |
| `src/screens/BuildScreen.tsx` | Update for multiple active tasks. Show parallel progress. Per-task output in expandable detail. |
| `src/components/KanbanBoard.tsx` | Accept `activeTasks` Map instead of single `currentTaskId`. |
| `electron/services/claude-code.ts` | Include `chatId` in `claude:chatOutput` messages. Verify `spawn()` isolation from pipeline. |
| `electron/services/github.ts` | Add `createWorktree()`, `removeWorktree()`, `listWorktrees()` methods. |
| `electron/preload.ts` | Add worktree IPC bridge calls. Add per-task output handler registry (`onChatOutputForTask`, `offChatOutputForTask`). Update `claude:chatOutput` listener to route by chatId. |
| `electron/main.ts` | Add worktree IPC handlers. |
| `src/types/electron.d.ts` | Update type declarations for worktree calls, per-task output, and updated `KanbanBoard` props. |
| `src/types/index.ts` | Add `TaskPipelineStatus` type. |

---

## Testing Strategy

1. **Git worktree validation:**
   - Create worktree → verify it exists and is on correct branch
   - Build in worktree → verify commits land on the feature branch, not main
   - Remove worktree → verify directory deleted and git references pruned
   - Stale worktree cleanup → verify leftover worktrees from previous crash are cleaned up
   - Multiple worktrees simultaneously → verify no interference

2. **Concurrency validation:**
   - Create a project with tasks known to be independent → verify they run in parallel (check timestamps)
   - Verify concurrency cap is respected (never more than 3 simultaneous Claude processes)
   - Verify each task gets its own worktree and branch
   - Verify per-task IPC output routing (each task receives its own output, not other tasks' output)

3. **Merge ordering:**
   - All parallel tasks complete → merges happen sequentially → main is clean
   - Simulate a merge conflict (two tasks unexpectedly touch same file) → conflicting task gets demoted

4. **Partial failure:**
   - One task in a tier fails, others succeed → successes merge, failure demoted, worktrees cleaned up
   - All tasks in a tier fail → all demoted to next tier, all worktrees cleaned up
   - Demoted task fails again → marked as permanently failed

5. **Cancellation:**
   - "Stop after this tier" during parallel execution → all running tasks finish, merge, worktrees cleaned up, then stop
   - Verify no orphan Claude processes after stop
   - Verify no stale worktrees after stop

6. **UI verification:**
   - Multiple cards in "In Progress" on kanban
   - Each card shows correct phase
   - Tier progress updates in real-time
   - Completed tasks move to "Done" as they merge (not all at once)
   - Per-task output viewable in expandable detail

7. **Regression:**
   - Single-task tiers still work (no regression from parallel plumbing — uses worktree even for single task, or fast-path to the old sequential flow)
   - Checkpoint/resume still works
   - Non-parallel contexts (onboarding, mini-chat) still work with legacy `onChatOutput`

---

## Success Criteria

- [ ] Tasks within a tier execute concurrently (up to cap of 3)
- [ ] Each parallel task runs in its own git worktree
- [ ] Wall-clock build time is measurably reduced (30-50% for projects with parallelizable tasks)
- [ ] Merge conflicts from parallel execution are handled gracefully (demote + retry)
- [ ] Partial failures don't stop the entire build
- [ ] Worktrees are always cleaned up (success, failure, cancel, crash)
- [ ] Per-task IPC output routing works (no cross-task output leaks)
- [ ] UI shows multiple in-flight tasks simultaneously
- [ ] "Stop after this tier" works correctly during parallel execution
- [ ] No orphan Claude processes after build completes or stops
- [ ] No regressions in single-task-per-tier execution
- [ ] Backward compatibility maintained for non-parallel `onChatOutput` callers
