# Phase 1: File Manifests + DAG Computation

## Overview

Extend the task generation system to include file manifest predictions (which files each task will create/modify), then build a deterministic algorithm that computes an execution DAG with tier assignments. Add a dry-run preview screen so users can inspect the computed plan before building. **No changes to build execution** — the pipeline still runs sequentially in this phase.

**Depends on:** Nothing — this is the foundation for Phases 2-3.

**Risk level:** Low. No changes to build execution. Worst case: the tier preview is wrong, user ignores it, build runs sequentially as before.

---

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| File prediction source | Claude via planning prompt | LLMs are good at predicting which files a task will touch. Deterministic code can't do this without understanding the task semantics. |
| DAG computation | Deterministic algorithm in client code | Graph algorithms are cheap, fast, and debuggable. Don't waste tokens on something code can do perfectly. |
| Dependency detection | File overlap + directory ancestry + Claude `dependsOn` hints | Three layers: file overlap catches direct conflicts, directory ancestry catches structural deps, Claude hints catch semantic deps. |
| Infrastructure file handling | Exclude from DAG, reconcile at tier boundaries | `package.json`, lock files, config files are touched by nearly every task. Including them in overlap analysis collapses parallelism. |
| Tier preview | New section on TasksScreen, shown after task generation | Users should see and approve the execution plan before building. Also valuable for debugging the algorithm. |

---

## Data Model Changes

### Updated Type: `Task`

```typescript
// src/types/index.ts

export interface Task {
  id: string;
  title: string;
  description?: string;
  estimatedMinutes?: number;
  completed: boolean;
  buildPhase?: 'branched' | 'built' | 'reviewed' | 'merged';
  branchName?: string;
  lastReviewArtifact?: ReviewArtifact;

  // NEW — file manifest (predicted by Claude during task generation)
  creates?: string[];       // files this task will create
  modifies?: string[];      // existing files this task will modify

  // NEW — dependency graph (computed deterministically from file manifests)
  dependsOn?: string[];     // task IDs that must complete before this one
  tier?: number;            // execution tier (0 = first, higher = later)
}
```

### New Type: `TierPlan`

```typescript
// src/types/index.ts

export interface TierPlan {
  tiers: TierGroup[];
  criticalPathLength: number;    // number of tiers (minimum possible time)
  estimatedSequentialMin: number; // sum of all task estimates
  estimatedParallelMin: number;  // sum of critical path tier estimates
}

export interface TierGroup {
  tier: number;
  taskIds: string[];
  estimatedMin: number;  // max of task estimates in this tier
}
```

---

## Infrastructure Files List

These files are excluded from DAG overlap analysis. Conflicts in these files are handled at tier boundaries via reconciliation, not by adding dependency edges.

```typescript
// src/utils/dag-scheduler.ts

const INFRASTRUCTURE_FILES = new Set([
  'package.json',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'tsconfig.json',
  'next.config.js',
  'next.config.ts',
  'next.config.mjs',
  'vite.config.ts',
  'vite.config.js',
  'tailwind.config.js',
  'tailwind.config.ts',
  'postcss.config.js',
  'postcss.config.mjs',
  '.eslintrc.js',
  '.eslintrc.json',
  'eslint.config.js',
  '.prettierrc',
  '.gitignore',
  '.env',
  '.env.local',
]);

function isInfrastructureFile(filePath: string): boolean {
  const basename = filePath.split('/').pop() || '';
  return INFRASTRUCTURE_FILES.has(basename);
}
```

---

## Planning Prompt Changes

### File: `src/screens/TasksScreen.tsx`

The `generateTasks` prompt (currently lines 70-91) is updated to request file manifests:

**Current prompt requests:**
```json
[{"title": "...", "description": "...", "estimatedMinutes": 3}]
```

**New prompt requests:**
```json
[{
  "title": "...",
  "description": "...",
  "estimatedMinutes": 3,
  "creates": ["src/components/Auth.tsx", "src/hooks/useAuth.ts"],
  "modifies": ["src/app/layout.tsx"],
  "dependsOn": [0]
}]
```

**Additions to prompt text:**

