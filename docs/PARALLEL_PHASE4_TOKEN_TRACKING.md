# Phase 4: Token Tracking + Context Optimization

## Overview

Add visibility into token consumption per task and per build. Switch Claude invocations from `--print` (text-only output) to `--output-format json` (includes usage metadata). Use this data to measure, display, and ultimately optimize context loading — particularly trimming the PRD to relevant sections per task.

**Depends on:** Independent of Phases 1-3. Can be implemented before, after, or alongside them. However, token data becomes much more actionable once parallel execution is live (Phase 3) because you can measure the cost of retries and tier overhead.

**Risk level:** Low. Output format change is the main risk — need to verify `--output-format json` works with the existing response parsing.

---

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Token source | Claude CLI `--output-format json` | The CLI already tracks tokens internally. JSON output includes `usage` metadata. No API key / billing integration needed. |
| Storage | Per-task on the `Task` type + aggregate on `Project` | Task-level gives granularity for optimization. Project-level gives the dashboard number. |
| Display | BuildScreen sidebar + post-build summary | Real-time per-task during build. Summary with totals after build completes. |
| Context optimization | Task-relevant PRD sections (Phase 4b, future) | Start by measuring. Optimize once we have baseline data showing the waste. |
| **Code path** | **Upgrade `chat()` directly** (not a separate `chatWithMetrics`) | Avoids maintaining two parallel code paths that must stay in sync. The JSON fallback (`try/catch` around parsing) makes this safe — if JSON parsing fails, return raw text with `usage: undefined`. All callers continue to work. |

---

## Step 0: Verify `--output-format json` (MUST DO FIRST)

Before writing any code, manually verify the Claude CLI JSON output format:

```bash
# Test 1: Basic JSON output
echo "Say hello" | claude --output-format json --print

# Test 2: With --dangerously-skip-permissions (our actual usage)
echo "Say hello" | claude --output-format json --dangerously-skip-permissions

# Test 3: Piped input from file (matches our actual invocation)
echo "Say hello" > /tmp/test-prompt.txt
cat /tmp/test-prompt.txt | claude --output-format json --dangerously-skip-permissions

# Verify:
# 1. Does --output-format json work alongside --print? Or replace it?
# 2. What are the exact field names? (result vs response vs text?)
# 3. What does the usage object look like? (input_tokens vs prompt_tokens?)
# 4. What happens on error — still JSON or raw text?
```

**Document the actual JSON structure before proceeding.** The examples in this plan are based on the Claude API response format — the CLI may differ.

---

## Claude CLI Output Format Change

### Current invocation (`electron/services/claude-code.ts`, line 440):

```bash
cat "${tempFile}" | claude --print --dangerously-skip-permissions
```

`--print` returns raw text only. No metadata.

### New invocation:

```bash
cat "${tempFile}" | claude --output-format json --dangerously-skip-permissions
```

`--output-format json` returns a JSON object with the response text AND usage metadata:

```json
{
  "result": "Here is the code I built...",
  "usage": {
    "input_tokens": 4523,
    "output_tokens": 1891
  },
  "model": "claude-sonnet-4-5-20250929",
  "stop_reason": "end_turn"
}
```

**Note:** Field names above are assumed from the Claude API format. Step 0 verification will confirm the actual structure.

---

## Data Model Changes

### Updated Type: `Task`

```typescript
// src/types/index.ts

export interface Task {
  // ... existing fields ...

  // NEW — token tracking
  tokenUsage?: TaskTokenUsage;
}

export interface TaskTokenUsage {
  build?: TokenCount;      // tokens for the build prompt
  review?: TokenCount;     // tokens for the review prompt
  fix?: TokenCount;        // tokens for the fix prompt (if applied)
  total: TokenCount;       // sum of all phases
}

export interface TokenCount {
  input: number;
  output: number;
}
```

### New Type: `BuildMetrics`

```typescript
// src/types/index.ts

export interface BuildMetrics {
  totalTokens: TokenCount;
  taskMetrics: {
    taskId: string;
    taskTitle: string;
    tokens: TaskTokenUsage;
    wallClockMs: number;     // how long the task took (wall clock)
    tier: number;
  }[];
  wallClockMs: number;       // total build wall clock time
  tiersExecuted: number;
  tasksCompleted: number;
  tasksFailed: number;
  tasksRetried: number;
}
```

---

## Service Layer Changes

### File: `electron/services/claude-code.ts`

#### Upgrade `chat()` to always use JSON output and return `ChatResult`

Instead of creating a separate `chatWithMetrics()` method (which would create a parallel code path that must stay in sync), upgrade `chat()` directly:

**New return type:**

