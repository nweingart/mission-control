# Codebase Audit — Prioritized Weaknesses

Filtered to: deployment/core flow disruption, security, performance.
Last reviewed: 2026-02-16

## 1. Disrupts Deployment / Core Flow

### #4 — Silent catch blocks in deploy flow — OUTDATED
- **File:** `src/screens/DeployScreen.tsx` (originally referenced lines 614,645 — file is now 590 lines)
- **Original problem:** GitHub API failures during deployment status polling are silently swallowed. User sees infinite loading with no feedback.
- **Current status:** FIXED. All three `catch` blocks in DeployScreen now properly set error state (`setError(...)`) and transition to the `'error'` deploy step, giving the user a visible error message and a retry button. No silent swallowing remains.

### #8 — Race conditions in task saves — PARTIALLY FIXED
- **File:** `src/store/useAppStore.ts:505-580`
- **Original problem:** Tasks update optimistically in UI, IPC save fires and forgets. If save fails, user's work is silently lost until app relaunch.
- **Current status:** PARTIALLY FIXED. The fire-and-forget pattern still exists (optimistic UI update, then async save), but `.catch()` handlers now set a `saveError` state that surfaces a `SaveErrorToast` to the user. So failures are no longer *silent* — the user gets notified. However, there is still no retry/reconciliation mechanism. If a save fails, the in-memory state diverges from disk until the next successful save or app restart.

### #5 — Missing async error boundaries — FIXED
- **File:** `src/App.tsx`
- **Original problem:** `ErrorBoundary` only catches synchronous render errors. Async `loadProject()`/`initialize()` failures leave app in broken half-loaded state with no recovery.
- **Current status:** FIXED. `App.tsx` now handles `initialize()` failures by catching errors and setting an `error` state (line 97-112), which renders a dedicated error screen with a reload button. The `ErrorBoundary` still only catches sync render errors (that's a React limitation), but the async paths now have their own error handling with visible recovery UI.

## 2. Major Security Concerns

### #1 — Command injection via shell strings — STILL PRESENT
- **Files:** `electron/services/claude-code.ts:87`, `electron/ipc/shell-handlers.ts:116`, `electron/ipc/devserver-handlers.ts:32`
- **Problem:** Three locations build shell commands via string interpolation:
  1. `claude-code.ts:87` — Temp file path interpolated into a bash command string: `` `cat '${tempFile}'` ``
  2. `claude-code.ts:440` — Same pattern in `chat()` method: `spawn('bash', ['-c', \`cat "${tempFile}" | claude ...\`])`
  3. `shell-handlers.ts:116` — User-provided command interpolated into an AppleScript string (has basic escaping but AppleScript injection may still be possible)
  4. `devserver-handlers.ts:32` — Port number interpolated into `lsof` and `kill` commands (low risk since port is a number, but still uses `execAsync` with string interpolation)
- **Status:** TODO — still the highest-risk security issue

### #6 — Sandbox disabled globally — STILL PRESENT
- **File:** `electron/main.ts:68`
- **Problem:** `sandbox: false` required for node-pty but gives renderer full Node.js access.
- **Status:** DEFERRED (required by node-pty, no easy fix)

### #16 — Unvalidated Vercel token write — OUTDATED
- **Original file:** `electron/main.ts:194-219`
- **Original problem:** No format/length validation before writing token to `~/.vercel/auth.json`.
- **Current status:** REMOVED. No Vercel token handling code exists in `electron/main.ts` anymore. The Vercel integration may have been removed or moved elsewhere. No references to `vercel` or `auth.json` found in main.ts.

## 3. Causes Slowness

### #7 — Monolithic Zustand store — STILL PRESENT (worse)
- **File:** `src/store/useAppStore.ts` (1,615 lines — up from 958 at time of audit)
- **Problem:** 100+ state fields, no selectors. Every subscriber re-renders on any state change. Terminal output appending during builds triggers re-renders across all screens.
- **Status:** TODO — store has grown 69% since original audit, making this more urgent

## Fix Order

1. **#1** Command injection — highest-risk security issue, surgical fix
2. **#7** Store splitting — largest performance impact, biggest refactor
3. **#8** Task save reconciliation — add retry mechanism for failed saves

## Completed

- **Type duplication** between `src/types/` and `electron/services/storage.ts` — FIXED (replaced 10 duplicate interfaces with `import type`)
- **#4** Silent deploy catches — FIXED (catch blocks now surface errors to UI)
- **#5** Missing async error boundaries — FIXED (App.tsx handles initialize failures with error UI)
- **#16** Unvalidated Vercel token write — REMOVED (code no longer exists)
