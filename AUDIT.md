# Codebase Audit — Prioritized Weaknesses

Filtered to: deployment/core flow disruption, security, performance.

## 1. Disrupts Deployment / Core Flow

### #4 — Silent catch blocks in deploy flow
- **File:** `src/screens/DeployScreen.tsx:614,645`
- **Problem:** GitHub API failures during deployment status polling are silently swallowed. User sees infinite loading with no feedback.
- **Status:** TODO

### #8 — Race conditions in task saves
- **File:** `src/store/useAppStore.ts:340-404`
- **Problem:** Tasks update optimistically in UI, IPC save fires and forgets. If save fails, user's work is silently lost until app relaunch.
- **Status:** TODO

### #5 — Missing async error boundaries
- **File:** `src/App.tsx`
- **Problem:** `ErrorBoundary` only catches synchronous render errors. Async `loadProject()`/`initialize()` failures leave app in broken half-loaded state with no recovery.
- **Status:** TODO

## 2. Major Security Concerns

### #1 — Command injection via shell strings
- **Files:** `electron/services/claude-code.ts:87`, `electron/ipc/shell-handlers.ts:116`, `electron/ipc/devserver-handlers.ts:32`
- **Problem:** Three locations build shell commands via string interpolation instead of `spawn()` with argument arrays. Session ID flows into shell string via temp file path in claude-code.ts.
- **Status:** TODO

### #6 — Sandbox disabled globally
- **File:** `electron/main.ts:65`
- **Problem:** `sandbox: false` required for node-pty but gives renderer full Node.js access.
- **Status:** DEFERRED (required by node-pty, no easy fix)

### #16 — Unvalidated Vercel token write
- **File:** `electron/main.ts:194-219`
- **Problem:** No format/length validation before writing token to `~/.vercel/auth.json`.
- **Status:** TODO

## 3. Causes Slowness

### #7 — Monolithic Zustand store
- **File:** `src/store/useAppStore.ts` (958 lines)
- **Problem:** 100+ state fields, no selectors. Every subscriber re-renders on any state change. Terminal output appending during builds triggers re-renders across all screens.
- **Status:** TODO

## Fix Order

1. **#4** Silent deploy catches — quick fix, directly improves core flow
2. **#1** Command injection — highest-risk security issue, surgical fix
3. **#7** Store splitting — largest performance impact, biggest refactor

## Completed

- **Type duplication** between `src/types/` and `electron/services/storage.ts` — FIXED (replaced 10 duplicate interfaces with `import type`)