```
For each task, also include:
- "creates": array of file paths this task will create (new files only)
- "modifies": array of existing file paths this task will change
- "dependsOn": array of task indices (0-based) that must complete before this task can start. Only include direct dependencies — if task 3 depends on task 1, and task 2 also depends on task 1, task 3 does NOT need to list task 1 unless it directly needs task 1's output.

File path guidelines:
- Use project-relative paths (e.g., "src/components/Auth.tsx", not absolute paths)
- Do NOT include package.json, lock files, or config files (tsconfig, tailwind.config, etc.) — these are handled separately
- Focus on source files your task will directly create or edit
```

### Parsing Changes

The parser (currently lines 99-143) adds handling for the new fields:

```typescript
// After existing field extraction:
creates: Array.isArray(obj.creates) ? obj.creates.filter((f: unknown) => typeof f === 'string') : undefined,
modifies: Array.isArray(obj.modifies) ? obj.modifies.filter((f: unknown) => typeof f === 'string') : undefined,
// dependsOn from Claude is index-based — converted to ID-based after all tasks are created
```

The `dependsOn` field from Claude uses **array indices** (0-based) since tasks don't have IDs yet during generation. After parsing, convert to task IDs:

```typescript
// After all tasks are created with IDs:
// NOTE: Task IDs are generated as `task-${Date.now()}-${index}` — all tasks in a
// single generateTasks call share the same timestamp. The index→ID mapping MUST
// happen in the same synchronous pass before any async work, since IDs depend on
// the array index at generation time.
const withDeps = generatedTasks.map((task, idx) => {
  const rawDeps = parsed[idx]?.dependsOn;
  if (Array.isArray(rawDeps)) {
    const depIds = rawDeps
      .filter((d: unknown) => typeof d === 'number' && d >= 0 && d < generatedTasks.length && d !== idx)
      .map((d: number) => generatedTasks[d].id);
    return { ...task, dependsOn: depIds.length > 0 ? depIds : undefined };
  }
  return task;
});
```

---

## DAG Computation Algorithm

### New File: `src/utils/dag-scheduler.ts`

This module takes a `Task[]` and computes tier assignments. It runs entirely in the renderer — no Claude calls, no async.

#### Step 1: Build adjacency list from file overlaps

```
For each pair (taskA at index i, taskB at index j) where i < j:
  Let A_files = (taskA.creates || []) + (taskA.modifies || [])
  Let B_files = (taskB.creates || []) + (taskB.modifies || [])

  Filter out infrastructure files from both sets.

  If intersection(A_files, B_files) is non-empty:
    → taskB depends on taskA

  // Directory ancestry check:
  For each file in B_files:
    For each file in A_files (that A creates):
      If B_file starts with dirname(A_file) + '/':
        → taskB depends on taskA (B works in a directory A creates)
```

#### Step 2: Merge Claude's `dependsOn` hints

```
For each task with dependsOn:
  Add those edges to the adjacency list (in addition to file-overlap edges)
```

#### Step 3: Assign tiers via Kahn's algorithm

```
Compute in-degree for each task (count of unresolved dependencies).

Tier 0: all tasks with in-degree 0.
Remove tier 0 tasks from the graph, decrement in-degrees of their dependents.

Tier 1: all tasks now with in-degree 0.
Repeat until all tasks assigned.

If any tasks remain unassigned (cycle detected), fall back:
  assign all remaining tasks to the next tier sequentially.
```

#### Step 4: Apply heuristics

```
// "Tests go last" heuristic:
// If a task title contains "test" (case-insensitive), push it to the final tier
// unless it already has dependencies that place it there.

// "Setup goes first" heuristic:
// Task at index 0 is always Tier 0 alone (the project setup task).
// If the algorithm already assigned it to Tier 0, no change needed.
// If other tasks also landed in Tier 0 and they don't have file conflicts
// with the setup task, that's fine — the algorithm is correct.
```

#### Legacy task handling

Tasks loaded from old projects (before Phase 1) will have no `creates`, `modifies`, or `dependsOn` fields. The algorithm must handle this gracefully:

```
If a task has no file manifest (creates === undefined && modifies === undefined):
  → Treat as "depends on all prior tasks" (conservative — forces sequential)
  → This preserves the existing build order for old projects

If ALL tasks lack manifests:
  → computeTierPlan returns a single tier containing all tasks
  → Effectively the same as the current flat sequential execution
```

#### Function Signature

```typescript
export function computeTierPlan(tasks: Task[]): TierPlan;
export function assignTiers(tasks: Task[]): Task[];  // returns tasks with tier/dependsOn populated
```

---

## Dry-Run Preview UI

