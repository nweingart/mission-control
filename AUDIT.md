# Mission Control — Codebase Audit

**Last reviewed:** 2026-03-20

---

## Strengths

### Architecture
- **Multi-project isolation is well-designed.** Per-project Zustand stores via factory + registry + React context (`createProjectStore.ts`, `projectStoreRegistry.ts`, `ProjectStoreContext.tsx`) cleanly separate state. The `display:none/contents` mount pattern in `App.tsx` keeps project trees alive without re-initialization.
- **Build pipeline is sophisticated.** `useBuildPipeline.ts` (1262 lines) implements checkpoint/resume, tier-based DAG scheduling, parallel worktree execution, decision gates, and token tracking. The phase progression (branching -> building -> reviewing -> fixing -> merging) is well-structured with `PHASE_ORDER` constants and `completedPhaseLevel()` for recovery.
- **Store slicing.** The global store is decomposed into 11 focused slices, which is a major improvement over the earlier monolith. Each slice has clear boundaries.
- **Atomic file writes.** `storage.ts` uses temp-file + rename for crash-safe persistence, with backup creation and JSON recovery from `.bak` files.

### Error Handling
- **Error classification system.** `pipeline-errors.ts` categorizes build errors (transient, auth, rate-limit, catastrophic) with appropriate recovery actions per severity.
- **Save error visibility.** `SaveErrorToast` surfaces persistence failures to the user. The `persistenceQueue.ts` implements retry with exponential backoff and transitions from fast (500ms) to slow (30s) retry modes.
- **Async initialization recovery.** `App.tsx` catches `initialize()` failures and renders a dedicated error screen with reload button.
- **Preflight gate pattern.** `usePreflightCheck.ts` blocks operations until required services are verified, with retry and dismiss paths.

### Code Quality
- **Token tracking is pure and testable.** `token-tracking.ts` uses pure functions with no side effects; it has good test coverage.
- **Discovery stream parsing is robust.** `useDiscoveryStream.ts` uses ref-based state mirroring for async safety, proper unsubscribe guards, and careful buffer management that preserves partial tags.
- **Clean agent routing.** `agent-router.ts` abstracts Claude vs Codex providers with proper optional chaining.
- **Good escape utilities.** `escape-utils.ts` implements proper backslash/quote escaping and length limits (8192 chars) for AppleScript injection prevention.
- **ProjectScreenRouter keeps BuildScreen mounted** via `display:none/contents` toggle, preventing re-initialization of build state during navigation. Clean, well-documented pattern.

### UX
- **Multi-project tabs** with build activity indicators (amber pulse) and max-5 enforcement.
- **Planning chat type awareness** — system prompts adapt to bug/refactor/feature context.
- **Gamification system** with streaks, milestones, rank progression, and freeze tokens.
- **Assistant directive extraction** parses structured commands from AI responses to automate backlog ops, builds, and planning.

---

## Weaknesses

### 1. Security

#### 1a. Command injection via shell string interpolation — CRITICAL
- **Files:** `electron/services/claude-code.ts:87,440`, `electron/ipc/shell-handlers.ts:116`, `electron/ipc/devserver-handlers.ts:32`
- **Problem:** Four locations build shell commands via string interpolation:
  1. `claude-code.ts:87` — Temp file path interpolated: `` `cat '${tempFile}'` ``
  2. `claude-code.ts:440` — Same in `chat()`: `spawn('bash', ['-c', \`cat "${tempFile}" | claude ...\`])`
  3. `shell-handlers.ts:116` — User command interpolated into AppleScript (has escaping but bypass may be possible)
  4. `devserver-handlers.ts:32` — Port number in `lsof`/`kill` (low risk since numeric)
- **Fix:** Use `spawn()` with args array instead of shell strings. For AppleScript, validate input against allowlist.

#### 1b. Symlink traversal in path validation — CRITICAL
- **File:** `electron/ipc/shell-handlers.ts:13-22`
- **Problem:** Path validation checks `resolvedPath.startsWith(root)` but doesn't resolve symlinks first. A symlink at `~/.mission-control/projects/foo/../../../../../../etc/passwd` passes validation.
- **Fix:** Use `fs.realpathSync()` to resolve symlinks before the startsWith check.

#### 1c. Command injection through editor path — HIGH
- **File:** `electron/ipc/shell-handlers.ts:93-124`
- **Problem:** Editor path from `which` output is interpolated into AppleScript. If a malicious binary is in PATH, it could inject commands.
- **Fix:** Validate `which` output against an allowlist of known editors.

#### 1d. Shell command parsing breaks on spaces — HIGH
- **File:** `electron/services/github.ts:583`
- **Problem:** `runShellCommand()` splits commands with `command.split(' ')`, which breaks on arguments containing spaces (e.g., commit messages).
- **Fix:** Use proper shell parsing or accept pre-split args arrays.

