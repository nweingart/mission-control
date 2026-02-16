# Cross-Device Sync

## Problem

A user might have a desktop and a laptop, or switch machines. Currently there's no way to continue a Houston project on a different computer. The source code is on GitHub (re-clonable), but the PRD, tasks, build state, and Houston config are trapped on the original machine.

## Goal

Open Houston on a second machine, see all your projects, pick one, and continue where you left off. The local git repo gets cloned from GitHub; everything else syncs from the cloud.

---

## Prerequisite

**Project Backup must be implemented first.** Sync is backup + pull. The `project_backups` table from the backup plan is the single source of truth.

---

## Sync Model

**Pull-based, not real-time.** Houston is not a collaborative editor — one person works on one project at a time. We don't need WebSockets or Supabase Realtime. A pull-on-open model is sufficient:

1. On app launch, fetch the list of backed-up projects from Supabase
2. Compare with local projects
3. Show projects that exist in cloud but not locally (available to restore)
4. For projects that exist both locally and in cloud, compare `backed_up_at` timestamps

---

## Conflict Resolution

Since only one machine works on a project at a time, conflicts should be rare. But they can happen (user forgets to sync, works on same project on two machines).

**Strategy: Last-write-wins with warning.**

- On sync, compare local `updated_at` with cloud `backed_up_at`
- If cloud is newer: prompt "This project was updated on another device. Pull latest?"
- If local is newer: auto-push to cloud (normal backup flow)
- If both changed since last sync: show diff summary, let user choose which to keep
- Source code conflicts are handled by git (already has merge tools)

---

## Implementation

### Phase 1: Project list sync

**On app launch (after auth):**
```ts
// src/services/syncService.ts
export async function syncProjectList() {
  const session = await supabase.auth.getSession();
  if (!session.data.session) return;

  // Fetch cloud projects
  const { data: cloudProjects } = await supabase
    .from('project_backups')
    .select('project_slug, project_name, backed_up_at, github_repo')
    .eq('user_id', session.data.session.user.id);

  // Fetch local projects
  const localProjects = await window.api.storage.listProjects();

  // Find cloud-only projects (available to restore)
  const cloudOnly = cloudProjects?.filter(
    cp => !localProjects.some(lp => lp.slug === cp.project_slug)
  );

  // Return for UI to display
  return { cloudOnly, localProjects, cloudProjects };
}
```

### Phase 2: Home screen integration

Add a "Cloud Projects" section to the home screen below local projects:

```
┌──────────────────────────────────┐
│  Your Projects                    │
│  ┌─────────┐  ┌─────────┐       │
│  │ weather  │  │ invoice  │       │
│  │ ● local  │  │ ● local  │       │
│  └─────────┘  └─────────┘       │
│                                   │
│  Available from Cloud             │
│  ┌─────────┐                     │
│  │ habit-   │                     │
│  │ tracker  │  ☁ Restore          │
│  └─────────┘                     │
└──────────────────────────────────┘
```

Clicking "Restore" triggers:
1. Download project data from `project_backups`
2. Create local project directory with meta.json, tasks.json, prd.md
3. If github_repo exists, run `git clone` into project directory
4. Project moves to "Your Projects" section

### Phase 3: Sync status indicators

On each project card, show sync state:
- **Synced** (green cloud) — local and cloud match
- **Local changes** (orange cloud) — local is ahead, will backup soon
- **Cloud changes** (blue cloud) — another device pushed updates
- **Local only** (no icon) — not backed up (free user or not signed in)

### Phase 4: Push/pull controls

In project settings or context menu:
- "Push to cloud" — force backup now
- "Pull from cloud" — overwrite local with cloud version
- "View sync history" — show timeline of backups with timestamps and device names

---

## Device Identification

To show "updated from MacBook Pro" vs "updated from iMac", store device name:

```sql
ALTER TABLE public.project_backups
  ADD COLUMN device_name text;
```

Populate from Electron:
```ts
import { hostname } from 'os';
const deviceName = hostname(); // e.g., "Neds-MacBook-Pro"
```

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Same project open on two machines | Last save wins. Show warning on next launch of the stale machine. |
| User deletes project on machine A | Backup stays in cloud. Machine B still sees it. Add explicit "delete from cloud" option. |
| User cancels Pro | Sync stops. Local projects remain. Cloud backups are retained for 30 days (grace period), then deleted. |
| Large PRD (>50 KB) | Fine — Supabase text columns handle this. Could compress if needed. |
| No internet on launch | Skip sync, use local state. Sync on next launch with connectivity. |

---

## Dependencies

- Project Backup (Phase 1 of that plan must be done first)
- Supabase auth (user must be signed in)
- Pro subscription (gating)

---

## Estimated Scope

| Phase | Effort | Description |
|-------|--------|-------------|
| 1. Project list sync | Small | Fetch + compare on launch |
| 2. Home screen UI | Medium | Cloud projects section, restore flow |
| 3. Status indicators | Small | Icons on project cards |
| 4. Push/pull controls | Medium | Manual sync + conflict UI |

Total: ~1-2 weeks of focused work after backup is in place.
