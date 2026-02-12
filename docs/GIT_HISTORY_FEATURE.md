# Git History Feature - Implementation Plan

## Overview

Add a Git History screen that shows the full story of how a project was built: every branch, commit, review, auto-fix, and merge — grouped by task. This also introduces a **Project Layout nav bar** that will serve as the foundation for all future project-level features (Deployment History, Schema Visualizer, etc.).

---

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Data source | Stored events model | Fast, always available, captures the Kiln narrative (not just raw git). Works even if project dir is moved/deleted. |
| UI placement | Project-level nav bar + dedicated screen | Forward-looking — gives every future feature a natural home with zero structural rework. |
| Interactivity | Read-only | Keep scope tight. Actions (checkout, revert) can be added later. |
| Event capture | Emit from BuildScreen during existing pipeline steps | Minimal code — the pipeline already hits these points, we just save a record. |

---

## Data Model

### New Type: `GitEvent`

```typescript
// src/types/index.ts

interface GitEvent {
  id: string;
  type: 'branch_created' | 'committed' | 'review_completed' | 'auto_fixed' | 'merged' | 'pushed';
  taskId?: string;
  taskTitle?: string;
  branchName?: string;
  commitHash?: string;
  commitMessage?: string;
  reviewArtifact?: ReviewArtifact; // attached on 'review_completed' events
  timestamp: string;
}
```

### Storage

Persisted as `git-events.json` per project, alongside existing files:

```
~/.kiln/projects/<slug>/
  ├── project.json
  ├── tasks.json
  ├── chat-history.json
  ├── backlog.json
  ├── planning-chats.json
  └── git-events.json        ← NEW
```

---

## Files to Modify

### 1. Types — `src/types/index.ts`

- Add `GitEvent` interface (see above)
- Add `'git-history'` to the `Screen` union type

### 2. Storage Service — `electron/services/storage.ts`

Add two methods to `StorageService`:

```typescript
async getGitEvents(slug: string): Promise<GitEvent[]>
async saveGitEvents(slug: string, events: GitEvent[]): Promise<void>
```

Same pattern as existing `getTasks` / `saveTasks` — read/write JSON file in the project directory.

### 3. IPC Wiring — `electron/main.ts`

Add IPC handlers:

```typescript
ipcMain.handle('storage:getGitEvents', async (_, slug: string) => {
  return storageService.getGitEvents(slug);
});

ipcMain.handle('storage:saveGitEvents', async (_, slug: string, events: GitEvent[]) => {
  await storageService.saveGitEvents(slug, events);
});
```

### 4. Preload — `electron/preload.ts`

Expose through the context bridge:

```typescript
getGitEvents: (slug: string) => ipcRenderer.invoke('storage:getGitEvents', slug),
saveGitEvents: (slug: string, events: GitEvent[]) => ipcRenderer.invoke('storage:saveGitEvents', slug, events),
```

### 5. Electron API Type — `src/types/electron.d.ts`

Add to the `storage` section of `ElectronAPI`:

```typescript
getGitEvents: (slug: string) => Promise<GitEvent[]>;
saveGitEvents: (slug: string, events: GitEvent[]) => Promise<void>;
```

### 6. Store — `src/store/useAppStore.ts`

Add to state:

```typescript
gitEvents: GitEvent[];
```

Add actions:

```typescript
addGitEvent: (event: Omit<GitEvent, 'id' | 'timestamp'>) => void;
saveGitEvents: () => Promise<void>;
loadGitEvents: () => Promise<void>;
```

`addGitEvent` creates the event with a generated ID and ISO timestamp, appends it to the array, and auto-saves.

Also update `loadProject` to call `loadGitEvents()` alongside the existing `loadTasks()` and `loadChatHistory()` calls.

### 7. BuildScreen — `src/screens/BuildScreen.tsx`

Emit git events at each existing pipeline step. These are one-liner additions at points that already exist in the code:

| Pipeline Step | Where in Code | Event Type |
|---------------|---------------|------------|
| Branch creation | After `createAndCheckoutBranch` call | `branch_created` |
| Build commit | After `gitAddAndCommit` call | `committed` |
| Review complete | After `parseReviewResponse` | `review_completed` (attach full `ReviewArtifact`) |
| Auto-fix applied | After fix commit | `auto_fixed` |
| Merge to main | After `mergeBranch` call | `merged` |
| Push to remote | After `gitPush` call (if applicable) | `pushed` |

Example insertion (pseudo):

```typescript
// After creating branch
await window.api.github.createAndCheckoutBranch(projectPath, branchName);
store.getState().addGitEvent({
  type: 'branch_created',
  taskId: task.id,
  taskTitle: task.title,
  branchName,
});
```

No changes to the existing build pipeline logic — just adding event emissions alongside what already happens.

---

## New Files

### 8. Project Layout — `src/components/ProjectLayout.tsx`

A wrapper component that renders a persistent nav bar above project screens.

