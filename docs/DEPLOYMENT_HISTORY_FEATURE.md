# Deployment History Feature - Implementation Plan

## Overview

Track every deployment to Vercel — which branch/commit was deployed, the resulting URL, and whether it succeeded. Surfaces as a new tab in the ProjectLayout nav bar alongside Build and Git History.

**Depends on:** Git History feature (ProjectLayout nav bar, GitEvent system).

---

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| What to track | Vercel deployments linked to the git commit/branch that triggered them | User wants to see "what went live and from where" |
| Interactivity | Read-only with clickable links | Consistent with Git History. Open deployment URL, open GitHub commit. |
| Nav placement | Third tab in ProjectLayout: Build / Git History / Deployments | Always visible once in a project. Shows empty state if no deployments yet. |
| Data source | Stored events captured during DeployScreen flow | Same pattern as Git History — we log what Kiln does. |

---

## Data Model

### New Type: `DeploymentRecord`

```typescript
// src/types/index.ts

interface DeploymentRecord {
  id: string;
  branch: string;                    // which branch was deployed
  commitHash: string;                // the commit that was pushed
  commitMessage?: string;            // commit message for context
  githubRepoUrl?: string;            // link to the repo/commit on GitHub
  vercelUrl?: string;                // the live deployment URL
  vercelProjectId?: string;          // Vercel project identifier
  status: 'pushing' | 'deploying' | 'success' | 'failed';
  error?: string;                    // error message if failed
  timestamp: string;
}
```

### Storage

Persisted as `deployments.json` per project:

```
~/.kiln/projects/<slug>/
  ├── project.json
  ├── tasks.json
  ├── chat-history.json
  ├── backlog.json
  ├── planning-chats.json
  ├── git-events.json
  ├── gap-analysis.json
  └── deployments.json        ← NEW (array of DeploymentRecord)
```

---

## Capture Points

Deployment records are created in `DeployScreen.tsx` at the existing pipeline steps. No new logic — just saving a record of what already happens.

### Current DeployScreen Flow

```
1. Git init (if needed)
2. Ensure .gitignore
3. Git add + commit
4. Create GitHub repo + push        ← capture branch + commit + repo URL
5. Deploy to Vercel                  ← capture deployment URL + status
6. Show success
```

### Where to Emit Records

| Step | What to Capture |
|------|----------------|
| After `gitAddAndCommit` | `commitHash`, `commitMessage` |
| After `createRepoAndPush` | `branch`, `githubRepoUrl` → create record with status `'pushing'` |
| Vercel deploy starts | Update status to `'deploying'` |
| Vercel deploy succeeds | Update status to `'success'`, set `vercelUrl` |
| Vercel deploy fails | Update status to `'failed'`, set `error` |

In practice, one `DeploymentRecord` is created at push time and updated as the Vercel deploy progresses:

```typescript
// In DeployScreen, after GitHub push:
const record: DeploymentRecord = {
  id: `deploy-${Date.now()}`,
  branch: currentBranch,
  commitHash: commitResult.commitHash,
  commitMessage: commitMessage,
  githubRepoUrl: `${repoUrl}/commit/${commitResult.commitHash}`,
  status: 'deploying',
  timestamp: new Date().toISOString(),
};
store.getState().addDeployment(record);

// After Vercel deploy succeeds:
store.getState().updateDeployment(record.id, {
  status: 'success',
  vercelUrl: deployResult.url,
  vercelProjectId: deployResult.projectId,
});
```

### Git History Integration

Deployments also emit a GitEvent so they appear in the timeline:

```typescript
// New GitEvent type value
type: 'deployed'

// Emitted after successful Vercel deploy:
store.getState().addGitEvent({
  type: 'deployed',
  branchName: currentBranch,
  commitHash: commitResult.commitHash,
  commitMessage: `Deployed to ${deployResult.url}`,
});
```

Add `'deployed'` to the `GitEvent.type` union in `src/types/index.ts`.

---

## Files to Modify

### 1. Types — `src/types/index.ts`

- Add `DeploymentRecord` interface
- Add `'deployments'` to the `Screen` union type
- Add `'deployed'` to the `GitEvent.type` union

### 2. Storage Service — `electron/services/storage.ts`

Add two methods:

```typescript
async getDeployments(slug: string): Promise<DeploymentRecord[]>
async saveDeployments(slug: string, deployments: DeploymentRecord[]): Promise<void>
```

### 3. IPC Wiring — `electron/main.ts`

```typescript
ipcMain.handle('storage:getDeployments', async (_, slug) => {
  return storageService.getDeployments(slug);
});

ipcMain.handle('storage:saveDeployments', async (_, slug, deployments) => {
  await storageService.saveDeployments(slug, deployments);
});
```

### 4. Preload — `electron/preload.ts`

```typescript
getDeployments: (slug: string) => ipcRenderer.invoke('storage:getDeployments', slug),
saveDeployments: (slug: string, deployments: DeploymentRecord[]) =>
  ipcRenderer.invoke('storage:saveDeployments', slug, deployments),
```

### 5. Electron API Type — `src/types/electron.d.ts`

Add to the `storage` section:

```typescript
getDeployments: (slug: string) => Promise<DeploymentRecord[]>;
saveDeployments: (slug: string, deployments: DeploymentRecord[]) => Promise<void>;
```

### 6. Store — `src/store/useAppStore.ts`

Add to state:

```typescript
deployments: DeploymentRecord[];
```

Add actions:

