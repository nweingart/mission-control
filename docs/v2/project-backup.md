# Project Backup & Recovery

## Problem

All project data (PRD, tasks, config, build logs) lives as JSON files on the user's local filesystem. If the machine is lost, the drive fails, or the user reinstalls macOS, all project metadata is gone. The source code survives (it's on GitHub), but the PRD, task history, build logs, and Houston-specific config are lost.

## Goal

Automatically back up project state to the cloud. Let users restore projects on the same or a different machine. Recovery should reconstruct everything except the local git working directory (user re-clones from GitHub).

---

## What Gets Backed Up

| Data | File(s) | Size | Frequency |
|------|---------|------|-----------|
| PRD | `prd.md` | 5-50 KB | On every PRD save |
| Tasks | `tasks.json` | 2-20 KB | On every task state change |
| Project config | `meta.json` | <1 KB | On config change |
| Build logs | `logs/*.log` | 10-500 KB per task | After each task completes |
| Houston chat | Not persisted yet | Variable | Per message (future) |

**Not backed up:** Source code (lives on GitHub), `node_modules`, build artifacts, local dev server state.

Total per project: ~50 KB to ~1 MB. Very small — storage costs are negligible.

---

## Database Schema

Add to the existing Supabase project (parable):

```sql
-- Project snapshots
CREATE TABLE public.project_backups (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  project_slug text NOT NULL,
  project_name text NOT NULL,
  github_repo text,
  supabase_ref text,
  vercel_project text,
  prd_content text,
  tasks_json jsonb,
  meta_json jsonb,
  backed_up_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(user_id, project_slug)
);

-- RLS: users can only access their own backups
ALTER TABLE public.project_backups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own backups"
  ON public.project_backups FOR ALL
  USING (auth.uid() = user_id);

-- Build logs stored separately (larger, append-only)
CREATE TABLE public.build_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  project_slug text NOT NULL,
  task_index integer NOT NULL,
  task_title text,
  log_content text,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.build_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own logs"
  ON public.build_logs FOR ALL
  USING (auth.uid() = user_id);
```

---

## Implementation

### Phase 1: Auto-backup (upload)

**When:** After any project mutation (PRD save, task state change, build completion).

**Where:** New service `src/services/backupService.ts`.

**How:**
1. After `storage.saveProject()` or `storage.saveTasks()`, debounce a backup call (500ms)
2. Read the current project files (meta.json, tasks.json, prd.md)
3. Upsert into `project_backups` via Supabase client
4. For build logs, insert into `build_logs` after each task completion

```ts
// src/services/backupService.ts
import { supabase } from '../lib/supabase';

let debounceTimer: ReturnType<typeof setTimeout>;

export async function backupProject(slug: string) {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(async () => {
    const session = await supabase.auth.getSession();
    if (!session.data.session) return; // Not signed in, skip

    const meta = await window.api.storage.getProject(slug);
    const tasks = await window.api.storage.getTasks(slug);
    const prd = await window.api.storage.getPRD(slug);

    await supabase.from('project_backups').upsert({
      user_id: session.data.session.user.id,
      project_slug: slug,
      project_name: meta.name,
      github_repo: meta.githubRepo,
      supabase_ref: meta.supabaseRef,
      vercel_project: meta.vercelProject,
      prd_content: prd,
      tasks_json: tasks,
      meta_json: meta,
      backed_up_at: new Date().toISOString(),
    }, { onConflict: 'user_id,project_slug' });
  }, 500);
}
```

### Phase 2: Restore (download)

**UI:** Settings screen > "Restore from Cloud" button. Shows list of backed-up projects not present locally.

**Flow:**
1. Fetch `project_backups` for the authenticated user
2. Filter out projects that already exist locally
3. User selects a project to restore
4. Create local project directory, write meta.json, tasks.json, prd.md
5. If `github_repo` exists, prompt to `git clone` into the project directory
6. Project appears on home screen

### Phase 3: Backup status indicator

Small cloud icon on each project card:
- Green checkmark: backed up, in sync
- Orange dot: local changes not yet backed up
- No icon: user not signed in (backup disabled)

---

## Gating

- Backup is a **Pro feature** — free users don't get cloud backup
- Free users see a "Back up your projects" upsell on the home screen
- This creates additional value for the Pro subscription beyond just "unlimited projects"

---

## Storage Costs

At ~500 KB per project and assuming 1,000 Pro users with 10 projects each:
- 1,000 * 10 * 500 KB = ~5 GB
- Supabase free tier: 500 MB database, 1 GB file storage
- Supabase Pro ($25/mo): 8 GB database, 100 GB file storage

Easily fits within Supabase Pro. Build logs are the largest item — could compress or cap at last 5 builds per task if storage becomes a concern.

---

## Dependencies

- Requires user to be signed in (Supabase auth)
- Requires Pro subscription (gating)
- No new infrastructure beyond existing Supabase project