```
┌──────────────────────────────────────────────────────┐
│ ← Home    Project Name          [Build] [Git History]│
├──────────────────────────────────────────────────────┤
│                                                      │
│              (current screen renders here)            │
│                                                      │
└──────────────────────────────────────────────────────┘
```

**Behavior:**

- Shows project name from `currentProject.name`
- "Home" button calls `goToHome()`
- Tab buttons: highlight the active screen, navigate via `setScreen()`
- Tabs visible now: **Build** (the current phase screen) and **Git History**
- Future tabs (Deploy History, Schema) get added with one line each

**Which screens get wrapped:**

Wrapped (inside a project):
- `discovery`, `prd-review`, `planning`, `planning-chats`
- `building`, `previewing`, `deploying`, `complete`
- `git-history`

NOT wrapped (setup/global):
- `onboarding`, `setup-workspace`, `setup-deploy`, `setup-ready`
- `home`, `idea`

**Implementation in App.tsx:**

```typescript
const renderScreen = () => {
  switch (screen) {
    // Unwrapped screens
    case 'onboarding': return <OnboardingScreen />;
    case 'setup-workspace': return <SetupWorkspaceScreen />;
    case 'setup-deploy': return <SetupDeployScreen />;
    case 'setup-ready': return <SetupReadyScreen />;
    case 'home': return <HomeScreen />;
    case 'idea': return <IdeaScreen />;

    // Wrapped screens
    default:
      return (
        <ProjectLayout>
          {renderProjectScreen()}
        </ProjectLayout>
      );
  }
};
```

### 9. Git History Screen — `src/screens/GitHistoryScreen.tsx`

**Layout:**

```
┌─────────────────────────────────────────────────┐
│ Git History                        12 events    │
│ ─────────────────────────────────────────────── │
│                                                 │
│ ● Task 3: Add user auth        main ← feat/... │
│   ├─ Branch created: feat/add-user-auth         │
│   ├─ Committed: "implement login form"          │
│   ├─ Review: 2 warnings, 1 info     [▼ expand] │
│   ├─ Auto-fixed: 2 issues resolved              │
│   └─ Merged to main ✓                          │
│                                                 │
│ ● Task 2: Setup database            merged ✓   │
│   ├─ Branch created: feat/setup-database        │
│   ├─ Committed: "add schema and migrations"     │
│   ├─ Review: 0 issues                          │
│   └─ Merged to main ✓                          │
│                                                 │
│ ● Task 1: Init project              merged ✓   │
│   └─ Committed: "initial scaffold"              │
│                                                 │
│ ─────────────────────────────────────────────── │
│ Summary: 3 tasks | 6 branches merged | 2 fixed │
└─────────────────────────────────────────────────┘
```

**Components within the screen:**

- **Header**: Title + total event count
- **Task Groups**: Events grouped by `taskId`, displayed in reverse chronological order (most recent task first)
- **Event Row**: Icon per event type + description + timestamp
- **Expandable Review**: Clicking a `review_completed` event expands inline to show:
  - Severity-colored finding badges (critical = red, warning = amber, info = blue)
  - Each finding's category + description
  - Review summary text
  - Diff stat
  - Whether auto-fix was applied
- **Summary Bar**: Bottom stats — total tasks, branches merged, findings found, auto-fixes applied
- **Empty State**: "No git history yet. History will appear here once building begins."

**Data flow:**

1. Screen mounts → calls `loadGitEvents()` from store
2. Groups events by `taskId`
3. Renders the timeline

---

## Implementation Order

This is the recommended sequence for the developer implementing this feature:

### Phase 1: Data Layer (no UI changes yet)

1. Add `GitEvent` type to `src/types/index.ts`
2. Add `'git-history'` to `Screen` type
3. Add `getGitEvents` / `saveGitEvents` to `storage.ts`
4. Add IPC handlers in `main.ts`
5. Add to preload bridge in `preload.ts`
6. Add to `ElectronAPI` type in `electron.d.ts`
7. Add `gitEvents` state + actions to `useAppStore.ts`

### Phase 2: Event Capture

8. Add `addGitEvent` calls to `BuildScreen.tsx` at each pipeline step
9. Verify events are being saved (check `~/.kiln/projects/<slug>/git-events.json`)

### Phase 3: Project Layout

10. Create `ProjectLayout.tsx` wrapper component
11. Update `App.tsx` to use `ProjectLayout` for project screens

### Phase 4: Git History Screen

12. Create `GitHistoryScreen.tsx`
13. Add route in `App.tsx`
14. Style and polish

---

## Future Extensions (not in this PR)

These are explicitly out of scope but the design accommodates them:

- **Interactive actions**: Checkout branch, view full diff, revert task
- **Live git refresh**: "Sync from repo" button that runs `git log` and merges with stored events
- **Deployment History tab**: Extends the nav bar, links git events to Vercel deployments
- **Gap Analysis events**: When Gap Analysis feature ships, its results become new event types in the same timeline
- **Multi-Agent annotations**: When Multi-Agent ships, events get an `agent` field showing which agent (frontend/backend) performed the action