```typescript
addDeployment: (record: Omit<DeploymentRecord, 'id' | 'timestamp'>) => void;
updateDeployment: (id: string, updates: Partial<DeploymentRecord>) => void;
saveDeployments: () => Promise<void>;
loadDeployments: () => Promise<void>;
```

`addDeployment` creates the record with generated ID + timestamp and auto-saves.
`updateDeployment` updates in place and auto-saves (for status progression).

Update `loadProject` to call `loadDeployments()`.

### 7. DeployScreen — `src/screens/DeployScreen.tsx`

Add deployment record creation and updates at the capture points described above. Approximately 10-15 lines of additions at existing pipeline steps — no structural changes.

Also emit a `'deployed'` GitEvent on successful Vercel deploy.

### 8. ProjectLayout — `src/components/ProjectLayout.tsx`

Add the Deployments tab:

```
← Home    Project Name          [Build] [Git History] [Deployments]
```

Routes to `'deployments'` screen on click.

### 9. App.tsx

Add the deployments route inside the ProjectLayout wrapper:

```typescript
case 'deployments':
  return <DeploymentsScreen />;
```

---

## New Files

### 10. DeploymentsScreen — `src/screens/DeploymentsScreen.tsx`

**UI Layout — with deployments:**

```
┌─────────────────────────────────────────────────────┐
│ Deployments                          3 deployments  │
│ ─────────────────────────────────────────────────── │
│                                                     │
│ ● Feb 6, 2026 — 3:42 PM                   SUCCESS  │
│   Branch: main                                      │
│   Commit: a1b2c3d "Add auth and dashboard"          │
│   ┌────────────────────────────────────┐            │
│   │ 🔗 my-app.vercel.app              │            │
│   └────────────────────────────────────┘            │
│   ┌────────────────────────────────────┐            │
│   │ 🔗 github.com/user/repo/commit/…  │            │
│   └────────────────────────────────────┘            │
│                                                     │
│ ● Feb 5, 2026 — 11:15 AM                  FAILED   │
│   Branch: main                                      │
│   Commit: d4e5f6a "Initial deploy attempt"          │
│   Error: Build failed — missing dependency          │
│   ┌────────────────────────────────────┐            │
│   │ 🔗 github.com/user/repo/commit/…  │            │
│   └────────────────────────────────────┘            │
│                                                     │
│ ● Feb 5, 2026 — 10:30 AM                  SUCCESS  │
│   Branch: main                                      │
│   Commit: 7g8h9i0 "First working build"            │
│   ┌────────────────────────────────────┐            │
│   │ 🔗 my-app-abc123.vercel.app       │            │
│   └────────────────────────────────────┘            │
│   ┌────────────────────────────────────┐            │
│   │ 🔗 github.com/user/repo/commit/…  │            │
│   └────────────────────────────────────┘            │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**UI Layout — empty state:**

```
┌─────────────────────────────────────────────────────┐
│ Deployments                                         │
│ ─────────────────────────────────────────────────── │
│                                                     │
│                                                     │
│              No deployments yet.                    │
│                                                     │
│     Deployment history will appear here once        │
│     your project is deployed to Vercel.             │
│                                                     │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Component structure:**

- **Header**: Title + count
- **Deployment cards** in reverse chronological order (newest first):
  - Timestamp (formatted nicely)
  - Status badge: green "SUCCESS" or red "FAILED"
  - Branch name
  - Commit hash (short) + message
  - Clickable Vercel URL (opens in browser via `window.api.shell.openExternal`)
  - Clickable GitHub commit URL (opens in browser)
  - Error message if failed (red text)
- **Empty state**: Friendly message when no deployments exist

**Data flow:**

1. Screen mounts → calls `loadDeployments()` from store
2. Renders deployment list sorted by timestamp descending
3. Links use `window.api.shell.openExternal(url)` to open in browser

---

## Implementation Order

### Phase 1: Data Layer

1. Add `DeploymentRecord` type to `src/types/index.ts`
2. Add `'deployments'` to `Screen` type
3. Add `'deployed'` to `GitEvent.type` union
4. Add `getDeployments` / `saveDeployments` to `storage.ts`
5. Add IPC handlers in `main.ts`
6. Add to preload bridge in `preload.ts`
7. Add to `ElectronAPI` type in `electron.d.ts`
8. Add `deployments` state + actions to `useAppStore.ts`

### Phase 2: Capture

9. Add deployment record creation/updates to `DeployScreen.tsx`
10. Emit `'deployed'` GitEvent on successful deploy
11. Verify records are saved (check `~/.kiln/projects/<slug>/deployments.json`)

### Phase 3: Display

12. Create `DeploymentsScreen.tsx`
13. Add route in `App.tsx`
14. Add Deployments tab to `ProjectLayout.tsx`
15. Style and polish

---

## Edge Cases to Handle

- **Deploy with no GitHub push**: If project was deployed without going through the standard flow (unlikely but possible), create a record with available info
- **Multiple deploys same commit**: Each deploy gets its own record — user may redeploy the same code
- **GitHub repo name collision retry**: DeployScreen already handles this — the deployment record captures whichever repo name succeeded
- **Vercel deploy timeout**: Set status to `'failed'` with timeout error message
- **No internet**: Deploy will fail naturally — record captures the error

---

## Future Extensions (not in this PR)

- **Redeploy action**: Button to redeploy a specific commit
- **Vercel API integration**: Fetch deployment status/logs from Vercel API for richer data
- **Preview deployments**: Track Vercel preview deployments for non-main branches
- **Rollback**: One-click rollback to a previous deployment
- **Deploy notifications**: Alert when a deployment completes or fails
- **Multi-platform**: Track deployments to other platforms (Netlify, AWS, etc.)