#### 1e. Unvalidated deep link URLs — MEDIUM
- **File:** `electron/main.ts:162-168`
- **Problem:** `missioncontrol://` URLs are sent to renderer without format validation.
- **Fix:** Parse and validate URL structure before forwarding.

#### 1f. Sandbox disabled globally — DEFERRED
- **File:** `electron/main.ts:70`
- **Problem:** `sandbox: false` for node-pty gives renderer full Node.js access.
- **Status:** Required by node-pty, no easy fix.

#### 1g. No IPC message validation — MEDIUM
- **File:** `electron/preload.ts:62-81`
- **Problem:** IPC messages are type-cast (`data as { chatId: string; ... }`) without runtime validation. Malformed messages could cause runtime errors.
- **Fix:** Add lightweight runtime validation (e.g., zod schemas) for all IPC message shapes.

#### 1h. No encryption at rest — LOW
- **File:** `electron/services/storage.ts`
- **Problem:** Chat history, project data, and tokens stored as plain JSON in `~/.mission-control/`.
- **Fix:** Encrypt sensitive fields or use OS keychain for secrets.

---

### 2. State Management

#### 2a. Destructuring without selectors causes unnecessary re-renders — HIGH
- **Files:** `src/App.tsx:21`, `src/screens/HomeScreen.tsx`, and most components
- **Problem:** Components destructure multiple fields from `useAppStore()` or `useProjectStore()` without selectors. This subscribes to the entire store — any mutation to any field triggers a re-render.
- **Example:** `const { screen, initialize, isLoading, error, openProjectSlugs, activeProjectSlug } = useAppStore()` in App.tsx re-renders on every chat message, terminal line, or task update.
- **Fix:** Use selector pattern consistently: `useAppStore(s => s.screen)`, `useAppStore(s => s.activeProjectSlug)`, etc.

#### 2b. Fire-and-forget persistence race conditions — HIGH
- **Files:** All store slices (`tasksSlice.ts`, `chatSlice.ts`, `planningChatSlice.ts`, etc.)
- **Problem:** Each state mutation calls `persistFireAndForget()` immediately. Rapid edits trigger parallel saves that read `get().tasks` at save time — if state changes between `set()` and the async save, data can be lost.
- **Example:** User edits task A, then immediately edits task B. Task A's save fires after B is set, potentially overwriting B's changes.
- **Fix:** Debounce/coalesce saves. The `persistenceQueue.ts` exists but isn't used consistently across all slices.

#### 2c. Cross-slice screen state confusion — MEDIUM
- **Files:** `appSlice.ts:68`, `navigationSlice.ts`, `projectSlice.ts:55,68,182`
- **Problem:** `screen` is owned by `navigationSlice` but set from `appSlice` and `projectSlice` via `as Partial<AppState>` type casts, bypassing type safety.
- **Fix:** All screen transitions should go through `navigationSlice` actions only.

#### 2d. Global store has per-project slices — LOW
- **File:** `src/store/useAppStore.ts:27-39`
- **Problem:** `buildSlice`, `tasksSlice`, `chatSlice`, etc. are instantiated in both the global store and per-project stores. The global instances hold stale data from the last active project.
- **Fix:** Remove per-project slices from global store, or clearly document which are authoritative.

---

### 3. Memory & Cleanup

#### 3a. Build pipeline buffer leaks — HIGH
- **File:** `src/hooks/useBuildPipeline.ts:147,170`
- **Problem:** `taskOutputBuffersRef` can grow unbounded during builds and is never cleared on pipeline end or component unmount. `buildChatIdsRef` (line 86) and `reviewHistory` (line 97) also accumulate across tasks/builds without cleanup.
- **Fix:** Clear all refs and buffers when pipeline ends, errors, or component unmounts.

#### 3b. Preflight promise can hang the pipeline — HIGH
- **File:** `src/hooks/useBuildPipeline.ts:949-951`
- **Problem:** `preflightResolveRef` is set but has no guarantee of resolution if the pipeline is cancelled or component unmounts. An unresolved promise hangs the pipeline indefinitely.
- **Fix:** Add timeout and cancellation handling to the preflight promise.

#### 3c. Decision resolvers not cleaned on cancel — MEDIUM
- **File:** `src/hooks/useBuildPipeline.ts:92,455,485`
- **Problem:** If pipeline is cancelled mid-decision, resolver functions remain in the map. Subsequent decisions could resolve stale entries.
- **Fix:** Clear all resolvers when `runIdRef` increments.

#### 3d. Worktrees leaked on force-quit — MEDIUM
- **File:** `src/hooks/build-pipeline/worktree-ops.ts:31-51`
- **Problem:** `cleanupStaleWorktrees()` runs at pipeline start but not on process crash. Force-quit leaves worktrees in `/tmp/mc-worktrees/`.
- **Fix:** Register cleanup handlers in electron main process for SIGINT/SIGTERM.

