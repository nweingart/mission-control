# Phase 2: Tier-Aware Sequential Execution

## Overview

Change the build pipeline from a flat task list to tier-by-tier execution. Tasks within each tier still run **sequentially** (one at a time) — this phase validates all the tier boundary plumbing without introducing concurrency. Adds the "stop after this tier" mechanism and tier boundary reconciliation.

**Depends on:** Phase 1 (file manifests + DAG computation + tier assignments).

**Risk level:** Medium. Changes the build execution loop, but no concurrency. If tiers are wrong, worst case is tasks run in a suboptimal order (but still sequentially, so no merge conflicts).

---

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Execution model | Tier-by-tier loop, sequential within tiers | Validates tier boundaries, reconciliation, and stop mechanism without concurrency complexity. |
| Tier boundary reconciliation | Direct `npm install` shell command + git add/commit after each tier | Handles infrastructure file drift (package.json changes from multiple tasks in a tier). Uses a direct shell command — no need to spin up a full Claude session for `npm install`. |
| Stop mechanism | "Stop after this tier" flag | No mid-task cancellation. Current tier always completes. Clean state at every tier boundary. |
| Pause mechanism | Between tiers (replaces between-tasks) | User approval happens at tier boundaries, not between individual tasks. Reduces interruptions. |
| Failed task handling | Demote to next tier | If a task fails, it gets pushed to the next tier for retry with updated main. |

---

## Build Pipeline Changes

### File: `src/hooks/useBuildPipeline.ts`

The `runAllTasks` function (currently lines 462-547) is restructured from a flat loop to a tier-based loop.

**Current structure:**
```
for each task in tasks[]:
  await runTaskPipeline(task)
  pause for user approval
```

**New structure:**
```
compute tiers from tasks[]
for each tier in tiers[]:
  for each task in tier.tasks[]:
    await runTaskPipeline(task)
  reconcile tier boundary (npm install, commit infra changes)
  check stopAfterTier flag
  pause for user approval (if not auto-approve)
```

### Key Changes

#### 1. Tier iteration

```typescript
const runAllTasks = useCallback(async () => {
  // ... existing setup (ensureGitRepo, etc.)

  const tierPlan = computeTierPlan(tasks);

  for (const tierGroup of tierPlan.tiers) {
    if (!isMountedRef.current || pipelineErrorRef.current || isStale()) break;

    const tierTasks = tierGroup.taskIds
      .map(id => tasks.find(t => t.id === id))
      .filter((t): t is Task => t !== null && !t.completed);

    // Execute tasks in this tier sequentially (Phase 3 makes this parallel)
    const failedTasks: Task[] = [];
    for (const task of tierTasks) {
      if (!isMountedRef.current || pipelineErrorRef.current || isStale()) break;

      const idx = tasks.findIndex(t => t.id === task.id);
      setCurrentTaskId(task.id);

      try {
        await runTaskPipeline(task, idx, false, myRunId);
      } catch {
        failedTasks.push(task);
      }
    }

    // Demote failed tasks to next tier
    // (handled by pushing them into the next tierGroup's taskIds)

    // Tier boundary reconciliation
    await reconcileTierBoundary(projectPath);

    // Check stop flag
    if (stopAfterTierRef.current) {
      // Pause and give user control
      break;
    }

    // User approval between tiers (if not auto-approve)
    if (!autoApproveRef.current) {
      await checkPause();
    }
  }
});
```

#### 2. Tier boundary reconciliation

```typescript
async function reconcileTierBoundary(projectPath: string) {
  // Ensure we're on main
  await window.api.github.checkoutBranch(projectPath, 'main');

  // Run npm install directly via shell command — no need for a full Claude session.
  // Requires a new IPC call: window.api.github.runShellCommand(cwd, command)
  try {
    await window.api.github.runShellCommand(projectPath, 'npm install');
  } catch {
    // Non-fatal — dependencies might already be fine
  }

  // Commit any infrastructure file changes
  try {
    await window.api.github.gitAddAndCommit(projectPath, 'chore: reconcile dependencies after tier');
  } catch {
    // No changes to commit — that's fine
  }
}
```

**Note:** This requires a new IPC call `runShellCommand(cwd, command)` in the github service. This is simpler, faster, and cheaper than using `claude.chat()` to run npm install (which was the original plan — flagged in gap analysis as overkill).

#### 3. Stop after tier mechanism

**New state:**

```typescript
const stopAfterTierRef = useRef(false);
const [stopRequested, setStopRequested] = useState(false);

const requestStopAfterTier = useCallback(() => {
  stopAfterTierRef.current = true;
  setStopRequested(true);
}, []);
```

**Exposed to UI:** The "Stop" button in BuildScreen changes behavior:
- Old: kills the running process immediately
- New: sets `stopAfterTier = true`, shows "Finishing current tier..." indicator. The pipeline completes all tasks in the current tier, reconciles, then stops.