```typescript
export interface ChatResult {
  response: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
  model?: string;
}
```

**Changes to `chat()` method:**

1. Change the spawn command from `--print` to `--output-format json`
2. Parse the JSON response, extract `result` and `usage`
3. Return `ChatResult` instead of `string`
4. Fallback: if JSON parsing fails, return `{ response: stdout, usage: undefined }`

```typescript
// In chat() method, after collecting all stdout:
try {
  const parsed = JSON.parse(stdout);
  return {
    response: parsed.result ?? parsed.response ?? stdout,
    usage: parsed.usage,
    model: parsed.model,
  };
} catch {
  // Fallback: treat entire stdout as plain text (same as --print behavior)
  return { response: stdout, usage: undefined };
}
```

#### Update all callers

Since `chat()` now returns `ChatResult` instead of `string`, all callers need updating:

```typescript
// Before:
const response = await window.api.claude.chat(cwd, prompt, timeout);

// After:
const { response } = await window.api.claude.chat(cwd, prompt, timeout);
// Or, when you need usage data:
const { response, usage } = await window.api.claude.chat(cwd, prompt, timeout);
```

**Callers to update (comprehensive list — find with grep for `claude.chat(`):**
- `src/hooks/useBuildPipeline.ts` — build, review, fix calls (3 call sites)
- `src/screens/TasksScreen.tsx` — task generation (1 call site)
- `src/screens/DiscoveryScreen.tsx` — discovery chat (if applicable)
- `src/components/onboarding/StageHouston.tsx` — mini-chat (1 call site)
- Any other screen that calls `claude.chat()`

This is a one-time migration — all callers destructure `{ response }` and optionally `{ usage }`.

---

## IPC Bridge Changes

### Files: `electron/preload.ts`, `electron/main.ts`, `src/types/electron.d.ts`

Update the `chat` return type in the IPC bridge:

```typescript
// electron.d.ts — update return type
chat: (cwd: string, prompt: string, inactivityTimeout?: number, chatId?: string) => Promise<ChatResult>;

// No new IPC channel needed — same `claude:chat` channel, just returns ChatResult instead of string.
```

---

## Build Pipeline Changes

### File: `src/hooks/useBuildPipeline.ts`

#### 1. Capture usage from build/review/fix calls

```typescript
// Build call
const { response: buildResponse, usage: buildUsage } =
  await window.api.claude.chat(projectPath, buildPrompt, 10 * 60 * 1000, chatId);

// Review call
const { response: reviewResponse, usage: reviewUsage } =
  await window.api.claude.chat(projectPath, reviewPrompt, 5 * 60 * 1000, chatId);

// Fix call (if needed)
const { response: fixResponse, usage: fixUsage } =
  await window.api.claude.chat(projectPath, fixPrompt, 10 * 60 * 1000, chatId);
```

#### 2. Save per-task token data

After each task completes, save token data:

```typescript
const tokenUsage: TaskTokenUsage = {
  build: buildUsage ? { input: buildUsage.input_tokens, output: buildUsage.output_tokens } : undefined,
  review: reviewUsage ? { input: reviewUsage.input_tokens, output: reviewUsage.output_tokens } : undefined,
  fix: fixUsage ? { input: fixUsage.input_tokens, output: fixUsage.output_tokens } : undefined,
  total: {
    input: (buildUsage?.input_tokens || 0) + (reviewUsage?.input_tokens || 0) + (fixUsage?.input_tokens || 0),
    output: (buildUsage?.output_tokens || 0) + (reviewUsage?.output_tokens || 0) + (fixUsage?.output_tokens || 0),
  },
};

updateTask(task.id, { tokenUsage });
```

#### 3. Aggregate build metrics

After all tiers complete, compute and store `BuildMetrics`:

```typescript
const buildMetrics: BuildMetrics = {
  totalTokens: { input: sumInputTokens, output: sumOutputTokens },
  taskMetrics: tasks.map(t => ({
    taskId: t.id,
    taskTitle: t.title,
    tokens: t.tokenUsage || { total: { input: 0, output: 0 } },
    wallClockMs: /* tracked per task */,
    tier: t.tier || 0,
  })),
  wallClockMs: Date.now() - buildStartTime,
  tiersExecuted: tierPlan.tiers.length,
  tasksCompleted: completedCount,
  tasksFailed: failedCount,
  tasksRetried: retriedCount,
};
```

---

## UI Changes

### File: `src/screens/BuildScreen.tsx`

#### 1. Real-time token counter

Small counter in the build progress area:

```
Tokens: 12,847 in / 3,291 out
```

Updates after each Claude call completes.

#### 2. Per-task token display