#### 3e. Backup files accumulate indefinitely — LOW
- **File:** `electron/services/storage.ts:85-88`
- **Problem:** Every save creates a `.bak` file. No cleanup of old backups.
- **Fix:** Rotate backups (keep last N) or clean up on app start.

#### 3f. Terminal output not cleared between builds — LOW
- **File:** `src/store/slices/buildSlice.ts:48-55`
- **Problem:** `terminalOutput` array persists across builds, growing with each run.
- **Fix:** Clear on new build start.

---

### 4. Error Handling Gaps

#### 4a. Silent failures in project loading — MEDIUM
- **File:** `src/store/slices/projectSlice.ts:131-133`
- **Problem:** `loadProject()` loads 9 data types in parallel. Individual failures are silently caught — the user sees a partially loaded project with no indication of what's missing.
- **Fix:** Surface per-resource load failures (e.g., "Failed to load chat history") and offer retry.

#### 4b. No structured error types — MEDIUM
- **Files:** `pipeline-errors.ts`, `retry-utils.ts:19`
- **Problem:** Error classification relies on string matching against error messages (`message.includes('timed out')`). If upstream error messages change, classification silently degrades.
- **Fix:** Define structured error types with error codes. Parse upstream errors into typed objects.

#### 4c. Persistence retry never stops — LOW
- **File:** `src/utils/persistenceQueue.ts:86-97`
- **Problem:** After 5 fast retries, switches to 30s slow retry with no maximum total retry count. Could retry indefinitely.
- **Fix:** Add a max total retry count with a final "give up" notification.

#### 4d. ErrorBoundary reset doesn't recover — LOW
- **File:** `src/components/ErrorBoundary.tsx`
- **Problem:** "Try Again" only clears error state. If the error is from a code bug, it immediately recurs. No error logging to external service.
- **Fix:** Add error reporting integration. Consider auto-reload after repeated failures.

---

### 5. Performance

#### 5a. Objects recreated on every render — MEDIUM
- **Files:** Multiple screens (`DeploymentsScreen.tsx:41`, `GitHistoryScreen.tsx:29`, `ProjectLayout.tsx:13`, `IssuesScreen.tsx:100`)
- **Problem:** Maps, sorted arrays, and style objects are recreated on every render instead of using `useMemo`.
- **Examples:** `groupByTask` sorting, `statusToScreen` map, category color lookup.
- **Fix:** Wrap in `useMemo` with appropriate dependencies.

#### 5b. Markdown re-parsed on every render — LOW
- **Files:** `Chat.tsx:47-59`, `DocsScreen.tsx:40-44`
- **Problem:** Markdown content is re-parsed on every render cycle.
- **Fix:** Memoize markdown rendering output.

#### 5c. No rate limiting on safeSend — LOW
- **File:** `electron/main.ts:48-58`
- **Problem:** High-frequency IPC messages (terminal output) have no throttling.
- **Fix:** Batch terminal output messages or throttle to ~60fps.

---

### 6. Code Quality

#### 6a. Duplicated PATH enhancement logic
- **Files:** `claude-code.ts`, `codex.ts`, `github.ts`, `setup-handlers.ts` each build their own enhanced PATH
- **Centralized version exists:** `electron/ipc/env.ts`
- **Fix:** Use `buildEnhancedPath()` from env.ts everywhere.

#### 6b. Dead code
- `App.tsx:70-72` — `handleDeepLink` is an empty placeholder
- `appSlice.ts:81-83` — `checkSubscription()` is a no-op stub
- `SettingsScreen.tsx:71` — "Manage Subscription" button does nothing

#### 6c. CSS variable duplication
- `src/index.css:10-135` — `:root` and `.dark` define identical CSS variables
- **Fix:** Remove `.dark` block or only override differences.

#### 6d. Preload API is a monolith
- `electron/preload.ts:94-346` — Single massive API object
- **Fix:** Split into logical modules (storage, claude, codex, shell, etc.).

#### 6e. Large monolithic type file
- `src/types/index.ts` — Contains all domain types plus deprecated V1 types
- **Fix:** Split into `types/project.ts`, `types/planning.ts`, `types/legacy.ts`, etc.

---

### 7. Testing

#### 7a. Low test coverage
- **Tested:** `token-tracking.ts`, `retry-utils.ts` (good coverage)
- **Untested critical paths:**
  - `useBuildPipeline` checkpoint/resume logic
  - Decision gate timeout and resolution
  - Worktree cleanup on errors
  - Preflight concurrent command handling
  - `useDiscoveryStream` parsing
  - `usePreflightCheck` race conditions
  - All store slices
  - All screens and components