#### 4. Failed task demotion

When a task fails within a tier:

1. Catch the error (don't set `pipelineErrorRef.current = true` — that stops everything)
2. Add the failed task to a `demotedTasks` queue
3. After the tier's remaining tasks complete and merge, the demoted tasks are prepended to the next tier
4. If a demoted task fails again (second attempt), mark it as failed and continue
5. After all tiers, surface failed tasks to the user

**Important nuance:** The `tierPlan.tiers` array is computed once before the loop starts. When demoting a task to the next tier, we're mutating the pre-computed plan mid-execution. The demoted task's file manifest may overlap with tasks already in the next tier, but this is fine — the task rebuilds against updated main (all prior merges applied), so it's working on the latest code regardless. The tier plan becomes advisory after execution begins.

```typescript
interface DemotedTask {
  task: Task;
  attempts: number;
  lastError: string;
}
```

#### 5. Updated progress tracking

**New state exposed by the hook:**

```typescript
// Add to BuildPipelineState:
currentTier: number;
totalTiers: number;
tierTasksComplete: number;
tierTasksTotal: number;
```

This gives the UI enough info to show: "Tier 2/4 — Task 1/3"

---

## IPC Changes

### New IPC call: `runShellCommand`

```typescript
// electron/preload.ts
runShellCommand: (cwd: string, command: string) =>
  ipcRenderer.invoke('github:run-shell-command', cwd, command),

// electron/main.ts
ipcMain.handle('github:run-shell-command', async (_event, cwd, command) => {
  return githubService.runShellCommand(cwd, command);
});

// electron/services/github.ts
async runShellCommand(cwd: string, command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(command, { cwd }, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr || error.message));
      else resolve(stdout);
    });
  });
}
```

---

## UI Changes

### File: `src/screens/BuildScreen.tsx`

Minimal changes in this phase — mainly updating progress indicators:

1. **Tier progress indicator:** "Tier 2 of 4" above the existing task progress
2. **Stop button:** Changes to "Stop after this tier" with a visual indicator when stop is requested
3. **Between-tier pause screen:** Shows what completed in this tier, what's coming next, approve/stop buttons
4. **Demoted task indicator:** If a task was demoted from a previous tier, show a small badge: "Retrying"

---

## Files to Modify

| File | Change |
|------|--------|
| `src/hooks/useBuildPipeline.ts` | Restructure `runAllTasks` to tier-based loop. Add tier boundary reconciliation. Add stop-after-tier mechanism. Add failed task demotion. Add tier progress state. |
| `src/screens/BuildScreen.tsx` | Update progress indicators for tier awareness. Change stop button behavior. Add between-tier pause UI. |
| `electron/preload.ts` | Add `runShellCommand` IPC bridge call. |
| `electron/main.ts` | Add `github:run-shell-command` IPC handler. |
| `electron/services/github.ts` | Add `runShellCommand()` method. |
| `src/types/electron.d.ts` | Add type declaration for `runShellCommand`. |

## Files NOT Modified

| File | Why |
|------|-----|
| `src/utils/dag-scheduler.ts` | Already built in Phase 1. |
| `src/types/index.ts` | Task type already has tier fields from Phase 1. |
| `electron/services/claude-code.ts` | No concurrent execution yet. |

---

## Testing Strategy

1. **Manual testing with a real project:**
   - Generate tasks → verify tiers computed → start build
   - Verify tasks execute in tier order
   - Verify tier boundary reconciliation runs (npm install, commit)
   - Verify "stop after this tier" pauses at the right point
   - Verify failed task demotion (intentionally break a task to test)

2. **Edge cases:**
   - All tasks in one tier (no parallelism possible) → should work identically to current flat loop
   - Single task per tier → should work identically to current flat loop
   - Task fails on second attempt (after demotion) → marked as failed, pipeline continues
   - User stops after tier 0 → only setup task completed, clean state
   - **Demoted task with file overlap in next tier → rebuilds on updated main, no conflict**

3. **Regression testing:**
   - Existing build flow still works (tasks without tier metadata default to sequential)
   - Checkpoint/resume still works within tiers
   - Error handling / retry logic still works

---

## Success Criteria

- [ ] Build pipeline executes tasks in tier order
- [ ] Tier boundary reconciliation runs between tiers (npm install via shell + commit)
- [ ] "Stop after this tier" cleanly pauses at tier boundaries
- [ ] Failed tasks are demoted to next tier and retried
- [ ] Tasks that fail twice are marked as failed, pipeline continues
- [ ] Failed tasks surfaced to user at end of build
- [ ] Tier progress visible in BuildScreen UI
- [ ] Between-tier pause shows completed/upcoming tasks
- [ ] No regressions in existing sequential build flow
- [ ] `runShellCommand` IPC call works for npm install