In the kanban card or task detail view, show tokens used:

```
✓ Build auth component
  Build: 4,523 in / 1,891 out
  Review: 2,104 in / 487 out
  Total: 6,627 in / 2,378 out
```

#### 3. Post-build summary

After build completes, show a summary screen or expandable section:

```
Build Complete — 12 tasks in 14 minutes

Token Usage:
  Total: 52,341 input / 18,729 output
  Avg per task: 4,362 input / 1,561 output

Largest tasks by tokens:
  1. "Build auth component" — 8,234 input (PRD context: ~4,500)
  2. "Connect dashboard to API" — 7,891 input
  3. "Add payment integration" — 6,543 input

Context efficiency:
  PRD tokens per task: ~4,500 (same for all tasks)
  Potential savings with targeted context: ~30%
```

The "context efficiency" section is forward-looking — it shows the user that the full PRD is being sent every time and estimates savings. This builds the case for Phase 4b (context trimming) without implementing it yet.

---

## Future: Phase 4b — Context Trimming (not in this implementation)

Once we have token data from real builds, we can implement intelligent context trimming:

1. **PRD section extraction:** Parse the PRD into sections. For each task, identify which sections are relevant based on the task description and file manifest.
2. **Include only relevant sections:** Instead of sending the full PRD, send a summary + the 1-2 sections most relevant to the current task.
3. **Measure the impact:** Compare build quality and token usage between full-PRD and trimmed-PRD builds.

This is deferred because we need baseline token data first to know if it's worth the complexity.

---

## Files to Create

| File | Purpose |
|------|---------|
| None | All changes are modifications to existing files. |

## Files to Modify

| File | Change |
|------|--------|
| `src/types/index.ts` | Add `TaskTokenUsage`, `TokenCount`, `BuildMetrics`, `ChatResult` types. Add `tokenUsage` field to `Task`. |
| `electron/services/claude-code.ts` | Change `chat()` to use `--output-format json`, parse JSON response, return `ChatResult` with fallback. |
| `electron/preload.ts` | Update `chat` return type. |
| `electron/main.ts` | No structural changes — `chat()` return type change propagates automatically. |
| `src/types/electron.d.ts` | Update `chat` return type to `Promise<ChatResult>`. |
| `src/hooks/useBuildPipeline.ts` | Destructure `{ response, usage }` from all `chat()` calls. Track per-task token usage. Compute aggregate `BuildMetrics`. |
| `src/screens/BuildScreen.tsx` | Add real-time token counter. Add per-task token display. Add post-build summary. |
| `src/screens/TasksScreen.tsx` | Update `chat()` call to destructure `{ response }`. |
| `src/components/onboarding/StageHouston.tsx` | Update `chat()` call to destructure `{ response }`. |
| `src/store/slices/tasksSlice.ts` | No structural changes — `tokenUsage` persists automatically via existing serialization. |

---

## Testing Strategy

1. **Step 0 — CLI verification (manual, before any code):**
   - Run `claude --output-format json` manually and document the exact response format
   - Verify it works with `--dangerously-skip-permissions`
   - Verify piped input works
   - Verify error responses are still parseable

2. **JSON output parsing:**
   - Valid JSON response → extract `result` and `usage` correctly
   - Non-JSON response (fallback) → return raw text, `usage` undefined
   - Malformed JSON → fallback gracefully
   - Empty response → handle without crash

3. **Token accumulation:**
   - Build + review + fix → total is sum of all three
   - Build only (no review findings) → total equals build tokens
   - Task with no token data (legacy or fallback) → displays "—" not "0"

4. **Caller migration:**
   - All callers of `chat()` updated to destructure `{ response }`
   - No caller breaks from the return type change
   - Non-pipeline callers (onboarding, task generation) still work correctly

5. **UI verification:**
   - Real-time counter updates during build
   - Per-task tokens visible in task detail
   - Post-build summary shows correct totals
   - Large numbers formatted readably (e.g., "52,341" not "52341")

---

## Success Criteria

- [ ] Step 0 complete: `--output-format json` verified working with current Claude CLI
- [ ] `chat()` returns `ChatResult` with response + optional usage data
- [ ] All existing callers migrated (no regressions)
- [ ] Fallback works when JSON parsing fails (no crash, graceful degradation)
- [ ] Token counts captured per Claude call (build, review, fix)
- [ ] Per-task token usage stored on Task and persisted to disk
- [ ] Aggregate BuildMetrics computed after build completes
- [ ] Real-time token counter visible during build
- [ ] Post-build summary shows total tokens, per-task breakdown, and largest consumers
- [ ] Context efficiency hint shown (PRD tokens repeated per task)