#### 7b. E2E test checkpoint not cleaned
- **File:** `src/components/E2ETestRunner.tsx:132`
- **Problem:** localStorage checkpoint persists after test completion. Re-running the test resumes from checkpoint instead of starting fresh.
- **Fix:** Clear checkpoint on test completion.

#### 7c. FlowTestRunner doesn't reset state
- **File:** `src/components/FlowTestRunner.tsx:118`
- **Problem:** Test projects and state linger after runs. No comprehensive store reset between runs. No assertions that state actually changed (false positives possible).
- **Fix:** Implement full store reset and add state assertions.

---

### 8. UX / Accessibility

#### 8a. Missing ARIA labels on interactive elements across all screens
#### 8b. Status indicators rely on color alone (no text fallbacks for colorblind users)
#### 8c. Modal focus traps not implemented (PaywallModal, delete confirmations)
#### 8d. Inconsistent loading/error/confirmation patterns across screens
#### 8e. No keyboard shortcuts help or discoverability

---

## Remaining Low-Severity Items

These were identified in re-audit but are low-priority:
- `safeSend()` swallows IPC send errors (returns boolean, no re-throw)
- `shell.trashItem()` failure in `deleteProject` doesn't prevent metadata deletion
- Dev server `killPort()` doesn't fallback to `netstat`/`ss` on Linux
- Editor allowlist is macOS-specific (falls back to Finder on other platforms)
- `gh auth` status detection is string-based (may not work with localized CLI output)
- PowerShell execution policy not handled on Windows
- Linux terminal detection is brittle (doesn't check DISPLAY/WAYLAND_DISPLAY)
- Git timeout is uniform 2 minutes (large clones may need more)
- `activeChatChildren` Map has no bounds (unlikely to grow large in practice)
- Preload API is a single large object (organizational, no functional impact)
- Types file is monolithic (organizational, no functional impact)

---

## Fixed in This Audit (2026-03-20)

### P0 — Security (`754805b`)
- 1a: Shell injection — temp file path validated, args arrays for spawn
- 1b: Symlink traversal — `realpathSync` before `startsWith` check
- 1c: Editor injection — allowlist of trusted directories for `which` output
- 1d: Command splitting — `runShellCommand` accepts pre-split args, all 5 callers migrated

### P1 — Performance + Data Integrity (`e5be8d9`)
- 2a: Zustand selectors — 18 components converted from destructuring to individual selectors
- 2b: Persistence races — 7 slices migrated from `persistFireAndForget` to debounced `persistQueued`

### P2 — Reliability (`716bcbd`)
- 1e: Deep link URL validation — validates `missioncontrol://` protocol
- 2c: Cross-slice `setScreen` — `appSlice` now uses `get().setScreen()`
- 3d: Worktree cleanup on SIGINT/SIGTERM — signal handlers registered in main
- 4a: Load failure toasts — surfaces per-resource failures as warnings
- 4b: Structured error codes — `ErrorCode` type, `CLAUDE_RATE_LIMIT` and `DISK_FULL` categories

### P3 — Code Quality (`40e08d6`)
- 5a: `useMemo` on DeploymentsScreen sort, GitHistoryScreen groupByTask
- 5b: Markdown components extracted to module-level constant in Chat.tsx
- 6a: PATH logic centralized — 7 duplications replaced with `buildEnhancedPath()`
- 6b: Dead `handleDeepLink` placeholder removed from App.tsx
- 6c: Duplicate `.dark` CSS block removed (saved ~1.4 kB)

### P4 — Accessibility (`f4f5df4`)
- 8a: ARIA roles/labels on StatusLight, BuildProgressBadge, ProgressRing, CompletionToast, ErrorBoundary, App loading/error, ToolDisconnectedOverlay
- 8b: Color-only indicators now have `role="status"` with text labels
- 8c: PaywallModal focus trap with Tab cycling and Escape dismiss
- Toast container has `aria-live="polite"` for screen reader announcements

### Re-audit Hardening (`4b3f3aa`)
- Orphaned temp file cleanup on PTY spawn failure
- PTY resize dimensions clamped to safe bounds (1-1000 cols, 1-500 rows)
- `deleteRepo` URL parsed with `new URL()` instead of string replacement
- 10MB diff size limit to prevent memory exhaustion
- 50MB JSON file size guard in storage reads
- `buildPrompt()` stale closure fixed — slug captured at call time

## Previously Fixed (prior audit 2026-02-16)

- Type duplication between `src/types/` and `electron/services/storage.ts` — replaced with `import type`
- Silent catch blocks in deploy flow — catch blocks now surface errors to UI
- Missing async error boundaries — `App.tsx` handles `initialize()` failures with error UI
- Unvalidated Vercel token write — code removed entirely