### File: `src/screens/TasksScreen.tsx`

After task generation completes, compute and display the tier plan. Add a new section between the task list and the "Start Building" button.

**Behavior:**
- Computed automatically when tasks change (via `useMemo`)
- Shows each tier with its tasks, grouped visually
- Shows estimated time savings: "~14 min parallel vs ~24 min sequential"
- Tasks within a tier are shown side-by-side to indicate parallelism
- Each task shows its file manifest (expandable) and dependencies
- Users can still drag-reorder tasks — reordering triggers DAG recomputation
- Clicking "Start Building" passes the tier plan to the build pipeline (Phase 2 concern)

**Preview layout:**

```
┌─ Execution Plan ─────────────────────────────────────────┐
│                                                           │
│  Tier 0 — Setup                                          │
│  ┌─────────────────────────────┐                         │
│  │ T1: Initialize Next.js      │                         │
│  └─────────────────────────────┘                         │
│                                                           │
│  Tier 1 — 3 tasks (parallel)                             │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐     │
│  │ T2: Auth     │ │ T3: Settings │ │ T4: API      │     │
│  └──────────────┘ └──────────────┘ └──────────────┘     │
│                                                           │
│  Tier 2 — 2 tasks (parallel)                             │
│  ┌──────────────┐ ┌──────────────────────┐               │
│  │ T5: Dashboard │ │ T6: Connect auth     │               │
│  └──────────────┘ └──────────────────────┘               │
│                                                           │
│  Tier 3 — 1 task                                         │
│  ┌─────────────────────────────┐                         │
│  │ T7: Add tests               │                         │
│  └─────────────────────────────┘                         │
│                                                           │
│  Est. ~14 min (parallel) vs ~24 min (sequential)         │
│  ℹ If any task fails in a tier, it retries in the next.  │
└───────────────────────────────────────────────────────────┘
```

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/utils/dag-scheduler.ts` | DAG computation: `computeTierPlan()`, `assignTiers()`, file overlap detection, Kahn's algorithm |

## Files to Modify

| File | Change |
|------|--------|
| `src/types/index.ts` | Add `creates`, `modifies`, `dependsOn`, `tier` to `Task`. Add `TierPlan`, `TierGroup` types. |
| `src/screens/TasksScreen.tsx` | Update planning prompt to request file manifests. Update parser to handle new fields. Add tier preview section. |
| `src/store/slices/tasksSlice.ts` | No structural changes needed — new fields persist automatically via existing `saveTasks` serialization. |

## Files NOT Modified

| File | Why |
|------|-----|
| `src/hooks/useBuildPipeline.ts` | Execution changes are Phase 2. |
| `src/screens/BuildScreen.tsx` | UI changes for parallel execution are Phase 3. |
| `electron/services/claude-code.ts` | Service layer changes are Phase 3. |

---

## Testing Strategy

1. **Unit tests for `dag-scheduler.ts`:**
   - Tasks with no file overlap → all in Tier 0
   - Tasks with linear chain of file dependencies → each in its own tier
   - Diamond dependency pattern (A→B, A→C, B→D, C→D) → correct tier assignment
   - Infrastructure files excluded from overlap analysis
   - Directory ancestry detection
   - Cycle detection (graceful fallback)
   - Claude `dependsOn` hints merged correctly
   - "Tests go last" heuristic
   - **Legacy tasks with no manifests → single tier (sequential fallback)**
   - **Mixed tasks (some with manifests, some without) → graceful degradation**

2. **Integration test:**
   - Generate tasks from a real PRD → verify file manifests are present and reasonable
   - Verify tier preview renders without errors

3. **Manual verification:**
   - Generate tasks for 3-4 different project types (landing page, CRUD app, full-stack app)
   - Inspect tier assignments — do they make sense?
   - Are file predictions reasonable? Track accuracy over multiple runs.

---

## Success Criteria

- [ ] Tasks generated with `creates` and `modifies` fields populated
- [ ] DAG algorithm computes tiers correctly for all test cases
- [ ] Tier preview visible on TasksScreen after generation
- [ ] Estimated time savings displayed
- [ ] Infrastructure files excluded from overlap analysis
- [ ] Existing sequential build still works (no execution changes)
- [ ] User can still drag-reorder tasks (triggers DAG recomputation)
- [ ] Legacy tasks without manifests degrade gracefully to single-tier sequential
